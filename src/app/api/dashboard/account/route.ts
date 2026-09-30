import { getSessionUser } from "@/lib/session";
import { accountMonthlyTrend, accountProductsGiven, accountProductsSold, accountSummary } from "@/lib/dashboard/focAccountDetail";
import { buildAccountMatrix } from "@/lib/dashboard/focAccountMatrix";
import { loadAccountDetail } from "@/lib/dashboard/accountDetailLoader";
import { parseItemGroups } from "@/lib/dashboard/filters";

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

  const detail = await loadAccountDetail(name, parseItemGroups(params.get("ig") ?? undefined));
  if (!detail) return Response.json({ error: "Account not found" }, { status: 404 });
  const { rows, entitlement } = detail;

  const years = detail.years;
  const askedYear = Number(params.get("year"));
  const year = Number.isInteger(askedYear) && askedYear > 0 ? askedYear : years[0];

  return Response.json({
    accountName: name,
    accountNumber: detail.accountNumber,
    // True when at least one assay's run count used this account's own TPB.
    ownTpbUsed: detail.ownTpbUsed,
    team: detail.team,
    rep: detail.rep,
    summary: accountSummary(rows),
    monthly: accountMonthlyTrend(rows),
    productsGiven: accountProductsGiven(rows, 10),
    productsSold: accountProductsSold(rows, 10),
    entitlement,
    years,
    matrix: buildAccountMatrix(rows, year),
  });
}
