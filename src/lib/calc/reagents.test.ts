import { describe, expect, it } from "vitest";
import { computeReagents } from "./reagents";
import { loadAssays } from "./fixtures";

const assays = loadAssays();

describe("main reagent order quantities", () => {
  it("matches the Excel example before calculating QC or additional items", () => {
    const reagents = computeReagents(assays, { "5800": { HIVQ: 1000 }, "6800": { HBV: 1000 } });
    expect(reagents).toHaveLength(2);
    expect(reagents.find((line) => line.code === "HIVQ")).toMatchObject({ qty: 6, value: 828000 });
    expect(reagents.find((line) => line.code === "HBV")).toMatchObject({ qty: 6, value: 979200 });
    expect(reagents.reduce((total, line) => total + line.value, 0)).toBe(1807200);
  });

  it("rounds a shared kit once across 5800 and 6800", () => {
    expect(computeReagents(assays, { "5800": { HBV: 100 }, "6800": { HBV: 92 } }))
      .toMatchObject([{ code: "HBV", tests: 192, qty: 1, systems: ["6800", "5800"] }]);
  });

  it("uses 4800 pack sizes independently of other systems", () => {
    const reagents = computeReagents(assays, { "4800": { HPV4800_240: 241 }, "5800": { HBV: 193 } });
    expect(reagents.find((line) => line.code === "HPV4800_240")).toMatchObject({ packSize: 240, qty: 2 });
    expect(reagents.find((line) => line.code === "HBV")).toMatchObject({ packSize: 192, qty: 2 });
  });

  it("does not produce quantities for empty input", () => {
    expect(computeReagents(assays, {})).toEqual([]);
  });
});