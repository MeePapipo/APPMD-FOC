import { prisma } from "@/lib/prisma";
import { System } from "@prisma/client";
import { computeSubmission } from "./engine";
import type { AssayLite, ItemLite, TestsBySystem, SysCode, ComputeOptions } from "./types";
import type { TpbTableInput } from "./tpb";

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
export async function loadEngineData(): Promise<{
  assays: AssayLite[];
  items: ItemLite[];
  tpbInput: TpbTableInput;
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

  const tpbInput: TpbTableInput = {
    floors: {
      "6800": tpbSettings?.floor6800 ?? 24,
      "5800": tpbSettings?.floor5800 ?? 6,
    },
    values: tpbRows
      .filter((v) => v.system === System.S6800 || v.system === System.S5800)
      .map((v) => ({ system: SYS_TO_CODE[v.system] as "6800" | "5800", code: v.code, tpb: v.tpb })),
  };

  return { assays, items, tpbInput };
}

/** Live-preview / submit compute — loads current master data and runs the pure engine. */
export async function computeForTests(testsBySys: TestsBySystem, opts: ComputeOptions = {}) {
  const { assays, items, tpbInput } = await loadEngineData();
  const result = computeSubmission(items, assays, testsBySys, tpbInput, opts);
  return { result, items, assays };
}
