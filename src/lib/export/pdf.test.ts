import { describe, expect, it } from "vitest";
import { findThaiFont } from "./pdf";
import {
  ADDITIONAL_FOC_HEADERS,
  FOC_ITEM_HEADERS,
  REAGENT_HEADERS,
  type SubmissionDoc,
} from "./submission-doc";

const hasFont = findThaiFont() !== null;

const doc: SubmissionDoc = {
  id: "sub-1",
  accountNumber: "52026568",
  accountName: "LOEY HOSPITAL",
  repEmail: "rep@roche.com",
  createdAt: new Date("2026-09-21T03:00:00Z"),
  status: "SUBMITTED",
  systemsLabel: "cobas 6800/8800 + cobas 5800",
  assayInputs: [{ system: "S6800", assayCode: "HBV", tests: 2000, freeTests: 0 }],
  reagents: [{
    description: "KIT COBAS 58/68/8800 HBV 192T IVD",
    materialNo: "09040820190",
    dkshCode: "101154999",
    tests: 2500,
    qty: 14,
    freeQty: 0,
    value: 2284800,
  }],
  reagentTotal: 2284800,
  focItems: [{
    group: "Control",
    description: "KIT COBAS 58/68/8800 HBV/HCV/HIV RMC IVD",
    materialNo: "09040773190",
    dkshCode: "101154998",
    packText: "8 sets",
    calculatedQty: 29,
    stockOnHand: 1,
    afterStockQty: 28,
    unitPrice: 3400,
    grossValue: 95200,
    adjustedQty: 2,
    finalQty: 30,
    finalValue: 102000,
    // Thai in an adjustment reason is the case most likely to expose a bad font.
    adjustComment: "ลูกค้าขอเพิ่มสำหรับรอบทดสอบ",
    overGiveQty: 2,
  }],
  calculatedFocTotal: 102000,
  additionalFocItems: [{
    description: "Disposable Gloves(powderless) size M",
    materialNo: "05840031001",
    dkshCode: "100394733",
    packText: null,
    qty: 4,
    unitPrice: 250,
    value: 1000,
  }],
  additionalFocTotal: 1000,
  focTotal: 103000,
  overGive: { lineCount: 1, packs: 2, value: 6800 },
  revenue: 2284800,
  focPct: 0.0451,
  fileStem: "FOC-52026568-2026-09-21",
};

describe("PDF summary document", () => {
  it("reports a clear, actionable error when no Thai font is present", async () => {
    const { MissingThaiFontError } = await import("./pdf");
    const error = new MissingThaiFontError();
    // Must name both a family it accepts and where to put it — this message is
    // the only instruction whoever deploys the app will get.
    expect(error.message).toContain("Sarabun");
    expect(error.message).toContain("fonts");
    expect(error.message).toContain("-Regular.ttf");
  });

  // Skipped until a Thai font is installed in public/fonts — see pdf.tsx. It
  // is a skip rather than a failure so a fresh checkout is not red before the
  // one-off font download.
  it.skipIf(!hasFont)("renders a real PDF containing Thai text", async () => {
    const { buildSubmissionPdf } = await import("./pdf");
    const buffer = await buildSubmissionPdf(doc);

    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.subarray(-6).toString("latin1")).toContain("EOF");
    // A failed render is ~2 KB of chrome; anything with an embedded Thai
    // subset clears this comfortably. Kept loose on purpose — the exact size
    // depends on which family is installed, and an earlier tighter bound
    // failed a perfectly good render just because the font was smaller.
    expect(buffer.length).toBeGreaterThan(8_000);

    // An embedded TrueType shows up as a FontFile2 stream. Had registration
    // failed, react-pdf would silently fall back to base-14 Helvetica — which
    // has no Thai glyphs — and every Thai label would vanish from the output.
    // Asserting both halves is what catches that, rather than asserting the
    // family name: react-pdf writes the font file's own internal name here,
    // not the alias it was registered under.
    const raw = buffer.toString("latin1");
    expect(raw).toContain("FontFile2");
    expect(raw).not.toContain("/BaseFont /Helvetica");
  }, 30_000);

  // The check that actually matters. A font can cover "most" Thai and still be
  // missing one tone mark, which @react-pdf drops silently — the document
  // renders, looks fine to anyone not reading closely, and is wrong.
  it.skipIf(!hasFont)("has a glyph for every character the document prints", async () => {
    const fontkit = await import("fontkit");
    const found = findThaiFont()!;
    const loaded = fontkit.openSync(found.regular);
    const font = "fonts" in loaded ? loaded.fonts[0] : loaded;

    const printed = [
      ...REAGENT_HEADERS, ...FOC_ITEM_HEADERS, ...ADDITIONAL_FOC_HEADERS,
      "ใบสรุปของแถม (FOC Summary)", "ผู้แทนขาย", "วันที่", "ใบนี้ถูกยกเลิก (VOID)",
      "น้ำยาหลักที่สั่ง (Main Reagent)", "ของแถม (FOC Items)",
      "ของแถมเพิ่มเติมที่ผู้แทนเลือกเอง (Third party FOC)",
      "รวมมูลค่าน้ำยา", "รวมของแถมเพิ่มเติม", "รวมมูลค่า FOC", "คิดเป็น % ของยอดขาย",
      "— ไม่มีน้ำยาหลักในใบนี้ —", "— ไม่มีของแถมในใบนี้ —", "หน้า",
      doc.focItems[0].adjustComment ?? "",
    ].join("");

    const missing = [...new Set([...printed])]
      .filter((c) => c.trim() !== "")
      .filter((c) => !font.hasGlyphForCodePoint(c.codePointAt(0)!));

    expect(missing, `${found.family} is missing: ${missing.join(" ")}`).toEqual([]);
  });
});
