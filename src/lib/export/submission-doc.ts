/**
 * The single view-model behind the FOC summary document — used by the XLSX
 * route, the PDF route and the history detail page so all three can never
 * disagree about a number.
 *
 * The layout it feeds is the one reps already know: sheet "2. ใบสรุป FOC" of
 * the v1 workbook (~/foc-excel/build.mjs). Column order and labels are fixed
 * there; see FOC_ITEM_HEADERS / REAGENT_HEADERS below.
 */
import { prisma } from "@/lib/prisma";
import { overGiveQty, summariseOverGive } from "@/lib/calc/adjust";
import type { SessionUser } from "@/lib/session";
import type { System } from "@prisma/client";

const SYSTEM_LABELS: Record<System, string> = {
  S6800: "cobas 6800/8800",
  S5800: "cobas 5800",
  S4800: "cobas 4800",
};

/**
 * Short form for tight spots like the per-assay list. The `S` prefix is a
 * Prisma enum artifact (identifiers cannot start with a digit) and means
 * nothing to a rep — the instruments are the C-series.
 */
export const SYSTEM_SHORT_LABELS: Record<System, string> = {
  S6800: "C6800/8800",
  S5800: "C5800",
  S4800: "C4800",
};

/**
 * Display names for `MasterItem.group`, which carries the v1 workbook's own
 * wording. Only the ones that differ are listed; anything else passes through.
 *
 * "Conditional" is the odd one out: reps call these Common additional, and the
 * calculator's own section headings already say so (see `previewGroup` in
 * src/lib/calc/preview.ts), so the report was the only place still using the
 * raw master value. Remapped on display rather than in the data so re-importing
 * the master sheet cannot quietly undo it.
 */
const GROUP_LABELS: Record<string, string> = {
  Conditional: "Common additional",
  // Rep-facing rename (2026-09) — remapped on display, not in the stored
  // `SubmissionLine.category` value, so historical submissions relabel too.
  "Additional FOC": "Third party FOC",
};

export const focGroupLabel = (group: string): string => GROUP_LABELS[group] ?? group;

/**
 * Reading order of the FOC table, matching the sections a rep already scrolled
 * through on the calculator: main reagents (their own table above), then
 * quality control, generic, common additional, optional, and finally the rep's
 * own give-aways (their own table below). Keyed on the DISPLAY label, so it
 * stays in step with GROUP_LABELS above.
 *
 * Alphabetical-only ordering interleaved the groups, which made the report read
 * as a flat parts list rather than as the order the rep built.
 */
const GROUP_ORDER = ["Control", "Generic", "Common additional", "Optional"];
const groupRank = (label: string): number => {
  const index = GROUP_ORDER.indexOf(label);
  // Anything the master sheet grows later sorts after the known groups rather
  // than silently jumping to the top.
  return index === -1 ? GROUP_ORDER.length : index;
};

export const REAGENT_HEADERS = [
  "Description",
  "Material No",
  "DKSH",
  "จำนวน test",
  "กล่อง",
  "มูลค่า (THB)",
] as const;

export const FOC_ITEM_HEADERS = [
  "กลุ่ม",
  "Description",
  "Material No",
  "DKSH",
  "Pack",
  "จำนวน",
  "สินค้าคงเหลือ",
  "จำนวน (หลังหักสินค้าคงเหลือ)",
  "THB / หน่วย",
  "มูลค่า (THB)",
  "ปรับ (+/-)",
  "จำนวนสุทธิ",
  "มูลค่าสุทธิ (THB)",
  "หมายเหตุการปรับ",
] as const;

export interface ReagentRow {
  description: string;
  materialNo: string;
  dkshCode: string | null;
  tests: number;
  qty: number;
  value: number;
}

/** Header set for the rep-chosen give-aways, which have no formula columns. */
export const ADDITIONAL_FOC_HEADERS = [
  "Description",
  "Material No",
  "DKSH",
  "Pack",
  "จำนวน",
  "THB / หน่วย",
  "มูลค่า (THB)",
] as const;

export interface FocItemRow {
  group: string;
  description: string;
  materialNo: string;
  dkshCode: string | null;
  packText: string | null;
  calculatedQty: number;
  stockOnHand: number | null;
  afterStockQty: number;
  unitPrice: number | null;
  grossValue: number;
  adjustedQty: number;
  finalQty: number;
  finalValue: number;
  adjustComment: string | null;
  /**
   * Packs given beyond the calculated-minus-stock entitlement, 0 when none.
   * Derived here rather than in each consumer so the PDF, the XLSX and the
   * history detail cannot disagree about which lines were over-given.
   */
  overGiveQty: number;
}

export interface AdditionalFocRow {
  description: string;
  materialNo: string;
  dkshCode: string | null;
  packText: string | null;
  qty: number;
  unitPrice: number | null;
  value: number;
}

export interface SubmissionDoc {
  id: string;
  accountNumber: string;
  accountName: string;
  repEmail: string;
  createdAt: Date;
  status: "SUBMITTED" | "VOID";
  systemsLabel: string;
  assayInputs: { system: System; assayCode: string; tests: number }[];
  reagents: ReagentRow[];
  reagentTotal: number;
  /** Driver-calculated give-aways. */
  focItems: FocItemRow[];
  calculatedFocTotal: number;
  /** Give-aways the rep chose by hand, kept in their own section. */
  additionalFocItems: AdditionalFocRow[];
  additionalFocTotal: number;
  /** Both sections combined — the figure that drives focPct. */
  focTotal: number;
  /**
   * Rollup of the give-away the formula did not ask for — what an approving
   * line manager has to weigh. Counts calculated lines only; the rep's own
   * picks are already broken out as `additionalFocTotal`.
   */
  overGive: { lineCount: number; packs: number; value: number };
  revenue: number;
  focPct: number;
  /** Safe for a Content-Disposition filename and a printed header. */
  fileStem: string;
}

/**
 * Loads one submission as a finished document, or null when the caller may not
 * see it. Access matches the history detail page exactly: a rep sees only
 * their own submissions, an admin sees every one.
 */
export async function loadSubmissionDoc(
  id: string,
  user: SessionUser,
): Promise<SubmissionDoc | null> {
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: {
      lines: { where: { included: true }, orderBy: { description: "asc" } },
      reagents: { orderBy: { assayCode: "asc" } },
      assayInputs: true,
    },
  });
  if (!submission) return null;
  if (user.role !== "ADMIN" && submission.createdByEmail !== user.email) return null;

  // group/packText/dkshCode are display-only master fields that SubmissionLine
  // does not snapshot, so they are joined back by materialNo. A SKU shared
  // across systems has one MasterItem row per system with identical values
  // here — any match does. Calculated and manual lines live in different
  // catalogues, hence the two lookups.
  const calculatedMaterials = [
    ...new Set(submission.lines.filter((l) => l.source !== "MANUAL").map((l) => l.materialNo)),
  ];
  const manualMaterials = [
    ...new Set(submission.lines.filter((l) => l.source === "MANUAL").map((l) => l.materialNo)),
  ];
  const [masterItems, additionalItems] = await Promise.all([
    calculatedMaterials.length
      ? prisma.masterItem.findMany({
          where: { materialNo: { in: calculatedMaterials } },
          select: { materialNo: true, group: true, packText: true, dkshCode: true },
        })
      : [],
    manualMaterials.length
      ? prisma.additionalFocItem.findMany({
          where: { materialNo: { in: manualMaterials } },
          select: { materialNo: true, dkshCode: true, unitText: true },
        })
      : [],
  ]);
  const masterByMaterial = new Map(masterItems.map((item) => [item.materialNo, item]));
  const additionalByMaterial = new Map(additionalItems.map((item) => [item.materialNo, item]));

  const reagents: ReagentRow[] = submission.reagents.map((reagent) => ({
    description: reagent.description,
    materialNo: reagent.materialNo,
    dkshCode: reagent.dkshCode,
    tests: reagent.tests,
    qty: reagent.qty,
    value: Number(reagent.lineValue),
  }));

  // Manual give-aways carry none of the stock/adjust columns, so they get
  // their own section rather than a row of dashes in the calculated table.
  const additionalFocItems: AdditionalFocRow[] = submission.lines
    .filter((line) => line.source === "MANUAL")
    .map((line) => ({
      description: line.description,
      materialNo: line.materialNo,
      dkshCode: additionalByMaterial.get(line.materialNo)?.dkshCode ?? null,
      packText: additionalByMaterial.get(line.materialNo)?.unitText ?? line.unitText,
      qty: line.finalQty,
      unitPrice: line.unitPrice,
      value: Number(line.lineValue),
    }));

  const focItems: FocItemRow[] = submission.lines
    .filter((line) => line.source !== "MANUAL")
    .map((line) => {
    const master = masterByMaterial.get(line.materialNo);
    const unitPrice = line.unitPrice;
    const afterStockQty = line.afterStockQty ?? line.calculatedQty;
    return {
      group: focGroupLabel(master?.group ?? line.category ?? "—"),
      description: line.description,
      materialNo: line.materialNo,
      dkshCode: master?.dkshCode ?? null,
      packText: master?.packText ?? line.unitText,
      calculatedQty: line.calculatedQty,
      stockOnHand: line.stockOnHand,
      afterStockQty,
      unitPrice,
      grossValue: afterStockQty * (unitPrice ?? 0),
      adjustedQty: line.adjustedQty ?? 0,
      finalQty: line.finalQty,
      finalValue: Number(line.lineValue),
      adjustComment: line.adjustComment,
      overGiveQty: overGiveQty({ finalQty: line.finalQty, afterStockQty }),
    };
  })
    // The query already ordered by description; this only regroups, so the
    // alphabetical run inside each group survives.
    .sort((a, b) => groupRank(a.group) - groupRank(b.group));

  const systems = [...new Set(submission.assayInputs.map((a) => a.system))];
  const revenue = Number(submission.revenue);
  const date = submission.createdAt.toISOString().slice(0, 10);

  return {
    id: submission.id,
    accountNumber: submission.accountNumber,
    accountName: submission.accountName,
    repEmail: submission.createdByEmail,
    createdAt: submission.createdAt,
    status: submission.status,
    systemsLabel: systems.length ? systems.map((s) => SYSTEM_LABELS[s]).join(" + ") : "—",
    assayInputs: submission.assayInputs.map((a) => ({
      system: a.system,
      assayCode: a.assayCode,
      tests: a.tests,
    })),
    reagents,
    reagentTotal: reagents.reduce((sum, r) => sum + r.value, 0),
    focItems,
    calculatedFocTotal: focItems.reduce((sum, i) => sum + i.finalValue, 0),
    additionalFocItems,
    additionalFocTotal: additionalFocItems.reduce((sum, i) => sum + i.value, 0),
    // The stored total, not a re-derived one: it is what the rep confirmed.
    focTotal: Number(submission.focValue),
    overGive: summariseOverGive(focItems, (item) => item.unitPrice ?? 0),
    revenue,
    focPct: Number(submission.focPct),
    fileStem: `FOC-${submission.accountNumber.replace(/[^\w.-]+/g, "_")}-${date}`,
  };
}

export function formatThaiDate(date: Date): string {
  return date.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });
}
