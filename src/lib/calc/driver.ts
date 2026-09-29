import type { BatchGroup } from "./batches";
import type { ItemLite, TestVector } from "./types";

/**
 * Units needed for one BATCH/TEST-driven item row (pieces before packaging
 * into boxes), for cobas 6800/8800 or 5800 items only — see engine4800.ts for
 * cobas 4800's weighted-linear model.
 *
 * Iterates `item.appliesTo` (or every assay code for the item's system when
 * `appliesTo` is null) directly. Do NOT hardcode a single system's code list
 * here — ~/foc-excel/verify.mjs's own reference model has exactly that bug in
 * its TEST-driver loop (hardcoded to the 6800 code list), which silently
 * zeroes out any assay code outside it, e.g. every cobas 4800 code.
 */
export function unitsForItem(
  item: ItemLite,
  allCodesForSystem: string[],
  groups: BatchGroup[],
  runs: Map<number, number>,
  tests: TestVector,
): number {
  const on = new Set(item.appliesTo ?? allCodesForSystem);
  let driverSum = 0;
  if (item.driver === "BATCH") {
    for (const g of groups) {
      if (g.codes.some((c) => on.has(c))) driverSum += runs.get(g.batchRow) ?? 0;
    }
  } else {
    for (const c of on) driverSum += tests[c] ?? 0;
  }
  return driverSum * item.consumption;
}
