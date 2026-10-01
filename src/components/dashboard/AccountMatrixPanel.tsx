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
import type { EntitlementLite } from "@/lib/dashboard/focExports";
import { quotaBand } from "@/lib/dashboard/annualQuota";
import type { NetSummary } from "@/lib/dashboard/entitlement";
import { DEFAULT_ITEM_GROUPS } from "@/lib/dashboard/itemGroups";
import { annualYearSummary, compactThb, formatOverPct } from "@/lib/dashboard/accountQuota";

type YearQuotaRow = { quota: number; free: number; focQty: number; bonusQty: number; significant: boolean; warning?: boolean };

type Loaded = {
  matrix: AccountMatrix;
  entitlement: { rows: EntitlementLite[]; net?: NetSummary };
  /** Quota earned in the shown year and what was given in it, per item with a quota rule. */
  yearQuota: Record<string, YearQuotaRow>;
  quotaMode?: "formula" | "annual";
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

/** "+31" / "−19" / "0": how far the units given are above or below the quota. */
const signed = (n: number) => (n > 0 ? `+${n.toLocaleString()}` : n < 0 ? `−${Math.abs(n).toLocaleString()}` : "0");

/** Units given in the year for the FOC / Bonus toggle (the year row carries both). */
function givenFor(y: YearQuotaRow, split: Split): number {
  return split === "foc" ? y.focQty : split === "bonus" ? y.bonusQty : y.free;
}

/**
 * YTD against the year's quota: the percentage with the units above (+) or
 * below (−) the quota in brackets (red = over, green = still to give), then
 * the status.
 */
const BAND_TEXT = { green: "text-positive", amber: "text-warning", red: "text-negative" } as const;

function VsQuota({ row, split, annual }: { row: YearQuotaRow | undefined; split: Split; annual: boolean }) {
  if (!row) return <span className="text-xs text-muted">{annual ? "No quota" : "No quota rule"}</span>;
  const given = givenFor(row, split);
  const diff = given - row.quota;
  const pct = row.quota > 0 ? (given / row.quota) * 100 : null;
  const status = row.significant ? "Over Quota" : row.warning ? "Warning" : row.free > row.quota ? "Over" : "Within";
  return (
    <span className="inline-flex flex-col items-end gap-0.5 whitespace-nowrap tabular-nums">
      <span className={cn("text-sm font-semibold", annual && pct !== null ? BAND_TEXT[quotaBand(pct)] : "text-ink")}>
        {pct === null ? "no quota" : `${Math.round(pct)}%`}{" "}
        <span className={cn("text-xs font-medium", diff > 0 ? "text-negative" : "text-positive")}>({signed(diff)})</span>
      </span>
      {status === "Over Quota" && <Badge tone="negative">Over Quota</Badge>}
      {status === "Warning" && <Badge tone="warning">Warning</Badge>}
      {status === "Over" && <Badge tone="warning">Over</Badge>}
      {status === "Within" && <Badge tone="positive">Within</Badge>}
    </span>
  );
}

const quotaHint = (year: number, annual = false) =>
  annual
    ? `Quota ${year}: the yearly quota set in Tableau (Quota(Year)), in units. % = FOC + Bonus given in the year / quota.`
    : `Quota ${year}: what this account may be given for the year, worked out from the reagents it bought (in units).`;

/**
 * The expanded body of an Accounts-view row: product x Jan..Dec for one year.
 * Fetched when the row is first opened (the page never ships every account's
 * matrix). Quota is the cumulative quota over the account's whole loaded
 * history, so the last column compares it with everything given to date (the
 * Total column), not with this year's columns alone.
 */
export function AccountMatrixPanel({
  name,
  year,
  measure,
  itemGroups,
  product,
  quotaMode,
  allYears = false,
  onFullDetail,
}: {
  name: string;
  year: number;
  measure: Measure;
  /** The page's `ig` param ("|"-separated), "" = default groups. */
  itemGroups: string;
  /** The page's `pl3` param, "" = default Product. */
  product: string;
  quotaMode: "formula" | "annual";
  /** Year filter is All years: the summary tiles cover every loaded month. */
  allYears?: boolean;
  onFullDetail: () => void;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [split, setSplit] = useState<Split>("both");
  const igQuery = `${allYears ? "&span=all" : ""}${itemGroups ? `&ig=${encodeURIComponent(itemGroups)}` : ""}${product ? `&pl3=${encodeURIComponent(product)}` : ""}`;

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
  const yq = data.yearQuota ?? {};
  const value = (c: MatrixCell) => cellValue(c, measure, split);
  const query = `name=${encodeURIComponent(name)}&year=${year}&measure=${measure}${igQuery}`;
  // Show the Item Group column once the selection reaches past the default groups.
  // ... or whenever the rows themselves span more than one group.
  const showGroup =
    itemGroups.split("|").some((g) => g && !(DEFAULT_ITEM_GROUPS as readonly string[]).includes(g)) ||
    new Set(matrix.rows.map((r) => r.itemGroup).filter(Boolean)).size > 1;
  const annual = (data.quotaMode ?? quotaMode) === "annual";
  const net = annual ? undefined : data.entitlement.net;
  const unit = measure === "qty" ? "units" : "THB";

  return (
    <div className="px-1 pb-4 pt-3">
      {net && <NetStrip net={net} period={allYears ? "all loaded months" : String(year)} />}
      {annual && <AnnualStrip yq={yq} />}
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
        <span className="text-xs text-muted">{matrix.year} by month, {unit}. Quota and vs Quota are always in units and cover {matrix.year} only. Hover a figure for its FOC/Bonus split.</span>
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
              const e = yq[r.materialNo];
              return (
                <div key={r.materialNo || r.productName} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-sm font-medium text-ink">{r.productName}</h4>
                      <p className="text-xs text-muted">{r.materialNo}{showGroup && r.itemGroup ? ` · ${r.itemGroup}` : ""}</p>
                    </div>
                    <VsQuota row={e} split={split} annual={annual} />
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <CardStat label="Prior year" value={fmt(value(r.prior)) || "0"} title={splitTitle(r.prior)} />
                    <CardStat label={`Quota ${matrix.year}`} value={e ? e.quota.toLocaleString() : "—"} title={quotaHint(matrix.year, annual)} strong />
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
                <tr className="text-[11px] uppercase tracking-wide">
                  <th scope="col" className="sticky left-0 z-10 bg-brand-tint px-3 pt-2" />
                  {showGroup && <th scope="col" />}
                  <th scope="col" className="px-2 pt-2 text-right font-medium">Last year</th>
                  <th scope="col" className="px-2 pt-2 text-right font-medium text-ink" title={quotaHint(matrix.year, annual)}>Quota {matrix.year}</th>
                  <th scope="col" colSpan={12} className="border-l border-line px-2 pt-2 text-center font-medium">{matrix.year} by month</th>
                  <th scope="col" colSpan={2} className="border-l border-line px-3 pt-2 text-right font-medium text-ink">{matrix.year} YTD vs quota</th>
                </tr>
                <tr className="border-b border-line">
                  <th scope="col" className="sticky left-0 z-10 min-w-56 bg-brand-tint px-3 py-2 text-left">Product</th>
                  {showGroup && <th scope="col" className="px-2 py-2 text-left">Item Group</th>}
                  <th scope="col" className="px-2 py-2 text-right" title="Given last year (total)">Prior yr</th>
                  <th scope="col" className="bg-brand-tint/70 px-2 py-2 text-right text-sm font-semibold text-ink" title={quotaHint(matrix.year, annual)}>Quota</th>
                  {MONTH_SHORT.map((m, i) => (
                    <th key={m} scope="col" className={cn("px-1.5 py-2 text-right font-normal", i === 0 && "border-l border-line")}>{m}</th>
                  ))}
                  <th scope="col" className="border-l border-line px-2 py-2 text-right text-sm font-semibold text-ink" title={`Given in ${matrix.year} so far`}>YTD</th>
                  <th scope="col" className="px-3 py-2 text-right text-sm font-semibold text-ink" title="YTD as a % of the quota, with the units above (+) or below (−) it">vs Quota</th>
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((r) => {
                  const e = yq[r.materialNo];
                  const alert = e?.significant === true;
                  return (
                    <tr key={r.materialNo || r.productName} className={cn("group border-b border-line/60", ROW_HOVER, alert && "bg-warning-tint/60")}>
                      <th scope="row" className={cn("sticky left-0 z-10 px-3 py-2 text-left font-normal", alert ? "bg-warning-tint" : "bg-surface group-hover:bg-canvas")}>
                        <div className="max-w-64 truncate text-ink" title={r.productName}>{r.productName}</div>
                        <div className="text-xs text-muted">{r.materialNo}</div>
                      </th>
                      {showGroup && <td className="max-w-32 truncate px-2 py-2 text-xs text-muted" title={r.itemGroup ?? undefined}>{r.itemGroup ?? "—"}</td>}
                      <td className="px-2 py-2 text-right tabular-nums text-muted" title={splitTitle(r.prior)}>{fmt(value(r.prior))}</td>
                      <td className="bg-brand-tint/30 px-2 py-2 text-right text-sm font-semibold tabular-nums text-ink">{e ? e.quota.toLocaleString() : "—"}</td>
                      {r.months.map((c, i) => (
                        <td key={i} className={cn("px-1.5 py-2 text-right text-xs tabular-nums text-muted", i === 0 && "border-l border-line")} title={value(c) !== 0 ? splitTitle(c) : undefined}>{fmt(value(c))}</td>
                      ))}
                      <td className="border-l border-line px-2 py-2 text-right text-sm font-semibold tabular-nums text-ink" title={splitTitle(r.ytd)}>{fmt(value(r.ytd))}</td>
                      <td className="px-3 py-2 text-right"><VsQuota row={e} split={split} annual={annual} /></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-line-strong text-xs font-medium">
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left">Total</th>
                  {showGroup && <td />}
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(value(matrix.totals.prior))}</td>
                  <td />
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

/** Quota value / Bonus given / Net excess / Stand-alone FOC for the account, above the matrix. */
function NetStrip({ net, period }: { net: NetSummary; period: string }) {
  const tile = "rounded-lg border border-line bg-canvas px-3 py-2";
  return (
    <>
    <p className="mb-1 text-xs text-muted">Account summary for {period}: Actual Bonus (given) vs Quota Bonus (earned by the formula), both at master prices.</p>
    <dl className="mb-3 grid grid-cols-2 gap-2 text-xs lg:grid-cols-4" aria-label="Account quota summary">
      <div className={tile} title={`${net.entitledValue.toLocaleString()} THB at master prices, optional items excluded`}>
        <dt className="text-muted" title={`Bonus the formula says the account has earned from the reagents sold in ${period}, valued at master prices`}>Quota Bonus</dt>
        <dd className="text-sm tabular-nums text-ink">{compactThb(net.entitledValue)} THB</dd>
      </div>
      <div className={tile} title={`${net.bonusValue.toLocaleString()} THB`}>
        <dt className="text-muted" title={`Bonus the reps actually gave in ${period} (FOC not included), valued at master prices`}>Actual Bonus</dt>
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
    </>
  );
}

/** Annual-quota Products: how many items have a yearly quota, how many are over it and by how many units. */
function AnnualStrip({ yq }: { yq: Record<string, YearQuotaRow> }) {
  const s = annualYearSummary(yq);
  const tile = "rounded-lg border border-line bg-canvas px-3 py-2";
  return (
    <dl className="mb-3 grid grid-cols-3 gap-2 text-xs" aria-label="Account quota summary">
      <div className={tile}><dt className="text-muted">Items with a quota</dt><dd className="text-sm tabular-nums text-ink">{s.itemsWithQuota}</dd></div>
      <div className={tile}>
        <dt className="text-muted">Over Quota</dt>
        <dd className="flex items-center gap-1.5 text-sm tabular-nums text-ink">{s.itemsOver}{s.itemsOver > 0 && <Badge tone="negative">Over Quota</Badge>}</dd>
      </div>
      <div className={tile}><dt className="text-muted">Excess units</dt><dd className="text-sm tabular-nums text-ink">{s.excessUnits.toLocaleString()}</dd></div>
    </dl>
  );
}
