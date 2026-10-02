import { prisma } from "@/lib/prisma";
import { timed } from "@/lib/perf";
import { focAccountRows, type FocActualFact } from "./focActualsAggregate";
import { computeAccountAlerts, type AccountAlert } from "./accountAlerts";
import { yoyWindow } from "./yoy";
import { inPeriodScope, matrixYear, parseItemGroups, resolveYear, type DashboardParams } from "./filters";
import { inItemGroups } from "./itemGroups";
import { LEGACY_PRODUCT, loadProductSettings } from "./importSettings";
import { annualSummaries, type AnnualSummary } from "./annualQuota";
import { loadAlertThresholds } from "./alertSettings";

/** Every column any Dashboard view or export reads. */
const SCOPE_SELECT = {
  year: true, month: true, team: true, rep: true, category: true, accountName: true,
  materialNo: true, productName: true, revenue: true, focCost: true, bonusCost: true,
  soldQty: true, revenueQty: true, focQty: true, bonusQty: true,
  product: true, annualQuota: true,
} as const;

export type ScopeFact = FocActualFact & {
  rep: string | null; category: string | null; revenueQty: number; focQty: number; bonusQty: number;
  product: string | null; annualQuota: number | null;
};

export type AccountScopeRow = ReturnType<typeof focAccountRows>[number] & {
  /** Item-level Over Quota (information). */
  overCount: number;
  /** Items over quota but within +1 per reagent bill. */
  warnCount: number;
  overCost: number;
  /** The same months of the previous year (null when there is nothing to compare with). */
  prev?: { revenue: number; totalCost: number; label: string } | null;
  /** Account-level verdict from the net rule; null when alerts were not computed. */
  net: AccountAlert["net"] | null;
  /** Annual-quota Products: this year's items with a quota and how many are over it; null for formula Products. */
  annual: AnnualSummary | null;
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
  const settings = await loadProductSettings();
  // The Product filter: absent = the first formula Product (Molecular Lab). Rows stored before the
  // Product was kept have none and belong to Molecular Lab.
  const product = p.pl3 || settings.formula[0] || LEGACY_PRODUCT;
  const quotaMode: "formula" | "annual" = settings.formula.includes(product) ? "formula" : "annual";
  const productWhere = product === LEGACY_PRODUCT ? { OR: [{ product }, { product: null }] } : { product };
  const [allActuals, productGroups] = await timed("dashboard: load actuals", () =>
    Promise.all([
      prisma.focActual.findMany({ where: productWhere, select: SCOPE_SELECT }) as Promise<ScopeFact[]>,
      prisma.focActual.groupBy({ by: ["product"] }),
    ]),
  );
  const productChoices = [...new Set(productGroups.map((g) => g.product ?? LEGACY_PRODUCT))].sort();
  const years = [...new Set(allActuals.map((f) => f.year))].sort((a, b) => b - a);
  const year = resolveYear(p, years);
  // Every Team present for this Product, for the Team chips (the raw TLevel3 value). A Team picked under another
  // Product (the filter survives switching Product in the URL) that has no rows here is ignored, not shown as 0.
  const teamChoices = [...new Set(allActuals.map((f) => f.team).filter((t): t is string => !!t))];
  p = { ...p, year: year || undefined, ateam: p.ateam && teamChoices.includes(p.ateam) ? p.ateam : undefined };
  const itemGroups = parseItemGroups(p.ig);
  // Molecular Lab's default is the four Item Groups the formula knows; the annual-quota Products
  // show every group until one is picked.
  const groupOk = (f: ScopeFact) =>
    quotaMode === "formula" ? inItemGroups(f.category, itemGroups) : !itemGroups || (f.category !== null && itemGroups.includes(f.category));
  const periodRows = allActuals.filter((f) => inPeriodScope(f, p) && groupOk(f));
  // Every Item Group present, for the filter's choices (null = imported before groups were stored).
  const itemGroupChoices = [...new Set(allActuals.map((f) => f.category).filter((c): c is string => c !== null))].sort();

  const allAccountRows = focAccountRows(periodRows);
  const accountNames = allAccountRows.map((a) => a.accountName).sort((a, b) => a.localeCompare(b));
  const needAlerts = opts.alerts || p.sig === "1";
  const quotaYear = matrixYear(p, years);
  // Formula Products: the net rule over the formula's own Item Groups, whatever the filter says, within the
  // selected year (all loaded months when the Year filter is All years).
  const alerts: Map<string, AccountAlert> =
    needAlerts && quotaMode === "formula" ? await timed("dashboard: account alerts", () => computeAccountAlerts(allActuals.filter((f) => inItemGroups(f.category, null) && (!year || f.year === Number(year))))) : new Map();
  // Annual-quota Products: items over the yearly quota in the shown year.
  const annualAlerts =
    needAlerts && quotaMode === "annual"
      ? annualSummaries(
          allActuals.filter(groupOk).map((f) => ({ ...f, annualQuota: f.annualQuota })),
          quotaYear,
          (await loadAlertThresholds()).minOverUnits,
        )
      : new Map<string, AnnualSummary & { items: import("./annualQuota").AnnualItem[] }>();

  const isFlagged = (name: string) => (quotaMode === "formula" ? alerts.get(name)?.flagged === true : (annualAlerts.get(name)?.itemsOver ?? 0) > 0);
  let accountRows: AccountScopeRow[] = allAccountRows
    .filter(
      (a) =>
        (!p.q || a.accountName === p.q) &&
        (p.hi !== "1" || a.ratio > 0.2) &&
        (p.xna !== "1" || Number.isFinite(a.ratio)) &&
        (p.sig !== "1" || isFlagged(a.accountName)),
    )
    .map((a) => ({
      ...a,
      overCount: alerts.get(a.accountName)?.count ?? 0,
      warnCount: alerts.get(a.accountName)?.warningCount ?? 0,
      overCost: alerts.get(a.accountName)?.cost ?? 0,
      net: alerts.get(a.accountName)?.net ?? null,
      annual: quotaMode === "annual" ? (annualAlerts.get(a.accountName) ?? { itemsWithQuota: 0, itemsOver: 0, excessUnits: 0 }) : null,
      flagged: isFlagged(a.accountName),
    }));
  if (p.top === "1") accountRows = [...accountRows].sort((a, b) => b.totalCost - a.totalCost).slice(0, 10);

  const inScope = new Set(accountRows.map((a) => a.accountName));
  const facts = periodRows.filter((f) => inScope.has(f.accountName));

  // Same months of the year before, for the year-on-year chips: same Product, team and Item Groups, and the
  // accounts currently shown.
  const compare = yoyWindow(p, year ? Number(year) : null, allActuals);
  const priorFacts = compare
    ? allActuals.filter(
        (f) =>
          f.year === compare.prevYear && f.month >= compare.from && f.month <= compare.to &&
          (!p.ateam || (f.team ?? "Unassigned") === p.ateam) && groupOk(f) && inScope.has(f.accountName),
      )
    : [];
  if (compare) {
    const prior = new Map(focAccountRows(priorFacts).map((a) => [a.accountName, a]));
    accountRows = accountRows.map((a) => ({ ...a, prev: { revenue: prior.get(a.accountName)?.revenue ?? 0, totalCost: prior.get(a.accountName)?.totalCost ?? 0, label: compare.label } }));
  }
  return { allActuals, years, periodRows, accountNames, accountRows, facts, alerts, annualAlerts, itemGroupChoices, teamChoices, itemGroups, product, productChoices, quotaMode, quotaYear, year, compare, priorFacts };
}
