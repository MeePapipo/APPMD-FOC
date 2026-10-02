import { describe, it, expect } from "vitest";
import { computeSubmission } from "./engine";
import { unitsFor4800Item } from "./engine4800";
import type { TestsBySystem } from "./types";
import { loadAssays, loadItems, loadTpbInput, loadGoldenCases, type GoldenCase } from "./fixtures";

const assays = loadAssays();
const items = loadItems();
const tpbInput = loadTpbInput();

function testsBySysFor(c: GoldenCase): TestsBySystem {
  if (c.bySys) return c.bySys;
  const sys = c.sys === "cobas 5800" ? "5800" : "6800";
  return { [sys]: c.tests };
}

describe("computeSubmission — golden cases vs ~/foc-excel/out/cases.json", () => {
  const cases = loadGoldenCases();

  it("fixture set is not stale (one qty entry per current master item)", () => {
    for (const c of cases) expect(c.qty.length).toBe(items.length);
  });

  for (const c of cases) {
    it(`${c.name}: qty per line, revenue, FOC value/%`, () => {
      const result = computeSubmission(items, assays, testsBySysFor(c), tpbInput);
      expect(result.rows.map((r) => r.qty)).toEqual(c.qty);
      expect(result.revenue).toBeCloseTo(c.revenue, 6);
      expect(result.focValue).toBeCloseTo(c.foc, 6);
      expect(result.focPct).toBeCloseTo(c.focPct, 6);
      expect(result.reagents.reduce((sum, line) => sum + line.value, 0)).toBeCloseTo(c.revenue, 6);
    });
  }
});

describe("computeSubmission — cross-system SKU combining sanity checks", () => {
  it("returns main reagent boxes for several assays, combining shared systems before rounding", () => {
    const result = computeSubmission(items, assays, {
      "6800": { HBV: 100, HCV: 200 },
      "5800": { HBV: 50 },
      "4800": { HPV4800_240: 240 },
    }, tpbInput);
    expect(result.reagents).toHaveLength(3);
    expect(result.reagents.find((line) => line.code === "HBV")).toMatchObject({
      systems: ["6800", "5800"], tests: 150, packSize: 192, qty: 1,
    });
    expect(result.reagents.find((line) => line.code === "HCV")).toMatchObject({ tests: 200, qty: 2 });
    expect(result.reagents.find((line) => line.code === "HPV4800_240")).toMatchObject({ systems: ["4800"], qty: 1 });
  });

  it("returns no reagent boxes for no tests", () => {
    expect(computeSubmission(items, assays, {}, tpbInput).reagents).toEqual([]);
  });

  it("returns main reagent boxes for 5800-only input", () => {
    const result = computeSubmission(items, assays, { "5800": { HBV: 193 } }, tpbInput);
    expect(result.reagents).toHaveLength(1);
    expect(result.reagents[0]).toMatchObject({ systems: ["5800"], tests: 193, qty: 2 });
  });

  it("a SKU shared across 6800 and 5800 combines before rounding (not per-system)", () => {
    // "cobas omni Secondary Tubes 13x75" (materialNo 06438776001, packSize 1500)
    // applies to HPV among other codes; 960 tests on 6800 + 960 on 5800 = 1920
    // pieces => ceil(1920/1500) = 2 boxes, not 1+1 rounded separately.
    const testsBySys: TestsBySystem = { "6800": { HPV: 960 }, "5800": { HPV: 960 } };
    const result = computeSubmission(items, assays, testsBySys, tpbInput);
    const tubeIndices = items
      .map((it, i) => (it.materialNo === "06438776001" ? i : -1))
      .filter((i) => i >= 0);
    const qtys = tubeIndices.map((i) => result.rows[i].qty);
    expect(qtys.filter((q) => q > 0)).toEqual([2]);
  });

  it("a SKU shared across 6800/5800 and 4800 combines across all three", () => {
    // Same materialNo, but this time include a 4800 contribution (HPV4800_240,
    // weight 0.041666... per the derived 4800 weights table) alongside 6800/5800.
    const testsBySys: TestsBySystem = {
      "6800": { HPV: 480 },
      "5800": { HPV: 480 },
      "4800": { HPV4800_240: 240 },
    };
    const result = computeSubmission(items, assays, testsBySys, tpbInput);
    const tubeRows = items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => it.materialNo === "06438776001");
    const totalQty = tubeRows.reduce((s, { i }) => s + result.rows[i].qty, 0);
    // 480 + 480 + 240*weight(0.041666..) pieces = 960 + 10 = 970 => ceil(970/1500) = 1 box, held by one row.
    expect(totalQty).toBe(1);
    const nonZero = tubeRows.filter(({ i }) => result.rows[i].qty > 0);
    expect(nonZero.length).toBe(1);
  });
});

describe("unitsFor4800Item — hand-derived cases (weights are ground truth, see engine4800.ts)", () => {
  const item4800 = items.find(
    (i) => i.system === "4800" && i.materialNo === "05235855190",
  )!; // KIT cobas 4800 HPV CONTROLS 10 SETS IVD, weights derived from the 4 HPV4800 codes

  it("computes the weighted sum directly from the weights table", () => {
    const tests = { HPV4800_240: 240, HPV4800_960: 0, HPV4800_SP240: 0, HPV4800_SP960: 0 };
    const expected = 240 * item4800.weights!.HPV4800_240;
    expect(unitsFor4800Item(item4800, tests)).toBeCloseTo(expected, 9);
  });

  it("zero tests produces zero units", () => {
    expect(unitsFor4800Item(item4800, {})).toBe(0);
  });

  it("computeSubmission end-to-end for a 4800-only order matches hand math", () => {
    const testsBySys: TestsBySystem = { "4800": { HPV4800_240: 240 } };
    const result = computeSubmission(items, assays, testsBySys, tpbInput);
    const idx = items.findIndex((i) => i === item4800);
    const rawUnits = 240 * item4800.weights!.HPV4800_240; // = 10
    const expectedQty = Math.ceil(rawUnits / (item4800.packSize * item4800.coverage) - 1e-9);
    expect(result.rows[idx].qty).toBe(expectedQty);
    expect(result.rows[idx].value).toBe(expectedQty * (item4800.price ?? 0));

    // Assay-kit revenue: 240 tests / 240 packSize = 1 kit at the assay's price.
    const assay = assays.find((a) => a.system === "4800" && a.code === "HPV4800_240")!;
    expect(result.revenue).toBe(1 * (assay.price ?? 0));
  });
});

describe("computeSubmission — main reagent given free", () => {
  it("works the supporting items out on paid + free tests, but bills only the paid boxes", () => {
    const paidOnly = computeSubmission(items, assays, { "6800": { HBV: 1920 } }, tpbInput);
    const together = computeSubmission(items, assays, { "6800": { HBV: 1920 } }, tpbInput, { freeTestsBySys: { "6800": { HBV: 1920 } } });
    const allPaid = computeSubmission(items, assays, { "6800": { HBV: 3840 } }, tpbInput);

    // Same supporting items as if all 3840 tests were bought...
    expect(together.rows.map((r) => r.qty)).toEqual(allPaid.rows.map((r) => r.qty));
    expect(together.focValue).toBeGreaterThan(paidOnly.focValue);
    // ...but revenue is the paid boxes only, and the free boxes are reported on their own.
    expect(together.revenue).toBe(paidOnly.revenue);
    expect(together.reagents.find((r) => r.code === "HBV")).toMatchObject({ tests: 1920, qty: 10, freeTests: 1920, freeQty: 10 });
  });

  it("lists a reagent that is only given free (no paid boxes) without billing it", () => {
    const result = computeSubmission(items, assays, {}, tpbInput, { freeTestsBySys: { "6800": { HBV: 192 } } });
    expect(result.reagents.find((r) => r.code === "HBV")).toMatchObject({ tests: 0, qty: 0, value: 0, freeTests: 192, freeQty: 1 });
    expect(result.revenue).toBe(0);
  });
});

describe("computeSubmission — free reagent of another assay", () => {
  it("a free box of a different assay earns that assay's supporting items, not the purchased one's", () => {
    const hivPaidHcvFree = computeSubmission(items, assays, { "6800": { HIVQ: 1920 } }, tpbInput, { freeTestsBySys: { "6800": { HCV: 1920 } } });
    const bothPaid = computeSubmission(items, assays, { "6800": { HIVQ: 1920, HCV: 1920 } }, tpbInput);
    expect(hivPaidHcvFree.rows.map((r) => r.qty)).toEqual(bothPaid.rows.map((r) => r.qty));
    expect(hivPaidHcvFree.reagents.find((r) => r.code === "HCV")).toMatchObject({ qty: 0, freeQty: 10, value: 0 });
    expect(hivPaidHcvFree.revenue).toBe(computeSubmission(items, assays, { "6800": { HIVQ: 1920 } }, tpbInput).revenue);
  });
});
