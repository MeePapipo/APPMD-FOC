/**
 * Stock-on-hand and manual-adjustment arithmetic, shared by the calculator UI
 * and the submit endpoint so the numbers a rep sees are the numbers persisted.
 *
 * Ports the v1 workbook's summary-sheet formulas verbatim
 * (~/foc-excel/build.mjs, columns I and M):
 *   I = MAX(0, calculated - stock)
 *   M = MAX(0, I + adjust)
 * Both clamps matter: a site holding more stock than the order calls for must
 * not produce a negative line, and neither must an over-eager negative adjust.
 */

export interface Adjustment {
  /** undefined = rep did not state a stock level; persisted as null, not 0. */
  stockOnHand?: number;
  /** Signed delta applied after the stock deduction. */
  adjust?: number;
  /** Mandatory whenever `adjust` is positive (giving more than calculated). */
  comment?: string;
}

export type AdjustmentMap = Record<string, Adjustment>;

export interface AdjustedQuantities {
  calculatedQty: number;
  stockOnHand: number | null;
  afterStockQty: number;
  adjustedQty: number;
  finalQty: number;
  lineValue: number;
}

export function applyAdjustment(
  calculatedQty: number,
  unitPrice: number | null,
  adjustment: Adjustment | undefined,
): AdjustedQuantities {
  const stockOnHand = adjustment?.stockOnHand ?? null;
  const adjustedQty = adjustment?.adjust ?? 0;
  const afterStockQty = Math.max(0, calculatedQty - (stockOnHand ?? 0));
  const finalQty = Math.max(0, afterStockQty + adjustedQty);
  return {
    calculatedQty,
    stockOnHand,
    afterStockQty,
    adjustedQty,
    finalQty,
    lineValue: finalQty * (unitPrice ?? 0),
  };
}

/**
 * True when the rep owes a written reason for the quantity they entered.
 *
 * Only required on required (driver-mandated) lines, and only when the
 * adjustment is positive: there the formula said how many are needed and a
 * human is handing over *more* than that, which the audit trail has to
 * explain. A negative adjustment (giving fewer than calculated) costs
 * nothing and needs no one's attention — same reasoning as `overGiveQty`
 * below, just applied before the order is confirmed rather than after.
 * Optional give-aways are discretionary by definition — the rep deciding to
 * hand over one box instead of two is the feature, not an exception, so
 * demanding a justification for it is pure friction.
 */
export function needsComment(adjustment: Adjustment | undefined, optional = false): boolean {
  if (optional) return false;
  return (adjustment?.adjust ?? 0) > 0 && !adjustment?.comment?.trim();
}

/**
 * Packs handed over beyond what the formula and the site's own stock justify.
 *
 * Derived from `finalQty`, deliberately NOT from `adjustedQty`: `applyAdjustment`
 * floors the final quantity at zero, so a rep who types -99 against an
 * after-stock of 3 stores `adjustedQty: -99` while only 3 packs actually moved.
 * Reading the stored delta would overstate the change by 96.
 *
 * Only increases count. Giving fewer packs than calculated costs nothing and
 * needs no one's attention; giving more is the thing a line manager approving
 * the order has to weigh.
 */
export function overGiveQty(line: Pick<AdjustedQuantities, "finalQty" | "afterStockQty">): number {
  return Math.max(0, line.finalQty - line.afterStockQty);
}

export function isOverGiven(line: Pick<AdjustedQuantities, "finalQty" | "afterStockQty">): boolean {
  return overGiveQty(line) > 0;
}

/** Rolls the per-line over-give up to the figures a reviewer is shown. */
export function summariseOverGive<T extends Pick<AdjustedQuantities, "finalQty" | "afterStockQty">>(
  lines: T[],
  valueOf: (line: T) => number,
): { lineCount: number; packs: number; value: number } {
  let lineCount = 0;
  let packs = 0;
  let value = 0;
  for (const line of lines) {
    const extra = overGiveQty(line);
    if (extra <= 0) continue;
    lineCount += 1;
    packs += extra;
    // Price the extra packs only, not the whole line — the calculated part of
    // the line was never in question.
    value += extra * valueOf(line);
  }
  return { lineCount, packs, value };
}

/**
 * Converts "give them exactly N" into the signed delta the model stores.
 * The UI offers a direct quantity box on optional lines because that is how
 * reps think about a give-away; the delta is an implementation detail.
 */
export function deltaForTargetQty(targetQty: number, afterStockQty: number): number {
  return targetQty - afterStockQty;
}
