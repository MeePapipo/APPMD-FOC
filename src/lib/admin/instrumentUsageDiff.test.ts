import { describe, expect, it } from "vitest";
import { classifyUsage, type UsageCell } from "./instrumentUsageDiff";

const cell = (over: Partial<UsageCell> = {}): UsageCell => ({ instrumentId: "i1", month: "2026-09", assay: "HPV", runs: 10, samples: 500, ...over });

describe("classifyUsage", () => {
  it("adds only cells that are not stored yet", () => {
    const out = classifyUsage([cell(), cell({ assay: "HBV" })], [cell()]);
    expect(out.fresh.map((c) => c.assay)).toEqual(["HBV"]);
    expect(out.unchanged).toBe(1);
  });
  it("uploading the same month twice adds nothing", () => {
    const stored = [cell(), cell({ month: "2026-08" })];
    expect(classifyUsage(stored, stored)).toMatchObject({ fresh: [], unchanged: 2, changed: [] });
  });
  it("reports revised figures instead of dropping them", () => {
    const out = classifyUsage([cell({ runs: 12, samples: 580 })], [cell()]);
    expect(out.changed).toHaveLength(1);
    expect(out.changed[0].before.runs).toBe(10);
  });
  it("treats another instrument, month or assay as a different cell", () => {
    const base = [cell()];
    expect(classifyUsage([cell({ instrumentId: "i2" })], base).fresh).toHaveLength(1);
    expect(classifyUsage([cell({ month: "2026-10" })], base).fresh).toHaveLength(1);
    expect(classifyUsage([cell({ assay: "MPX" })], base).fresh).toHaveLength(1);
  });
});
