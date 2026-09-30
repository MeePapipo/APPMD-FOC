const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Aug 2026". Fixed English names, so server and browser always agree. */
export const periodLabel = (year: number, month: number) => `${MONTHS[month - 1] ?? month} ${year}`;

export type Period = { year: number; month: number };

/** "Jan 2025 and Jan 2026", "Jan–Mar 2026", "Dec 2025 – Feb 2026", sorted oldest first. */
export function describePeriods(periods: Period[]): string {
  const sorted = [...periods].sort((a, b) => a.year - b.year || a.month - b.month);
  if (sorted.length === 0) return "no months";
  if (sorted.length <= 3) {
    const labels = sorted.map((p) => periodLabel(p.year, p.month));
    return labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
  }
  return `${periodLabel(sorted[0].year, sorted[0].month)} – ${periodLabel(sorted.at(-1)!.year, sorted.at(-1)!.month)} (${sorted.length} months)`;
}
