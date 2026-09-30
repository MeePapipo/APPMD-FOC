/**
 * The Dashboard's URL search params, shared by the page and the export route
 * so a bookmarked view and its CSV always describe the same accounts.
 */

export const VIEWS = ["accounts", "overview", "alerts"] as const;
export type DashboardView = (typeof VIEWS)[number];

export type DashboardParams = {
  view?: string;
  year?: string;
  /** First month of the range (or the only month when `mto` is absent). */
  month?: string;
  /** Last month of the range. */
  mto?: string;
  ateam?: string;
  q?: string;
  hi?: string;
  xna?: string;
  sig?: string;
  /** "1" = only the ten accounts with the highest cost. */
  top?: string;
  /** Matrix measure: "cost", anything else = quantity. */
  m?: string;
};

export const parseView = (v: string | undefined): DashboardView => (VIEWS as readonly string[]).includes(v ?? "") ? (v as DashboardView) : "accounts";

const monthNo = (v: string | undefined): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
};

/** Inclusive month range from the `month`/`mto` params; null = every month. */
export function monthRange(p: Pick<DashboardParams, "month" | "mto">): { from: number; to: number } | null {
  const from = monthNo(p.month);
  const to = monthNo(p.mto);
  if (from === null && to === null) return null;
  const lo = from ?? 1;
  const hi = to ?? from ?? 12;
  return lo <= hi ? { from: lo, to: hi } : { from: hi, to: lo };
}

/** Year + month-range + team, the period scope every view shares. */
export function inPeriodScope(f: { year: number; month: number; team: string | null }, p: DashboardParams): boolean {
  const range = monthRange(p);
  return (
    (!p.year || f.year === Number(p.year)) &&
    (!range || (f.month >= range.from && f.month <= range.to)) &&
    (!p.ateam || (f.team ?? "Unassigned") === p.ateam)
  );
}

/** The year the matrix shows: the picked year, else the latest year in the data. */
export function matrixYear(p: Pick<DashboardParams, "year">, years: number[]): number {
  const picked = Number(p.year);
  return p.year && Number.isInteger(picked) ? picked : (years[0] ?? new Date().getFullYear());
}
