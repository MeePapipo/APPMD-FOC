import type { NetSummary } from "./entitlement";

/** The bits of an Accounts-list row the Quota and FOC-only columns read. */
export type QuotaRowLike = {
  net: NetSummary | null;
  flagged: boolean;
  overCount: number;
  warnCount?: number;
  /** Annual-quota Products: items with a quota, how many are over it, units above (null = formula Product). */
  annual?: { itemsWithQuota: number; itemsOver: number; excessUnits: number } | null;
};

/** 1234567 -> "1.2M", 48200 -> "48.2K", 900 -> "900" (THB, for small print). */
export function compactThb(n: number): string {
  const v = Math.round(n);
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (a >= 10_000) return `${(v / 1_000).toFixed(a >= 100_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return v.toLocaleString("en-US");
}

/** "+54.3%" / "-12%"; "no entitlement" when the account has none to divide by. */
export const formatOverPct = (pct: number | null): string =>
  pct === null ? "no entitlement" : `${pct > 0 ? "+" : ""}${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;

/** Items over quota, split by how far: red = more than +1 per reagent bill, yellow = within it. */
function itemsLine(red: number, yellow: number): string | null {
  if (red + yellow === 0) return null;
  const parts = [red > 0 && `${red} red`, yellow > 0 && `${yellow} yellow`].filter(Boolean);
  return `Items over quota: ${parts.join(" · ")}`;
}

/** What the Quota column shows: null when the account has no entitlement verdict at all. */
export function quotaSummary(r: QuotaRowLike): { over: boolean; line: string; pct: string; items: string | null } | null {
  if (!r.net) return null;
  const { net } = r;
  return {
    over: net.over,
    line: `Actual Bonus ${compactThb(net.bonusValue)} vs Quota Bonus ${compactThb(net.entitledValue)}`,
    pct: formatOverPct(net.overPct),
    items: itemsLine(r.overCount, r.warnCount ?? 0),
  };
}

/**
 * Sort key of the Quota column (descending = the default list order): flagged
 * accounts first by net excess value, then the rest by excess, and accounts
 * without a verdict last. Ties fall back to total cost in the table's sort.
 */
export function quotaSortValue(r: Pick<QuotaRowLike, "net" | "flagged" | "annual">): number {
  if (r.annual) return annualSortValue(r.annual);
  if (!r.net) return -1e15;
  return (r.flagged ? 1e12 : 0) + r.net.excessValue;
}

type AnnualCounts = { itemsWithQuota: number; itemsOver: number; excessUnits: number };

/** Annual-quota Products: most items over quota first, then the units above. */
export const annualSortValue = (a: AnnualCounts): number => a.itemsOver * 1e12 + a.excessUnits;

/** "2 of 14 items over quota"; null when the account has no item with a quota. */
export function annualQuotaLine(a: AnnualCounts): string | null {
  return a.itemsWithQuota > 0 ? `${a.itemsOver} of ${a.itemsWithQuota} item${a.itemsWithQuota === 1 ? "" : "s"} over quota` : null;
}

/** The drawer's strip for an annual-quota Product, from the matrix API's `yearQuota` (items with a quota only). */
export function annualYearSummary(yq: Record<string, { quota: number; free: number; significant: boolean }>): AnnualCounts {
  let itemsWithQuota = 0, itemsOver = 0, excessUnits = 0;
  for (const v of Object.values(yq)) {
    if (v.quota <= 0) continue;
    itemsWithQuota++;
    if (v.significant) {
      itemsOver++;
      excessUnits += Math.max(0, v.free - v.quota);
    }
  }
  return { itemsWithQuota, itemsOver, excessUnits };
}

/** Title-case a Tableau Product name: "MOLECULAR LAB" -> "Molecular Lab". */
export const productLabel = (p: string): string => p.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
