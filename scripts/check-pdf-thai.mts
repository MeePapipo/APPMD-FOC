/**
 * Confirms a generated summary PDF really contains Thai text.
 *
 * An embedded FontFile2 alone does not prove it: the Latin labels would embed
 * the same font even if every Thai glyph had been dropped. What does prove it
 * is the ToUnicode CMap, which maps the glyph ids actually drawn back to their
 * code points — Thai lives in U+0E00–U+0E7F.
 *
 * This is a smoke signal, not an audit. How many entries it recovers depends on
 * how the producer laid out its object streams, so it reports presence rather
 * than a count threshold — an earlier version failed a perfectly good PDF
 * purely because a different font compressed into fewer readable streams. For
 * the real guarantee that every printed character has a glyph, use
 * check-font-thai.mts against the TTF itself.
 *
 * Run: npx tsx scripts/check-pdf-thai.mts /tmp/foc-summary-sample.pdf
 */
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const file = process.argv[2];
if (!file) throw new Error("usage: tsx scripts/check-pdf-thai.mts <file.pdf>");

const pdf = readFileSync(file);
const raw = pdf.toString("latin1");

// Pull every Flate stream and inflate the ones that decompress cleanly.
const codePoints = new Set<number>();
const streamRe = /stream\r?\n/g;
let match: RegExpExecArray | null;
let inflated = 0;
while ((match = streamRe.exec(raw)) !== null) {
  const start = match.index + match[0].length;
  const end = raw.indexOf("endstream", start);
  if (end === -1) continue;
  try {
    const text = inflateSync(pdf.subarray(start, end)).toString("latin1");
    inflated += 1;
    // CMap entries look like: <0123> <0E01>  or  <0123> <0E01 0E02>
    for (const m of text.matchAll(/<([0-9a-fA-F]{4})>\s*<([0-9a-fA-F]{4,})>/g)) {
      const dst = m[2];
      for (let i = 0; i + 4 <= dst.length; i += 4) {
        codePoints.add(parseInt(dst.slice(i, i + 4), 16));
      }
    }
  } catch {
    // Not a Flate stream (font programs, images) — skip.
  }
}

const thai = [...codePoints].filter((c) => c >= 0x0e00 && c <= 0x0e7f).sort((a, b) => a - b);
const sample = thai.slice(0, 24).map((c) => String.fromCodePoint(c)).join("");

console.log(`${file}`);
console.log(`  ${(pdf.length / 1024).toFixed(1)} KB · ${inflated} inflated streams · ${codePoints.size} mapped code points`);
console.log(`  Thai code points: ${thai.length}`);
console.log(`  sample glyphs:    ${sample}`);
const helveticaFallback = raw.includes("/BaseFont /Helvetica");
const ok = thai.length > 0 && raw.includes("FontFile2") && !helveticaFallback;
console.log(
  ok
    ? "  ✓ Thai text is embedded and mapped — it will render, not drop to blanks"
    : helveticaFallback
      ? "  ✗ fell back to Helvetica, which has no Thai glyphs — font registration failed"
      : "  ✗ no Thai found in the ToUnicode map",
);
process.exitCode = ok ? 0 : 1;
