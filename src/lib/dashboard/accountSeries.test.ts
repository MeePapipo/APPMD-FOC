import { describe, expect, it } from "vitest";
import { monthlyCostByAccount } from "./accountSeries";

const fact = (year: number, month: number, accountName: string, focCost: number, bonusCost: number) => ({ year, month, accountName, focCost, bonusCost });

describe("monthlyCostByAccount", () => {
  it("sums FOC + Bonus per month for the chosen year only", () => {
    const out = monthlyCostByAccount(
      [fact(2026, 1, "A", 10, 5), fact(2026, 1, "A", 1, 0), fact(2026, 3, "A", 0, 7), fact(2025, 1, "A", 99, 99), fact(2026, 2, "B", 4, 4)],
      2026,
    );
    expect(out.A).toEqual([16, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(out.B[1]).toBe(8);
  });

  it("limits to the given accounts and omits accounts with no rows that year", () => {
    const out = monthlyCostByAccount([fact(2026, 1, "A", 1, 1), fact(2026, 1, "B", 1, 1), fact(2025, 5, "C", 1, 1)], 2026, new Set(["A", "C"]));
    expect(Object.keys(out)).toEqual(["A"]);
  });
});
