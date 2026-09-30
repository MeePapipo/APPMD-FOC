/**
 * Copies the reference/catalog tables from one database to another — used to
 * load a fresh production DB (Neon) from the local dev DB, which is where all
 * the imported master data, TPB edits and FocActual imports actually live.
 * `prisma/seed.ts` can't do this on its own: it reads ~/foc-excel/data, which
 * only exists on the dev machine, and misses every edit made later through
 * the admin console.
 *
 * Only tables with no foreign keys are copied. Users, submissions, forecasts,
 * quotas and the audit log are left alone on purpose.
 *
 * Original ids are kept and rows go in with `skipDuplicates`, so rerunning is
 * safe: anything already on the target (same id or same unique key) is left
 * untouched, never overwritten.
 *
 * Run:
 *   SOURCE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/focwebapp \
 *   DATABASE_URL=<target> npm run copy-reference-data
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL;
if (!sourceUrl || !targetUrl) {
  throw new Error("Set both SOURCE_DATABASE_URL (copy from) and DATABASE_URL (copy to).");
}
if (sourceUrl === targetUrl) {
  throw new Error("SOURCE_DATABASE_URL and DATABASE_URL are the same database — nothing to copy.");
}

const source = new PrismaClient({ adapter: new PrismaPg({ connectionString: sourceUrl }) });
// Some networks (Roche's) block Postgres' TCP port 5432 to Neon but let HTTPS
// through. For *.neon.tech targets, talk to Neon over a WebSocket on 443 instead.
neonConfig.webSocketConstructor = ws;
const viaNeonWs = new URL(targetUrl).hostname.endsWith(".neon.tech");
const target = new PrismaClient({
  adapter: viaNeonWs
    ? new PrismaNeon({ connectionString: targetUrl })
    : new PrismaPg({ connectionString: targetUrl }),
});

const CHUNK = 1000;

// Each entry reads every row from the source and bulk-inserts into the target.
// Written out per model (rather than a generic loop over model names) so the
// row types stay checked against the Prisma client.
const TABLES: { name: string; copy: () => Promise<{ read: number; inserted: number }> }[] = [
  {
    name: "MasterAssay",
    copy: async () => {
      const rows = await source.masterAssay.findMany();
      return insertChunks(rows, (data) => target.masterAssay.createMany({ data, skipDuplicates: true }));
    },
  },
  {
    name: "MasterItem",
    copy: async () => {
      const rows = await source.masterItem.findMany();
      // Json columns come back as JsonValue; createMany wants InputJsonValue.
      const data = rows.map((r) => ({ ...r, weights: r.weights ?? undefined }));
      return insertChunks(data, (d) => target.masterItem.createMany({ data: d, skipDuplicates: true }));
    },
  },
  {
    name: "AdditionalFocItem",
    copy: async () => {
      const rows = await source.additionalFocItem.findMany();
      return insertChunks(rows, (data) => target.additionalFocItem.createMany({ data, skipDuplicates: true }));
    },
  },
  {
    name: "TpbSettings",
    copy: async () => {
      const rows = await source.tpbSettings.findMany();
      return insertChunks(rows, (data) => target.tpbSettings.createMany({ data, skipDuplicates: true }));
    },
  },
  {
    name: "TpbEntry",
    copy: async () => {
      const rows = await source.tpbEntry.findMany();
      return insertChunks(rows, (data) => target.tpbEntry.createMany({ data, skipDuplicates: true }));
    },
  },
  {
    name: "Account",
    copy: async () => {
      const rows = await source.account.findMany();
      return insertChunks(rows, (data) => target.account.createMany({ data, skipDuplicates: true }));
    },
  },
  {
    name: "FocActual",
    copy: async () => {
      const rows = await source.focActual.findMany();
      return insertChunks(rows, (data) => target.focActual.createMany({ data, skipDuplicates: true }));
    },
  },
];

async function insertChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<{ count: number }>) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    inserted += (await insert(rows.slice(i, i + CHUNK))).count;
  }
  return { read: rows.length, inserted };
}

async function main() {
  const summary = [];
  for (const t of TABLES) {
    const { read, inserted } = await t.copy();
    summary.push({ table: t.name, source: read, inserted, skipped: read - inserted });
  }
  const targetCounts: Record<string, number> = {
    MasterAssay: await target.masterAssay.count(),
    MasterItem: await target.masterItem.count(),
    AdditionalFocItem: await target.additionalFocItem.count(),
    TpbSettings: await target.tpbSettings.count(),
    TpbEntry: await target.tpbEntry.count(),
    Account: await target.account.count(),
    FocActual: await target.focActual.count(),
  };
  console.table(summary.map((s) => ({ ...s, targetTotal: targetCounts[s.table] })));
  const drift = summary.filter((s) => s.skipped > 0 && targetCounts[s.table] !== s.source);
  if (drift.length) {
    console.warn(
      "Some rows were skipped because the target already had a different row with the same key " +
        `(${drift.map((s) => s.table).join(", ")}). Those target rows were NOT overwritten — ` +
        "update them through the admin console's import if the source is newer.",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([source.$disconnect(), target.$disconnect()]);
  });
