import { prisma } from "@/lib/prisma";
import { loadEngineData } from "@/lib/calc/service";
import { computeEntitlement } from "./entitlement";
import { accountNumberFromName, buildGot, recentFromPeriod } from "./accountGiven";
import { loadDataThrough } from "./dataThrough";
import { loadAlertThresholds } from "./alertSettings";
import { inItemGroups } from "./itemGroups";

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
 * the formula's own.
 */
export async function loadAccountDetail(name: string, itemGroups: string[] | null = null) {
  const allRows = await prisma.focActual.findMany({
    where: { accountName: name },
    select: {
      year: true, month: true, team: true, rep: true, category: true, materialNo: true, productName: true,
      revenue: true, revenueQty: true, soldQty: true, focCost: true, focQty: true, bonusCost: true, bonusQty: true,
    },
  });
  const rows = allRows.filter((r) => inItemGroups(r.category, itemGroups));
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
  const entitlement = computeEntitlement(buildGot(allRows.filter((r) => inItemGroups(r.category, null)), recentFromPeriod(through.latest)), assays, items, additionalMats, tpbInput, alert);

  // Pack size per reagent material (6800 and 5800 share material numbers and sizes), for boxes -> tests.
  const packByMaterial: Record<string, number> = {};
  for (const a of assays) if (a.packSize > 0) packByMaterial[a.materialNo] = a.packSize;

  return {
    rows,
    packByMaterial,
    /** Every year the account has rows in, whatever the Item Group filter. */
    years: [...new Set(allRows.map((r) => r.year))].sort((a, b) => b - a),
    entitlement,
    accountNumber: name.match(/\(([^()]+)\)\s*$/)?.[1] ?? null,
    ownTpbUsed: [...(tpbDetail?.values() ?? [])].some((d) => d.source !== "national"),
    team: dominant(allRows.map((r) => r.team)),
    rep: dominant(allRows.map((r) => r.rep)),
  };
}
