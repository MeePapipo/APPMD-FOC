import { describe, expect, it } from "vitest";
import { pooledTpb } from "./tpb";

describe("pooledTpb", () => {
  it("is total samples over total runs, to 2 dp", () => {
    expect(pooledTpb(1352, 63579)).toBe(47.03);
    expect(pooledTpb(15, 591)).toBe(39.4);
  });
  it("is null when a total is missing or zero", () => {
    expect(pooledTpb(null, 100)).toBeNull();
    expect(pooledTpb(0, 100)).toBeNull();
    expect(pooledTpb(10, undefined)).toBeNull();
  });
});
