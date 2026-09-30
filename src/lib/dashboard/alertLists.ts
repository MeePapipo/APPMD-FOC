import type { AccountAlert, AlertItem } from "./accountAlerts";

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
