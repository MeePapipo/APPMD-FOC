import type { ItemLite, TestVector } from "./types";

/**
 * cobas 4800 has no batch/run/TPB concept at all — confirmed with the
 * business, not a data gap. Every item's raw units are a per-assay-code
 * weighted-linear combination of test counts. The weights are the source of
 * truth here: they were derived directly from "FOC Master Data _30 Aug
 * 2.xlsx"'s own shipped formulas (see ~/foc-excel/extract.mjs's
 * deriveWeights4800, which isolates each code's coefficient and validates
 * linearity against 20 synthetic test-count vectors within 1e-9 relative
 * tolerance) — NOT from ~/foc-excel/verify.mjs's modelMixed(), which has a
 * confirmed bug for cobas 4800 (its TEST-driver loop iterates a hardcoded
 * 6800-only assay-code list, so it silently computes 0 for every 4800 item).
 */
export function unitsFor4800Item(item: ItemLite, tests: TestVector): number {
  // onDemand items (manual freebies) are never driven — same as 6800/5800,
  // where onDemand rows carry appliesTo:[] so their driver sum is naturally 0.
  // cobas 4800's onDemand rows simply have no weights map at all.
  if (item.onDemand) return 0;
  if (!item.weights) {
    throw new Error(`cobas 4800 item ${item.materialNo} (${item.description}) is missing weights`);
  }
  let sum = 0;
  for (const [code, weight] of Object.entries(item.weights)) {
    sum += (tests[code] ?? 0) * weight;
  }
  return sum;
}
