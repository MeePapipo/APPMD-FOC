import { describe, expect, it } from "vitest";
import { financeByMonth, withRatio } from "./focFinance";

describe("financeByMonth", () => {
  it("sums per month, oldest first, with cost/revenue", () => {
    const rows = financeByMonth([
      { year: 2026, month: 2, revenue: 1000, focCost: 50, bonusCost: 50 },
      { year: 2025, month: 12, revenue: 500, focCost: 25, bonusCost: 0 },
      { year: 2026, month: 2, revenue: 1000, focCost: 100, bonusCost: 0 },
    ]);
    expect(rows.map((r) => r.label)).toEqual(["Dec 2025", "Feb 2026"]);
    expect(rows[1]).toMatchObject({ revenue: 2000, totalCost: 200, ratio: 0.1 });
  });
  it("marks zero revenue with cost as an infinite ratio", () => {
    expect(financeByMonth([{ year: 2026, month: 1, revenue: 0, focCost: 5, bonusCost: 0 }])[0].ratio).toBe(Infinity);
  });
});

describe("withRatio", () => {
  it("adds total and ratio", () => {
    expect(withRatio({ revenue: 100, focCost: 5, bonusCost: 5 })).toMatchObject({ totalCost: 10, ratio: 0.1 });
  });
});
