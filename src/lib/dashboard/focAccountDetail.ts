/**
 * Per-account drill-down aggregation for the Dashboard's account modal —
 * scoped to one account's `FocActual` rows across its **full** available
 * history (the modal deliberately ignores the page's year/month filter, same
 * as the reference dashboard's own account modal: "ไม่ขึ้นกับตัวกรองเดือน").
 *
 * This is Part 1 of the account drill-down (see the approved plan) — real
 * actuals only, no entitlement/quota math. Quota-vs-actual is a separate,
 * deliberately deferred follow-up (materialNo doesn't uniquely imply a
 * system, and the quota-driving test count must come from Selling Quantity,
 * not the raw `tests` field — see the plan for why).
 */

import { monthKey, monthLabel, ratioOf } from "./focActualsAggregate";

export type FocAccountFact = {
  year: number;
  month: number;
  materialNo: string;
  productName: string;
  revenue: number;
  revenueQty: number;
  soldQty: number;
  focCost: number;
  focQty: number;
  bonusCost: number;
  bonusQty: number;
};

export function accountSummary(rows: FocAccountFact[]): {
  revenue: number;
  focCost: number;
  bonusCost: number;
  totalCost: number;
  ratio: number;
  soldQty: number;
  focQty: number;
  bonusQty: number;
} {
  const t = { revenue: 0, focCost: 0, bonusCost: 0, soldQty: 0, focQty: 0, bonusQty: 0 };
  for (const r of rows) {
    t.revenue += r.revenue;
    t.focCost += r.focCost;
    t.bonusCost += r.bonusCost;
    t.soldQty += r.soldQty;
    t.focQty += r.focQty;
    t.bonusQty += r.bonusQty;
  }
  const totalCost = t.focCost + t.bonusCost;
  return { ...t, totalCost, ratio: ratioOf(t.revenue, totalCost) };
}

/** Every month present in this account's history, sorted ascending — not a
 * zero-filled rolling window (there is no "now" reference point once you've
 * scoped to a single account's own full history). */
export function accountMonthlyTrend(
  rows: FocAccountFact[],
): { key: string; label: string; revenue: number; focCost: number; bonusCost: number; focValue: number; ratio: number }[] {
  const buckets = new Map<string, { revenue: number; focCost: number; bonusCost: number }>();
  for (const r of rows) {
    const key = monthKey(r.year, r.month);
    const b = buckets.get(key) ?? { revenue: 0, focCost: 0, bonusCost: 0 };
    b.revenue += r.revenue;
    b.focCost += r.focCost;
    b.bonusCost += r.bonusCost;
    buckets.set(key, b);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => {
      const focValue = v.focCost + v.bonusCost;
      return { key, label: monthLabel(key), ...v, focValue, ratio: ratioOf(v.revenue, focValue) };
    });
}

/** FOC + Bonus given, ranked by value — "products given to this account". */
export function accountProductsGiven(
  rows: FocAccountFact[],
  limit = 10,
): { materialNo: string; productName: string; focQty: number; bonusQty: number; focCost: number; bonusCost: number; focValue: number }[] {
  const buckets = new Map<
    string,
    { productName: string; focQty: number; bonusQty: number; focCost: number; bonusCost: number }
  >();
  for (const r of rows) {
    const key = r.materialNo || r.productName;
    const b = buckets.get(key) ?? { productName: r.productName, focQty: 0, bonusQty: 0, focCost: 0, bonusCost: 0 };
    b.focQty += r.focQty;
    b.bonusQty += r.bonusQty;
    b.focCost += r.focCost;
    b.bonusCost += r.bonusCost;
    buckets.set(key, b);
  }
  return [...buckets.entries()]
    .map(([materialNo, v]) => ({ materialNo, ...v, focValue: v.focCost + v.bonusCost }))
    .filter((v) => v.focValue !== 0 || v.focQty !== 0 || v.bonusQty !== 0)
    .sort((a, b) => b.focValue - a.focValue)
    .slice(0, limit);
}

/** Revenue-category sales, ranked by revenue — "products sold to this
 * account" (revenue here already only reflects "Reagents, kits" rows, same
 * restriction as everywhere else this app reads `FocActual.revenue`). */
export function accountProductsSold(
  rows: FocAccountFact[],
  limit = 10,
): { materialNo: string; productName: string; revenueQty: number; revenue: number }[] {
  const buckets = new Map<string, { productName: string; revenueQty: number; revenue: number }>();
  for (const r of rows) {
    if (r.revenue === 0 && r.revenueQty === 0) continue;
    const key = r.materialNo || r.productName;
    const b = buckets.get(key) ?? { productName: r.productName, revenueQty: 0, revenue: 0 };
    b.revenueQty += r.revenueQty;
    b.revenue += r.revenue;
    buckets.set(key, b);
  }
  // A sale reversed by a credit note nets to zero (or below): nothing was sold, so it is not listed.
  return [...buckets.entries()]
    .map(([materialNo, v]) => ({ materialNo, ...v }))
    .filter((v) => v.revenueQty > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}
