/**
 * Measures how wide each PDF table header actually renders, so the column
 * widths in pdf.tsx can be set from measurement instead of guesswork.
 *
 * This matters because Thai has no inter-word spaces and pdf.tsx disables
 * hyphenation (splitting Thai at arbitrary points is worse than not wrapping).
 * A header narrower than its own text is therefore silently clipped — which is
 * how "จำนวน" shipped as "จำนว".
 *
 * Run: npx tsx scripts/measure-pdf-headers.mts
 */
import * as fontkit from "fontkit";
import {
  ADDITIONAL_FOC_HEADERS,
  FOC_ITEM_HEADERS,
  REAGENT_HEADERS,
} from "../src/lib/export/submission-doc";
import { findThaiFont } from "../src/lib/export/thai-font";

const HEADER_FONT_SIZE = 6;
const CELL_PADDING_RIGHT = 3;
/** A4 landscape is 842pt; pdf.tsx pads 24pt each side. */
const CONTENT_WIDTH = 842 - 48;

const found = findThaiFont();
if (!found) throw new Error("No Thai font installed — see public/fonts/README.md");
const loaded = fontkit.openSync(found.regular);
const font = "fonts" in loaded ? loaded.fonts[0] : loaded;

/**
 * Widest unbreakable run, i.e. what the column must fit or it will clip.
 *
 * Measured two ways and the larger taken. SARA AM (ำ, U+0E33) is a single code
 * point that Thai shaping expands into nikhahit + sara aa, so a naive
 * per-code-point sum under-measures any word containing it — which is exactly
 * why "จำนวน" clipped its last glyph in a column that looked wide enough.
 */
function widestWord(text: string): number {
  const scale = HEADER_FONT_SIZE / font.unitsPerEm;
  const expanded = text.replace(/ำ/g, "ํา");
  const widthOf = (s: string) =>
    Math.max(...s.split(/\s+/).map((word) => font.layout(word).advanceWidth * scale));
  return Math.max(widthOf(text), widthOf(expanded));
}

function report(name: string, headers: readonly string[], flex: number[]) {
  const totalFlex = flex.reduce((a, b) => a + b, 0);
  const perFlex = CONTENT_WIDTH / totalFlex;
  console.log(`\n${name}  (${totalFlex} flex over ${CONTENT_WIDTH}pt = ${perFlex.toFixed(1)}pt per unit)`);
  headers.forEach((header, i) => {
    const needed = widestWord(header) + CELL_PADDING_RIGHT;
    const got = flex[i] * perFlex;
    const minFlex = needed / perFlex;
    const ok = got >= needed;
    console.log(
      `  ${ok ? "✓" : "✗"} ${header.padEnd(30)} needs ${needed.toFixed(1).padStart(6)}pt  ` +
        `got ${got.toFixed(1).padStart(6)}pt  (min flex ${minFlex.toFixed(2)})`,
    );
  });
}

// Keep these in sync with the *_COLS arrays in src/lib/export/pdf.tsx.
report("REAGENT", REAGENT_HEADERS, [3.4, 1.3, 1.1, 0.8, 0.6, 1]);
report("FOC ITEM", FOC_ITEM_HEADERS, [0.85, 3, 1.2, 1, 0.8, 0.6, 0.7, 0.85, 0.7, 0.85, 0.6, 0.7, 0.85, 1.6]);
report("ADDITIONAL", ADDITIONAL_FOC_HEADERS, [3.4, 1.3, 1.1, 1, 0.6, 0.8, 1]);
