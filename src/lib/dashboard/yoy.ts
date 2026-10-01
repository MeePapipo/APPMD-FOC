import { monthRange, type DashboardParams } from "./filters";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The previous-year window a view compares with: the same months of the year before. */
export type YoyWindow = { year: number; prevYear: number; from: number; to: number; label: string };

/**
 * Like-for-like comparison window for a selected year: the month range picked on the page, else every month
 * the year has data for (a part-way year is compared with the same months of the year before, never with its
 * full 12). Null when no year is selected (All years) or the previous year has no data.
 */
export function yoyWindow(p: Pick<DashboardParams, "month" | "mto">, year: number | null, rows: { year: number; month: number }[]): YoyWindow | null {
  if (!year || !rows.some((r) => r.year === year - 1)) return null;
  let range = monthRange(p);
  if (!range) {
    let latest = 0;
    for (const r of rows) if (r.year === year && r.month > latest) latest = r.month;
    if (latest === 0) return null;
    range = { from: 1, to: latest };
  }
  const span = range.from === 1 && range.to === 12 ? "" : range.from === range.to ? ` ${MONTHS[range.from - 1]}` : ` ${MONTHS[range.from - 1]}–${MONTHS[range.to - 1]}`;
  return { year, prevYear: year - 1, from: range.from, to: range.to, label: `${year - 1}${span}` };
}

/** Relative change in %, null when there is no earlier figure to divide by. */
export function pctChange(cur: number, prev: number): number | null {
  return prev > 0 ? ((cur - prev) / prev) * 100 : null;
}

/** "+12%" for big moves, "+3.4%" for small ones; the sign is always shown. */
export function formatPctChange(change: number): string {
  const abs = Math.abs(change);
  // A tiny base year makes the percentage meaningless (+18125%); cap it rather than print noise.
  if (abs >= 1000) return `${change > 0 ? ">+" : "<−"}999%`;
  const text = abs >= 10 ? Math.round(abs).toString() : abs.toFixed(1);
  return `${change > 0 ? "+" : change < 0 ? "−" : ""}${text}%`;
}

/** Percentage-point move of a ratio (cost % of revenue): "+1.2 pp". */
export function formatPp(cur: number, prev: number): string {
  const d = cur - prev;
  return `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toFixed(1)} pp`;
}
