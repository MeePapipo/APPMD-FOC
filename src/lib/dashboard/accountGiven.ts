import type { MaterialGiven } from "./entitlement";

export type ActualForGot = {
  materialNo: string;
  productName: string;
  soldQty: number;
  focQty: number;
  bonusQty: number;
  focCost: number;
  bonusCost: number;
};

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
export function buildGot(rows: ActualForGot[]): Map<string, MaterialGiven> {
  const got = new Map<string, MaterialGiven>();
  for (const r of rows) {
    const d = got.get(r.materialNo) ?? { sold: 0, foc: 0, bonus: 0, freeCost: 0, productName: r.productName };
    d.sold += r.soldQty;
    d.foc += r.focQty;
    d.bonus += r.bonusQty;
    d.freeCost += r.focCost + r.bonusCost;
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
