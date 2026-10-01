import { prisma } from "@/lib/prisma";
import { loadEngineData, loadOwnTpbByAccount } from "@/lib/calc/service";
import { resolveAccountTpb } from "@/lib/calc/accountTpb";
import { accountNumberFromName, buildGot, reagentBillMonths, recentFromPeriod, type ActualForGot } from "./accountGiven";
import { computeEntitlement, type NetSummary } from "./entitlement";
import { loadAlertThresholds } from "./alertSettings";

/** One significantly over-quota product, as the Alerts view lists it. */
export type AlertItem = {
  materialNo: string;
  productName: string;
  expected: number;
  free: number;
  over: number;
  excessValue: number;
  ratio: number | null;
};

export type AccountAlert = {
  /** Item-level Over Quota: information, not an alert (reps legitimately swap one item for another). */
  count: number;
  /** Items over quota but within +1 per reagent bill (yellow). */
  warningCount: number;
  cost: number;
  items: AlertItem[];
  /** Account-level verdict: Bonus given vs the whole entitlement, and stand-alone FOC. */
  net: NetSummary;
  /** The alert: over quota on the net rule, or stand-alone FOC past its threshold. */
  flagged: boolean;
};

/**
 * Cumulative over-quota alerts for every account in the import, scored the same
 * way as the per-account drilldown (full history, the account's own TPB where
 * it has one, the admin's alert thresholds), so the list and the drilldown can
 * never disagree. Keyed by the FocActual ship-to name.
 */
export async function computeAccountAlerts(
  actuals: (ActualForGot & { accountName: string })[],
): Promise<Map<string, AccountAlert>> {
  const [{ assays, items, tpbInput: nationalTpb }, additionalItems, alert, own, accounts] = await Promise.all([
    loadEngineData(),
    prisma.additionalFocItem.findMany({ where: { active: true }, select: { materialNo: true } }),
    loadAlertThresholds(),
    loadOwnTpbByAccount(),
    prisma.account.findMany({ select: { id: true, accountNumber: true } }),
  ]);
  const additionalMats = new Set(additionalItems.map((i) => i.materialNo));
  const idByNumber = new Map(accounts.map((a) => [a.accountNumber, a.id]));

  // Stand-alone FOC is judged over the latest 12 months in the data; the quota stays cumulative.
  let latestIdx = -1;
  for (const r of actuals) if (r.year !== undefined && r.month !== undefined) latestIdx = Math.max(latestIdx, r.year * 12 + r.month);
  const recentFrom = latestIdx >= 0 ? recentFromPeriod({ year: Math.floor((latestIdx - 1) / 12), month: ((latestIdx - 1) % 12) + 1 }) : undefined;

  const byName = new Map<string, ActualForGot[]>();
  for (const r of actuals) {
    const list = byName.get(r.accountName) ?? [];
    list.push(r);
    byName.set(r.accountName, list);
  }

  const out = new Map<string, AccountAlert>();
  for (const [name, rows] of byName) {
    const no = accountNumberFromName(name);
    const ownTpb = no ? own.ownByAccount.get(idByNumber.get(no) ?? "") : undefined;
    const tpbInput = ownTpb ? resolveAccountTpb(nationalTpb, ownTpb, own.settings).input : nationalTpb;
    const computed = computeEntitlement(buildGot(rows, recentFrom), assays, items, additionalMats, tpbInput, alert, reagentBillMonths(rows));
    const { totals } = computed;
    const alertItems = computed.rows
      .filter((r) => r.significant)
      .map((r) => ({ materialNo: r.materialNo, productName: r.productName, expected: r.expected, free: r.free, over: r.over, excessValue: r.excessValue, ratio: r.ratio }))
      .sort((a, b) => b.excessValue - a.excessValue);
    out.set(name, {
      count: totals.significantCount, warningCount: totals.warningCount, cost: totals.significantCost, items: alertItems,
      net: computed.net, flagged: computed.net.over || computed.net.focFlagged,
    });
  }
  return out;
}
