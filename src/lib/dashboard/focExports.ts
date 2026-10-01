/**
 * Pure CSV builders for the Dashboard exports (the PDF lives in
 * src/lib/export/accountMatrixPdf.tsx and reads the same table via
 * `matrixTable`). CSVs get a UTF-8 BOM so Excel shows the Thai names.
 */

import { toCsv } from "@/lib/csv";
import type { EntitlementRow } from "./entitlement";
import { MONTH_SHORT, cellValue, type AccountMatrix, type Measure } from "./focAccountMatrix";

export const CSV_BOM = "﻿";

export type EntitlementLite = Pick<EntitlementRow, "materialNo" | "expected" | "free" | "significant"> &
  Partial<Pick<EntitlementRow, "focQty" | "bonusQty">>;

export type QuotaStatus = "Over Quota" | "Over" | "Within" | "";

/** Over Quota = beyond the admin thresholds; Over = any excess; "" = no quota row. */
export function quotaStatus(e: EntitlementLite | undefined): QuotaStatus {
  if (!e) return "";
  if (e.significant) return "Over Quota";
  return e.free > e.expected ? "Over" : "Within";
}

/** Given as a percentage of entitlement; null when there is no entitlement to divide by. */
export const quotaPct = (e: EntitlementLite | undefined): number | null =>
  e && e.expected > 0 ? (e.free / e.expected) * 100 : null;

export const MATRIX_HEADERS = [
  "Product code", "Product", "Quota (units, year)", "Given % of quota", "Status",
  "Prior-year total", ...MONTH_SHORT, "YTD total",
];

/** The matrix as header + string-free rows (numbers stay numbers), plus a totals row. */
export function matrixTable(matrix: AccountMatrix, entitlement: EntitlementLite[], measure: Measure): (string | number)[][] {
  const byMat = new Map(entitlement.map((e) => [e.materialNo, e]));
  const rows: (string | number)[][] = matrix.rows.map((r) => {
    const e = byMat.get(r.materialNo);
    const pct = quotaPct(e);
    return [
      r.materialNo, r.productName, e ? e.expected : "", pct === null ? "" : Math.round(pct), quotaStatus(e),
      cellValue(r.prior, measure), ...r.months.map((c) => cellValue(c, measure)), cellValue(r.ytd, measure),
    ];
  });
  rows.push([
    "", "Total", "", "", "",
    cellValue(matrix.totals.prior, measure), ...matrix.totals.months.map((c) => cellValue(c, measure)), cellValue(matrix.totals.ytd, measure),
  ]);
  return rows;
}

/** One account's matrix. The measure only changes the month/total cells. */
export function accountMatrixCsv(
  account: { name: string; number: string | null; team: string | null; rep: string | null },
  matrix: AccountMatrix,
  entitlement: EntitlementLite[],
  measure: Measure,
): string {
  const unit = measure === "qty" ? "FOC + Bonus quantity" : "FOC + Bonus cost (THB)";
  return CSV_BOM + toCsv([
    ["Account", account.name],
    ["Account no", account.number ?? ""],
    ["Team", account.team ?? ""],
    ["Rep", account.rep ?? ""],
    ["Year", matrix.year],
    ["Measure", unit],
    [],
    [...MATRIX_HEADERS, "item_group"],
    ...matrixTable(matrix, entitlement, measure).map((r, i) => [...r, matrix.rows[i]?.itemGroup ?? ""]),
  ]);
}

export type LongFact = {
  accountName: string;
  team: string | null;
  rep: string | null;
  materialNo: string;
  productName: string;
  category?: string | null;
  year: number;
  month: number;
  focQty: number;
  bonusQty: number;
  focCost: number;
  bonusCost: number;
};

export const LONG_HEADERS = [
  "Account", "Account no", "Team", "Rep", "Product code", "Product name", "Year", "Month",
  "FOC qty", "Bonus qty", "FOC cost", "Bonus cost", "item_group",
];

const accountNo = (name: string) => name.match(/\(([^()]+)\)\s*$/)?.[1].trim() ?? "";
/** "PICHIT HOSPITAL  (0052027798)" -> "PICHIT HOSPITAL". */
const accountLabel = (name: string) => name.replace(/\s*\([^()]+\)\s*$/, "").trim();

/** Every account's rows in long format, one line per account x product x month; all-zero lines are skipped. */
export function longFactsCsv(facts: LongFact[]): string {
  const sorted = facts
    .filter((f) => f.focQty !== 0 || f.bonusQty !== 0 || f.focCost !== 0 || f.bonusCost !== 0)
    .sort((a, b) =>
      a.accountName.localeCompare(b.accountName) || a.year - b.year || a.month - b.month || a.materialNo.localeCompare(b.materialNo));
  return CSV_BOM + toCsv([
    LONG_HEADERS,
    ...sorted.map((f) => [
      accountLabel(f.accountName), accountNo(f.accountName), f.team ?? "", f.rep ?? "", f.materialNo, f.productName,
      f.year, f.month, f.focQty, f.bonusQty, f.focCost, f.bonusCost, f.category ?? "",
    ]),
  ]);
}
