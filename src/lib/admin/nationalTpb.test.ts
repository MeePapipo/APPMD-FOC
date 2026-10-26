import { describe, expect, it } from "vitest";
import { computeNationalTpb, type NationalUsageRow } from "./nationalTpb";

const row = (p: Partial<NationalUsageRow>): NationalUsageRow => ({
  month: "2026-09", instrumentId: "i1", systemClass: "c6800", assay: "HPV", runs: 10, samples: 500, ...p,
});
const master = new Set(["S6800|HPV", "S6800|HIVQ", "S6800|HIVQ_PSC", "S5800|HPV"]);
const months = ["2026-07", "2026-08", "2026-09"];

describe("computeNationalTpb", () => {
  it("pools runs and samples across instruments and months before dividing", () => {
    const { rows } = computeNationalTpb(
      [
        row({ month: "2026-07", instrumentId: "a", runs: 10, samples: 900 }),
        row({ month: "2026-08", instrumentId: "b", systemClass: "c8800", runs: 30, samples: 300 }),
        row({ month: "2026-09", instrumentId: "a", runs: 10, samples: 800 }),
      ],
      months, master, 8,
    );
    expect(rows).toEqual([
      { system: "S6800", code: "HPV", tpb: 40, totalRuns: 50, totalSamples: 2000, monthsWithData: "3/3", instruments: 2, confidence: "normal" },
    ]);
  });

  it("keeps c5800 separate and leaves c4800 out", () => {
    const { rows } = computeNationalTpb(
      [row({ systemClass: "c5800", runs: 20, samples: 200 }), row({ systemClass: "c4800", runs: 99, samples: 99 })],
      ["2026-09"], master, 8,
    );
    expect(rows.map((r) => [r.system, r.tpb])).toEqual([["S5800", 10]]);
  });

  it("ignores months outside the window", () => {
    const { rows } = computeNationalTpb([row({ month: "2026-01", runs: 10, samples: 10 }), row({})], ["2026-09"], master, 8);
    expect(rows[0].tpb).toBe(50);
  });

  it("gives an eLP test to every master code that shares its batch line", () => {
    const { rows } = computeNationalTpb([row({ assay: "HIVQ", runs: 10, samples: 400 })], ["2026-09"], master, 8);
    expect(rows.map((r) => r.code)).toEqual(["HIVQ", "HIVQ_PSC"]);
  });

  it("reports codes with no master assay instead of proposing them", () => {
    const res = computeNationalTpb([row({ assay: "HEV" })], ["2026-09"], master, 8);
    expect(res.rows).toEqual([]);
    expect(res.notInMaster).toEqual(["S6800|HEV"]);
  });

  it("marks thin evidence low: too few months or too few runs", () => {
    const { rows } = computeNationalTpb(
      [row({ month: "2026-09", runs: 50 }), row({ systemClass: "c5800", month: "2026-07", runs: 3 }), row({ systemClass: "c5800", month: "2026-08", runs: 3 }), row({ systemClass: "c5800", runs: 1 })],
      months, master, 8,
    );
    expect(rows.map((r) => [r.system, r.monthsWithData, r.confidence])).toEqual([
      ["S5800", "3/3", "low"],
      ["S6800", "1/3", "low"],
    ]);
  });
});
