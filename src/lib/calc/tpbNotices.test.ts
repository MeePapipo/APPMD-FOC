import { describe, expect, it } from "vitest";
import { tpbNotices, type TpbMeta } from "./tpbNotices";
import type { TpbDetail } from "./accountTpb";

const floors = { "6800": 24, "5800": 6 } as const;
const meta: TpbMeta[] = [
  { system: "6800", code: "HPV", tpb: 47.03, confidence: "normal", monthsWithData: "8/8" },
  { system: "6800", code: "MALARIA", tpb: 65.8, confidence: "normal", monthsWithData: "4/8" },
  { system: "6800", code: "MTB", tpb: 39.4, confidence: "low", monthsWithData: "8/8" },
  { system: "6800", code: "CTNG", tpb: 66.52, confidence: "normal", monthsWithData: "6/8" },
];

describe("tpbNotices", () => {
  it("stays quiet for well-supported assays", () => {
    expect(tpbNotices(meta, floors, { "6800": { HPV: 480 } })).toEqual([]);
  });

  it("flags thin month coverage and low confidence, but not exactly 6 of 8 months", () => {
    const out = tpbNotices(meta, floors, { "6800": { MALARIA: 100, MTB: 100, CTNG: 100 } });
    expect(out.map((n) => n.code).sort()).toEqual(["MALARIA", "MTB"]);
    expect(out.every((n) => n.kind === "limited")).toBe(true);
  });

  it("flags an ordered assay with no entry and names the floor", () => {
    const [n] = tpbNotices(meta, floors, { "5800": { BKV: 50 } });
    expect(n).toMatchObject({ system: "5800", code: "BKV", kind: "no-data" });
    expect(n.message).toContain("6 tests per run");
  });

  it("ignores assays that were not ordered, and the 4800 system", () => {
    expect(tpbNotices(meta, floors, { "6800": { MTB: 0 }, "4800": { HPV: 500 } })).toEqual([]);
  });

  it("replaces the coverage warning with an account note when the account's own TPB is used", () => {
    const detail = new Map<string, TpbDetail>([
      ["6800|MALARIA", { system: "6800", code: "MALARIA", tpb: 70, source: "account", national: 65.8, own: 70, runs: 12 }],
      ["6800|MTB", { system: "6800", code: "MTB", tpb: 19.7, source: "floor-clamped", national: 39.4, own: 6, runs: 30 }],
    ]);
    const out = tpbNotices(meta, floors, { "6800": { MALARIA: 100, MTB: 100 } }, detail);
    expect(out.map((n) => [n.code, n.kind])).toEqual([["MALARIA", "account"], ["MTB", "account"]]);
    expect(out[1].message).toContain("floor of 19.7");
  });
});
