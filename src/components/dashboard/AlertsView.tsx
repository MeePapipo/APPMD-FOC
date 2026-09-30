import { Card } from "@/components/ui";
import { ROW_HOVER } from "@/lib/hoverStyles";
import { cn } from "@/lib/cn";
import type { AlertItem } from "@/lib/dashboard/accountAlerts";
import type { FinanceRow } from "@/lib/dashboard/focFinance";
import { RatioBadge } from "./RatioBadge";

export type AlertListItem = AlertItem & { accountName: string; team: string | null; rep: string | null };
export type FinanceTeamRow = FinanceRow;

const money = (n: number) => Math.round(n).toLocaleString();
const timesQuota = (r: number | null) => (r === null ? "no quota" : `${r.toFixed(2)}x`);

/**
 * Significant over-quota items across the accounts in scope, biggest excess
 * value first, then the finance tables (cost and cost/revenue by month and by
 * team). Cumulative quota figures, same as the drilldown.
 */
/** Each item renders twice (phone card + table row); hundreds make the page heavy, and past the biggest few nobody reads on. */
const MAX_ITEMS = 150;

export function AlertsView({ items: allItems, byMonth, byTeam }: { items: AlertListItem[]; byMonth: FinanceRow[]; byTeam: FinanceRow[] }) {
  const items = allItems.slice(0, MAX_ITEMS);
  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink">Over-quota items</h2>
        <p className="mb-3 text-xs text-muted">
          Items given beyond quota past the alert thresholds, by excess value. Quota is cumulative over each account&apos;s whole history.
        </p>
        {allItems.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No over-quota items for this filter.</p>
        ) : (
          <>
            {allItems.length > MAX_ITEMS && (
              <p className="mb-3 text-xs text-muted">Showing the {MAX_ITEMS} largest of {allItems.length.toLocaleString()} items. Narrow the filters (team, account) to see the rest.</p>
            )}
            <div className="divide-y divide-line border-y border-line md:hidden">
              {items.map((i) => (
                <div key={`${i.accountName}|${i.materialNo}`} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-ink">{i.productName}</h3>
                      <p className="truncate text-xs text-muted">{i.accountName}</p>
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-negative">{money(i.excessValue)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Given {i.free.toLocaleString()} of {i.expected.toLocaleString()} ({timesQuota(i.ratio)}) · +{i.over.toLocaleString()}
                    {i.team ? ` · ${i.team}` : ""}
                  </p>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[48rem] text-sm">
                <thead className="bg-brand-tint text-xs text-muted">
                  <tr className="border-y border-line text-left">
                    <th scope="col" className="px-3 py-2">Account</th>
                    <th scope="col" className="px-3 py-2">Team / rep</th>
                    <th scope="col" className="px-3 py-2">Product</th>
                    <th scope="col" className="px-3 py-2 text-right">Entitled</th>
                    <th scope="col" className="px-3 py-2 text-right">Given</th>
                    <th scope="col" className="px-3 py-2 text-right">Over</th>
                    <th scope="col" className="px-3 py-2 text-right">x quota</th>
                    <th scope="col" className="px-3 py-2 text-right">Excess value (THB)</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={`${i.accountName}|${i.materialNo}`} className={cn("border-b border-line/60", ROW_HOVER)}>
                      <td className="max-w-56 truncate px-3 py-2" title={i.accountName}>{i.accountName}</td>
                      <td className="px-3 py-2 text-xs text-muted">{[i.team, i.rep].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="max-w-64 truncate px-3 py-2" title={i.productName}>{i.productName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{i.expected.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{i.free.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-negative">+{i.over.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{timesQuota(i.ratio)}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums text-negative">{money(i.excessValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FinanceTable title="Cost by month" firstHeader="Month" rows={byMonth} />
        <FinanceTable title="Cost by team" firstHeader="Team" rows={byTeam} />
      </div>
    </div>
  );
}

function FinanceTable({ title, firstHeader, rows }: { title: string; firstHeader: string; rows: FinanceRow[] }) {
  const sum = (pick: (r: FinanceRow) => number) => rows.reduce((t, r) => t + pick(r), 0);
  const revenue = sum((r) => r.revenue);
  const totalCost = sum((r) => r.totalCost);
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold text-ink">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm">
          <thead className="bg-brand-tint text-xs text-muted">
            <tr className="border-y border-line">
              <th scope="col" className="px-3 py-2 text-left">{firstHeader}</th>
              <th scope="col" className="px-3 py-2 text-right">Revenue</th>
              <th scope="col" className="px-3 py-2 text-right">FOC</th>
              <th scope="col" className="px-3 py-2 text-right">Bonus</th>
              <th scope="col" className="px-3 py-2 text-right">Total</th>
              <th scope="col" className="px-3 py-2 text-right">Cost/rev</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={cn("border-b border-line/60", ROW_HOVER)}>
                <th scope="row" className="px-3 py-2 text-left font-normal">{r.label}</th>
                <td className="px-3 py-2 text-right tabular-nums">{money(r.revenue)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(r.focCost)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(r.bonusCost)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(r.totalCost)}</td>
                <td className="px-3 py-2 text-right"><RatioBadge ratio={r.ratio} /></td>
              </tr>
            ))}
          </tbody>
          {rows.length > 1 && (
            <tfoot>
              <tr className="border-t border-line-strong text-xs font-medium">
                <th scope="row" className="px-3 py-2 text-left">Total</th>
                <td className="px-3 py-2 text-right tabular-nums">{money(revenue)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(sum((r) => r.focCost))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(sum((r) => r.bonusCost))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totalCost)}</td>
                <td className="px-3 py-2 text-right"><RatioBadge ratio={revenue > 0 ? totalCost / revenue : totalCost > 0 ? Infinity : 0} /></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}
