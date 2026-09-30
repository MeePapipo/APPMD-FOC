import { prisma } from "@/lib/prisma";
import { loadEngineData } from "@/lib/calc/service";
import { computeEntitlement } from "./entitlement";
import { accountNumberFromName, buildGot } from "./accountGiven";
import { loadAlertThresholds } from "./alertSettings";

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
 * account has no rows.
 */
export async function loadAccountDetail(name: string) {
  const rows = await prisma.focActual.findMany({
    where: { accountName: name },
    select: {
      year: true, month: true, team: true, rep: true, materialNo: true, productName: true,
      revenue: true, revenueQty: true, soldQty: true, focCost: true, focQty: true, bonusCost: true, bonusQty: true,
    },
  });
  if (rows.length === 0) return null;

  // FocActual only carries the ship-to name, which ends in the account number
  // (zero-padded: "(0052027798)"). Use it to find the Account and, through it,
  // that account's own TPB; an account not in the app's list gets the national TPB.
  const accountNo = accountNumberFromName(name);
  const accountRecord = accountNo
    ? await prisma.account.findUnique({ where: { accountNumber: accountNo }, select: { id: true } })
    : null;

  const [{ assays, items, tpbInput, tpbDetail }, additionalItems, alert] = await Promise.all([
    loadEngineData(accountRecord?.id),
    prisma.additionalFocItem.findMany({ where: { active: true }, select: { materialNo: true } }),
    loadAlertThresholds(),
  ]);
  const additionalMats = new Set(additionalItems.map((i) => i.materialNo));
  const entitlement = computeEntitlement(buildGot(rows), assays, items, additionalMats, tpbInput, alert);

  return {
    rows,
    entitlement,
    accountNumber: name.match(/\(([^()]+)\)\s*$/)?.[1] ?? null,
    ownTpbUsed: [...(tpbDetail?.values() ?? [])].some((d) => d.source !== "national"),
    team: dominant(rows.map((r) => r.team)),
    rep: dominant(rows.map((r) => r.rep)),
  };
}
