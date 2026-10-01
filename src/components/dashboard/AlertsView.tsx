import { Card, Badge } from "@/components/ui";
import { ROW_HOVER } from "@/lib/hoverStyles";
import { cn } from "@/lib/cn";
import type { OverQuotaAccount, StandaloneFocAccount } from "@/lib/dashboard/alertLists";
import { formatOverPct } from "@/lib/dashboard/accountQuota";
import type { FinanceRow } from "@/lib/dashboard/focFinance";
import { RatioBadge } from "./RatioBadge";

export type FinanceTeamRow = FinanceRow;

const money = (n: number) => Math.round(n).toLocaleString();

/** Each list renders twice (phone card + table row); past the biggest hundred nobody reads on. */
const MAX_ROWS = 100;

const Overflow = ({ total }: { total: number }) =>
  total > MAX_ROWS ? (
    <p className="mb-3 text-xs text-muted">Showing the {MAX_ROWS} largest of {total.toLocaleString()}. Narrow the filters (team, account) to see the rest.</p>
  ) : null;

/**
 * Accounts over quota (Bonus given beyond the whole entitlement, biggest
 * excess first), accounts with stand-alone FOC past its threshold, then the
 * finance tables (cost and cost/revenue by month and by team). Figures are
 * cumulative over each account's history, same as the drawer.
 */
export function AlertsView({
  overQuota,
  standalone,
  byMonth,
  byTeam,
}: {
  overQuota: OverQuotaAccount[];
  standalone: StandaloneFocAccount[];
  byMonth: FinanceRow[];
  byTeam: FinanceRow[];
}) {
  const over = overQuota.slice(0, MAX_ROWS);
  const foc = standalone.slice(0, MAX_ROWS);
  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink">Accounts over quota</h2>
        <p className="mb-3 text-xs text-muted">
          Bonus given (master prices) beyond the whole entitlement, past the thresholds in Settings, by excess value. The items driving it are information: reps legitimately swap one item for another.
        </p>
        {overQuota.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No accounts over quota for this filter.</p>
        ) : (
          <>
            <Overflow total={overQuota.length} />
            <div className="divide-y divide-line border-y border-line md:hidden">
              {over.map((r) => (
                <div key={r.accountName} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-medium text-ink">{r.accountName}</h3>
                      <p className="text-xs text-muted">{r.team ?? "—"}</p>
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-negative">{money(r.excessValue)}</span>
                  </div>
                  <p className="mt-1 text-xs tabular-nums text-muted">
                    Bonus {money(r.bonusValue)} / Quota {money(r.entitledValue)} · {formatOverPct(r.overPct)}
                  </p>
                  {r.topItems.length > 0 && (
                    <p className="mt-1 text-xs text-muted">{r.topItems.map((i) => `${i.productName} (+${i.over.toLocaleString()})`).join(" · ")}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[56rem] text-sm">
                <thead className="bg-brand-tint text-xs text-muted">
                  <tr className="border-y border-line text-left">
                    <th scope="col" className="px-3 py-2">Account</th>
                    <th scope="col" className="px-3 py-2 text-right">Quota value</th>
                    <th scope="col" className="px-3 py-2 text-right">Bonus given</th>
                    <th scope="col" className="px-3 py-2 text-right">Excess (THB)</th>
                    <th scope="col" className="px-3 py-2 text-right">Excess %</th>
                    <th scope="col" className="px-3 py-2">Items driving it</th>
                  </tr>
                </thead>
                <tbody>
                  {over.map((r) => (
                    <tr key={r.accountName} className={cn("border-b border-line/60 align-top", ROW_HOVER)}>
                      <td className="max-w-64 px-3 py-2">
                        <div className="truncate" title={r.accountName}>{r.accountName}</div>
                        {r.team && <div className="text-xs text-muted">{r.team}</div>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(r.entitledValue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(r.bonusValue)}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums text-negative">{money(r.excessValue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatOverPct(r.overPct)}</td>
                      <td className="px-3 py-2 text-xs text-muted">
                        {r.topItems.length === 0 ? "—" : (
                          <ul className="space-y-0.5">
                            {r.topItems.map((i) => (
                              <li key={i.materialNo} title={`Given ${i.free.toLocaleString()} of ${i.expected.toLocaleString()}`}>
                                <span className="text-ink">{i.productName}</span> +{i.over.toLocaleString()} · {money(i.excessValue)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink">Stand-alone FOC</h2>
        <p className="mb-3 text-xs text-muted">
          FOC given with no reagent sold alongside it (it carries VAT), for accounts past the stand-alone threshold in Settings.
        </p>
        {standalone.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No stand-alone FOC past its threshold for this filter.</p>
        ) : (
          <>
            <Overflow total={standalone.length} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <thead className="bg-brand-tint text-xs text-muted">
                  <tr className="border-y border-line text-left">
                    <th scope="col" className="px-3 py-2">Account</th>
                    <th scope="col" className="px-3 py-2">Team</th>
                    <th scope="col" className="px-3 py-2 text-right">Stand-alone FOC (THB)</th>
                  </tr>
                </thead>
                <tbody>
                  {foc.map((r) => (
                    <tr key={r.accountName} className={cn("border-b border-line/60", ROW_HOVER)}>
                      <td className="max-w-64 truncate px-3 py-2" title={r.accountName}>{r.accountName}</td>
                      <td className="px-3 py-2 text-xs text-muted">{r.team ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className="inline-flex items-center gap-2">{money(r.cost)} <Badge tone="warning">Flag</Badge></span>
                      </td>
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
