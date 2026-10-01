import { describe, expect, it } from "vitest";
import { accountMonthlyTrend, accountProductsGiven, accountProductsSold, accountSummary, type FocAccountFact } from "./focAccountDetail";

function fact(overrides: Partial<FocAccountFact>): FocAccountFact {
  return {
    year: 2026,
    month: 3,
    materialNo: "MAT-1",
    productName: "Item",
    revenue: 1000,
    revenueQty: 2,
    soldQty: 2,
    focCost: 80,
    focQty: 1,
    bonusCost: 20,
    bonusQty: 1,
    ...overrides,
  };
}

describe("accountSummary", () => {
  it("sums every measure and computes the ratio", () => {
    const result = accountSummary([
      fact({ revenue: 1000, focCost: 80, bonusCost: 20, soldQty: 2, focQty: 1, bonusQty: 1 }),
      fact({ revenue: 500, focCost: 10, bonusCost: 0, soldQty: 1, focQty: 0, bonusQty: 0 }),
    ]);
    expect(result).toEqual({
      revenue: 1500,
      focCost: 90,
      bonusCost: 20,
      totalCost: 110,
      ratio: 110 / 1500,
      soldQty: 3,
      focQty: 1,
      bonusQty: 1,
    });
  });

  it("uses the shared 3-way ratio rule for a zero-revenue account", () => {
    const result = accountSummary([fact({ revenue: 0, focCost: 5, bonusCost: 0 })]);
    expect(result.ratio).toBe(Infinity);
  });
});

describe("accountMonthlyTrend", () => {
  it("returns every month present, sorted ascending, not zero-filled", () => {
    const result = accountMonthlyTrend([
      fact({ year: 2026, month: 6, revenue: 100, focCost: 10, bonusCost: 0 }),
      fact({ year: 2026, month: 3, revenue: 200, focCost: 20, bonusCost: 0 }),
    ]);
    expect(result.map((r) => r.key)).toEqual(["2026-03", "2026-06"]);
    expect(result[0]).toMatchObject({ revenue: 200, focValue: 20, ratio: 0.1 });
  });
});

describe("accountProductsGiven", () => {
  it("ranks by FOC+Bonus value and aggregates same-material rows", () => {
    const result = accountProductsGiven([
      fact({ materialNo: "A", focCost: 10, bonusCost: 5, focQty: 1, bonusQty: 1 }),
      fact({ materialNo: "A", focCost: 10, bonusCost: 5, focQty: 1, bonusQty: 1 }),
      fact({ materialNo: "B", focCost: 1, bonusCost: 0, focQty: 1, bonusQty: 0 }),
    ]);
    expect(result[0]).toMatchObject({ materialNo: "A", focQty: 2, bonusQty: 2, focValue: 30 });
    expect(result[1]).toMatchObject({ materialNo: "B", focValue: 1 });
  });

  it("excludes rows with nothing given away", () => {
    const result = accountProductsGiven([fact({ materialNo: "C", focCost: 0, bonusCost: 0, focQty: 0, bonusQty: 0 })]);
    expect(result).toHaveLength(0);
  });
});

describe("accountProductsSold", () => {
  it("ranks by revenue and excludes give-away-only rows", () => {
    const result = accountProductsSold([
      fact({ materialNo: "A", revenue: 1000, revenueQty: 2 }),
      fact({ materialNo: "B", revenue: 0, revenueQty: 0, focCost: 50, focQty: 1 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ materialNo: "A", revenue: 1000, revenueQty: 2 });
  });

  it("drops a product whose sale was fully reversed by a credit note", () => {
    const result = accountProductsSold([
      fact({ materialNo: "A", revenue: 1000, revenueQty: 2 }),
      fact({ materialNo: "R", month: 2, revenue: 500, revenueQty: 5 }),
      fact({ materialNo: "R", month: 4, revenue: -500, revenueQty: -5 }),
    ]);
    expect(result.map((r) => r.materialNo)).toEqual(["A"]);
  });
});
