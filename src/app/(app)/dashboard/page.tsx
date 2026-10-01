import { requireUser } from "@/lib/session";
import {
  focCostComposition,
  focMonthlyTrend,
  focTeamBreakdown,
  focTopProducts,
} from "@/lib/dashboard/focActualsAggregate";
import { ActualsFilters } from "@/components/dashboard/ActualsFilters";
import { ExcludeNaToggle } from "@/components/dashboard/ExcludeNaToggle";
import { OverQuotaToggle } from "@/components/dashboard/OverQuotaToggle";
import { loadDashboardScope } from "@/lib/dashboard/scope";
import { ALL_YEARS, VIEWS, inPeriodScope, matrixYear, type DashboardParams, type DashboardView } from "@/lib/dashboard/filters";
import { financeByMonth, withRatio } from "@/lib/dashboard/focFinance";
import { LEGACY_PRODUCT, loadProductSettings } from "@/lib/dashboard/importSettings";
import { loadDataThrough } from "@/lib/dashboard/dataThrough";
import { periodLabel } from "@/lib/dashboard/period";
import { FocActualsImportControl } from "@/components/dashboard/FocActualsImportControl";
import { monthlyCostByAccount } from "@/lib/dashboard/accountSeries";
import { AccountsView, type AccountRow } from "@/components/dashboard/AccountsView";
import { AlertsView } from "@/components/dashboard/AlertsView";
import { annualOverAccounts, overQuotaAccounts, standaloneFocAccounts } from "@/lib/dashboard/alertLists";
import { DashboardViewTabs } from "@/components/dashboard/DashboardViewTabs";
import { FocActualsAccountTable } from "@/components/dashboard/FocActualsAccountTable";
import { DeltaChip } from "@/components/dashboard/DeltaChip";
import { StatTile } from "@/components/dashboard/StatTile";
import { BarChart } from "@/components/dashboard/BarChart";
import { DonutChart } from "@/components/dashboard/DonutChart";
import { RatioBadge } from "@/components/dashboard/RatioBadge";
import { productLabel } from "@/lib/dashboard/accountQuota";
import { Card } from "@/components/ui";

const REVENUE_COLOR = "var(--chart-revenue)";
const FOC_VALUE_COLOR = "var(--chart-foc)";
const money = (n: number) => `${Math.round(n).toLocaleString()} THB`;
const revFocSeries = [
  { key: "revenue", label: "Revenue", color: REVENUE_COLOR },
  { key: "focValue", label: "FOC value", color: FOC_VALUE_COLOR },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<PageParams>;
}) {
  // Visible to every logged-in user regardless of role — this is a shared
  // reporting view, not an admin tool (praditww's explicit decision).
  const user = await requireUser();
  const params = await searchParams;
  // Overview is the landing view: no (or an unknown) `view` param means overview.
  const view: DashboardView = (VIEWS as readonly string[]).includes(params.view ?? "") ? (params.view as DashboardView) : "overview";

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-ink">Dashboard</h1>
      <p className="mb-4 text-sm text-muted">
        Real nationwide sales/cost/FOC actuals, imported from Tableau.
      </p>

      <ActualsContent isAdmin={user.role === "ADMIN"} view={view} params={params} />
    </div>
  );
}

async function ActualsContent({ isAdmin, view, params }: { isAdmin: boolean; view: DashboardView; params: PageParams }) {
  const [productSettings, dataThrough] = await Promise.all([loadProductSettings(), loadDataThrough()]);
  const allowedProductLines = productSettings.allowed;
  const defaultProduct = productSettings.formula[0] ?? LEGACY_PRODUCT;
  // The account picker (an exact dropdown, not free text — see
  // ActualsFilters), the >20% toggle, the over-quota toggle and the "exclude
  // N/A" toggle narrow the whole view (KPIs, panels, lists), not just one
  // table — so the "N ship-to accounts" count and every figure on the page
  // agree. "N/A" (non-finite ratio) accounts are common here — zero/negative
  // revenue with real cost, e.g. samples/credits billed elsewhere — so
  // excluding them is a separate toggle from ">20% only" (which, correctly,
  // still counts an N/A account as a breach: an unbillable give-away is worse
  // than 20%, not undefined for that purpose).
  const { allActuals, years, accountNames, accountRows, facts, alerts, annualAlerts, itemGroupChoices, product, productChoices, quotaMode, year: scopeYear, compare, priorFacts } = await loadDashboardScope(params);

  if (allActuals.length === 0) {
    return (
      <div>
        {isAdmin && <FocActualsImportControl allowedProductLines={allowedProductLines} dataThrough={dataThrough} />}
        {/* A Product with nothing imported yet still needs its picker, or there is no way back. */}
        {params.pl3 && (
          <ActualsFilters view="overview" years={[]} year="" accountNames={[]} accountCount={0} itemGroupChoices={[]} product={product} defaultProduct={defaultProduct} productChoices={productChoices} quotaMode={quotaMode} />
        )}
        <p className="py-12 text-center text-sm text-muted">
          {params.pl3 ? `No actuals imported for ${productLabel(product)} yet` : "No national actuals imported yet"}
          {isAdmin ? " — upload a file above to get started." : "."}
        </p>
      </div>
    );
  }

  return (
    <div>
      {isAdmin && <FocActualsImportControl allowedProductLines={allowedProductLines} dataThrough={dataThrough} />}

      <p className="mb-3 text-xs text-muted">
        {dataThrough.latest ? `Data through ${periodLabel(dataThrough.latest.year, dataThrough.latest.month)}` : "No data yet"}
        {dataThrough.lastImport ? ` · last import ${new Date(dataThrough.lastImport.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} by ${dataThrough.lastImport.by}` : ""}
      </p>

      <DashboardViewTabs current={view} params={{ ...params }} />
      <ActualsFilters view={view} years={years} year={scopeYear} accountNames={accountNames} accountCount={accountRows.length} itemGroupChoices={itemGroupChoices} product={product} defaultProduct={defaultProduct} productChoices={productChoices} quotaMode={quotaMode} />

      {view === "accounts" && <AccountsContent params={params} years={years} accountRows={accountRows} allActuals={allActuals} quotaMode={quotaMode} />}
      {view === "overview" && <OverviewContent accountRows={accountRows} facts={facts} compare={compare} priorFacts={priorFacts} year={scopeYear ? Number(scopeYear) : null} product={product} itemGroups={params.ig ?? ""} />}
      {view === "alerts" && <AlertsContent accountRows={accountRows} facts={facts} alerts={alerts} annualAlerts={annualAlerts} quotaMode={quotaMode} />}
    </div>
  );
}

/** The shared filter params plus the Accounts drawer's `acct` (exact account name). */
type PageParams = DashboardParams & { acct?: string };

type Scope = Awaited<ReturnType<typeof loadDashboardScope>>;

function AccountsContent({ params, years, accountRows, allActuals, quotaMode }: { quotaMode: "formula" | "annual"; params: PageParams; years: number[]; accountRows: Scope["accountRows"]; allActuals: Scope["allActuals"] }) {
  const year = matrixYear(params, years);
  // The sparkline shows the whole selected year (team filter applies, the
  // month range does not), so a month filter never flattens the trend.
  const inScope = new Set(accountRows.map((a) => a.accountName));
  const series = monthlyCostByAccount(
    allActuals.filter((f) => inPeriodScope(f, { ...params, month: undefined, mto: undefined, year: String(year) })),
    year,
    inScope,
  );
  const rows: AccountRow[] = accountRows.map((a) => ({ ...a, monthlyCost: series[a.accountName] ?? Array<number>(12).fill(0) }));
  const exportParams = new URLSearchParams();
  for (const key of ["year", "month", "mto", "ateam", "q", "hi", "xna", "sig", "top", "ig", "pl3"] as const) {
    if (params[key]) exportParams.set(key, params[key]);
  }
  return (
    <AccountsView
      rows={rows}
      year={year}
      measure={params.m === "cost" ? "cost" : "qty"}
      exportQuery={exportParams.toString()}
      initialAcct={params.acct ?? null}
      itemGroups={params.ig ?? ""}
      product={params.pl3 ?? ""}
      quotaMode={quotaMode}
      allYears={params.year === ALL_YEARS}
    />
  );
}

function AlertsContent({ accountRows, facts, alerts, annualAlerts, quotaMode }: { accountRows: Scope["accountRows"]; facts: Scope["facts"]; alerts: Scope["alerts"]; annualAlerts: Scope["annualAlerts"]; quotaMode: "formula" | "annual" }) {
  // Team per account: whichever appears on the most rows in scope.
  const dominant = (name: string, pick: "team" | "rep"): string | null => {
    const counts = new Map<string, number>();
    for (const f of facts) if (f.accountName === name && f[pick]) counts.set(f[pick]!, (counts.get(f[pick]!) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const teamOf = (name: string) => dominant(name, "team");
  const annual = quotaMode === "annual";
  const overQuota = annual ? [] : overQuotaAccounts(accountRows, alerts, teamOf);
  const standalone = annual ? [] : standaloneFocAccounts(accountRows, alerts, teamOf);
  const annualOver = annual ? annualOverAccounts(accountRows, annualAlerts, teamOf) : [];
  const byTeam = focTeamBreakdown(facts).map((t) => ({ key: t.team, ...withRatio(t) }));
  return <AlertsView mode={quotaMode} annualOver={annualOver} overQuota={overQuota} standalone={standalone} byMonth={financeByMonth(facts)} byTeam={byTeam} />;
}

function OverviewContent({ accountRows, facts, compare, priorFacts, year, product, itemGroups }: { accountRows: Scope["accountRows"]; facts: Scope["facts"]; compare: Scope["compare"]; priorFacts: Scope["priorFacts"]; year: number | null; product: string; itemGroups: string }) {
  // Drop empty months from display — praditww doesn't want zero-value
  // padding months cluttering the chart (the rolling 12-month window can
  // extend past whatever period was actually imported).
  const monthly = focMonthlyTrend(facts, 12).filter((m) => m.revenue !== 0 || m.focValue !== 0);
  const byTeam = focTeamBreakdown(facts);
  const products = focTopProducts(facts, 10);
  const composition = focCostComposition(facts);

  // 20, not 10 — this panel shows one bar per account while the ratio panel
  // next to it shows two (Revenue + FOC value), so at equal row counts this
  // one reads roughly half as tall and leaves empty space below it.
  const topByCost = [...accountRows].sort((a, b) => b.totalCost - a.totalCost).slice(0, 20);
  const topByRatio = [...accountRows]
    .filter((a) => Number.isFinite(a.ratio))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 10);

  const totalRevenue = composition.revenue;
  const totalFocCost = composition.focCost;
  const totalBonusCost = composition.bonusCost;
  const totalCost = totalFocCost + totalBonusCost;
  const focPct = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;
  // Reagent kits sold, to pair with the revenue above (revenue counts Reagents, kits only). Summing every
  // Item Group let one customer's control-product credit notes turn the tile negative.
  const totalSoldQty = facts.reduce((t, f) => t + f.revenueQty, 0);
  const totalFocQty = facts.reduce((t, f) => t + f.focQty, 0);
  const totalBonusQty = facts.reduce((t, f) => t + f.bonusQty, 0);

  // The same months of the year before, for the change chips under each tile.
  const prior = compare ? focCostComposition(priorFacts) : null;
  const priorCost = prior ? prior.focCost + prior.bonusCost : null;
  const priorPct = prior && prior.revenue > 0 && priorCost !== null ? (priorCost / prior.revenue) * 100 : null;
  const chip = (cur: number, prev: number | null | undefined, upIs: "good" | "bad", mode: "pct" | "pp" = "pct") =>
    compare && prev !== null && prev !== undefined ? <DeltaChip cur={cur} prev={prev} mode={mode} upIs={upIs} label={compare.label} /> : undefined;

  const ratioBarSeries = (rows: typeof accountRows) =>
    rows.map((a) => ({ category: a.accountName, values: { revenue: a.revenue, focValue: a.totalCost } }));

  return (
    <div>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Revenue" value={money(totalRevenue)} hint={`${totalSoldQty.toLocaleString()} reagent units sold`} accent={REVENUE_COLOR} delta={chip(totalRevenue, prior?.revenue, "good")} />
        <StatTile label="FOC cost" value={money(totalFocCost)} hint={`${totalFocQty.toLocaleString()} units given FOC`} accent={REVENUE_COLOR} delta={chip(totalFocCost, prior?.focCost, "bad")} />
        <StatTile label="Bonus cost" value={money(totalBonusCost)} hint={`${totalBonusQty.toLocaleString()} units given as bonus`} accent={FOC_VALUE_COLOR} delta={chip(totalBonusCost, prior?.bonusCost, "bad")} />
        <StatTile label="Total cost (FOC + Bonus)" value={money(totalCost)} hint={`${(totalFocQty + totalBonusQty).toLocaleString()} units given away`} delta={chip(totalCost, priorCost, "bad")} />
        <StatTile label="Total cost % of revenue" value={`${focPct.toFixed(1)}%`} hint="Target reference: ≤5%" delta={chip(focPct, priorPct, "bad", "pp")} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card interactive className="p-4">
          <h2 className="mb-1 text-sm font-semibold text-ink">Cost composition</h2>
          <p className="mb-3 text-xs text-muted">FOC cost vs Bonus cost within total cost.</p>
          <DonutChart
            segments={[
              { label: "FOC cost", value: totalFocCost, color: REVENUE_COLOR },
              { label: "Bonus cost", value: totalBonusCost, color: FOC_VALUE_COLOR },
            ]}
            centerValue={`${focPct.toFixed(1)}%`}
            centerLabel="of revenue"
            valueFormat={money}
          />
        </Card>

        <Card interactive className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">By team</h2>
          <BarChart
            data={byTeam.map((t) => ({ category: t.label, values: { revenue: t.revenue, focValue: t.focValue } }))}
            series={revFocSeries}
            orientation="horizontal"
            valueFormat={(n) => n.toLocaleString()}
            rightOf={(d) => {
              const t = byTeam.find((row) => row.label === d.category);
              return <RatioBadge ratio={t && t.revenue > 0 ? t.focValue / t.revenue : Infinity} />;
            }}
          />
        </Card>

        <Card interactive className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Top 20 accounts — highest total cost</h2>
          <BarChart
            data={topByCost.map((a) => ({ category: a.accountName, values: { value: a.totalCost } }))}
            series={[{ key: "value", label: "Total cost (THB)", color: FOC_VALUE_COLOR }]}
            orientation="horizontal"
            valueFormat={(n) => n.toLocaleString()}
          />
        </Card>

        <Card interactive className="p-4">
          <h2 className="mb-1 text-sm font-semibold text-ink">Top 10 accounts — highest cost/revenue %</h2>
          <p className="mb-3 text-xs text-muted">Accounts with revenue excluded when 0 (ratio undefined).</p>
          <BarChart
            data={ratioBarSeries(topByRatio)}
            series={revFocSeries}
            orientation="horizontal"
            valueFormat={(n) => n.toLocaleString()}
            rightOf={(d) => <RatioBadge ratio={topByRatio.find((a) => a.accountName === d.category)?.ratio ?? Infinity} />}
          />
        </Card>

        <Card interactive className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Monthly trend</h2>
          <BarChart
            data={monthly.map((m) => ({ category: m.label, values: { revenue: m.revenue, focValue: m.focValue } }))}
            series={revFocSeries}
            valueFormat={(n) => n.toLocaleString()}
          />
        </Card>

        <Card interactive className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Top products given away</h2>
          <BarChart
            data={products.map((p) => ({ category: p.productName, values: { value: p.focValue } }))}
            series={[{ key: "value", label: "FOC + Bonus value (THB)", color: FOC_VALUE_COLOR }]}
            orientation="horizontal"
            valueFormat={(n) => n.toLocaleString()}
          />
        </Card>
      </div>

      <Card className="mt-6 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Detail by ship-to account</h2>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <OverQuotaToggle />
            <ExcludeNaToggle />
          </div>
        </div>
        <FocActualsAccountTable rows={accountRows} year={year} product={product} itemGroups={itemGroups} />
      </Card>
    </div>
  );
}
