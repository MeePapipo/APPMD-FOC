"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui";
import { DownloadButton } from "@/components/DownloadButton";
import { cn } from "@/lib/cn";
import { ROW_HOVER } from "@/lib/hoverStyles";
import {
  MONTH_SHORT,
  cellValue,
  type AccountMatrix,
  type MatrixCell,
  type Measure,
  type Split,
} from "@/lib/dashboard/focAccountMatrix";
import { quotaPct, quotaStatus, type EntitlementLite } from "@/lib/dashboard/focExports";
import type { NetSummary } from "@/lib/dashboard/entitlement";
import { DEFAULT_ITEM_GROUPS } from "@/lib/dashboard/itemGroups";
import { compactThb, formatOverPct } from "@/lib/dashboard/accountQuota";

type Loaded = {
  matrix: AccountMatrix;
  entitlement: { rows: EntitlementLite[]; net?: NetSummary };
};

const SPLITS: { value: Split; label: string }[] = [
  { value: "both", label: "FOC + Bonus" },
  { value: "foc", label: "FOC only" },
  { value: "bonus", label: "Bonus only" },
];

const fmt = (n: number) => (n === 0 ? "" : Math.round(n).toLocaleString());

/** Hover text for a cell: the FOC/Bonus split in both units, whatever the measure shown. */
const splitTitle = (c: MatrixCell) =>
  `FOC ${c.focQty.toLocaleString()} pcs / ${Math.round(c.focCost).toLocaleString()} THB · Bonus ${c.bonusQty.toLocaleString()} pcs / ${Math.round(c.bonusCost).toLocaleString()} THB`;

function QuotaBadge({ entitlement }: { entitlement: EntitlementLite | undefined }) {
  const status = quotaStatus(entitlement);
  const pct = quotaPct(entitlement);
  if (!status) return <span className="text-xs text-muted">No quota rule</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs tabular-nums">
      {pct === null ? "no quota" : `${Math.round(pct)}%`}
      {status === "Over Quota" && <Badge tone="negative">Over Quota</Badge>}
      {status === "Over" && <Badge tone="warning">Over</Badge>}
      {status === "Within" && <Badge tone="positive">Within</Badge>}
    </span>
  );
}

/**
 * The expanded body of an Accounts-view row: product x Jan..Dec for one year.
 * Fetched when the row is first opened (the page never ships every account's
 * matrix). Entitled is the cumulative entitlement over the account's whole
 * history, so "Given %" compares it with everything given, not with this
 * year's columns.
 */
export function AccountMatrixPanel({
  name,
  year,
  measure,
  itemGroups,
  onFullDetail,
}: {
  name: string;
  year: number;
  measure: Measure;
  /** The page's `ig` param ("|"-separated), "" = default groups. */
  itemGroups: string;
  onFullDetail: () => void;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [split, setSplit] = useState<Split>("both");
  const igQuery = itemGroups ? `&ig=${encodeURIComponent(itemGroups)}` : "";

  useEffect(() => {
    // The parent keys this panel by name+year, so a change remounts with
    // fresh state rather than needing an effect to clear the old matrix.
    let cancelled = false;
    fetch(`/api/dashboard/account?name=${encodeURIComponent(name)}&year=${year}${igQuery}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to load account.");
        return res.json();
      })
      .then((json) => { if (!cancelled) setData(json); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load account."); });
    return () => { cancelled = true; };
  }, [name, year, igQuery]);

  if (error) return <p role="alert" className="py-6 text-center text-sm text-negative">{error}</p>;
  if (!data) return <p className="py-6 text-center text-sm text-muted">Loading…</p>;

  const { matrix } = data;
  const byMat = new Map(data.entitlement.rows.map((e) => [e.materialNo, e]));
  const value = (c: MatrixCell) => cellValue(c, measure, split);
  const query = `name=${encodeURIComponent(name)}&year=${year}&measure=${measure}${igQuery}`;
  // Show the Item Group column once the selection reaches past the default groups.
  const showGroup = itemGroups.split("|").some((g) => g && !(DEFAULT_ITEM_GROUPS as readonly string[]).includes(g));
  const net = data.entitlement.net;
  const unit = measure === "qty" ? "units" : "THB";

  return (
    <div className="px-1 pb-4 pt-3">
      {net && <NetStrip net={net} />}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="FOC or Bonus" className="inline-flex overflow-hidden rounded-lg border border-line-strong text-xs">
          {SPLITS.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={split === s.value}
              onClick={() => setSplit(s.value)}
              className={cn("px-2.5 py-1", split === s.value ? "bg-brand text-white" : "bg-surface text-ink hover:bg-canvas")}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">{matrix.year}, {unit}. Hover a figure for its FOC/Bonus split.</span>
        <div className="ml-auto flex flex-wrap items-start gap-2">
          <DownloadButton href={`/api/dashboard/account/export?${query}&format=csv`} label="CSV"><Download className="h-4 w-4" aria-hidden="true" /></DownloadButton>
          <DownloadButton href={`/api/dashboard/account/export?${query}&format=pdf`} label="PDF"><Download className="h-4 w-4" aria-hidden="true" /></DownloadButton>
          <button type="button" onClick={onFullDetail} className="rounded-lg border border-line-strong px-3 py-2 text-sm font-medium text-brand hover:bg-canvas">
            Full detail
          </button>
        </div>
      </div>

      {matrix.rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Nothing given in {matrix.year} or the year before.</p>
      ) : (
        <>
          {/* Phone: one card per product, only the months with something in them. */}
          <div className="divide-y divide-line border-y border-line md:hidden">
            {matrix.rows.map((r) => {
              const e = byMat.get(r.materialNo);
              return (
                <div key={r.materialNo || r.productName} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-sm font-medium text-ink">{r.productName}</h4>
                      <p className="text-xs text-muted">{r.materialNo}{showGroup && r.itemGroup ? ` · ${r.itemGroup}` : ""}</p>
                    </div>
                    <QuotaBadge entitlement={e} />
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <CardStat label="Entitled" value={e ? e.expected.toLocaleString() : "—"} />
                    <CardStat label="Prior year" value={fmt(value(r.prior)) || "0"} title={splitTitle(r.prior)} />
                    <CardStat label={`YTD ${matrix.year}`} value={fmt(value(r.ytd)) || "0"} title={splitTitle(r.ytd)} strong />
                  </dl>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.months.map((c, i) =>
                      value(c) !== 0 ? (
                        <span key={i} title={splitTitle(c)} className="rounded-md border border-line bg-canvas px-2 py-0.5 text-xs tabular-nums">
                          <span className="text-muted">{MONTH_SHORT[i]}</span> {fmt(value(c))}
                        </span>
                      ) : null,
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: the full grid, first column pinned while the months scroll. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[60rem] text-sm">
              <thead className="bg-brand-tint text-xs text-muted">
                <tr className="border-y border-line">
                  <th scope="col" className="sticky left-0 z-10 min-w-56 bg-brand-tint px-3 py-2 text-left">Product</th>
                  {showGroup && <th scope="col" className="px-2 py-2 text-left">Item Group</th>}
                  <th scope="col" className="px-2 py-2 text-right" title="Cumulative entitlement over the account's full history, in units">Entitled</th>
                  <th scope="col" className="px-2 py-2 text-right">Prior yr</th>
                  {MONTH_SHORT.map((m) => (
                    <th key={m} scope="col" className="px-2 py-2 text-right">{m}</th>
                  ))}
                  <th scope="col" className="px-2 py-2 text-right">YTD</th>
                  <th scope="col" className="px-3 py-2 text-right" title="Everything given (full history) as a share of the entitlement">Given %</th>
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((r) => {
                  const e = byMat.get(r.materialNo);
                  const alert = e?.significant === true;
                  return (
                    <tr key={r.materialNo || r.productName} className={cn("group border-b border-line/60", ROW_HOVER, alert && "bg-warning-tint/60")}>
                      <th scope="row" className={cn("sticky left-0 z-10 px-3 py-2 text-left font-normal", alert ? "bg-warning-tint" : "bg-surface group-hover:bg-canvas")}>
                        <div className="max-w-64 truncate text-ink" title={r.productName}>{r.productName}</div>
                        <div className="text-xs text-muted">{r.materialNo}</div>
                      </th>
                      {showGroup && <td className="max-w-32 truncate px-2 py-2 text-xs text-muted" title={r.itemGroup ?? undefined}>{r.itemGroup ?? "—"}</td>}
                      <td className="px-2 py-2 text-right tabular-nums text-muted">{e ? e.expected.toLocaleString() : "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums" title={splitTitle(r.prior)}>{fmt(value(r.prior))}</td>
                      {r.months.map((c, i) => (
                        <td key={i} className="px-2 py-2 text-right tabular-nums" title={value(c) !== 0 ? splitTitle(c) : undefined}>{fmt(value(c))}</td>
                      ))}
                      <td className="px-2 py-2 text-right font-medium tabular-nums" title={splitTitle(r.ytd)}>{fmt(value(r.ytd))}</td>
                      <td className="px-3 py-2 text-right"><QuotaBadge entitlement={e} /></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-line-strong text-xs font-medium">
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left">Total</th>
                  {showGroup && <td />}
                  <td />
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(value(matrix.totals.prior))}</td>
                  {matrix.totals.months.map((c, i) => (
                    <td key={i} className="px-2 py-2 text-right tabular-nums">{fmt(value(c))}</td>
                  ))}
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(value(matrix.totals.ytd))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function CardStat({ label, value, title, strong }: { label: string; value: string; title?: string; strong?: boolean }) {
  return (
    <div title={title}>
      <dt className="text-muted">{label}</dt>
      <dd className={cn("tabular-nums text-ink", strong && "font-medium")}>{value}</dd>
    </div>
  );
}

/** Entitled / Bonus given / Net excess / Stand-alone FOC for the account, above the matrix. */
function NetStrip({ net }: { net: NetSummary }) {
  const tile = "rounded-lg border border-line bg-canvas px-3 py-2";
  return (
    <dl className="mb-3 grid grid-cols-2 gap-2 text-xs lg:grid-cols-4" aria-label="Account quota summary">
      <div className={tile} title={`${net.entitledValue.toLocaleString()} THB at master prices, optional items excluded`}>
        <dt className="text-muted">Entitled value</dt>
        <dd className="text-sm tabular-nums text-ink">{compactThb(net.entitledValue)} THB</dd>
      </div>
      <div className={tile} title={`${net.bonusValue.toLocaleString()} THB`}>
        <dt className="text-muted">Bonus given</dt>
        <dd className="text-sm tabular-nums text-ink">{compactThb(net.bonusValue)} THB</dd>
      </div>
      <div className={tile} title={`${net.excessValue.toLocaleString()} THB`}>
        <dt className="text-muted">Net excess</dt>
        <dd className="flex flex-wrap items-center gap-1.5 text-sm tabular-nums text-ink">
          {compactThb(net.excessValue)} THB <span className="text-xs text-muted">{formatOverPct(net.overPct)}</span>
          {net.over ? <Badge tone="negative">Over Quota</Badge> : <Badge tone="positive">Within</Badge>}
        </dd>
      </div>
      <div className={tile} title="Given with no reagent sold alongside it; carries VAT">
        <dt className="text-muted">Stand-alone FOC</dt>
        <dd className="flex flex-wrap items-center gap-1.5 text-sm tabular-nums text-ink">
          {compactThb(net.focStandaloneCost)} THB
          {net.focFlagged && <Badge tone="warning">Flag</Badge>}
        </dd>
      </div>
    </dl>
  );
}
