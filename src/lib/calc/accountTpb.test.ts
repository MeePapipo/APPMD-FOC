import { describe, expect, it } from "vitest";
import { basisForOrder, effectiveTpb, latestMonths, resolveAccountTpb, sumOwn } from "./accountTpb";
import type { TpbTableInput } from "./tpb";

const S = { floorRatio: 0.5, minRuns: 8 };
const national: TpbTableInput = {
  floors: { "6800": 24, "5800": 6 },
  values: [
    { system: "6800", code: "HPV", tpb: 50 },
    { system: "6800", code: "HIVQ", tpb: 40 },
    { system: "6800", code: "HIVQ_PSC", tpb: 40 },
  ],
};

describe("effectiveTpb", () => {
  it("uses the account's own value when it has enough runs and is above the floor", () => {
    expect(effectiveTpb({ runs: 20, samples: 1200 }, 50, S)).toMatchObject({ tpb: 60, source: "account", own: 60, runs: 20 });
  });
  it("clamps a low-fill site to floorRatio x national", () => {
    expect(effectiveTpb({ runs: 30, samples: 150 }, 40, S)).toMatchObject({ tpb: 20, source: "floor-clamped", own: 5 });
  });
  it("falls back to national below the minimum runs, keeping the raw value for display", () => {
    expect(effectiveTpb({ runs: 7, samples: 700 }, 50, S)).toMatchObject({ tpb: 50, source: "national", own: 100 });
  });
  it("is national when the account has no data, and undefined when nothing exists", () => {
    expect(effectiveTpb(undefined, 50, S)).toEqual({ tpb: 50, source: "national" });
    expect(effectiveTpb(undefined, undefined, S)).toEqual({ tpb: undefined, source: "national" });
  });
  it("does not invent a floor when there is no national value", () => {
    expect(effectiveTpb({ runs: 50, samples: 500 }, undefined, S).tpb).toBeUndefined();
  });
});

describe("sumOwn / latestMonths", () => {
  it("pools runs and samples and expands eLP codes to master codes", () => {
    const own = sumOwn([
      { system: "6800", assay: "HIVQ", runs: 10, samples: 400 },
      { system: "6800", assay: "HIVQ", runs: 10, samples: 200 },
    ]);
    expect(own.get("6800|HIVQ")).toEqual({ runs: 20, samples: 600 });
    expect(own.get("6800|HIVQ_PSC")).toEqual({ runs: 20, samples: 600 });
  });
  it("keeps the latest n months", () => {
    expect([...latestMonths(["2026-06", "2026-09", "2026-07", "2026-08", "2026-09"], 3)].sort()).toEqual(["2026-07", "2026-08", "2026-09"]);
  });
});

describe("resolveAccountTpb", () => {
  const own = sumOwn([
    { system: "6800", assay: "HPV", runs: 40, samples: 3600 }, // 90
    { system: "6800", assay: "HIVQ", runs: 60, samples: 300 }, // 5 -> clamp to 20
  ]);
  const { input, detail } = resolveAccountTpb(national, own, S);
  const tpb = (code: string) => input.values.find((v) => v.system === "6800" && v.code === code)?.tpb;

  it("overlays own values on the national table and leaves the floors alone", () => {
    expect(tpb("HPV")).toBe(90);
    expect(tpb("HIVQ")).toBe(20);
    expect(tpb("HIVQ_PSC")).toBe(20); // alias shares the batch line, so it shares the value
    expect(input.floors).toEqual(national.floors);
  });
  it("records the decision per assay for the audit trail", () => {
    const basis = basisForOrder(detail, { "6800": { HPV: 480, HIVQ: 100, MPX: 50 } }, national.floors);
    expect(basis.find((b) => b.code === "HPV")).toMatchObject({ source: "account", tpb: 90, national: 50 });
    expect(basis.find((b) => b.code === "HIVQ")).toMatchObject({ source: "floor-clamped", tpb: 20, own: 5 });
    expect(basis.find((b) => b.code === "MPX")).toMatchObject({ source: "floor-default", tpb: 24, national: null });
  });
});
