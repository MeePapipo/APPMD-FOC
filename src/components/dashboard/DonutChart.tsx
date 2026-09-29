/**
 * Plain 2(+)-segment categorical donut, CSS `conic-gradient` based — no SVG,
 * no chart library, matching `BarChart`'s "no dependency for a simple chart"
 * convention. A 2px surface gap is cut between segments (per the dataviz
 * skill's mark spec for adjacent fills) by inserting a hairline of the card's
 * own surface color at each boundary. Labels/values stay in ink tokens in the
 * legend, never colored — only the swatch carries the color.
 */
export type DonutSegment = { label: string; value: number; color: string };

const GAP_DEG = 2;

export function DonutChart({
  segments,
  centerValue,
  centerLabel,
  valueFormat = (n: number) => Math.round(n).toLocaleString(),
}: {
  segments: DonutSegment[];
  centerValue: string;
  centerLabel: string;
  valueFormat?: (n: number) => string;
}) {
  const total = segments.reduce((t, s) => t + s.value, 0);

  let acc = 0;
  const stops: string[] = [];
  for (const s of segments) {
    const startDeg = total > 0 ? (acc / total) * 360 : 0;
    acc += s.value;
    const endDeg = total > 0 ? (acc / total) * 360 : 0;
    const gapped = Math.max(startDeg, endDeg - GAP_DEG);
    stops.push(`${s.color} ${startDeg}deg ${gapped}deg`, `var(--surface) ${gapped}deg ${endDeg}deg`);
  }
  const gradient = total > 0 ? `conic-gradient(${stops.join(", ")})` : "conic-gradient(var(--line) 0deg 360deg)";

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div
        role="img"
        aria-label={`${centerLabel}: ${centerValue}. ${segments.map((s) => `${s.label} ${valueFormat(s.value)}`).join(", ")}`}
        className="relative h-36 w-36 shrink-0 rounded-full"
        style={{ background: gradient }}
      >
        <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-surface text-center">
          <span className="text-xl font-semibold text-ink">{centerValue}</span>
          <span className="text-[10px] text-muted">{centerLabel}</span>
        </div>
      </div>

      <div className="space-y-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-muted">{s.label}</span>
            <span className="font-medium tabular-nums text-ink">{valueFormat(s.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
