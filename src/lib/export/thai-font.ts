/**
 * Locating the Thai font for the PDF export.
 *
 * Kept separate from pdf.tsx so tooling can ask "which font will be used?"
 * without importing @react-pdf/renderer — that package is ESM-only underneath
 * and fails to resolve outside a bundler, which would take every helper script
 * down with it.
 */
import { existsSync } from "node:fs";
import path from "node:path";

// public/ is copied into the standalone image (Dockerfile), so this resolves in
// dev and in production alike — process.cwd() is the app root in both.
export const FONT_DIR = path.join(process.cwd(), "public", "fonts");

/**
 * Families we will render Thai with, best first. All are SIL OFL, so any of
 * them may be committed to this repo and shipped in the container.
 *
 * Sarabun leads because it is what Thai business and government documents are
 * normally set in; the others are here so a site that already has one of them
 * to hand is not blocked waiting for a download.
 */
export const FONT_CANDIDATES = ["Sarabun", "Prompt", "Kanit", "NotoSansThai"] as const;

export class MissingThaiFontError extends Error {
  constructor() {
    super(
      `Thai PDF font missing. Put <Family>-Regular.ttf (and optionally ` +
        `<Family>-Bold.ttf) in ${FONT_DIR}, where <Family> is one of: ` +
        `${FONT_CANDIDATES.join(", ")}. See public/fonts/README.md.`,
    );
    this.name = "MissingThaiFontError";
  }
}

/** First candidate family with a Regular face on disk, plus its Bold if present. */
export function findThaiFont(): { family: string; regular: string; bold: string | null } | null {
  for (const family of FONT_CANDIDATES) {
    const regular = path.join(FONT_DIR, `${family}-Regular.ttf`);
    if (!existsSync(regular)) continue;
    const bold = path.join(FONT_DIR, `${family}-Bold.ttf`);
    return { family, regular, bold: existsSync(bold) ? bold : null };
  }
  return null;
}
