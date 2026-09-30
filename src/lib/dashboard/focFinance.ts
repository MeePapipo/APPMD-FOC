import { ratioOf } from "./focActualsAggregate";
import { periodLabel } from "./period";

type FinanceFact = { year: number; month: number; revenue: number; focCost: number; bonusCost: number };

export type FinanceRow = { key: string; label: string; revenue: number; focCost: number; bonusCost: number; totalCost: number; ratio: number };

/** Cost and cost/revenue for every month that has data, oldest first (the Alerts view's finance table). */
export function financeByMonth(facts: FinanceFact[]): FinanceRow[] {
  const buckets = new Map<string, { year: number; month: number; revenue: number; focCost: number; bonusCost: number }>();
  for (const f of facts) {
    const key = `${f.year}-${String(f.month).padStart(2, "0")}`;
    const b = buckets.get(key) ?? { year: f.year, month: f.month, revenue: 0, focCost: 0, bonusCost: 0 };
    b.revenue += f.revenue;
    b.focCost += f.focCost;
    b.bonusCost += f.bonusCost;
    buckets.set(key, b);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, b]) => {
      const totalCost = b.focCost + b.bonusCost;
      return { key, label: periodLabel(b.year, b.month), revenue: b.revenue, focCost: b.focCost, bonusCost: b.bonusCost, totalCost, ratio: ratioOf(b.revenue, totalCost) };
    });
}

/** Adds the total and ratio to a team breakdown row. */
export function withRatio<T extends { revenue: number; focCost: number; bonusCost: number }>(row: T): T & { totalCost: number; ratio: number } {
  const totalCost = row.focCost + row.bonusCost;
  return { ...row, totalCost, ratio: ratioOf(row.revenue, totalCost) };
}
