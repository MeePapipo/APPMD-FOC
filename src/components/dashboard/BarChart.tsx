import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Hand-rolled bar chart (no SVG, no chart library) per the dataviz skill's
 * mark specs: <=24px-thick bars, 4px rounded data-end, a hairline gridline
 * set for vertical charts, a legend whenever there are 2+ series, and always-
 * visible direct value labels (not gated behind hover) — the CSS
 * hover/focus brightness lift is purely a supplementary affordance, never
 * the only way to read a value.
 */

export type ChartSeries = { key: string; label: string; color: string };
export type ChartDatum = { category: string; values: Record<string, number> };

/** Rounds up to a "nice" axis max: 1/2/5 × 10^n. */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exp = Math.floor(Math.log10(max));
  const base = 10 ** exp;
  const frac = max / base;
  const niceFrac = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return niceFrac * base;
}

const GRID_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];

export function BarChart({
  data,
  series,
  orientation = "vertical",
  valueFormat = (n: number) => Math.round(n).toLocaleString(),
  height = 240,
  rightOf,
}: {
  data: ChartDatum[];
  series: ChartSeries[];
  orientation?: "vertical" | "horizontal";
  valueFormat?: (n: number) => string;
  height?: number;
  /** Horizontal orientation only — extra content after a row's bars, e.g. a
   * ratio status badge. */
  rightOf?: (d: ChartDatum) => ReactNode;
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No data for this filter.</p>;
  }

  const max = niceMax(Math.max(1, ...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0))));

  return (
    <div>
      {series.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}

      {orientation === "vertical" ? (
        <div className="relative" style={{ height }}>
          {GRID_FRACTIONS.map((f) => (
            <div key={f} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${f * 100}%` }}>
              <span className="absolute left-0 -translate-y-full pb-0.5 text-[10px] text-muted">
                {valueFormat(max * f)}
              </span>
            </div>
          ))}
          <div className="absolute inset-0 flex items-end justify-around gap-1 pl-10">
            {data.map((d) => (
              <div key={d.category} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <div className="flex h-full items-end gap-0.5">
                  {series.map((s) => {
                    const v = d.values[s.key] ?? 0;
                    const pct = (v / max) * 100;
                    return (
                      <div key={s.key} className="flex h-full w-[18px] flex-col items-center justify-end">
                        <span className="mb-0.5 text-[9px] tabular-nums text-muted">
                          {v > 0 ? valueFormat(v) : ""}
                        </span>
                        <div
                          tabIndex={0}
                          role="img"
                          aria-label={`${d.category} — ${s.label}: ${valueFormat(v)}`}
                          className="w-full rounded-t-[4px] transition-[filter] hover:brightness-110 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-brand"
                          style={{ height: `${pct}%`, minHeight: v > 0 ? 3 : 0, backgroundColor: s.color }}
                        />
                      </div>
                    );
                  })}
                </div>
                <span className="max-w-full truncate text-[11px] text-muted">{d.category}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((d) => (
            <div key={d.category} className="flex min-w-0 items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 truncate text-xs font-medium text-ink">{d.category}</div>
                <div className="space-y-0.5">
                  {series.map((s) => {
                    const v = d.values[s.key] ?? 0;
                    const pct = v > 0 ? Math.max(1, (v / max) * 100) : 0;
                    return (
                      <div key={s.key} className="flex items-center gap-2">
                        <div
                          tabIndex={0}
                          role="img"
                          aria-label={`${d.category} — ${s.label}: ${valueFormat(v)}`}
                          className={cn(
                            "h-5 rounded-r-[4px] transition-[filter] hover:brightness-110 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-brand",
                            v === 0 && "hidden",
                          )}
                          style={{ width: `${pct}%`, backgroundColor: s.color }}
                        />
                        <span className="shrink-0 text-xs tabular-nums text-muted">{valueFormat(v)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {rightOf && <div className="shrink-0 pt-4">{rightOf(d)}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
