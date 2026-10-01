import { describe, expect, it } from "vitest";
import { annualItems, annualSummaries, quotaBand, summariseAnnual, type AnnualFact } from "./annualQuota";

const f = (over: Partial<AnnualFact> = {}): AnnualFact => ({
  accountName: "LAB A (0052000001)", materialNo: "M1", productName: "CleanCell", year: 2026, annualQuota: 360, focQty: 0, bonusQty: 0, ...over,
});

describe("quotaBand", () => {
  it("is green below 80, amber from 80 to 100, red above 100", () => {
    expect(quotaBand(53)).toBe("green");
    expect(quotaBand(79.9)).toBe("green");
    expect(quotaBand(80)).toBe("amber");
    expect(quotaBand(100)).toBe("amber");
    expect(quotaBand(100.1)).toBe("red");
    expect(quotaBand(1111)).toBe("red");
  });
});

describe("annualItems", () => {
  it("takes the repeated annual quota once (never the sum) and adds FOC + Bonus over the months", () => {
    // Quota 360 repeated on each active month; 190 given across them: 53%, as on the Core Lab dashboard.
    const items = annualItems([f({ bonusQty: 35 }), f({ bonusQty: 25 }), f({ focQty: 10, bonusQty: 45 }), f({ bonusQty: 75 })], 2026);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ quota: 360, given: 190, diff: -170, over: false });
    expect(Math.round(items[0].pct!)).toBe(53);
  });

  it("ignores other years and keeps items with no quota (percentage null)", () => {
    const items = annualItems([f({ year: 2025, bonusQty: 99 }), f({ materialNo: "M2", productName: "Tube", annualQuota: null, bonusQty: 12 })], 2026);
    expect(items.map((i) => i.materialNo)).toEqual(["M2"]);
    expect(items[0]).toMatchObject({ quota: 0, given: 12, pct: null, over: false });
  });

  it("is over only when the quota is exceeded by at least the minimum units", () => {
    expect(annualItems([f({ annualQuota: 9, bonusQty: 100 })], 2026)[0].over).toBe(true);
    expect(annualItems([f({ annualQuota: 9, bonusQty: 9 })], 2026)[0].over).toBe(false); // exactly the quota
    expect(annualItems([f({ annualQuota: 9, bonusQty: 10 })], 2026, 2)[0].over).toBe(false); // 1 unit over, minimum 2
  });

  it("leaves out items with neither quota nor activity", () => {
    expect(annualItems([f({ annualQuota: null })], 2026)).toEqual([]);
  });
});

describe("summaries", () => {
  it("counts the items that have a quota and those over it, with the excess in units", () => {
    const s = summariseAnnual(annualItems([f({ bonusQty: 400 }), f({ materialNo: "M2", annualQuota: 240, bonusQty: 100 }), f({ materialNo: "M3", annualQuota: null, bonusQty: 5 })], 2026));
    expect(s).toEqual({ itemsWithQuota: 2, itemsOver: 1, excessUnits: 40 });
  });

  it("groups by account", () => {
    const map = annualSummaries([f({ bonusQty: 400 }), f({ accountName: "LAB B (0052000002)", bonusQty: 1 })], 2026);
    expect(map.get("LAB A (0052000001)")?.itemsOver).toBe(1);
    expect(map.get("LAB B (0052000002)")?.itemsOver).toBe(0);
  });
});
