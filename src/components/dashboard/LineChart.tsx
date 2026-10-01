/**
 * Hand-rolled single-series SVG line chart (dataviz mark specs: 2px line,
 * round join/cap, >=8px end markers, hairline solid gridlines) plus an
 * optional dashed reference line for a fixed threshold — used for the
 * account drill-down's %cost/revenue-over-time chart and its 20% reference.
 * No chart library, matching `BarChart`'s convention.
 */

const REVENUE_COLOR = "var(--chart-revenue)";
const WIDTH = 640;
const HEIGHT = 160;
const PAD = { top: 20, right: 76, bottom: 24, left: 36 };

export function LineChart({
  data,
  valueFormat = (n: number) => `${n.toFixed(1)}%`,
  referenceValue,
  referenceLabel,
}: {
  data: { label: string; value: number | null }[];
  valueFormat?: (n: number) => string;
  referenceValue?: number;
  referenceLabel?: string;
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No data for this account.</p>;
  }

  const finiteValues = data.map((d) => d.value).filter((v): v is number => v !== null && Number.isFinite(v));
  // A round axis top (multiple of 20) so the four gridlines land on whole, even steps.
  const max = Math.ceil((Math.max(1, referenceValue ?? 0, ...finiteValues) * 1.1) / 20) * 20;

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  const points = data.map((d, i) => ({ ...d, x: x(i), y: d.value !== null ? y(d.value) : null }));
  const linePoints = points.filter((p): p is typeof p & { y: number } => p.y !== null);
  const path = linePoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  const gridFractions = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Cost percent of revenue by month">
        {gridFractions.map((f) => {
          const gy = PAD.top + plotH * (1 - f);
          return (
            <g key={f}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={gy} y2={gy} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.left - 6} y={gy} textAnchor="end" dominantBaseline="middle" className="fill-muted text-[9px]">
                {Math.round(max * f)}%
              </text>
            </g>
          );
        })}

        {referenceValue !== undefined && referenceValue <= max && (
          <g>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(referenceValue)}
              y2={y(referenceValue)}
              stroke="var(--muted)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            {referenceLabel && (
              <text x={WIDTH - PAD.right + 6} y={y(referenceValue)} dominantBaseline="middle" className="fill-muted text-[9px]">
                {referenceLabel}
              </text>
            )}
          </g>
        )}

        <path d={path} fill="none" stroke={REVENUE_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p) => {
          if (p.value === null) return null;
          const py = y(p.value);
          return (
            <g key={p.label}>
              <circle cx={p.x} cy={py} r={4} fill={REVENUE_COLOR} stroke="var(--surface)" strokeWidth={2} />
              <text
                x={p.x}
                y={py - 8}
                textAnchor="middle"
                className="fill-ink text-[9px] tabular-nums"
                stroke="var(--surface)"
                strokeWidth={3}
                strokeLinejoin="round"
                paintOrder="stroke"
              >
                {valueFormat(p.value)}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => (
          <text key={d.label} x={x(i)} y={HEIGHT - 6} textAnchor="middle" className="fill-muted text-[9px]">
            {d.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
