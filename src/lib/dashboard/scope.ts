import { prisma } from "@/lib/prisma";
import { focAccountRows, type FocActualFact } from "./focActualsAggregate";
import { computeAccountAlerts, type AccountAlert } from "./accountAlerts";
import { inPeriodScope, parseItemGroups, type DashboardParams } from "./filters";
import { inItemGroups } from "./itemGroups";

/** Every column any Dashboard view or export reads. */
const SCOPE_SELECT = {
  year: true, month: true, team: true, rep: true, category: true, accountName: true,
  materialNo: true, productName: true, revenue: true, focCost: true, bonusCost: true,
  soldQty: true, revenueQty: true, focQty: true, bonusQty: true,
} as const;

export type ScopeFact = FocActualFact & { rep: string | null; category: string | null; revenueQty: number; focQty: number; bonusQty: number };

export type AccountScopeRow = ReturnType<typeof focAccountRows>[number] & {
  /** Item-level Over Quota (information). */
  overCount: number;
  overCost: number;
  /** Account-level verdict from the net rule; null when alerts were not computed. */
  net: AccountAlert["net"] | null;
  flagged: boolean;
};

/**
 * Applies the URL filters to the imported actuals. The page's three views and
 * the all-accounts CSV all go through here, so "the accounts currently shown"
 * means exactly the same thing in each. Over-quota is cumulative over each
 * account's whole history (same as the drilldown), so it is scored from every
 * import row, not the period filter.
 */
export async function loadDashboardScope(p: DashboardParams, opts: { alerts: boolean } = { alerts: true }) {
  const allActuals = (await prisma.focActual.findMany({ select: SCOPE_SELECT })) as ScopeFact[];
  const years = [...new Set(allActuals.map((f) => f.year))].sort((a, b) => b - a);
  const itemGroups = parseItemGroups(p.ig);
  const periodRows = allActuals.filter((f) => inPeriodScope(f, p) && inItemGroups(f.category, itemGroups));
  // Every Item Group present, for the filter's choices (null = imported before groups were stored).
  const itemGroupChoices = [...new Set(allActuals.map((f) => f.category).filter((c): c is string => c !== null))].sort();

  const allAccountRows = focAccountRows(periodRows);
  const accountNames = allAccountRows.map((a) => a.accountName).sort((a, b) => a.localeCompare(b));
  const needAlerts = opts.alerts || p.sig === "1";
  // Quota covers the formula's own Item Groups, whatever the view's Item Group filter says.
  const alerts: Map<string, AccountAlert> = needAlerts ? await computeAccountAlerts(allActuals.filter((f) => inItemGroups(f.category, null))) : new Map();

  let accountRows: AccountScopeRow[] = allAccountRows
    .filter(
      (a) =>
        (!p.q || a.accountName === p.q) &&
        (p.hi !== "1" || a.ratio > 0.2) &&
        (p.xna !== "1" || Number.isFinite(a.ratio)) &&
        (p.sig !== "1" || alerts.get(a.accountName)?.flagged === true),
    )
    .map((a) => ({
      ...a,
      overCount: alerts.get(a.accountName)?.count ?? 0,
      overCost: alerts.get(a.accountName)?.cost ?? 0,
      net: alerts.get(a.accountName)?.net ?? null,
      flagged: alerts.get(a.accountName)?.flagged === true,
    }));
  if (p.top === "1") accountRows = [...accountRows].sort((a, b) => b.totalCost - a.totalCost).slice(0, 10);

  const inScope = new Set(accountRows.map((a) => a.accountName));
  const facts = periodRows.filter((f) => inScope.has(f.accountName));
  return { allActuals, years, periodRows, accountNames, accountRows, facts, alerts, itemGroupChoices, itemGroups };
}
