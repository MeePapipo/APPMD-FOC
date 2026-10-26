/**
 * One-off clean-up of InstrumentUsageMonth rows loaded by the first
 * import-instrument-usage script, which stored some raw eLP test names:
 *   - "Malaria"  -> "MALARIA" (the master code), merging into an existing row if one exists
 *   - "U_HPV_GT" -> removed (left out of FOC on purpose)
 * Dry run by default; pass --apply to write.
 *
 * Run: DATABASE_URL=<url> NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npm run fix-usage-assay-codes [-- --apply]
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL.");
const apply = process.argv.includes("--apply");

// Roche blocks Postgres' TCP port to Neon; talk to *.neon.tech over a WebSocket on 443.
neonConfig.webSocketConstructor = ws;
const prisma = new PrismaClient({
  adapter: new URL(url).hostname.endsWith(".neon.tech") ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url }),
});

const RENAME: Record<string, string> = { Malaria: "MALARIA" };
const DROP = ["U_HPV_GT"];

async function main() {
  console.log(`${new URL(url!).hostname}: ${apply ? "APPLY" : "dry run (pass --apply to write)"}`);

  for (const [from, to] of Object.entries(RENAME)) {
    const rows = await prisma.instrumentUsageMonth.findMany({ where: { assayCode: from } });
    console.log(`${from} -> ${to}: ${rows.length} row(s), ${rows.reduce((s, r) => s + r.runs, 0)} runs`);
    if (!apply) continue;
    for (const r of rows) {
      const clash = await prisma.instrumentUsageMonth.findUnique({
        where: { instrumentId_month_assayCode: { instrumentId: r.instrumentId, month: r.month, assayCode: to } },
      });
      if (clash) {
        await prisma.$transaction([
          prisma.instrumentUsageMonth.update({ where: { id: clash.id }, data: { runs: clash.runs + r.runs, samples: clash.samples + r.samples } }),
          prisma.instrumentUsageMonth.delete({ where: { id: r.id } }),
        ]);
      } else {
        await prisma.instrumentUsageMonth.update({ where: { id: r.id }, data: { assayCode: to } });
      }
    }
  }

  const dropCount = await prisma.instrumentUsageMonth.count({ where: { assayCode: { in: DROP } } });
  console.log(`remove ${DROP.join(", ")}: ${dropCount} row(s)`);
  if (apply && dropCount > 0) await prisma.instrumentUsageMonth.deleteMany({ where: { assayCode: { in: DROP } } });

  const codes = await prisma.instrumentUsageMonth.groupBy({ by: ["assayCode"], _count: true, orderBy: { assayCode: "asc" } });
  console.log("assay codes now:", codes.map((c) => `${c.assayCode}(${c._count})`).join(" "));
}

main().finally(() => prisma.$disconnect());
