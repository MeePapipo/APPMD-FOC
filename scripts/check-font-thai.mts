/**
 * Checks that a TTF actually covers every character the summary document
 * prints, not merely "some Thai". A font missing one tone mark silently drops
 * it from the PDF, which is far worse than a visibly broken document.
 *
 * Run: npx tsx scripts/check-font-thai.mts public/fonts/Prompt-Regular.ttf
 */
import * as fontkit from "fontkit";

// Every literal string the PDF can print, from src/lib/export/*.ts.
const DOCUMENT_TEXT = [
  "ใบสรุปของแถม (FOC Summary)",
  "ผู้แทนขาย",
  "วันที่",
  "ใบนี้ถูกยกเลิก (VOID)",
  "น้ำยาหลักที่สั่ง (Main Reagent)",
  "จำนวน test",
  "กล่อง",
  "มูลค่า (THB)",
  "รวมมูลค่าน้ำยา",
  "— ไม่มีน้ำยาหลักในใบนี้ —",
  "ของแถม (FOC Items)",
  "กลุ่ม",
  "Pack",
  "จำนวน",
  "สินค้าคงเหลือ",
  "จำนวน (หลังหักสินค้าคงเหลือ)",
  "THB / หน่วย",
  "ปรับ (+/-)",
  "จำนวนสุทธิ",
  "มูลค่าสุทธิ (THB)",
  "หมายเหตุการปรับ",
  "— ไม่มีของแถมในใบนี้ —",
  "ของแถมเพิ่มเติมที่ผู้แทนเลือกเอง (Additional FOC)",
  "รวมของแถมเพิ่มเติม",
  "รวมมูลค่า FOC",
  "คิดเป็น % ของยอดขาย",
  "หน้า",
  // A realistic free-text adjustment reason.
  "ลูกค้าขอเพิ่มสำหรับรอบทดสอบ ไม่เพียงพอ ขอแก้ไขจำนวนใหม่",
  // Thai digits and the baht sign occasionally appear in pasted text.
  "฿ ๐๑๒๓๔๕๖๗๘๙",
].join("");

const file = process.argv[2];
if (!file) throw new Error("usage: tsx scripts/check-font-thai.mts <font.ttf>");

const loaded = fontkit.openSync(file);
const font = "fonts" in loaded ? loaded.fonts[0] : loaded;

const needed = [...new Set([...DOCUMENT_TEXT])].filter((c) => c.trim() !== "");
const missing = needed.filter((c) => !font.hasGlyphForCodePoint(c.codePointAt(0)!));

console.log(`${file}`);
console.log(`  family:   ${font.familyName} ${font.subfamilyName}`);
console.log(`  checked:  ${needed.length} distinct characters used by the document`);
if (missing.length === 0) {
  console.log("  ✓ every character the document prints has a glyph");
} else {
  console.log(`  ✗ ${missing.length} missing: ${missing.join(" ")}`);
  console.log(`    code points: ${missing.map((c) => "U+" + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")).join(" ")}`);
}
process.exitCode = missing.length === 0 ? 0 : 1;
