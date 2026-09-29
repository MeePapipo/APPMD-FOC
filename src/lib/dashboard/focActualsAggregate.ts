/**
 * Aggregation for the Dashboard — over `FocActual` rows, the nationwide
 * sales/cost/FOC actuals imported from the Tableau export. This is the
 * Dashboard's only data source (the earlier Submission-based "My orders"
 * tab was removed — praditww only wants the real Tableau-sourced numbers).
 */

export type FocActualFact = {
  year: number;
  month: number;
  team: string | null;
  rep: string | null;
  accountName: string;
  materialNo: string;
  productName: string;
  revenue: number;
  focCost: number;
  bonusCost: number;
  soldQty: number;
};

/** "FOC value" here means the same thing it does for Submission-based data:
 * the cost of what was given away (FOC + Bonus), separate from revenue. */
const focValueOf = (f: Pick<FocActualFact, "focCost" | "bonusCost">) => f.focCost + f.bonusCost;

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

/** The reference tool's own three-way rule, factored out so every ratio
 * computed anywhere in this app agrees: revenue > 0 -> a real ratio; revenue
 * 0 but cost > 0 -> `Infinity` (an unbillable give-away, "N/A" in the UI);
 * revenue 0 and cost 0 -> `0` (nothing happened, not a breach). Never `NaN`. */
export function ratioOf(revenue: number, totalCost: number): number {
  return revenue > 0 ? totalCost / revenue : totalCost > 0 ? Infinity : 0;
}

type CostBucket = { revenue: number; focCost: number; bonusCost: number };
const newBucket = (): CostBucket => ({ revenue: 0, focCost: 0, bonusCost: 0 });
const addFact = (bucket: CostBucket, f: FocActualFact) => {
  bucket.revenue += f.revenue;
  bucket.focCost += f.focCost;
  bucket.bonusCost += f.bonusCost;
};
const withFocValue = <T extends CostBucket>(v: T) => ({ ...v, focValue: v.focCost + v.bonusCost });

export function focMonthlyTrend(
  facts: FocActualFact[],
  monthsBack = 12,
  now = new Date(),
): { key: string; label: string; revenue: number; focCost: number; bonusCost: number; focValue: number }[] {
  const buckets = new Map<string, CostBucket>();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.set(monthKey(d.getFullYear(), d.getMonth() + 1), newBucket());
  }
  for (const f of facts) {
    const bucket = buckets.get(monthKey(f.year, f.month));
    if (!bucket) continue;
    addFact(bucket, f);
  }
  return [...buckets.entries()].map(([key, v]) => ({ key, label: monthLabel(key), ...withFocValue(v) }));
}

export function focTeamBreakdown(
  facts: FocActualFact[],
): { team: string; label: string; revenue: number; focCost: number; bonusCost: number; focValue: number }[] {
  const buckets = new Map<string, CostBucket>();
  for (const f of facts) {
    const key = f.team ?? "Unassigned";
    const bucket = buckets.get(key) ?? newBucket();
    addFact(bucket, f);
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .map(([team, v]) => ({ team, label: team, ...withFocValue(v) }))
    .sort((a, b) => b.focValue - a.focValue);
}

/** One row per account, every account (not capped) — callers slice/sort/filter
 * as needed for the cost-ranked panel, the ratio-ranked panel, and the detail
 * table, so all three always agree on the underlying numbers. `ratio`
 * matches the reference tool's own three-way rule exactly (confirmed real:
 * 2 of 238 accounts hit the zero/zero branch in the imported data): revenue
 * > 0 -> a real ratio; revenue 0 but cost > 0 -> `Infinity` (an unbillable
 * give-away, the source data's own "N/A" case); revenue 0 and cost 0 -> `0`
 * (nothing happened for this account, not a ratio breach). Never `NaN`, so
 * callers can filter the give-away case out of a ratio ranking with a plain
 * `Number.isFinite` check. */
export function focAccountRows(
  facts: FocActualFact[],
): { accountName: string; revenue: number; focCost: number; bonusCost: number; totalCost: number; ratio: number }[] {
  const buckets = new Map<string, CostBucket>();
  for (const f of facts) {
    const bucket = buckets.get(f.accountName) ?? newBucket();
    addFact(bucket, f);
    buckets.set(f.accountName, bucket);
  }
  return [...buckets.entries()].map(([accountName, v]) => {
    const totalCost = v.focCost + v.bonusCost;
    const ratio = v.revenue > 0 ? totalCost / v.revenue : totalCost > 0 ? Infinity : 0;
    return { accountName, ...v, totalCost, ratio };
  });
}

export function focCostComposition(facts: FocActualFact[]): { focCost: number; bonusCost: number; revenue: number } {
  const totals = { focCost: 0, bonusCost: 0, revenue: 0 };
  for (const f of facts) {
    totals.focCost += f.focCost;
    totals.bonusCost += f.bonusCost;
    totals.revenue += f.revenue;
  }
  return totals;
}

export function focTopProducts(
  facts: FocActualFact[],
  limit = 10,
): { materialNo: string; productName: string; qty: number; focValue: number }[] {
  const buckets = new Map<string, { productName: string; qty: number; focValue: number }>();
  for (const f of facts) {
    const key = f.materialNo || f.productName;
    const bucket = buckets.get(key) ?? { productName: f.productName, qty: 0, focValue: 0 };
    bucket.qty += f.soldQty;
    bucket.focValue += focValueOf(f);
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .map(([materialNo, v]) => ({ materialNo, ...v }))
    .sort((a, b) => b.focValue - a.focValue)
    .slice(0, limit);
}
