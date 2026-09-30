/**
 * Per-account monthly cost (FOC + Bonus) for one year — the series behind the
 * Accounts list's sparkline. Pure, built from the facts the page already loads.
 */

export type SeriesFact = { year: number; month: number; accountName: string; focCost: number; bonusCost: number };

/** accountName -> 12 numbers, Jan..Dec. Accounts with nothing that year are absent. */
export function monthlyCostByAccount(facts: SeriesFact[], year: number, accounts?: Set<string>): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const f of facts) {
    if (f.year !== year || f.month < 1 || f.month > 12) continue;
    if (accounts && !accounts.has(f.accountName)) continue;
    const series = (out[f.accountName] ??= Array<number>(12).fill(0));
    series[f.month - 1] += f.focCost + f.bonusCost;
  }
  return out;
}
