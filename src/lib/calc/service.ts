import { prisma } from "@/lib/prisma";
import { System } from "@prisma/client";
import { computeSubmission } from "./engine";
import { mergeTests, type AssayLite, type ItemLite, type TestsBySystem, type SysCode, type ComputeOptions } from "./types";
import type { TpbTableInput } from "./tpb";
import { tpbNotices, type TpbMeta } from "./tpbNotices";
import { basisForOrder, resolveAccountTpb, sumOwn, type TpbDetail, type UsageRow } from "./accountTpb";

const SYS_TO_CODE: Record<System, SysCode> = {
  [System.S6800]: "6800",
  [System.S5800]: "5800",
  [System.S4800]: "4800",
};
const CODE_TO_SYS: Record<SysCode, System> = {
  "6800": System.S6800,
  "5800": System.S5800,
  "4800": System.S4800,
};

export { CODE_TO_SYS, SYS_TO_CODE };

/** Loads MasterAssay/MasterItem/TpbEntry from the DB and maps them to the pure engine's Lite types. */
/**
 * Each account's own usage, pooled over the latest `accountWindowMonths` months
 * of InstrumentUsageMonth. One account when `accountId` is given, else all
 * accounts that have instruments (the dashboard scores every account at once).
 */
export async function loadOwnTpbByAccount(accountId?: string) {
  const tpbSettings = await prisma.tpbSettings.findUnique({ where: { id: "singleton" } });
  const settings = {
    floorRatio: tpbSettings?.accountFloorRatio ?? 0.5,
    minRuns: tpbSettings?.accountMinRuns ?? 8,
  };
  const windowMonths = tpbSettings?.accountWindowMonths ?? 4;
  const monthRows = await prisma.instrumentUsageMonth.findMany({
    distinct: ["month"],
    select: { month: true },
    orderBy: { month: "desc" },
    take: windowMonths,
  });
  const usage = await prisma.instrumentUsageMonth.findMany({
    where: {
      month: { in: monthRows.map((m) => m.month) },
      instrument: { accountId: accountId ?? { not: null } },
    },
    select: { assayCode: true, runs: true, samples: true, instrument: { select: { systemClass: true, accountId: true } } },
  });
  const rowsByAccount = new Map<string, UsageRow[]>();
  for (const u of usage) {
    const id = u.instrument.accountId!;
    const rows = rowsByAccount.get(id) ?? [];
    rows.push({
      // c6800 and c8800 share the 6800 model; c4800 has no TPB.
      system: u.instrument.systemClass === "c5800" ? "5800" : "6800",
      assay: u.assayCode,
      runs: u.runs,
      samples: u.samples,
    });
    rowsByAccount.set(id, rows);
  }
  const ownByAccount = new Map([...rowsByAccount].map(([id, rows]) => [id, sumOwn(rows)]));
  return { settings, ownByAccount };
}

/**
 * With an `accountId` the national TPB table is overlaid with that account's own
 * samples-per-run (see accountTpb.ts). Without one it is exactly the national table.
 */
export async function loadEngineData(accountId?: string): Promise<{
  assays: AssayLite[];
  items: ItemLite[];
  tpbInput: TpbTableInput;
  tpbMeta: TpbMeta[];
  tpbDetail?: Map<string, TpbDetail>;
}> {
  const [assayRows, itemRows, tpbSettings, tpbRows] = await Promise.all([
    prisma.masterAssay.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.masterItem.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.tpbSettings.findUnique({ where: { id: "singleton" } }),
    prisma.tpbEntry.findMany(),
  ]);

  const assays: AssayLite[] = assayRows.map((a) => ({
    system: SYS_TO_CODE[a.system],
    code: a.code,
    description: a.description,
    materialNo: a.materialNo,
    dkshCode: a.dkshCode,
    batchRow: a.batchRow,
    batchLabel: a.batchLabel,
    packSize: a.packSize,
    price: a.price,
  }));

  const items: ItemLite[] = itemRows.map((i) => ({
    system: SYS_TO_CODE[i.system],
    materialNo: i.materialNo,
    dkshCode: i.dkshCode,
    description: i.description,
    category: i.category,
    usageType: i.usageType,
    unitText: i.unitText,
    driver: i.driver,
    appliesTo: i.appliesToAll ? null : i.appliesTo,
    consumption: i.consumption,
    coverage: i.coverage,
    packSize: i.packSize,
    price: i.price,
    onDemand: i.onDemand,
    optional: i.optional,
    weights: (i.weights as Record<string, number> | null) ?? null,
  }));

  const nationalTpb: TpbTableInput = {
    floors: {
      "6800": tpbSettings?.floor6800 ?? 24,
      "5800": tpbSettings?.floor5800 ?? 6,
    },
    values: tpbRows
      .filter((v) => v.system === System.S6800 || v.system === System.S5800)
      .map((v) => ({ system: SYS_TO_CODE[v.system] as "6800" | "5800", code: v.code, tpb: v.tpb })),
  };

  const tpbMeta: TpbMeta[] = tpbRows
    .filter((v) => v.system === System.S6800 || v.system === System.S5800)
    .map((v) => ({
      system: SYS_TO_CODE[v.system] as "6800" | "5800",
      code: v.code,
      tpb: v.tpb,
      confidence: v.confidence,
      monthsWithData: v.monthsWithData,
    }));

  if (!accountId) return { assays, items, tpbInput: nationalTpb, tpbMeta };

  const { settings, ownByAccount } = await loadOwnTpbByAccount(accountId);
  const { input, detail } = resolveAccountTpb(nationalTpb, ownByAccount.get(accountId) ?? new Map(), settings);
  return { assays, items, tpbInput: input, tpbMeta, tpbDetail: detail };
}

/** Live-preview / submit compute — loads current master data and runs the pure engine. */
export async function computeForTests(testsBySys: TestsBySystem, opts: ComputeOptions = {}, accountId?: string) {
  const { assays, items, tpbInput, tpbMeta, tpbDetail } = await loadEngineData(accountId);
  const result = computeSubmission(items, assays, testsBySys, tpbInput, opts);
  // Run estimates and the TPB basis describe what the instrument runs, free reagent included.
  testsBySys = mergeTests(testsBySys, opts.freeTestsBySys);
  return {
    result,
    items,
    assays,
    tpbInput,
    tpbNotices: tpbNotices(tpbMeta, tpbInput.floors, testsBySys, tpbDetail),
    // What each ordered assay was computed with — stored on the submission.
    tpbBasis: tpbDetail ? basisForOrder(tpbDetail, testsBySys, tpbInput.floors) : null,
    tpbFloors: tpbInput.floors,
  };
}
