import type { NetSummary } from "./entitlement";

/** The bits of an Accounts-list row the Quota and FOC-only columns read. */
export type QuotaRowLike = { net: NetSummary | null; flagged: boolean; overCount: number };

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

/** What the Quota column shows: null when the account has no entitlement verdict at all. */
export function quotaSummary(r: QuotaRowLike): { over: boolean; line: string; pct: string; items: string | null } | null {
  if (!r.net) return null;
  const { net } = r;
  return {
    over: net.over,
    line: `Bonus ${compactThb(net.bonusValue)} / Entitled ${compactThb(net.entitledValue)}`,
    pct: formatOverPct(net.overPct),
    items: r.overCount > 0 ? `${r.overCount} item${r.overCount === 1 ? "" : "s"} Over Quota` : null,
  };
}

/**
 * Sort key of the Quota column (descending = the default list order): flagged
 * accounts first by net excess value, then the rest by excess, and accounts
 * without a verdict last. Ties fall back to total cost in the table's sort.
 */
export function quotaSortValue(r: Pick<QuotaRowLike, "net" | "flagged">): number {
  if (!r.net) return -1e15;
  return (r.flagged ? 1e12 : 0) + r.net.excessValue;
}
