import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { NetSummary } from "@/lib/dashboard/entitlement";
import { annualQuotaLine, quotaSortValue, quotaSummary } from "@/lib/dashboard/accountQuota";
import { DeltaChip } from "./DeltaChip";
import { RatioBadge } from "./RatioBadge";

/**
 * The Accounts list's row type and column definitions, in one place: a new
 * per-account field is one property on `AccountRow` plus one entry in
 * `ACCOUNT_COLUMNS` (the table header, the sort and the cell all come from it).
 * The phone cards and the drawer KPIs read the same row.
 */
export type AccountRow = {
  accountName: string;
  revenue: number;
  focCost: number;
  bonusCost: number;
  totalCost: number;
  ratio: number;
  warnCount?: number; // items over quota but within +1 per bill (yellow)
  overCount: number; // items over quota beyond the alert thresholds (cumulative, information only)
  overCost: number; // their excess value
  net: NetSummary | null; // account-level verdict (Bonus given vs the whole entitlement), null = none
  flagged: boolean; // net over quota, or stand-alone FOC past its threshold (annual Products: an item over its yearly quota)
  annual: { itemsWithQuota: number; itemsOver: number; excessUnits: number } | null; // annual-quota Products only
  monthlyCost: number[]; // FOC + Bonus cost, Jan..Dec of the selected year
  /** The same months of the previous year, for the change chips; absent when there is nothing to compare with. */
  prev?: { revenue: number; totalCost: number; label: string } | null;
};

/** A figure with its change against last year in small print underneath. */
function WithDelta({ value, delta, align = "right" }: { value: ReactNode; delta: ReactNode; align?: "left" | "right" }) {
  return (
    <span className={cn("inline-flex flex-col gap-0.5", align === "right" ? "items-end" : "items-start")}>
      {value}
      {delta}
    </span>
  );
}

/** Revenue / cost chips for a row; null when the row has no earlier year to compare with. */
export function revenueDelta(r: AccountRow, compact = true) {
  return r.prev ? <DeltaChip cur={r.revenue} prev={r.prev.revenue} upIs="good" label={r.prev.label} compact={compact} /> : null;
}
export function costDelta(r: AccountRow, compact = true) {
  return r.prev ? <DeltaChip cur={r.totalCost} prev={r.prev.totalCost} upIs="bad" label={r.prev.label} compact={compact} /> : null;
}
/** Cost % of revenue, moved in percentage points; skipped when either year has no revenue to divide by. */
export function ratioDelta(r: AccountRow, compact = true) {
  if (!r.prev || r.prev.revenue <= 0 || !Number.isFinite(r.ratio)) return null;
  return <DeltaChip cur={r.ratio * 100} prev={(r.prev.totalCost / r.prev.revenue) * 100} mode="pp" upIs="bad" label={r.prev.label} compact={compact} />;
}

export const money = (n: number) => Math.round(n).toLocaleString();

/** "PICHIT HOSPITAL  (0052027798)" -> name and number. */
export function splitName(full: string): { label: string; number: string | null } {
  const m = full.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  return m ? { label: m[1], number: m[2] } : { label: full, number: null };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Twelve tiny bars, scaled to the account's own busiest month. */
export function Sparkline({ values, year }: { values: number[]; year: number }) {
  const max = Math.max(0, ...values);
  const peak = max > 0 ? values.indexOf(max) : -1;
  return (
    <svg
      viewBox="0 0 48 16"
      className="h-5 w-16"
      role="img"
      aria-label={peak >= 0 ? `Monthly cost ${year}, peak ${MONTHS[peak]} ${money(max)} THB` : `No cost in ${year}`}
    >
      {values.map((v, i) => {
        const h = max > 0 && v > 0 ? Math.max(1, (v / max) * 16) : 0;
        return (
          <rect key={i} x={i * 4} y={16 - h} width={3} height={h} rx={0.5} fill="var(--brand)" opacity={i === peak ? 1 : 0.55}>
            <title>{`${MONTHS[i]} ${year}: ${money(v)} THB`}</title>
          </rect>
        );
      })}
      <line x1={0} y1={15.5} x2={48} y2={15.5} stroke="var(--line-strong)" strokeWidth={0.5} />
    </svg>
  );
}

/** Account-level Quota status: Over Quota / Within, the Bonus-vs-Quota line, the % and the item-level count (information). */
export function QuotaCell({ row, align = "right" }: { row: AccountRow; align?: "left" | "right" }) {
  if (row.annual) {
    const line = annualQuotaLine(row.annual);
    if (!line) return <span className="text-xs text-muted">—</span>;
    const cls = align === "right" ? "items-end text-right" : "items-start text-left";
    return (
      <span className={cn("inline-flex flex-col gap-0.5", cls)} title={`Items given more than their yearly quota set in Tableau; ${row.annual.excessUnits.toLocaleString()} units above`}>
        {row.annual.itemsOver > 0 ? <Badge tone="negative">Over Quota</Badge> : <span className="text-xs text-muted">Within</span>}
        <span className="text-[11px] tabular-nums text-muted">{line}</span>
      </span>
    );
  }
  const q = quotaSummary(row);
  if (!q) return <span className="text-xs text-muted">—</span>;
  const cls = align === "right" ? "items-end text-right" : "items-start text-left";
  return (
    <span className={cn("inline-flex flex-col gap-0.5", cls)} title={`Account verdict: Actual Bonus ${money(row.net!.bonusValue)} THB vs Quota Bonus ${money(row.net!.entitledValue)} THB (selected year; every loaded month when Year is All years). Over Quota only when the excess is both above the % and above the THB amount set in Settings.`}>
      {q.over ? <Badge tone="negative">Over Quota</Badge> : <span className="text-xs text-muted">Within</span>}
      <span className="text-[11px] tabular-nums text-muted">
        {q.line} · <span className={cn(q.over && "font-semibold text-negative")}>{q.pct}</span>
      </span>
    </span>
  );
}

/** Stand-alone FOC cost (no reagent sold with it), with an amber Flag past the admin threshold. */
export function FocOnlyCell({ row }: { row: AccountRow }) {
  if (!row.net) return <span className="text-xs text-muted">—</span>;
  const { focStandaloneCost, focFlagged } = row.net;
  if (focStandaloneCost <= 0) return <span className="text-xs text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-2" title="Stand-alone FOC: given with no reagent sold alongside it (includes main reagent given free, e.g. to compensate for a breakdown)">
      <span className="tabular-nums">{money(focStandaloneCost)}</span>
      {focFlagged && <Badge tone="warning">Flag</Badge>}
    </span>
  );
}

export type AccountColumn = {
  key: string;
  label: string;
  align?: "right";
  /** Value the header sorts by; omit for a column that is not sortable. */
  sortValue?: (r: AccountRow) => number | string;
  cell: (r: AccountRow, ctx: { year: number }) => ReactNode;
  /** Shown as a tooltip on the header. */
  hint?: string;
};

// The Account column (name + number, the row's focus target) is rendered by
// the table itself; these are the columns after it.
export const ACCOUNT_COLUMNS: AccountColumn[] = [
  { key: "revenue", label: "Revenue", align: "right", sortValue: (r) => r.revenue, hint: "Small arrow: change against the same months of the previous year (hover for that figure)", cell: (r) => <WithDelta value={<span className="tabular-nums">{money(r.revenue)}</span>} delta={revenueDelta(r)} /> },
  { key: "totalCost", label: "FOC+Bonus cost", align: "right", sortValue: (r) => r.totalCost, hint: "Small arrow: change against the same months of the previous year; red = more cost, green = less", cell: (r) => <WithDelta value={<span className="tabular-nums">{money(r.totalCost)}</span>} delta={costDelta(r)} /> },
  { key: "ratio", label: "Cost/revenue", align: "right", sortValue: (r) => r.ratio, hint: "Small arrow: move in percentage points against the same months of the previous year", cell: (r) => <WithDelta value={<RatioBadge ratio={r.ratio} />} delta={ratioDelta(r)} /> },
  { key: "quota", label: "Quota", align: "right", sortValue: quotaSortValue, hint: "Annual-quota Products: items given more than their yearly quota. Otherwise the whole account: Actual Bonus (what reps gave, at master prices) vs Quota Bonus (what the formula earns from the reagents sold); the percentage is how far Actual Bonus is above (+) or below (−) Quota Bonus. Over Quota only past the % and THB set in Settings. Item-level detail is in the account drawer.", cell: (r) => <QuotaCell row={r} /> },
  { key: "focOnly", label: "FOC only", align: "right", sortValue: (r) => r.net?.focStandaloneCost ?? 0, hint: "Stand-alone FOC cost (THB): given with no reagent sold alongside it, carries VAT. Includes main reagent given free (e.g. compensation for a breakdown)", cell: (r) => <FocOnlyCell row={r} /> },
  { key: "trend", label: "Monthly cost", hint: "FOC+Bonus cost, Jan to Dec of the selected year", cell: (r, { year }) => <Sparkline values={r.monthlyCost} year={year} /> },
];

export const ACCOUNT_NAME_COLUMN: Pick<AccountColumn, "key" | "label" | "align" | "hint" | "sortValue"> = {
  key: "accountName",
  label: "Account",
  sortValue: (r) => r.accountName.toLowerCase(),
};

/** NaN-safe compare (Infinity - Infinity is NaN, and N/A ratios are Infinity). */
export function compareValues(a: number | string, b: number | string): number {
  if (typeof a === "string" || typeof b === "string") return String(a).localeCompare(String(b));
  return a === b ? 0 : a < b ? -1 : 1;
}

/** The columns for a Product: stand-alone FOC relies on the formula's net figures, so annual-quota Products drop it. */
export const columnsFor = (annual: boolean): AccountColumn[] => (annual ? ACCOUNT_COLUMNS.filter((c) => c.key !== "focOnly") : ACCOUNT_COLUMNS);
