import { describe, expect, it } from "vitest";
import { buildAccountMatrix, cellValue, type MatrixFact } from "./focAccountMatrix";

const fact = (over: Partial<MatrixFact>): MatrixFact => ({
  year: 2026, month: 1, materialNo: "A", productName: "Alpha",
  focQty: 0, bonusQty: 0, focCost: 0, bonusCost: 0, ...over,
});

describe("buildAccountMatrix", () => {
  it("puts each month in its own cell and sums the year", () => {
    const m = buildAccountMatrix([
      fact({ month: 1, focQty: 2, focCost: 200 }),
      fact({ month: 3, bonusQty: 1, bonusCost: 50 }),
      fact({ month: 3, focQty: 1, focCost: 100 }),
    ], 2026);
    expect(m.rows).toHaveLength(1);
    const [row] = m.rows;
    expect(row.months).toHaveLength(12);
    expect(row.months[0]).toEqual({ focQty: 2, bonusQty: 0, focCost: 200, bonusCost: 0 });
    expect(row.months[2]).toEqual({ focQty: 1, bonusQty: 1, focCost: 100, bonusCost: 50 });
    expect(row.months[1]).toEqual({ focQty: 0, bonusQty: 0, focCost: 0, bonusCost: 0 });
    expect(row.ytd).toEqual({ focQty: 3, bonusQty: 1, focCost: 300, bonusCost: 50 });
  });

  it("totals the previous calendar year separately and ignores older years", () => {
    const m = buildAccountMatrix([
      fact({ year: 2025, month: 1, focQty: 4, focCost: 400 }),
      fact({ year: 2025, month: 12, bonusQty: 1, bonusCost: 10 }),
      fact({ year: 2024, month: 5, focQty: 99, focCost: 9900 }),
      fact({ year: 2026, month: 2, focQty: 1, focCost: 100 }),
    ], 2026);
    expect(m.rows[0].prior).toEqual({ focQty: 4, bonusQty: 1, focCost: 400, bonusCost: 10 });
    expect(m.rows[0].ytd.focQty).toBe(1);
    expect(m.totals.prior.focQty).toBe(4);
  });

  it("keeps a product that only has prior-year activity, drops one with none", () => {
    const m = buildAccountMatrix([
      fact({ year: 2025, materialNo: "B", productName: "Beta", focQty: 1, focCost: 5 }),
      fact({ materialNo: "C", productName: "Gamma" }),
      fact({ year: 2020, materialNo: "D", productName: "Delta", focQty: 1, focCost: 5 }),
    ], 2026);
    expect(m.rows.map((r) => r.materialNo)).toEqual(["B"]);
  });

  it("sorts by the year's cost, heaviest first", () => {
    const m = buildAccountMatrix([
      fact({ materialNo: "A", focCost: 10, focQty: 1 }),
      fact({ materialNo: "B", productName: "Beta", focCost: 500, focQty: 1 }),
      fact({ materialNo: "C", productName: "Gamma", bonusCost: 100, bonusQty: 1 }),
    ], 2026);
    expect(m.rows.map((r) => r.materialNo)).toEqual(["B", "C", "A"]);
  });

  it("sums the column totals across products", () => {
    const m = buildAccountMatrix([
      fact({ materialNo: "A", month: 2, focQty: 1, focCost: 10 }),
      fact({ materialNo: "B", month: 2, focQty: 2, focCost: 20 }),
    ], 2026);
    expect(m.totals.months[1].focQty).toBe(3);
    expect(m.totals.ytd.focCost).toBe(30);
  });

  it("ignores out-of-range months and returns no rows for an empty account", () => {
    expect(buildAccountMatrix([fact({ month: 13, focQty: 1 })], 2026).rows).toHaveLength(0);
    expect(buildAccountMatrix([], 2026).rows).toEqual([]);
  });
});

describe("cellValue", () => {
  const cell = { focQty: 2, bonusQty: 3, focCost: 20, bonusCost: 30 };
  it("picks measure and split", () => {
    expect(cellValue(cell, "qty")).toBe(5);
    expect(cellValue(cell, "cost")).toBe(50);
    expect(cellValue(cell, "qty", "foc")).toBe(2);
    expect(cellValue(cell, "cost", "bonus")).toBe(30);
  });
});
