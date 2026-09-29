/**
 * Seeds MasterAssay / MasterItem / TpbSettings / TpbEntry / Account straight
 * from ~/foc-excel/data/*.json — the canonical structured source of truth for
 * the driver-based calculation model. No xlsx parsing needed here (unlike
 * v1's scripts/generate-seed.py); ~/foc-excel/extract.mjs already did that.
 *
 * Run: npm run import-foc-excel
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, System, Driver } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const FOC_EXCEL_DIR = join(process.env.HOME ?? "/home/praditww", "foc-excel");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function readJson<T>(relPath: string): T {
  return JSON.parse(readFileSync(join(FOC_EXCEL_DIR, relPath), "utf8")) as T;
}

const SYS_MAP: Record<"6800" | "5800" | "4800", System> = {
  "6800": System.S6800,
  "5800": System.S5800,
  "4800": System.S4800,
};

interface RawAssay {
  system: "6800" | "5800" | "4800";
  code: string;
  srcRow: number;
  batchRow: number | null;
  batchLabel: string | null;
  category: string | null;
  materialNo: string;
  dkshCode: string | null;
  description: string;
  usageType: string | null;
  usageGroup: string | null;
  packText: string | null;
  packSize: number;
  unitText: string | null;
  price: number | null;
  pricePerTest: number | null;
  testsPerBatchDefault: number | null;
  neg: string | null;
}

interface RawItem {
  system: "6800" | "5800" | "4800";
  srcRow: number | null;
  group: string;
  category: string | null;
  materialNo: string;
  dkshCode: string | null;
  description: string;
  usageType: string | null;
  usageGroup: string | null;
  optional: boolean;
  packText: string | null;
  packSize: number;
  consumption: number;
  coverage: number;
  unitText: string | null;
  price: number | null;
  priceText: string | null;
  driver: "BATCH" | "TEST";
  appliesTo: string[] | null;
  onDemand: boolean;
  srcFormula: string | null;
  fix: string | null;
  weights?: Record<string, number> | null;
}

interface RawTpb {
  method: string;
  asOf: string;
  floors: { "6800": number; "5800": number };
  values: {
    system: "6800" | "5800";
    code: string;
    tpb: number;
    monthsWithData: string;
    totalRuns: number;
    totalSamples: number;
    confidence: string;
    notes: string;
  }[];
}

interface RawAccount {
  number: string;
  name: string;
}

async function main() {
  const assays = readJson<RawAssay[]>("data/assays.json");
  const items = readJson<RawItem[]>("data/items.json");
  const tpb = readJson<RawTpb>("data/tpb.json");
  const accounts = readJson<RawAccount[]>("data/accounts.json");

  console.log(`Loaded ${assays.length} assays, ${items.length} items, ${tpb.values.length} TPB entries, ${accounts.length} accounts.`);

  await prisma.$transaction(async (tx) => {
    for (const [i, a] of assays.entries()) {
      await tx.masterAssay.upsert({
        where: { system_code: { system: SYS_MAP[a.system], code: a.code } },
        create: {
          system: SYS_MAP[a.system],
          code: a.code,
          srcRow: a.srcRow,
          batchRow: a.batchRow,
          batchLabel: a.batchLabel,
          category: a.category,
          materialNo: a.materialNo,
          dkshCode: a.dkshCode,
          description: a.description,
          usageType: a.usageType,
          usageGroup: a.usageGroup,
          packText: a.packText,
          packSize: a.packSize,
          unitText: a.unitText,
          price: a.price,
          pricePerTest: a.pricePerTest,
          testsPerBatchDefault: a.testsPerBatchDefault,
          negCode: a.neg,
          sortOrder: i,
        },
        update: {
          srcRow: a.srcRow,
          batchRow: a.batchRow,
          batchLabel: a.batchLabel,
          category: a.category,
          materialNo: a.materialNo,
          dkshCode: a.dkshCode,
          description: a.description,
          usageType: a.usageType,
          usageGroup: a.usageGroup,
          packText: a.packText,
          packSize: a.packSize,
          unitText: a.unitText,
          price: a.price,
          pricePerTest: a.pricePerTest,
          testsPerBatchDefault: a.testsPerBatchDefault,
          negCode: a.neg,
          sortOrder: i,
        },
      });
    }
    console.log(`Upserted ${assays.length} MasterAssay rows.`);

    for (const [i, it] of items.entries()) {
      await tx.masterItem.upsert({
        where: { system_materialNo: { system: SYS_MAP[it.system], materialNo: it.materialNo } },
        create: {
          system: SYS_MAP[it.system],
          srcRow: it.srcRow,
          group: it.group,
          category: it.category,
          materialNo: it.materialNo,
          dkshCode: it.dkshCode,
          description: it.description,
          usageType: it.usageType,
          usageGroup: it.usageGroup,
          optional: it.optional,
          onDemand: it.onDemand,
          packText: it.packText,
          packSize: it.packSize,
          consumption: it.consumption,
          coverage: it.coverage,
          unitText: it.unitText,
          price: it.price,
          priceText: it.priceText,
          driver: it.driver as Driver,
          appliesTo: it.appliesTo ?? [],
          appliesToAll: it.appliesTo === null,
          weights: it.weights ?? undefined,
          srcFormula: it.srcFormula,
          fixNote: it.fix,
          sortOrder: i,
        },
        update: {
          srcRow: it.srcRow,
          group: it.group,
          category: it.category,
          materialNo: it.materialNo,
          dkshCode: it.dkshCode,
          description: it.description,
          usageType: it.usageType,
          usageGroup: it.usageGroup,
          optional: it.optional,
          onDemand: it.onDemand,
          packText: it.packText,
          packSize: it.packSize,
          consumption: it.consumption,
          coverage: it.coverage,
          unitText: it.unitText,
          price: it.price,
          priceText: it.priceText,
          driver: it.driver as Driver,
          appliesTo: it.appliesTo ?? [],
          appliesToAll: it.appliesTo === null,
          weights: it.weights ?? undefined,
          srcFormula: it.srcFormula,
          fixNote: it.fix,
          sortOrder: i,
        },
      });
    }
    console.log(`Upserted ${items.length} MasterItem rows.`);

    await tx.tpbSettings.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        floor6800: tpb.floors["6800"],
        floor5800: tpb.floors["5800"],
        method: tpb.method,
        asOf: new Date(tpb.asOf),
      },
      update: {
        floor6800: tpb.floors["6800"],
        floor5800: tpb.floors["5800"],
        method: tpb.method,
        asOf: new Date(tpb.asOf),
      },
    });

    for (const v of tpb.values) {
      await tx.tpbEntry.upsert({
        where: { system_code: { system: SYS_MAP[v.system], code: v.code } },
        create: {
          system: SYS_MAP[v.system],
          code: v.code,
          tpb: v.tpb,
          confidence: v.confidence,
          monthsWithData: v.monthsWithData,
          totalRuns: v.totalRuns,
          totalSamples: v.totalSamples,
          notes: v.notes,
          asOf: new Date(tpb.asOf),
        },
        update: {
          tpb: v.tpb,
          confidence: v.confidence,
          monthsWithData: v.monthsWithData,
          totalRuns: v.totalRuns,
          totalSamples: v.totalSamples,
          notes: v.notes,
          asOf: new Date(tpb.asOf),
        },
      });
    }
    console.log(`Upserted TpbSettings + ${tpb.values.length} TpbEntry rows.`);

    for (const acc of accounts) {
      await tx.account.upsert({
        where: { accountNumber: acc.number },
        create: { accountNumber: acc.number, accountName: acc.name },
        update: { accountName: acc.name },
      });
    }
    console.log(`Upserted ${accounts.length} Account rows.`);
  });

  console.log("Import complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
