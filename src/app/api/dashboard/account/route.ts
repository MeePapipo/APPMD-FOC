import { getSessionUser } from "@/lib/session";
import { accountMonthlyTrend, accountProductsGiven, accountProductsSold, accountSummary } from "@/lib/dashboard/focAccountDetail";
import { buildAccountMatrix } from "@/lib/dashboard/focAccountMatrix";
import { loadAccountDetail } from "@/lib/dashboard/accountDetailLoader";
import { parseItemGroups } from "@/lib/dashboard/filters";
import { withVolume } from "@/lib/dashboard/soldVolume";

/**
 * Per-account drill-down for the Dashboard. The original fields are scoped to
 * the account's FULL history, ignoring the page's year/month filter (matches
 * the reference dashboard's own account modal); `matrix` is the product x
 * Jan..Dec table for `?year=` (default: the account's latest year), which the
 * Accounts view loads lazily when a row is expanded. Visible to any signed-in
 * user (same as the Dashboard page itself), not admin-gated — viewing is open
 * to everyone, only importing is admin-only.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const name = params.get("name");
  if (!name) return Response.json({ error: "Missing account name" }, { status: 400 });

  const detail = await loadAccountDetail(name, parseItemGroups(params.get("ig") ?? undefined), params.get("pl3") || null);
  if (!detail) return Response.json({ error: "Account not found" }, { status: 404 });
  const { rows, entitlement } = detail;

  const years = detail.years;
  const askedYear = Number(params.get("year"));
  const year = Number.isInteger(askedYear) && askedYear > 0 ? askedYear : years[0];
  // The trend charts show the year asked for; with no year they cover the whole history.
  const trendRows = Number.isInteger(askedYear) && askedYear > 0 ? rows.filter((r) => r.year === askedYear) : rows;

  return Response.json({
    accountName: name,
    accountNumber: detail.accountNumber,
    // True when at least one assay's run count used this account's own TPB.
    ownTpbUsed: detail.ownTpbUsed,
    team: detail.team,
    rep: detail.rep,
    summary: accountSummary(rows),
    monthly: accountMonthlyTrend(trendRows),
    productsGiven: accountProductsGiven(rows, 10),
    productsSold: withVolume(accountProductsSold(rows, 10), detail.packByMaterial),
    // The summary tiles follow the shown year, or every loaded month when the page's Year filter is All years.
    entitlement: params.get("span") === "all" ? entitlement : { ...entitlement, net: detail.netForYear(year) },
    quotaMode: detail.quotaMode,
    // Quota and what was given in the shown year, per item with a quota rule (what the matrix compares).
    yearQuota: detail.yearQuotaFor(year),
    years,
    matrix: buildAccountMatrix(rows, year),
  });
}
