import { describe, expect, it } from "vitest";
import { previewGroup, selectPreview, type PreviewResult } from "./preview";
import { computeSubmission } from "./engine";
import { loadAssays, loadItems, loadTpbInput } from "./fixtures";

const items = loadItems();
const assays = loadAssays();
const tpb = loadTpbInput();
const tests = { "6800": { HBV: 2000, HCV: 1000 }, "5800": { HBV: 500 } };
const result = computeSubmission(items, assays, tests, tpb);
const preview: PreviewResult = {
  ...result,
  lines: items.map((item, index) => ({
    materialNo: item.materialNo, dkshCode: item.dkshCode ?? null, description: item.description,
    category: item.category ?? null, unitText: item.unitText ?? null,
    system: item.system, onDemand: item.onDemand, optional: item.optional,
    qty: result.rows[index].qty, value: result.rows[index].value, unitPrice: item.price,
  })).filter((line) => line.qty > 0),
};

describe("Excel usage-type groups", () => {
  it.each([
    ["Quality Control", "Quality control"],
    ["Common Additional", "Common additional"],
    ["Common Addtional ", "Common additional"],
    ["Addtional ", "Additional"],
    ["Additional", "Additional"],
  ])("maps %s to %s", (usageType, expected) => {
    expect(previewGroup({ usageType, category: null })).toBe(expected);
  });

  it("retains controls and uncategorized items from older previews", () => {
    expect(previewGroup({ category: "Controls" })).toBe("Quality control");
    expect(previewGroup({ category: null })).toBe("Additional");
  });
});

describe("optional preview selection", () => {
  it("adds/removes optional rows and prices immediately and agrees with server math", () => {
    const available = preview.lines.filter((line) => line.optional);
    expect(available.length).toBeGreaterThan(0);
    const flags = Object.fromEntries(available.map((line) => [line.materialNo, true]));
    const selected = selectPreview(preview, flags);
    const server = computeSubmission(items, assays, tests, tpb, { optionalTicked: flags });
    expect(selected.selectedOptional).toHaveLength(available.length);
    expect(selected.focValue).toBe(server.focValue);
    expect(selected.focPct).toBe(server.focPct);
    expect(selected.optionalValue).toBeGreaterThan(0);
    const cleared = selectPreview(preview, {});
    expect(cleared.selectedOptional).toEqual([]);
    expect(cleared.optionalValue).toBe(0);
    expect(cleared.focValue).toBe(result.focValue);
    expect(cleared.optional).toHaveLength(available.length);
  });

  it("ignores unknown selections and handles zero revenue", () => {
    const selection = selectPreview({ ...preview, revenue: 0 }, { unknown: true });
    expect(selection.selectedOptional).toEqual([]);
    expect(selection.focPct).toBe(0);
  });
});

describe("stock and adjustment in the preview", () => {
  const firstPriced = preview.lines.find((line) => !line.optional && (line.unitPrice ?? 0) > 0)!;

  it("leaves every line untouched when nothing is adjusted", () => {
    const plain = selectPreview(preview, {}, {});
    const line = plain.required.find((l) => l.materialNo === firstPriced.materialNo)!;
    expect(line.finalQty).toBe(firstPriced.qty);
    expect(line.lineValue).toBe(firstPriced.value);
    expect(plain.focValue).toBe(result.focValue);
  });

  it("drops the on-screen FOC total by the value of the deducted stock", () => {
    const adjusted = selectPreview(preview, {}, { [firstPriced.materialNo]: { stockOnHand: 1 } });
    const line = adjusted.required.find((l) => l.materialNo === firstPriced.materialNo)!;
    expect(line.afterStockQty).toBe(firstPriced.qty - 1);
    expect(line.finalQty).toBe(firstPriced.qty - 1);
    expect(adjusted.focValue).toBe(result.focValue - (firstPriced.unitPrice ?? 0));
  });

  it("applies a manual delta after the stock deduction", () => {
    const adjusted = selectPreview(preview, {}, {
      [firstPriced.materialNo]: { stockOnHand: 1, adjust: 2, comment: "Buffer stock" },
    });
    const line = adjusted.required.find((l) => l.materialNo === firstPriced.materialNo)!;
    expect(line.finalQty).toBe(firstPriced.qty + 1);
    expect(adjusted.focValue).toBe(result.focValue + (firstPriced.unitPrice ?? 0));
  });

  it("ignores adjustments for materials that are not in this order", () => {
    const adjusted = selectPreview(preview, {}, { "not-a-real-material": { stockOnHand: 99 } });
    expect(adjusted.focValue).toBe(result.focValue);
  });
});

describe("additional FOC chosen by the rep", () => {
  const gloves = {
    materialNo: "05840031001",
    description: "Disposable Gloves(powderless) size M",
    dkshCode: "100394733",
    packSize: 1,
    unitText: null,
    unitPrice: 250,
    qty: 4,
  };

  it("adds to the FOC total without touching the calculated lines", () => {
    const withExtras = selectPreview(preview, {}, {}, [gloves]);
    expect(withExtras.manualValue).toBe(1000);
    expect(withExtras.focValue).toBe(result.focValue + 1000);
    expect(withExtras.requiredValue).toBe(selectPreview(preview, {}).requiredValue);
  });

  it("raises the FOC percentage against the same revenue", () => {
    const plain = selectPreview(preview, {});
    const withExtras = selectPreview(preview, {}, {}, [gloves]);
    expect(withExtras.focPct).toBeGreaterThan(plain.focPct);
    expect(withExtras.focPct).toBeCloseTo(withExtras.focValue / preview.revenue, 10);
  });

  it("drops zero-quantity rows rather than listing them at no value", () => {
    const withExtras = selectPreview(preview, {}, {}, [{ ...gloves, qty: 0 }]);
    expect(withExtras.manual).toEqual([]);
    expect(withExtras.manualValue).toBe(0);
    expect(withExtras.focValue).toBe(result.focValue);
  });

  it("treats an unpriced give-away as zero value, not NaN", () => {
    const withExtras = selectPreview(preview, {}, {}, [{ ...gloves, unitPrice: null }]);
    expect(withExtras.manualValue).toBe(0);
    expect(withExtras.focValue).toBe(result.focValue);
  });
});