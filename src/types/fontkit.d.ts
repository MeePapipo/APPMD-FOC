/**
 * fontkit ships no type declarations and has no @types package. Only the
 * handful of members the glyph-coverage checks use are declared here —
 * deliberately narrow, so this does not drift into pretending to describe the
 * whole library.
 *
 * Used by src/lib/export/pdf.test.ts and scripts/check-font-thai.mts.
 */
declare module "fontkit" {
  interface GlyphRun {
    /** Total advance of the shaped run, in font units. */
    advanceWidth: number;
  }

  interface Font {
    familyName: string;
    subfamilyName: string;
    /** Font design units per em — divide by this to scale to points. */
    unitsPerEm: number;
    hasGlyphForCodePoint(codePoint: number): boolean;
    /** Shapes a string, applying the font's GSUB/GPOS tables. */
    layout(text: string): GlyphRun;
  }

  /** A .ttc/.otc holds several faces; a plain .ttf resolves straight to one. */
  interface FontCollection {
    fonts: Font[];
  }

  export function openSync(filename: string, postscriptName?: string): Font | FontCollection;
}
