import type { MaterialGiven } from "./entitlement";

export type ActualForGot = {
  materialNo: string;
  productName: string;
  soldQty: number;
  revenueQty?: number;
  focQty: number;
  bonusQty: number;
  focCost: number;
  bonusCost: number;
  year?: number;
  month?: number;
};

/** The account's reagent "bills": the months in which it bought reagent kits. The Tableau export has no
 * invoice numbers, so one month with reagent sales counts as one bill (several invoices in a month count once). */
export function reagentBillMonths(rows: { year?: number; month?: number; revenueQty?: number }[]): number {
  const months = new Set<number>();
  for (const r of rows) if ((r.revenueQty ?? 0) > 0 && r.year !== undefined && r.month !== undefined) months.add(r.year * 12 + r.month);
  return months.size;
}

/** How far back stand-alone FOC is counted for the alert: a rolling window, not the account's lifetime. */
export const FOC_ALERT_MONTHS = 12;

/** The period index (year*12+month) the rolling window starts at, given the latest month with data. */
export function recentFromPeriod(latest: { year: number; month: number } | null, months = FOC_ALERT_MONTHS): number | undefined {
  return latest ? latest.year * 12 + latest.month - (months - 1) : undefined;
}

/**
 * "got" for the entitlement engine: one account's FocActual rows summed across
 * their full history by materialNo.
 *
 * `soldQty` (unrestricted), not `revenueQty` — the latter is zeroed by our own
 * import pipeline for anything outside the "Reagents, kits" category, which is
 * correct for revenue but wrong here: a non-reagent give-away item (e.g. an
 * Additional FOC consumable) can still carry a real Selling Quantity movement
 * (a credit/return), and for genuine reagent-kit rows the two are numerically
 * identical anyway (a reagent materialNo is always "Reagents, kits").
 */
export function buildGot(rows: ActualForGot[], recentFrom?: number): Map<string, MaterialGiven> {
  const got = new Map<string, MaterialGiven>();
  for (const r of rows) {
    const d = got.get(r.materialNo) ?? { sold: 0, foc: 0, bonus: 0, freeCost: 0, productName: r.productName };
    d.sold += r.soldQty;
    d.foc += r.focQty;
    d.bonus += r.bonusQty;
    d.freeCost += r.focCost + r.bonusCost;
    d.focCost = (d.focCost ?? 0) + r.focCost;
    d.bonusCost = (d.bonusCost ?? 0) + r.bonusCost;
    if (recentFrom !== undefined && r.year !== undefined && r.month !== undefined) {
      // Only the stand-alone FOC alert looks at this; the quota itself stays cumulative.
      d.focCostRecent = (d.focCostRecent ?? 0) + (r.year * 12 + r.month >= recentFrom ? r.focCost : 0);
    }
    got.set(r.materialNo, d);
  }
  return got;
}

/**
 * FocActual only carries the ship-to name, which ends in the account number,
 * zero-padded: "PICHIT HOSPITAL  (0052027798)". The Account table stores it
 * without the padding.
 */
export function accountNumberFromName(name: string): string | null {
  const m = name.match(/\(([^()]+)\)\s*$/);
  const n = m?.[1].trim().replace(/^0+/, "");
  return n || null;
}
