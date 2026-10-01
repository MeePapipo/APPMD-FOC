import { prisma } from "@/lib/prisma";
import { loadEngineData } from "@/lib/calc/service";
import { computeEntitlement } from "./entitlement";
import type { EntitlementLite } from "./focExports";
import { accountNumberFromName, buildGot, reagentBillMonths, recentFromPeriod } from "./accountGiven";
import { loadDataThrough } from "./dataThrough";
import { loadAlertThresholds } from "./alertSettings";
import { inItemGroups } from "./itemGroups";
import { LEGACY_PRODUCT, loadProductSettings, productOf } from "./importSettings";
import { annualItems } from "./annualQuota";

/** One reagent-consumable item for one calendar year: the quota earned in the year and what was given in it (units). */
export type YearQuota = { quota: number; free: number; focQty: number; bonusQty: number; significant: boolean; warning?: boolean };

/** The year view as the lite rows the CSV/PDF builders and the matrix panel read. */
export function yearEntitlementLite(yq: Record<string, YearQuota>): (EntitlementLite & { focQty: number; bonusQty: number })[] {
  return Object.entries(yq).map(([materialNo, v]) => ({ materialNo, expected: v.quota, free: v.free, focQty: v.focQty, bonusQty: v.bonusQty, significant: v.significant, warning: v.warning }));
}

/** Whichever value appears on the most rows — the "dominant tag" convention
 * for team/rep, which can change mid-history (e.g. a rep transfer). */
const dominant = (values: (string | null)[]): string | null => {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c; }
  return best;
};

/**
 * One account's full FocActual history plus its cumulative entitlement, shared
 * by the drilldown/matrix route and the per-account exports. Null when the
 * account has no rows. `itemGroups` (the `ig` selection, null = default groups)
 * filters the product rows; the entitlement always covers the default groups,
 * the formula's own. `productPick` (the Dashboard's Product filter, null = the default Product)
 * narrows the rows to one Product and picks the quota source: formula Products use
 * the cumulative formula, the others the annual Quota(Year) from Tableau.
 */
export async function loadAccountDetail(name: string, itemGroups: string[] | null = null, productPick: string | null = null) {
  const productSettings = await loadProductSettings();
  // No pick = the Dashboard's default Product, never "every Product": Core Lab and Pathology items
  // (chemistry, immunoassay) would otherwise show up in a Molecular account's sold and given lists.
  const product = productPick || productSettings.formula[0] || LEGACY_PRODUCT;
  const fetched = await prisma.focActual.findMany({
    where: { accountName: name },
    select: {
      year: true, month: true, team: true, rep: true, category: true, product: true, annualQuota: true, materialNo: true, productName: true,
      revenue: true, revenueQty: true, soldQty: true, focCost: true, focQty: true, bonusCost: true, bonusQty: true,
    },
  });
  const allRows = fetched.filter((r) => productOf(r.product) === product);
  const annualMode = !productSettings.formula.includes(product);
  // Item Groups are a formula-Product notion (Molecular's controls/consumables); the annual-quota
  // Products show every Item Group they have.
  const rows = annualMode ? allRows : allRows.filter((r) => inItemGroups(r.category, itemGroups));
  if (allRows.length === 0) return null;

  // FocActual only carries the ship-to name, which ends in the account number
  // (zero-padded: "(0052027798)"). Use it to find the Account and, through it,
  // that account's own TPB; an account not in the app's list gets the national TPB.
  const accountNo = accountNumberFromName(name);
  const accountRecord = accountNo
    ? await prisma.account.findUnique({ where: { accountNumber: accountNo }, select: { id: true } })
    : null;

  const [{ assays, items, tpbInput, tpbDetail }, additionalItems, alert, through] = await Promise.all([
    loadEngineData(accountRecord?.id),
    prisma.additionalFocItem.findMany({ where: { active: true }, select: { materialNo: true } }),
    loadAlertThresholds(),
    loadDataThrough(),
  ]);
  const additionalMats = new Set(additionalItems.map((i) => i.materialNo));
  // Annual-quota Products have no formula: an empty entitlement keeps the response shape without
  // scoring their items against rules that do not apply to them.
  const entitlement = annualMode
    ? computeEntitlement(new Map(), assays, items, additionalMats, tpbInput, alert)
    : computeEntitlement(buildGot(allRows.filter((r) => inItemGroups(r.category, null)), recentFromPeriod(through.latest)), assays, items, additionalMats, tpbInput, alert, reagentBillMonths(allRows));

  // Everything below works on one calendar year at a time: the quota is what that year's reagent sales earn
  // (rounded once on the year's total, with the account's own TPB) and "given" is what went out in that year,
  // so the matrix, the quota table, the summary tiles and the Calculator's allowance all read the same figures.
  // (A year-to-year "delta of cumulative" quota would make the years add up exactly, but it gave the matrix
  // a different number from the quota table for the same item.)
  const defaultRows = allRows.filter((r) => inItemGroups(r.category, null));
  const ruleMats = new Set(entitlement.rows.filter((r) => r.bucket === "over" || r.bucket === "within").map((r) => r.materialNo));

  // The whole entitlement (quota rows, net summary, stand-alone FOC) for one calendar year; null = every loaded month.
  const entitlementForYear = (year: number | null) => {
    const inYear = (r: { year: number }) => year === null || r.year === year;
    return computeEntitlement(
      buildGot(defaultRows.filter(inYear), year === null ? recentFromPeriod(through.latest) : undefined),
      assays, items, additionalMats, tpbInput, alert, reagentBillMonths(allRows.filter(inYear)),
    );
  };

  const yearQuotaFor = (year: number): Record<string, YearQuota> => {
    if (annualMode) {
      // The quota is the yearly figure Tableau holds; given = FOC + Bonus in the year.
      const out: Record<string, YearQuota> = {};
      for (const i of annualItems(allRows.map((r) => ({ ...r, accountName: name })), year, alert.minOverUnits)) {
        if (i.quota > 0) out[i.materialNo] = { quota: i.quota, free: i.given, focQty: i.focQty, bonusQty: i.bonusQty, significant: i.over };
      }
      return out;
    }
    const out: Record<string, YearQuota> = {};
    for (const row of entitlementForYear(year).rows) {
      if (row.bucket !== "over" && row.bucket !== "within") continue; // only items with a quota rule
      out[row.materialNo] = { quota: row.expected, free: row.free, focQty: row.focQty, bonusQty: row.bonusQty, significant: row.significant, warning: row.severity === "warning" };
    }
    // An item with a rule that earned and was given nothing this year (e.g. given only last year) still has a quota of 0.
    for (const mat of ruleMats) if (!out[mat]) out[mat] = { quota: 0, free: 0, focQty: 0, bonusQty: 0, significant: false, warning: false };
    return out;
  };

  // Pack size per reagent material (6800 and 5800 share material numbers and sizes), for boxes -> tests.
  const packByMaterial: Record<string, number> = {};
  for (const a of assays) if (a.packSize > 0) packByMaterial[a.materialNo] = a.packSize;

  return {
    rows,
    packByMaterial,
    /** Every year the account has rows in, whatever the Item Group filter. */
    years: [...new Set(allRows.map((r) => r.year))].sort((a, b) => b - a),
    entitlement,
    quotaMode: (annualMode ? "annual" : "formula") as "annual" | "formula",
    yearQuotaFor,
    entitlementForYear,
    accountNumber: name.match(/\(([^()]+)\)\s*$/)?.[1] ?? null,
    ownTpbUsed: [...(tpbDetail?.values() ?? [])].some((d) => d.source !== "national"),
    team: dominant(allRows.map((r) => r.team)),
    rep: dominant(allRows.map((r) => r.rep)),
  };
}
