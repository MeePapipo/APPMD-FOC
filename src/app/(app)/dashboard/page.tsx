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
import { matrixYear, parseView, type DashboardParams, type DashboardView } from "@/lib/dashboard/filters";
import { financeByMonth, withRatio } from "@/lib/dashboard/focFinance";
import { loadAllowedProductLines } from "@/lib/dashboard/importSettings";
import { loadDataThrough } from "@/lib/dashboard/dataThrough";
import { periodLabel } from "@/lib/dashboard/period";
import { FocActualsImportControl } from "@/components/dashboard/FocActualsImportControl";
import { AccountsView } from "@/components/dashboard/AccountsView";
import { AlertsView, type AlertListItem } from "@/components/dashboard/AlertsView";
import { DashboardViewTabs } from "@/components/dashboard/DashboardViewTabs";
import { FocActualsAccountTable } from "@/components/dashboard/FocActualsAccountTable";
import { StatTile } from "@/components/dashboard/StatTile";
import { BarChart } from "@/components/dashboard/BarChart";
import { DonutChart } from "@/components/dashboard/DonutChart";
import { RatioBadge } from "@/components/dashboard/RatioBadge";
import { Card } from "@/components/ui";

const REVENUE_COLOR = "#0b41cd"; // matches --brand
const FOC_VALUE_COLOR = "#eb6834";
const money = (n: number) => `${Math.round(n).toLocaleString()} THB`;
const revFocSeries = [
  { key: "revenue", label: "Revenue", color: REVENUE_COLOR },
  { key: "focValue", label: "FOC value", color: FOC_VALUE_COLOR },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardParams>;
}) {
  // Visible to every logged-in user regardless of role — this is a shared
  // reporting view, not an admin tool (praditww's explicit decision).
  const user = await requireUser();
  const params = await searchParams;
  const view = parseView(params.view);

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

async function ActualsContent({ isAdmin, view, params }: { isAdmin: boolean; view: DashboardView; params: DashboardParams }) {
  const [allowedProductLines, dataThrough] = await Promise.all([loadAllowedProductLines(), loadDataThrough()]);
  // The account picker (an exact dropdown, not free text — see
  // ActualsFilters), the >20% toggle, the over-quota toggle and the "exclude
  // N/A" toggle narrow the whole view (KPIs, panels, lists), not just one
  // table — so the "N ship-to accounts" count and every figure on the page
  // agree. "N/A" (non-finite ratio) accounts are common here — zero/negative
  // revenue with real cost, e.g. samples/credits billed elsewhere — so
  // excluding them is a separate toggle from ">20% only" (which, correctly,
  // still counts an N/A account as a breach: an unbillable give-away is worse
  // than 20%, not undefined for that purpose).
  const { allActuals, years, accountNames, accountRows, facts, alerts } = await loadDashboardScope(params);

  if (allActuals.length === 0) {
    return (
      <div>
        {isAdmin && <FocActualsImportControl allowedProductLines={allowedProductLines} dataThrough={dataThrough} />}
        <p className="py-12 text-center text-sm text-muted">
          No national actuals imported yet{isAdmin ? " — upload a file above to get started." : "."}
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
      <ActualsFilters view={view} years={years} accountNames={accountNames} accountCount={accountRows.length} />

      {view === "accounts" && <AccountsContent params={params} years={years} accountRows={accountRows} />}
      {view === "overview" && <OverviewContent accountRows={accountRows} facts={facts} />}
      {view === "alerts" && <AlertsContent accountRows={accountRows} facts={facts} alerts={alerts} />}
    </div>
  );
}

type Scope = Awaited<ReturnType<typeof loadDashboardScope>>;

function AccountsContent({ params, years, accountRows }: { params: DashboardParams; years: number[]; accountRows: Scope["accountRows"] }) {
  // Over-quota excess first, then total cost — the accounts that need a
  // conversation lead the list.
  const sorted = [...accountRows].sort((a, b) => b.overCost - a.overCost || b.totalCost - a.totalCost);
  const exportParams = new URLSearchParams();
  for (const key of ["year", "month", "mto", "ateam", "q", "hi", "xna", "sig", "top"] as const) {
    if (params[key]) exportParams.set(key, params[key]);
  }
  return (
    <AccountsView
      rows={sorted}
      year={matrixYear(params, years)}
      measure={params.m === "cost" ? "cost" : "qty"}
      exportQuery={exportParams.toString()}
      openByDefault={Boolean(params.q)}
    />
  );
}

function AlertsContent({ accountRows, facts, alerts }: { accountRows: Scope["accountRows"]; facts: Scope["facts"]; alerts: Scope["alerts"] }) {
  // Team/rep per account: whichever appears on the most rows in scope.
  const dominant = (name: string, pick: "team" | "rep"): string | null => {
    const counts = new Map<string, number>();
    for (const f of facts) if (f.accountName === name && f[pick]) counts.set(f[pick]!, (counts.get(f[pick]!) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const items: AlertListItem[] = accountRows
    .flatMap((a) => (alerts.get(a.accountName)?.items ?? []).map((i) => ({ ...i, accountName: a.accountName, team: dominant(a.accountName, "team"), rep: dominant(a.accountName, "rep") })))
    .sort((a, b) => b.excessValue - a.excessValue);
  const byTeam = focTeamBreakdown(facts).map((t) => ({ key: t.team, ...withRatio(t) }));
  return <AlertsView items={items} byMonth={financeByMonth(facts)} byTeam={byTeam} />;
}

function OverviewContent({ accountRows, facts }: { accountRows: Scope["accountRows"]; facts: Scope["facts"] }) {
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
  const totalSoldQty = facts.reduce((t, f) => t + f.soldQty, 0);
  const totalFocQty = facts.reduce((t, f) => t + f.focQty, 0);
  const totalBonusQty = facts.reduce((t, f) => t + f.bonusQty, 0);

  const ratioBarSeries = (rows: typeof accountRows) =>
    rows.map((a) => ({ category: a.accountName, values: { revenue: a.revenue, focValue: a.totalCost } }));

  return (
    <div>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Revenue" value={money(totalRevenue)} hint={`${totalSoldQty.toLocaleString()} units sold`} accent={REVENUE_COLOR} />
        <StatTile label="FOC cost" value={money(totalFocCost)} hint={`${totalFocQty.toLocaleString()} units given FOC`} accent={REVENUE_COLOR} />
        <StatTile label="Bonus cost" value={money(totalBonusCost)} hint={`${totalBonusQty.toLocaleString()} units given as bonus`} accent={FOC_VALUE_COLOR} />
        <StatTile label="Total cost (FOC + Bonus)" value={money(totalCost)} hint={`${(totalFocQty + totalBonusQty).toLocaleString()} units given away`} />
        <StatTile label="Total cost % of revenue" value={`${focPct.toFixed(1)}%`} hint="Target reference: ≤5%" />
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
        <FocActualsAccountTable rows={accountRows} />
      </Card>
    </div>
  );
}
