"use client";

import type { AdjustedLine, AllowanceInfo } from "@/lib/calc/preview";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ROW_HOVER } from "@/lib/hoverStyles";

const n = (x: number) => x.toLocaleString();

/**
 * Cumulative give-away allowance for the chosen account: what Tableau says was
 * already given, what the account is entitled to in total once this order is
 * counted, and what is left. A line whose quantity on this order is more than
 * what is left would push the account over its quota; it is flagged, and the
 * rep decides what to do (the quantity is never changed for them).
 */
export function AllowancePanel({ allowance, lines }: {
  allowance: AllowanceInfo;
  lines: AdjustedLine[];
}) {
  const rows = lines
    .filter((line) => allowance.lines[line.materialNo])
    .map((line) => {
      const a = allowance.lines[line.materialNo];
      const over = Math.max(0, line.finalQty - Math.max(a.remaining, 0));
      return { line, ...a, over };
    })
    .sort((x, y) => y.over - x.over || x.line.description.localeCompare(y.line.description));
  if (rows.length === 0) return null;
  const overCount = rows.filter((r) => r.over > 0).length;

  return (
    <section aria-labelledby="allowance-heading" className="min-w-0">
      <h3 id="allowance-heading" className="text-sm font-semibold text-ink">Remaining allowance for this account</h3>
      <p className="mt-1 text-xs text-muted">
        {allowance.hasHistory
          ? `Actual FOC+Bonus comes from Tableau billing for ${allowance.year ?? "the latest year"}, up to ${allowance.asOf ?? "the last import"}; orders not billed yet are not counted.`
          : `This account has no give-away in ${allowance.year ?? "the latest year"} in the import, so the allowance is based on this order alone.`}{" "}
        The quota is what {allowance.year ? `${allowance.year}’s` : "that year’s"} reagent sales earn, and includes this order.
      </p>
      {overCount > 0 ? (
        <p role="status" className="mt-2 rounded-lg bg-warning-tint px-3 py-2 text-sm text-warning">
          {overCount} item{overCount === 1 ? "" : "s"} on this order would go past the remaining allowance.
        </p>
      ) : (
        <p role="status" className="mt-2 text-sm text-positive">Everything on this order is within the remaining allowance.</p>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm tabular-nums">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="py-2 pr-3">Item</th>
              <th scope="col" className="py-2 pr-3 text-right">Actual FOC+Bonus <span className="font-normal">(previous bills{allowance.year ? `, ${allowance.year}` : ""})</span></th>
              <th scope="col" className="py-2 pr-3 text-right">Quota{allowance.year ? ` ${allowance.year}` : ""}</th>
              <th scope="col" className="py-2 pr-3 text-right">Remaining</th>
              <th scope="col" className="py-2 pr-3 text-right">This order</th>
              <th scope="col" className="py-2 text-right">Check</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ line, given, entitled, remaining, over }) => (
              <tr key={line.materialNo} className={cn("border-b border-line/60", ROW_HOVER)}>
                <td className="py-2 pr-3 text-ink">{line.description}</td>
                <td className="py-2 pr-3 text-right text-muted">{n(given)}</td>
                <td className="py-2 pr-3 text-right text-muted">{n(entitled)}</td>
                <td className={cn("py-2 pr-3 text-right font-medium", remaining < 0 ? "text-negative" : "text-ink")}>{n(remaining)}</td>
                <td className="py-2 pr-3 text-right font-medium text-ink">{n(line.finalQty)}</td>
                <td className="py-2 text-right">
                  {over > 0 ? <Badge tone="negative">Over by {n(over)}</Badge> : <Badge tone="positive">Within</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
