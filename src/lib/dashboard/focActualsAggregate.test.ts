import { describe, expect, it } from "vitest";
import {
  focAccountRows,
  focCostComposition,
  focMonthlyTrend,
  focTeamBreakdown,
  focTopProducts,
  type FocActualFact,
} from "./focActualsAggregate";

function fact(overrides: Partial<FocActualFact>): FocActualFact {
  return {
    year: 2026,
    month: 9,
    team: "TH - North",
    rep: "Rep A",
    accountName: "Account One",
    materialNo: "MAT-1",
    productName: "Item",
    revenue: 1000,
    focCost: 80,
    bonusCost: 20,
    soldQty: 10,
    ...overrides,
  };
}

describe("focMonthlyTrend", () => {
  const now = new Date("2026-09-15");

  it("zero-fills the window and sums focCost+bonusCost as focValue", () => {
    const result = focMonthlyTrend([fact({ year: 2026, month: 9, revenue: 1000, focCost: 80, bonusCost: 20 })], 3, now);
    expect(result.map((r) => r.key)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(result.find((r) => r.key === "2026-09")).toMatchObject({ revenue: 1000, focValue: 100 });
  });
});

describe("focTeamBreakdown", () => {
  it("buckets a null team as Unassigned", () => {
    const result = focTeamBreakdown([fact({ team: null, revenue: 500, focCost: 10, bonusCost: 0 })]);
    expect(result).toEqual([
      { team: "Unassigned", label: "Unassigned", revenue: 500, focCost: 10, bonusCost: 0, focValue: 10 },
    ]);
  });

  it("sorts by focValue descending", () => {
    const result = focTeamBreakdown([
      fact({ team: "TH - North", focCost: 10, bonusCost: 0 }),
      fact({ team: "TH - South", focCost: 50, bonusCost: 0 }),
    ]);
    expect(result.map((r) => r.team)).toEqual(["TH - South", "TH - North"]);
  });
});

describe("focAccountRows", () => {
  it("aggregates same-named accounts across all rows (uncapped) and computes the cost/revenue ratio", () => {
    const result = focAccountRows([
      fact({ accountName: "Alpha", revenue: 1000, focCost: 10, bonusCost: 20 }),
      fact({ accountName: "Alpha", revenue: 1000, focCost: 20, bonusCost: 0 }),
      fact({ accountName: "Beta", revenue: 500, focCost: 5, bonusCost: 0 }),
    ]);
    expect(result).toHaveLength(2);
    const alpha = result.find((r) => r.accountName === "Alpha");
    expect(alpha).toMatchObject({ revenue: 2000, focCost: 30, bonusCost: 20, totalCost: 50, ratio: 0.025 });
  });

  it("reports Infinity (not NaN) for a zero-revenue, non-zero-cost account, so it can be filtered out of a ratio ranking", () => {
    const result = focAccountRows([fact({ accountName: "Gamma", revenue: 0, focCost: 5, bonusCost: 0 })]);
    expect(result[0].ratio).toBe(Infinity);
    expect(result.filter((r) => Number.isFinite(r.ratio))).toHaveLength(0);
  });

  it("reports 0 (not Infinity/N-A) for a zero-revenue, zero-cost account — matches the reference tool's own rule exactly", () => {
    const result = focAccountRows([fact({ accountName: "Delta", revenue: 0, focCost: 0, bonusCost: 0 })]);
    expect(result[0].ratio).toBe(0);
  });
});

describe("focCostComposition", () => {
  it("sums focCost/bonusCost/revenue across all facts", () => {
    const result = focCostComposition([
      fact({ revenue: 1000, focCost: 10, bonusCost: 20 }),
      fact({ revenue: 500, focCost: 5, bonusCost: 0 }),
    ]);
    expect(result).toEqual({ focCost: 15, bonusCost: 20, revenue: 1500 });
  });
});

describe("focTopProducts", () => {
  it("sums qty/focValue by materialNo and sorts by focValue", () => {
    const result = focTopProducts([
      fact({ materialNo: "A", soldQty: 5, focCost: 10, bonusCost: 0 }),
      fact({ materialNo: "A", soldQty: 5, focCost: 10, bonusCost: 0 }),
      fact({ materialNo: "B", soldQty: 100, focCost: 1, bonusCost: 0 }),
    ]);
    expect(result[0]).toMatchObject({ materialNo: "A", qty: 10, focValue: 20 });
    expect(result[1]).toMatchObject({ materialNo: "B", qty: 100, focValue: 1 });
  });
});
