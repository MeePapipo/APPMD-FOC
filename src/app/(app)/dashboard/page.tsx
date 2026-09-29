import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  focAccountRows,
  focCostComposition,
  focMonthlyTrend,
  focTeamBreakdown,
  focTopProducts,
  type FocActualFact,
} from "@/lib/dashboard/focActualsAggregate";
import { ActualsFilters } from "@/components/dashboard/ActualsFilters";
import { ExcludeNaToggle } from "@/components/dashboard/ExcludeNaToggle";
import { FocActualsImportControl } from "@/components/dashboard/FocActualsImportControl";
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
  searchParams: Promise<{ year?: string; month?: string; ateam?: string; q?: string; hi?: string; xna?: string }>;
}) {
  // Visible to every logged-in user regardless of role — this is a shared
  // reporting view, not an admin tool (praditww's explicit decision).
  const user = await requireUser();
  const { year, month, ateam, q, hi, xna } = await searchParams;

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-ink">Dashboard</h1>
      <p className="mb-4 text-sm text-muted">
        Real nationwide sales/cost/FOC actuals, imported from Tableau.
      </p>

      <ActualsContent isAdmin={user.role === "ADMIN"} year={year} month={month} ateam={ateam} q={q} hi={hi} xna={xna} />
    </div>
  );
}

async function ActualsContent({
  isAdmin,
  year,
  month,
  ateam,
  q,
  hi,
  xna,
}: {
  isAdmin: boolean;
  year?: string;
  month?: string;
  ateam?: string;
  q?: string;
  hi?: string;
  xna?: string;
}) {
  const allActuals = await prisma.focActual.findMany({
    select: {
      year: true, month: true, team: true, rep: true, accountName: true,
      materialNo: true, productName: true, revenue: true, focCost: true, bonusCost: true,
      soldQty: true, focQty: true, bonusQty: true,
    },
  });

  if (allActuals.length === 0) {
    return (
      <div>
        {isAdmin && <FocActualsImportControl />}
        <p className="py-12 text-center text-sm text-muted">
          No national actuals imported yet{isAdmin ? " — upload a file above to get started." : "."}
        </p>
      </div>
    );
  }

  const years = [...new Set(allActuals.map((f) => f.year))].sort((a, b) => b - a);

  // Exact period/team filters — this data is a periodic bulk import, not a
  // live rolling window, so "year"/"month" pick a specific period rather
  // than a "last N months" style filter.
  const periodRows = allActuals.filter(
    (f) =>
      (!year || f.year === Number(year)) &&
      (!month || f.month === Number(month)) &&
      (!ateam || (f.team ?? "Unassigned") === ateam),
  );

  // The account picker (an exact dropdown, not free text — see
  // ActualsFilters), the >20% toggle, and the "exclude N/A" toggle narrow
  // the whole tab (KPIs, both top-10 panels, the donut, by-team, and the
  // table), not just the table — so the "N ship-to accounts" count and
  // every figure on the page agree. "N/A" (non-finite ratio) accounts are
  // common here — zero/negative revenue with real cost, e.g. samples/
  // credits billed elsewhere — so excluding them is a separate toggle from
  // ">20% only" (which, correctly, still counts an N/A account as a breach:
  // an unbillable give-away is worse than 20%, not undefined for that
  // purpose).
  const allAccountRows = focAccountRows(periodRows as FocActualFact[]);
  const accountNames = allAccountRows.map((a) => a.accountName).sort((a, b) => a.localeCompare(b));
  const highRatioOnly = hi === "1";
  const excludeNa = xna === "1";
  const accountRows = allAccountRows.filter(
    (a) =>
      (!q || a.accountName === q) &&
      (!highRatioOnly || a.ratio > 0.2) &&
      (!excludeNa || Number.isFinite(a.ratio)),
  );
  const accountsInScope = new Set(accountRows.map((a) => a.accountName));
  const facts = periodRows.filter((f) => accountsInScope.has(f.accountName));

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
      {isAdmin && <FocActualsImportControl />}

      <ActualsFilters years={years} accountNames={accountNames} accountCount={accountRows.length} />

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
          <ExcludeNaToggle />
        </div>
        <FocActualsAccountTable rows={accountRows} />
      </Card>
    </div>
  );
}
