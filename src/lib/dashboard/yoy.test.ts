import { describe, expect, it } from "vitest";
import { formatPctChange, formatPp, pctChange, yoyWindow } from "./yoy";

const rows = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => ({ year: 2025, month })),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((month) => ({ year: 2026, month })),
];

describe("yoyWindow", () => {
  it("compares a part-way year with the same months of the year before", () => {
    expect(yoyWindow({}, 2026, rows)).toEqual({ year: 2026, prevYear: 2025, from: 1, to: 9, label: "2025 Jan–Sep" });
  });
  it("uses the picked month range", () => {
    expect(yoyWindow({ month: "3", mto: "5" }, 2026, rows)?.label).toBe("2025 Mar–May");
    expect(yoyWindow({ month: "4" }, 2026, rows)?.label).toBe("2025 Apr");
  });
  it("labels a complete year with just the year", () => {
    expect(yoyWindow({}, 2025, [...rows, { year: 2024, month: 1 }, ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => ({ year: 2025, month }))])?.label).toBe("2024");
  });
  it("is null for All years or when the year before has no data", () => {
    expect(yoyWindow({}, null, rows)).toBeNull();
    expect(yoyWindow({}, 2025, rows)).toBeNull();
  });
});

describe("change formatting", () => {
  it("pctChange needs an earlier figure", () => {
    expect(pctChange(120, 100)).toBe(20);
    expect(pctChange(5, 0)).toBeNull();
  });
  it("formats with a sign and fewer decimals for big moves", () => {
    expect(formatPctChange(12.34)).toBe("+12%");
    expect(formatPctChange(-3.44)).toBe("−3.4%");
    expect(formatPctChange(0)).toBe("0.0%");
    expect(formatPctChange(18125)).toBe(">+999%");
    expect(formatPctChange(-2000)).toBe("<−999%");
  });
  it("formats percentage points", () => {
    expect(formatPp(16.2, 15)).toBe("+1.2 pp");
    expect(formatPp(9, 10.5)).toBe("−1.5 pp");
  });
});
