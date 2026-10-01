import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { NetSummary } from "@/lib/dashboard/entitlement";
import { annualQuotaLine, quotaSortValue, quotaSummary } from "@/lib/dashboard/accountQuota";
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
  overCount: number; // items over quota beyond the alert thresholds (cumulative, information only)
  overCost: number; // their excess value
  net: NetSummary | null; // account-level verdict (Bonus given vs the whole entitlement), null = none
  flagged: boolean; // net over quota, or stand-alone FOC past its threshold (annual Products: an item over its yearly quota)
  annual: { itemsWithQuota: number; itemsOver: number; excessUnits: number } | null; // annual-quota Products only
  monthlyCost: number[]; // FOC + Bonus cost, Jan..Dec of the selected year
};

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
    <span className={cn("inline-flex flex-col gap-0.5", cls)} title={`Bonus given ${money(row.net!.bonusValue)} THB vs quota ${money(row.net!.entitledValue)} THB, cumulative`}>
      {q.over ? <Badge tone="negative">Over Quota</Badge> : <span className="text-xs text-muted">Within</span>}
      <span className="text-[11px] tabular-nums text-muted">{q.line} · {q.pct}</span>
      {q.items && <span className="text-[11px] text-muted">{q.items}</span>}
    </span>
  );
}

/** Stand-alone FOC cost (no reagent sold with it), with an amber Flag past the admin threshold. */
export function FocOnlyCell({ row }: { row: AccountRow }) {
  if (!row.net) return <span className="text-xs text-muted">—</span>;
  const { focStandaloneCost, focFlagged } = row.net;
  if (focStandaloneCost <= 0) return <span className="text-xs text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-2" title="Stand-alone FOC: given with no reagent sold alongside it">
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
  { key: "revenue", label: "Revenue", align: "right", sortValue: (r) => r.revenue, cell: (r) => <span className="tabular-nums">{money(r.revenue)}</span> },
  { key: "totalCost", label: "FOC+Bonus cost", align: "right", sortValue: (r) => r.totalCost, cell: (r) => <span className="tabular-nums">{money(r.totalCost)}</span> },
  { key: "ratio", label: "Cost/revenue", align: "right", sortValue: (r) => r.ratio, cell: (r) => <RatioBadge ratio={r.ratio} /> },
  { key: "quota", label: "Quota", align: "right", sortValue: quotaSortValue, hint: "Annual-quota Products: items given more than their yearly quota. Otherwise Bonus given (at master prices) against the whole entitlement; Over Quota past the Settings thresholds. Item counts are information only.", cell: (r) => <QuotaCell row={r} /> },
  { key: "focOnly", label: "FOC only", align: "right", sortValue: (r) => r.net?.focStandaloneCost ?? 0, hint: "Stand-alone FOC cost (THB): given with no reagent sold alongside it, carries VAT", cell: (r) => <FocOnlyCell row={r} /> },
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
