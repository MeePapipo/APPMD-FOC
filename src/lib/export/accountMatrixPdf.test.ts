import { describe, expect, it } from "vitest";
import { buildAccountMatrix } from "@/lib/dashboard/focAccountMatrix";
import { findThaiFont } from "./pdf";
import { buildAccountMatrixPdf } from "./accountMatrixPdf";

const hasFont = findThaiFont() !== null;

const matrix = buildAccountMatrix([
  { year: 2026, month: 1, materialNo: "A1", productName: "KIT COBAS HBV 192T", focQty: 2, bonusQty: 1, focCost: 2000, bonusCost: 1000 },
  { year: 2026, month: 5, materialNo: "B2", productName: "ท่อเก็บตัวอย่าง จำนวน", focQty: 4, bonusQty: 0, focCost: 400, bonusCost: 0 },
  { year: 2025, month: 6, materialNo: "A1", productName: "KIT COBAS HBV 192T", focQty: 5, bonusQty: 0, focCost: 5000, bonusCost: 0 },
], 2026);

describe("buildAccountMatrixPdf", () => {
  it.skipIf(!hasFont)("renders a PDF with Thai product names", async () => {
    const buffer = await buildAccountMatrixPdf({
      name: "โรงพยาบาลพิจิตร  (0052027798)", number: "0052027798", team: "TH - North", rep: null,
      matrix, entitlement: [{ materialNo: "A1", expected: 2, free: 3, significant: true }], measure: "cost",
    });
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(2000);
  });

  it.skipIf(!hasFont)("renders an account with nothing to show", async () => {
    const buffer = await buildAccountMatrixPdf({
      name: "EMPTY  (1)", number: "1", team: null, rep: null, matrix: buildAccountMatrix([], 2026), entitlement: [], measure: "qty",
    });
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
