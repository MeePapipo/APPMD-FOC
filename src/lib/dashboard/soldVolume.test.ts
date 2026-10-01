import { describe, expect, it } from "vitest";
import { testsPerBox, withVolume } from "./soldVolume";

const packs = { "09040544190": 480 };

describe("testsPerBox", () => {
  it("prefers the master pack size", () => {
    expect(testsPerBox("09040544190", "KIT COBAS 58/68/8800 HPV 480T IVD", packs)).toBe(480);
    expect(testsPerBox("09040544190", "renamed in Tableau", packs)).toBe(480);
  });
  it("falls back to the test count in the product name", () => {
    expect(testsPerBox("X1", "KIT COBAS EGFR AMP/DET V2 24T IVD", packs)).toBe(24);
    expect(testsPerBox("X2", "KIT COBAS CFDNA SAMP PREP 24T", packs)).toBe(24);
    expect(testsPerBox("X3", "KIT C58/68/88 HIV-1/HIV-2 QUAL 192T IVD", packs)).toBe(192);
  });
  it("is null when neither source knows", () => {
    expect(testsPerBox("X4", "KRAS Mutation Test v2 (LSR)", packs)).toBeNull();
    expect(testsPerBox("X5", "Tube 5 ml, 100 pcs/pack", packs)).toBeNull();
  });
});

describe("withVolume", () => {
  it("turns boxes into tests and keeps returns negative", () => {
    const [a, b, c] = withVolume(
      [
        { materialNo: "09040544190", productName: "HPV", revenueQty: 5, revenue: 480000 },
        { materialNo: "X1", productName: "EGFR 24T", revenueQty: -2, revenue: -10 },
        { materialNo: "X4", productName: "KRAS", revenueQty: 3, revenue: 5 },
      ],
      packs,
    );
    expect(a).toMatchObject({ boxes: 5, testsPerBox: 480, tests: 2400 });
    expect(b).toMatchObject({ boxes: -2, tests: -48 });
    expect(c).toMatchObject({ boxes: 3, tests: null });
  });
});
