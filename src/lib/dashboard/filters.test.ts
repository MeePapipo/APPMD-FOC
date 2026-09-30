import { describe, expect, it } from "vitest";
import { inPeriodScope, matrixYear, monthRange, parseView } from "./filters";

describe("monthRange", () => {
  it("is null with no month params", () => expect(monthRange({})).toBeNull());
  it("keeps the old single-month meaning", () => expect(monthRange({ month: "3" })).toEqual({ from: 3, to: 3 }));
  it("reads from..to, swapping a reversed range", () => {
    expect(monthRange({ month: "2", mto: "5" })).toEqual({ from: 2, to: 5 });
    expect(monthRange({ month: "8", mto: "2" })).toEqual({ from: 2, to: 8 });
  });
  it("treats a lone end month as January..end and ignores garbage", () => {
    expect(monthRange({ mto: "4" })).toEqual({ from: 1, to: 4 });
    expect(monthRange({ month: "x", mto: "13" })).toBeNull();
  });
});

describe("inPeriodScope", () => {
  const f = { year: 2026, month: 4, team: null };
  it("matches year, range and team", () => {
    expect(inPeriodScope(f, {})).toBe(true);
    expect(inPeriodScope(f, { year: "2026", month: "3", mto: "5" })).toBe(true);
    expect(inPeriodScope(f, { year: "2025" })).toBe(false);
    expect(inPeriodScope(f, { month: "5", mto: "6" })).toBe(false);
    expect(inPeriodScope(f, { ateam: "Unassigned" })).toBe(true);
    expect(inPeriodScope(f, { ateam: "TH - BP" })).toBe(false);
  });
});

describe("view and matrix year", () => {
  it("defaults to accounts", () => {
    expect(parseView(undefined)).toBe("accounts");
    expect(parseView("nope")).toBe("accounts");
    expect(parseView("alerts")).toBe("alerts");
  });
  it("uses the picked year else the latest", () => {
    expect(matrixYear({ year: "2025" }, [2026, 2025])).toBe(2025);
    expect(matrixYear({}, [2026, 2025])).toBe(2026);
  });
});
