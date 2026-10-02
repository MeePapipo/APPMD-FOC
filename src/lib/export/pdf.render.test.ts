/**
 * Not a test so much as a one-command way to eyeball the PDF: run
 *   npx vitest run pdf.render --reporter=basic
 * and open the file it writes. Skipped unless WRITE_PDF=1 so it never slows
 * the normal suite down or leaves files behind in CI.
 */
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { findThaiFont } from "./pdf";
import type { SubmissionDoc } from "./submission-doc";

const enabled = process.env.WRITE_PDF === "1" && findThaiFont() !== null;

const doc: SubmissionDoc = {
  id: "sample",
  accountNumber: "52026568",
  accountName: "LOEY HOSPITAL",
  repEmail: "rep@roche.com",
  createdAt: new Date("2026-09-21T03:00:00Z"),
  status: "SUBMITTED",
  systemsLabel: "cobas 6800/8800 + cobas 5800",
  assayInputs: [],
  reagents: [
    { description: "KIT COBAS 58/68/8800 HBV 192T IVD", materialNo: "09040820190", dkshCode: "101154999", tests: 2500, qty: 14, freeQty: 0, value: 2284800 },
    { description: "KIT COBAS 58/68/8800 HCV 192T IVD", materialNo: "09040765190", dkshCode: "101154997", tests: 800, qty: 5, freeQty: 0, value: 960000 },
  ],
  reagentTotal: 3244800,
  focItems: [
    { group: "Control", description: "KIT COBAS 58/68/8800 HBV/HCV/HIV RMC IVD", materialNo: "09040773190", dkshCode: "101154998", packText: "8 sets", calculatedQty: 29, stockOnHand: 1, afterStockQty: 28, unitPrice: 3400, grossValue: 95200, adjustedQty: 0, finalQty: 28, finalValue: 95200, adjustComment: null, overGiveQty: 0 },
    { group: "Control", description: "KIT COBAS 58/68/8800 NHP NEG RMC IVD", materialNo: "09051554190", dkshCode: "101155001", packText: "16 sets", calculatedQty: 15, stockOnHand: null, afterStockQty: 15, unitPrice: 3400, grossValue: 51000, adjustedQty: 2, finalQty: 17, finalValue: 57800, adjustComment: "ลูกค้าขอเพิ่มสำหรับรอบทดสอบ", overGiveQty: 2 },
    { group: "Optional", description: "cobas omni Secondary Tubes 13x75", materialNo: "06438776001", dkshCode: "100675324", packText: "1500 PC", calculatedQty: 3, stockOnHand: null, afterStockQty: 3, unitPrice: 18000, grossValue: 54000, adjustedQty: -2, finalQty: 1, finalValue: 18000, adjustComment: null, overGiveQty: 0 },
  ],
  calculatedFocTotal: 171000,
  additionalFocItems: [
    { description: "Cryotube 2.0 ml, no label, skirt", materialNo: "09458484001", dkshCode: "100873341", packText: "100 per pack", qty: 4, unitPrice: 380, value: 1520 },
    { description: "EDTA K2 vacutainer tube 6mL", materialNo: "05409306001", dkshCode: "100252317", packText: "100 per pack", qty: 6, unitPrice: 610, value: 3660 },
  ],
  additionalFocTotal: 5180,
  focTotal: 176180,
  overGive: { lineCount: 1, packs: 2, value: 6800 },
  revenue: 3244800,
  focPct: 0.0543,
  fileStem: "FOC-sample",
};

describe("PDF sample", () => {
  it.skipIf(!enabled)("writes a sample to /tmp for visual inspection", async () => {
    const { buildSubmissionPdf } = await import("./pdf");
    const out = "/tmp/foc-summary-sample.pdf";
    writeFileSync(out, await buildSubmissionPdf(doc));
    console.log(`wrote ${out}`);
  }, 30_000);
});
