import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AdminUsersTable } from "@/components/admin/AdminUsersTable";

const TEAM_LABELS: Record<string, string> = {
  NORTH: "North Team",
  SOUTH: "South Team",
  PRIVATE: "Private Team",
  BUSINESS_PARTNER: "Business Partner Team",
  THAI_RED_CROSS: "Thai Red Cross Team",
  MD: "MD Team",
  UNASSIGNED: "Unassigned",
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Real usage by team, not just the profile label — who's actually using the
 * system in the last 30 days, not who's assigned where. */
function teamRollup(users: { team: string | null; lastLoginAt: Date | null }[]) {
  const recentCutoffMs = Date.now() - THIRTY_DAYS_MS;
  const rollup = new Map<string, { total: number; activeRecently: number }>();
  for (const u of users) {
    // MD is the admin's own label, not a sales team — keep it out of the rollup.
    if (u.team === "MD") continue;
    const key = u.team ?? "UNASSIGNED";
    const bucket = rollup.get(key) ?? { total: 0, activeRecently: 0 };
    bucket.total += 1;
    if (u.lastLoginAt && u.lastLoginAt.getTime() >= recentCutoffMs) bucket.activeRecently += 1;
    rollup.set(key, bucket);
  }
  return rollup;
}

export default async function AdminUsersPage() {
  const user = await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      team: true,
      active: true,
      createdAt: true,
      lastLoginAt: true,
      loginCount: true,
    },
  });

  const rollup = teamRollup(users);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-ink">Users</h1>
      <p className="mb-6 text-sm text-muted">
        Every account, self-registered or signed in via Roche SSO. Promote, demote, assign a
        team, or deactivate someone below.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[...rollup.entries()].map(([team, stats]) => (
          <div key={team} className="rounded-lg border border-line bg-surface p-3">
            <div className="text-xs text-muted">{TEAM_LABELS[team] ?? team}</div>
            <div className="mt-1 text-lg font-semibold text-ink">
              {stats.activeRecently} <span className="text-sm font-normal text-muted">/ {stats.total} active in 30d</span>
            </div>
          </div>
        ))}
      </div>

      <AdminUsersTable
        initialUsers={users.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        }))}
        currentUserId={user.id}
      />
    </div>
  );
}
