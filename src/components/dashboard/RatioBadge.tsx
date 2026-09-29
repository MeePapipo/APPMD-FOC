/**
 * Cost/revenue ratio, flagged past 20% — the single source of truth for that
 * threshold and its color, reused by the by-team panel, the top-10-by-ratio
 * panel, and the detail table's % column. `Infinity` (a zero-revenue account,
 * the source data's own edge case) renders as a muted "N/A", not a dot.
 */
const THRESHOLD = 0.2;

export function RatioBadge({ ratio }: { ratio: number }) {
  if (!Number.isFinite(ratio)) {
    return <span className="text-xs text-muted">N/A</span>;
  }
  const over = ratio > THRESHOLD;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs tabular-nums ${over ? "text-negative" : "text-ink"}`}>
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: over ? "var(--negative)" : "var(--line-strong)" }}
        aria-hidden="true"
      />
      {(ratio * 100).toFixed(1)}%
    </span>
  );
}
