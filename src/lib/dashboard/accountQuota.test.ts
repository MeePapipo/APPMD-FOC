import { describe, expect, it } from "vitest";
import { annualQuotaLine, annualSortValue, annualYearSummary, compactThb, formatOverPct, productLabel, quotaSortValue, quotaSummary } from "./accountQuota";

const net = (o: Partial<import("./entitlement").NetSummary> = {}) => ({
  entitledValue: 800_000, bonusValue: 1_234_567, excessValue: 434_567, overPct: 54.3, over: true, focStandaloneCost: 0, focFlagged: false, ...o,
});

describe("account quota helpers", () => {
  it("compacts THB", () => {
    expect(compactThb(900)).toBe("900");
    expect(compactThb(48_200)).toBe("48.2K");
    expect(compactThb(480_000)).toBe("480K");
    expect(compactThb(1_234_567)).toBe("1.2M");
    expect(compactThb(-2_000_000)).toBe("-2M");
  });
  it("formats the percentage", () => {
    expect(formatOverPct(54.3)).toBe("+54.3%");
    expect(formatOverPct(-12)).toBe("-12%");
    expect(formatOverPct(null)).toBe("no entitlement");
  });
  it("summarises only accounts with a verdict", () => {
    expect(quotaSummary({ net: null, flagged: false, overCount: 0 })).toBeNull();
    const s = quotaSummary({ net: net(), flagged: true, overCount: 3 })!;
    expect(s).toEqual({ over: true, line: "Bonus 1.2M / Entitled 800K", pct: "+54.3%", items: "3 items Over Quota" });
    expect(quotaSummary({ net: net({ over: false }), flagged: false, overCount: 1 })!.items).toBe("1 item Over Quota");
  });
  it("orders flagged first, then excess, then no verdict", () => {
    const flagged = quotaSortValue({ net: net({ excessValue: 10 }), flagged: true });
    const big = quotaSortValue({ net: net({ excessValue: 900_000 }), flagged: false });
    const none = quotaSortValue({ net: null, flagged: false });
    expect(flagged).toBeGreaterThan(big);
    expect(big).toBeGreaterThan(none);
  });
});

describe("annual-quota helpers", () => {
  it("summarises the matrix year", () => {
    const s = annualYearSummary({
      A: { quota: 10, free: 14, significant: true },
      B: { quota: 10, free: 3, significant: false },
      C: { quota: 0, free: 5, significant: false },
    });
    expect(s).toEqual({ itemsWithQuota: 2, itemsOver: 1, excessUnits: 4 });
  });
  it("words the list line and sorts by items over, then excess", () => {
    expect(annualQuotaLine({ itemsWithQuota: 14, itemsOver: 2, excessUnits: 9 })).toBe("2 of 14 items over quota");
    expect(annualQuotaLine({ itemsWithQuota: 0, itemsOver: 0, excessUnits: 0 })).toBeNull();
    expect(annualSortValue({ itemsWithQuota: 5, itemsOver: 2, excessUnits: 1 })).toBeGreaterThan(annualSortValue({ itemsWithQuota: 5, itemsOver: 1, excessUnits: 900 }));
    expect(quotaSortValue({ net: null, flagged: true, annual: { itemsWithQuota: 1, itemsOver: 1, excessUnits: 3 } })).toBe(1e12 + 3);
  });
  it("title-cases a Product", () => {
    expect(productLabel("MOLECULAR LAB")).toBe("Molecular Lab");
  });
});
