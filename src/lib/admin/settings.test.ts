import { describe, expect, it } from "vitest";
import { settingsPatchSchema } from "./settings";

describe("settingsPatchSchema", () => {
  it("accepts a partial alert or tpb change", () => {
    expect(settingsPatchSchema.safeParse({ alert: { overPct5800: 25 } }).success).toBe(true);
    expect(settingsPatchSchema.safeParse({ tpb: { accountFloorRatio: 0.6, accountMinRuns: 10 } }).success).toBe(true);
  });
  it("rejects an empty patch", () => {
    expect(settingsPatchSchema.safeParse({}).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ alert: {} }).success).toBe(false);
  });
  it("rejects out-of-range values", () => {
    expect(settingsPatchSchema.safeParse({ tpb: { accountFloorRatio: 1.5 } }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ tpb: { accountMinRuns: 0 } }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ tpb: { accountMinRuns: 2.5 } }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ alert: { overPct6800: -1 } }).success).toBe(false);
  });
});
