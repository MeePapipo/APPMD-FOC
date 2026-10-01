import type { AccountAlert, AlertItem } from "./accountAlerts";
import type { AnnualItem, AnnualSummary } from "./annualQuota";

export type OverQuotaAccount = {
  accountName: string;
  team: string | null;
  entitledValue: number;
  bonusValue: number;
  excessValue: number;
  overPct: number | null;
  /** Up to three items driving the excess, biggest first (information). */
  topItems: AlertItem[];
};

export type StandaloneFocAccount = { accountName: string; team: string | null; cost: number };

type Scored = { accountName: string };

/** Accounts over quota on the net rule, biggest excess first. */
export function overQuotaAccounts(rows: Scored[], alerts: Map<string, AccountAlert>, teamOf: (name: string) => string | null): OverQuotaAccount[] {
  const out: OverQuotaAccount[] = [];
  for (const r of rows) {
    const a = alerts.get(r.accountName);
    if (!a?.net.over) continue;
    out.push({
      accountName: r.accountName,
      team: teamOf(r.accountName),
      entitledValue: a.net.entitledValue,
      bonusValue: a.net.bonusValue,
      excessValue: a.net.excessValue,
      overPct: a.net.overPct,
      topItems: [...a.items].sort((x, y) => y.excessValue - x.excessValue).slice(0, 3),
    });
  }
  return out.sort((a, b) => b.excessValue - a.excessValue || a.accountName.localeCompare(b.accountName));
}

/** Accounts whose stand-alone FOC is past its threshold, biggest cost first. */
export function standaloneFocAccounts(rows: Scored[], alerts: Map<string, AccountAlert>, teamOf: (name: string) => string | null): StandaloneFocAccount[] {
  const out: StandaloneFocAccount[] = [];
  for (const r of rows) {
    const a = alerts.get(r.accountName);
    if (a?.net.focFlagged) out.push({ accountName: r.accountName, team: teamOf(r.accountName), cost: a.net.focStandaloneCost });
  }
  return out.sort((a, b) => b.cost - a.cost || a.accountName.localeCompare(b.accountName));
}

export type AnnualOverAccount = {
  accountName: string;
  team: string | null;
  itemsWithQuota: number;
  itemsOver: number;
  excessUnits: number;
  /** Up to three items furthest over their annual quota. */
  topItems: AnnualItem[];
};

/** Annual-quota Products: accounts with items over their yearly quota, most excess units first. */
export function annualOverAccounts(
  rows: Scored[],
  annual: Map<string, AnnualSummary & { items: AnnualItem[] }>,
  teamOf: (name: string) => string | null,
): AnnualOverAccount[] {
  const out: AnnualOverAccount[] = [];
  for (const r of rows) {
    const a = annual.get(r.accountName);
    if (!a || a.itemsOver === 0) continue;
    out.push({
      accountName: r.accountName,
      team: teamOf(r.accountName),
      itemsWithQuota: a.itemsWithQuota,
      itemsOver: a.itemsOver,
      excessUnits: a.excessUnits,
      topItems: a.items.filter((i) => i.over).sort((x, y) => y.diff - x.diff).slice(0, 3),
    });
  }
  return out.sort((a, b) => b.excessUnits - a.excessUnits || b.itemsOver - a.itemsOver || a.accountName.localeCompare(b.accountName));
}
