import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Stat tile per the dataviz skill's figures contract: sentence-case label, no
 * trailing colon; value in proportional figures (not tabular-nums — that's
 * for columns that must align, not a single standalone number). `accent`
 * (a left border color) and `hint` (a muted subtitle line) are both optional
 * so existing callers render unchanged.
 */
export function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <Card
      interactive
      className={cn("p-4", accent && "border-l-4")}
      style={accent ? { borderLeftColor: accent } : undefined}
    >
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  );
}
