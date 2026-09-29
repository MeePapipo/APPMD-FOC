import type { AssayLite, BatchSysCode, TestVector } from "./types";
import { tpbOf, type TpbTable } from "./tpb";
import { ceil } from "./round";

export interface BatchGroup {
  batchRow: number;
  label?: string | null;
  codes: string[];
}

/** Groups a system's assays by shared batchRow (e.g. SARS192+SARS480 merge into one run line). */
export function groupsFor(system: BatchSysCode, assays: AssayLite[]): BatchGroup[] {
  const groups: BatchGroup[] = [];
  for (const a of assays) {
    if (a.system !== system || a.batchRow == null) continue;
    const existing = groups.find((g) => g.batchRow === a.batchRow);
    if (existing) existing.codes.push(a.code);
    else groups.push({ batchRow: a.batchRow, label: a.batchLabel, codes: [a.code] });
  }
  return groups;
}

/**
 * Effective TPB divisor for a batch group: the MAX observed TPB across the
 * group's codes — matches ~/foc-excel's `_Calc!F` / verify.mjs's effTpb().
 * A group can merge codes with different individual TPBs (e.g. SARS192+SARS480).
 */
export function effTpb(table: TpbTable, system: BatchSysCode, group: BatchGroup): number {
  return Math.max(...group.codes.map((c) => tpbOf(table, system, c)));
}

/** batchRow -> run count for a system, given that system's test-count vector. */
export function runsForSystem(
  system: BatchSysCode,
  groups: BatchGroup[],
  tests: TestVector,
  table: TpbTable,
): Map<number, number> {
  const runs = new Map<number, number>();
  for (const g of groups) {
    const totalTests = g.codes.reduce((sum, c) => sum + (tests[c] ?? 0), 0);
    runs.set(g.batchRow, ceil(totalTests / effTpb(table, system, g)));
  }
  return runs;
}
