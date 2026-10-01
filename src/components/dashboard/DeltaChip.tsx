import { cn } from "@/lib/cn";
import { formatPctChange, formatPp, pctChange } from "@/lib/dashboard/yoy";

/**
 * "Up or down against the same months last year", small enough to sit under a figure. Colour carries the
 * sentiment, not the direction: more revenue is good, more cost is bad (`upIs`). A move under half a percent
 * (or 0.1 pp) is shown as flat; with nothing to compare against the chip says "new" or stays empty.
 * `mode="pp"` is for a ratio that is already a percentage (cost % of revenue).
 */
export function DeltaChip({
  cur,
  prev,
  mode = "pct",
  upIs,
  label,
  compact = false,
  className,
}: {
  cur: number;
  prev: number | null | undefined;
  mode?: "pct" | "pp";
  upIs: "good" | "bad";
  /** The comparison period, e.g. "2025 Jan–Sep". */
  label: string;
  /** Just the arrow and the figure; the period moves into the tooltip. */
  compact?: boolean;
  className?: string;
}) {
  if (prev === null || prev === undefined || !Number.isFinite(cur) || !Number.isFinite(prev)) return null;
  if (cur === 0 && prev === 0) return null;
  const shown = (n: number) => (mode === "pp" ? `${n.toFixed(1)}%` : Math.round(n).toLocaleString());
  const title = `${label}: ${shown(prev)}`;

  let text: string;
  let dir: "up" | "down" | "flat";
  if (mode === "pp") {
    const d = cur - prev;
    dir = Math.abs(d) < 0.1 ? "flat" : d > 0 ? "up" : "down";
    text = formatPp(cur, prev);
  } else {
    const change = pctChange(cur, prev);
    if (change === null) return <span title={title} className={cn("text-[11px] text-muted", className)}>new</span>;
    dir = Math.abs(change) < 0.5 ? "flat" : change > 0 ? "up" : "down";
    text = formatPctChange(change);
  }

  const tone = dir === "flat" ? "text-muted" : (dir === "up") === (upIs === "good") ? "text-positive" : "text-negative";
  return (
    <span title={title} // Compact chips (table cells) never wrap; the full form may, so "vs 2025 Jan–Sep" cannot push a narrow tile wider.
      className={cn("inline-flex items-baseline gap-1 text-[11px] font-medium tabular-nums", compact && "whitespace-nowrap", !compact && "flex-wrap", tone, className)}>
      <span aria-hidden="true">{dir === "up" ? "▲" : dir === "down" ? "▼" : "–"}</span>
      <span className="sr-only">{dir === "up" ? "up" : dir === "down" ? "down" : "unchanged"}</span>
      {text}
      {!compact && <span className="font-normal text-muted">vs {label}</span>}
    </span>
  );
}
