import { requireApiUser } from "@/lib/api-auth";
import { loadDashboardScope } from "@/lib/dashboard/scope";
import { longFactsCsv } from "@/lib/dashboard/focExports";
import type { DashboardParams } from "@/lib/dashboard/filters";

const KEYS = ["year", "month", "mto", "ateam", "q", "hi", "xna", "sig", "top"] as const;

/** Long-format CSV of every account matching the Dashboard's current filters (same param names as the page). */
export async function GET(request: Request) {
  const guard = await requireApiUser();
  if (guard instanceof Response) return guard;

  const search = new URL(request.url).searchParams;
  const params: DashboardParams = {};
  for (const key of KEYS) {
    const v = search.get(key);
    if (v) params[key] = v;
  }

  const { facts } = await loadDashboardScope(params, { alerts: false });
  const label = [params.year, params.month && `m${params.month}${params.mto ? `-${params.mto}` : ""}`].filter(Boolean).join("-");
  return new Response(longFactsCsv(facts), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="FOC-accounts${label ? `-${label}` : ""}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
