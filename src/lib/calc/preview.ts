import type { ReagentResult } from "./types";
import type { TpbNotice } from "./tpbNotices";
import { applyAdjustment, type AdjustedQuantities, type AdjustmentMap } from "./adjust";

export interface PreviewLine {
  materialNo: string;
  dkshCode: string | null;
  description: string;
  category: string | null;
  usageType?: string | null;
  unitText: string | null;
  system: string;
  onDemand: boolean;
  optional: boolean;
  qty: number;
  unitPrice: number | null;
  value: number;
}

/**
 * How much of an account's cumulative give-away allowance is left, per item.
 * `entitled` already includes the order being previewed; `given` is what
 * Tableau says was handed out up to `asOf` (the last import).
 */
export interface AllowanceInfo {
  asOf: string | null; // "2026-08", the latest month in the FOC import
  year: number | null; // the calendar year the allowance covers: the latest year in the import
  hasHistory: boolean; // false when the account has no rows in the import at all
  lines: Record<string, { given: number; entitled: number; remaining: number }>;
}

export interface PreviewResult {
  reagents: ReagentResult[];
  lines: PreviewLine[];
  revenue: number;
  focValue: number;
  focPct: number;
  /** Assays whose run count rests on weak TPB evidence; absent on older saved previews. */
  tpbNotices?: TpbNotice[];
  /** Present when the order was previewed for an account. */
  allowance?: AllowanceInfo | null;
}

export function previewGroup(line: Pick<PreviewLine, "usageType" | "category">) {
  const usageType = line.usageType?.trim().toLowerCase().replace("addtional", "additional");
  if (usageType === "quality control" || line.category === "Controls") return "Quality control";
  if (usageType === "common additional") return "Common additional";
  return "Additional";
}

/** A preview line with the rep's stock deduction and manual adjustment folded in. */
export type AdjustedLine = PreviewLine & AdjustedQuantities;

/**
 * A give-away the rep added by hand — no driver produced it, so it carries a
 * quantity and nothing else. Priced from the catalogue, and counted in the FOC
 * total like any other freebie.
 */
export interface ManualFocLine {
  materialNo: string;
  description: string;
  dkshCode: string | null;
  packSize: number;
  unitText: string | null;
  unitPrice: number | null;
  qty: number;
}

export const manualLineValue = (line: ManualFocLine) => line.qty * (line.unitPrice ?? 0);

/**
 * Selection and stock/adjust arithmetic only — never reruns assay math. The
 * driver quantity (`line.qty`) always comes from the server; the only things
 * layered on here are the rep's own two inputs, using the same
 * `applyAdjustment` the submit endpoint uses so the screen can't disagree
 * with what gets persisted.
 */
export function selectPreview(
  preview: PreviewResult,
  optionalTicked: Record<string, boolean>,
  adjustments: AdjustmentMap = {},
  manual: ManualFocLine[] = [],
) {
  const adjust = (line: PreviewLine): AdjustedLine => ({
    ...line,
    ...applyAdjustment(line.qty, line.unitPrice, adjustments[line.materialNo]),
  });

  const required = preview.lines.filter((line) => !line.optional).map(adjust);
  const optional = preview.lines.filter((line) => line.optional).map(adjust);
  const selectedOptional = optional.filter((line) => optionalTicked[line.materialNo] === true);
  const requiredValue = required.reduce((sum, line) => sum + line.lineValue, 0);
  const optionalValue = selectedOptional.reduce((sum, line) => sum + line.lineValue, 0);
  const manualLines = manual.filter((line) => line.qty > 0);
  const manualValue = manualLines.reduce((sum, line) => sum + manualLineValue(line), 0);
  const focValue = requiredValue + optionalValue + manualValue;
  return {
    required, optional, selectedOptional, manual: manualLines,
    requiredValue, optionalValue, manualValue, focValue,
    focPct: preview.revenue ? focValue / preview.revenue : 0,
  };
}