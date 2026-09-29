import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { accountMonthlyTrend, accountProductsGiven, accountProductsSold, accountSummary } from "@/lib/dashboard/focAccountDetail";
import { computeEntitlement, type MaterialGiven } from "@/lib/dashboard/entitlement";
import { loadEngineData } from "@/lib/calc/service";

/**
 * Per-account drill-down for the Dashboard's account modal. Deliberately
 * scoped to the account's FULL history, ignoring the page's year/month
 * filter — matches the reference dashboard's own account modal behavior.
 * Visible to any signed-in user (same as the Dashboard page itself), not
 * admin-gated — viewing is open to everyone, only importing is admin-only.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const name = new URL(request.url).searchParams.get("name");
  if (!name) return Response.json({ error: "Missing account name" }, { status: 400 });

  const rows = await prisma.focActual.findMany({
    where: { accountName: name },
    select: {
      year: true, month: true, team: true, rep: true, materialNo: true, productName: true,
      revenue: true, revenueQty: true, soldQty: true, focCost: true, focQty: true, bonusCost: true, bonusQty: true,
    },
  });

  if (rows.length === 0) return Response.json({ error: "Account not found" }, { status: 404 });

  // Team/rep can vary row-to-row in the source data (e.g. a rep transfer
  // mid-year) — show whichever value appears on the most rows, same
  // "dominant tag" convention the source tool uses for account labeling.
  const dominant = (values: (string | null)[]): string | null => {
    const counts = new Map<string, number>();
    for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best: string | null = null;
    let bestCount = 0;
    for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c; }
    return best;
  };

  const accountNumberMatch = name.match(/\(([^()]+)\)\s*$/);

  // "got" for the entitlement engine — summed across the account's full
  // history by materialNo, same scope as everything else in this modal
  // (independent of the page's month filter).
  const got = new Map<string, MaterialGiven>();
  for (const r of rows) {
    const d = got.get(r.materialNo) ?? { sold: 0, foc: 0, bonus: 0, freeCost: 0, productName: r.productName };
    // `soldQty` (unrestricted), not `revenueQty` — the latter is zeroed by
    // our own import pipeline for anything outside the "Reagents, kits"
    // category, which is correct for revenue but wrong here: a non-reagent
    // give-away item (e.g. an Additional FOC consumable) can still carry a
    // real Selling Quantity movement (a credit/return), and for genuine
    // reagent-kit rows the two are numerically identical anyway (a reagent
    // materialNo is always "Reagents, kits"). Confirmed against a real
    // account: the reference shows Selling Qty -1 for a non-reagent
    // Additional FOC row that `revenueQty` silently reported as 0.
    d.sold += r.soldQty;
    d.foc += r.focQty;
    d.bonus += r.bonusQty;
    d.freeCost += r.focCost + r.bonusCost;
    got.set(r.materialNo, d);
  }

  const [{ assays, items, tpbInput }, additionalItems] = await Promise.all([
    loadEngineData(),
    prisma.additionalFocItem.findMany({ where: { active: true }, select: { materialNo: true } }),
  ]);
  const additionalMats = new Set(additionalItems.map((i) => i.materialNo));
  const entitlement = computeEntitlement(got, assays, items, additionalMats, tpbInput);

  return Response.json({
    accountName: name,
    accountNumber: accountNumberMatch?.[1] ?? null,
    team: dominant(rows.map((r) => r.team)),
    rep: dominant(rows.map((r) => r.rep)),
    summary: accountSummary(rows),
    monthly: accountMonthlyTrend(rows),
    productsGiven: accountProductsGiven(rows, 10),
    productsSold: accountProductsSold(rows, 10),
    entitlement,
  });
}
