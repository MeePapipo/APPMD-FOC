import { describe, expect, it } from "vitest";
import {
  applyAdjustment,
  deltaForTargetQty,
  isOverGiven,
  needsComment,
  overGiveQty,
  summariseOverGive,
} from "./adjust";

describe("stock deduction and manual adjustment", () => {
  it("passes the calculated quantity straight through when the rep states nothing", () => {
    expect(applyAdjustment(6, 100, undefined)).toEqual({
      calculatedQty: 6,
      stockOnHand: null,
      afterStockQty: 6,
      adjustedQty: 0,
      finalQty: 6,
      lineValue: 600,
    });
  });

  it("distinguishes a stated zero stock from no statement at all", () => {
    expect(applyAdjustment(6, 100, { stockOnHand: 0 }).stockOnHand).toBe(0);
    expect(applyAdjustment(6, 100, {}).stockOnHand).toBeNull();
  });

  it("deducts stock on hand before pricing", () => {
    expect(applyAdjustment(6, 100, { stockOnHand: 2 })).toMatchObject({
      afterStockQty: 4,
      finalQty: 4,
      lineValue: 400,
    });
  });

  it("floors at zero when the site already holds more than the order calls for", () => {
    expect(applyAdjustment(3, 100, { stockOnHand: 10 })).toMatchObject({
      afterStockQty: 0,
      finalQty: 0,
      lineValue: 0,
    });
  });

  it("applies the adjustment as a signed delta on top of the stock deduction", () => {
    expect(applyAdjustment(10, 50, { stockOnHand: 4, adjust: 2, comment: "Extra run planned" }))
      .toMatchObject({ afterStockQty: 6, adjustedQty: 2, finalQty: 8, lineValue: 400 });
  });

  it("floors at zero when a negative adjustment overshoots", () => {
    expect(applyAdjustment(5, 50, { stockOnHand: 1, adjust: -99, comment: "Not needed" }))
      .toMatchObject({ afterStockQty: 4, finalQty: 0, lineValue: 0 });
  });

  it("prices an unpriced item at zero rather than NaN", () => {
    expect(applyAdjustment(4, null, undefined).lineValue).toBe(0);
  });
});

describe("mandatory adjustment reason", () => {
  it("is required once the quantity has been increased above the calculated amount", () => {
    expect(needsComment({ adjust: 1 })).toBe(true);
    expect(needsComment({ adjust: 1, comment: "   " })).toBe(true);
    expect(needsComment({ adjust: 1, comment: "Customer asked for one more" })).toBe(false);
  });

  it("is never required for a decrease, an untouched line, or a stock-only line", () => {
    expect(needsComment(undefined)).toBe(false);
    expect(needsComment({})).toBe(false);
    expect(needsComment({ adjust: 0 })).toBe(false);
    expect(needsComment({ adjust: -1 })).toBe(false);
    expect(needsComment({ adjust: -1, comment: "   " })).toBe(false);
    expect(needsComment({ stockOnHand: 3 })).toBe(false);
  });

  it("is never required on an optional give-away, however it was changed", () => {
    expect(needsComment({ adjust: -1 }, true)).toBe(false);
    expect(needsComment({ adjust: 5 }, true)).toBe(false);
  });
});

describe("choosing a give-away quantity directly", () => {
  it("converts a target quantity into the delta the model stores", () => {
    // Formula says 2, rep hands over 1.
    expect(deltaForTargetQty(1, 2)).toBe(-1);
    expect(applyAdjustment(2, 500, { adjust: deltaForTargetQty(1, 2) }))
      .toMatchObject({ finalQty: 1, lineValue: 500 });
  });

  it("round-trips the untouched quantity to no adjustment at all", () => {
    expect(deltaForTargetQty(2, 2)).toBe(0);
  });

  it("supports giving none of an optional item", () => {
    expect(applyAdjustment(2, 500, { adjust: deltaForTargetQty(0, 2) }))
      .toMatchObject({ finalQty: 0, lineValue: 0 });
  });

  it("supports giving more than the formula suggested", () => {
    expect(applyAdjustment(2, 500, { adjust: deltaForTargetQty(5, 2) }))
      .toMatchObject({ finalQty: 5, lineValue: 2500 });
  });

  it("targets the post-stock quantity, not the raw calculated one", () => {
    // 6 calculated, 2 already on site -> 4 available; rep gives 3.
    const afterStock = applyAdjustment(6, 100, { stockOnHand: 2 }).afterStockQty;
    expect(afterStock).toBe(4);
    expect(applyAdjustment(6, 100, { stockOnHand: 2, adjust: deltaForTargetQty(3, afterStock) }))
      .toMatchObject({ finalQty: 3 });
  });
});

describe("giving beyond the formula", () => {
  it("counts nothing when the line lands exactly on the calculated quantity", () => {
    expect(overGiveQty(applyAdjustment(6, 100, undefined))).toBe(0);
  });

  it("counts the packs handed over above the post-stock entitlement", () => {
    // 6 calculated, 2 on site -> 4 due; rep gives 7, so 3 are beyond the formula.
    expect(overGiveQty(applyAdjustment(6, 100, { stockOnHand: 2, adjust: 3 }))).toBe(3);
    expect(isOverGiven(applyAdjustment(6, 100, { stockOnHand: 2, adjust: 3 }))).toBe(true);
  });

  it("ignores reductions — giving fewer packs is not the approver's problem", () => {
    expect(overGiveQty(applyAdjustment(6, 100, { adjust: -2 }))).toBe(0);
    expect(isOverGiven(applyAdjustment(6, 100, { adjust: -2 }))).toBe(false);
  });

  it("reads the real movement, not the stored delta, when a negative overshoots", () => {
    // adjustedQty is stored as -99 but finalQty floors at 0: only 3 packs moved,
    // and none of them upward. Reading adjustedQty would report -99.
    const line = applyAdjustment(3, 100, { adjust: -99 });
    expect(line.adjustedQty).toBe(-99);
    expect(line.finalQty).toBe(0);
    expect(overGiveQty(line)).toBe(0);
  });

  it("treats stock the rep never stated as zero stock, not as a free-for-all", () => {
    expect(overGiveQty(applyAdjustment(4, 100, { adjust: 1 }))).toBe(1);
  });

  it("rolls the extra packs up and prices only those packs", () => {
    const lines = [
      { ...applyAdjustment(6, 100, { stockOnHand: 2, adjust: 3 }), unitPrice: 100 }, // +3 @100
      { ...applyAdjustment(4, 250, { adjust: 2 }), unitPrice: 250 },                 // +2 @250
      { ...applyAdjustment(5, 300, { adjust: -1 }), unitPrice: 300 },                // reduction
      { ...applyAdjustment(2, 400, undefined), unitPrice: 400 },                     // untouched
    ];
    expect(summariseOverGive(lines, (line) => line.unitPrice)).toEqual({
      lineCount: 2,
      packs: 5,
      value: 800, // 3*100 + 2*250 — the calculated part of each line is not counted
    });
  });

  it("prices an unpriced over-give at zero rather than NaN", () => {
    const lines = [{ ...applyAdjustment(1, null, { adjust: 2 }), unitPrice: null }];
    expect(summariseOverGive(lines, (line) => line.unitPrice ?? 0))
      .toEqual({ lineCount: 1, packs: 2, value: 0 });
  });

  it("reports nothing for an order where no one adjusted anything", () => {
    const lines = [applyAdjustment(3, 100, undefined), applyAdjustment(1, 50, { stockOnHand: 1 })];
    expect(summariseOverGive(lines, () => 100)).toEqual({ lineCount: 0, packs: 0, value: 0 });
  });
});
