"use client";

import { useState } from "react";
import { Badge, Button, CardRow } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ROW_HOVER } from "@/lib/hoverStyles";

type Team = "NORTH" | "SOUTH" | "PRIVATE" | "BUSINESS_PARTNER";
type Role = "USER" | "ADMIN";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  team: Team | null;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  loginCount: number;
};

function lastActive(user: Pick<AdminUser, "lastLoginAt" | "loginCount">): string {
  if (!user.lastLoginAt) return "Never logged in";
  const days = Math.floor((Date.now() - new Date(user.lastLoginAt).getTime()) / 86_400_000);
  const when = days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days}d ago`;
  return `${when} · ${user.loginCount} login${user.loginCount === 1 ? "" : "s"}`;
}

const TEAM_LABELS: Record<Team, string> = {
  NORTH: "North Team",
  SOUTH: "South Team",
  PRIVATE: "Private Team",
  BUSINESS_PARTNER: "Business Partner Team",
};

export function AdminUsersTable({
  initialUsers,
  currentUserId,
}: {
  initialUsers: AdminUser[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ email: string; tempPassword: string } | null>(null);

  async function patch(id: string, body: Partial<Pick<AdminUser, "role" | "team" | "active">>) {
    setPendingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Update failed. Please try again.");
      setUsers((previous) => previous.map((u) => (u.id === id ? { ...u, ...data.user } : u)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  async function resetPassword(id: string) {
    setPendingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${id}/reset-password`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Reset failed. Please try again.");
      setResetResult({ email: data.email, tempPassword: data.tempPassword });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reset failed. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  function Controls({ user, layout }: { user: AdminUser; layout: "card" | "row" }) {
    const self = user.id === currentUserId;
    const busy = pendingId === user.id;
    const idPrefix = `${layout}-${user.id}`;
    const wrap = layout === "card" ? "flex flex-col gap-2" : "flex flex-wrap items-center gap-2";

    return (
      <div className={wrap}>
        <label htmlFor={`${idPrefix}-role`} className="sr-only">
          Role for {user.email}
        </label>
        <select
          id={`${idPrefix}-role`}
          value={user.role}
          disabled={self || busy}
          onChange={(e) => patch(user.id, { role: e.target.value as Role })}
          className="rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm disabled:opacity-50"
        >
          <option value="USER">User</option>
          <option value="ADMIN">Admin</option>
        </select>

        <label htmlFor={`${idPrefix}-team`} className="sr-only">
          Team for {user.email}
        </label>
        <select
          id={`${idPrefix}-team`}
          value={user.team ?? ""}
          disabled={busy}
          onChange={(e) => patch(user.id, { team: (e.target.value || null) as Team | null })}
          className="rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm disabled:opacity-50"
        >
          <option value="">Unassigned</option>
          {(Object.keys(TEAM_LABELS) as Team[]).map((t) => (
            <option key={t} value={t}>
              {TEAM_LABELS[t]}
            </option>
          ))}
        </select>

        <Button
          type="button"
          variant={user.active ? "secondary" : "danger"}
          size="sm"
          disabled={self || busy}
          onClick={() => patch(user.id, { active: !user.active })}
        >
          {user.active ? "Deactivate" : "Reactivate"}
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => resetPassword(user.id)}
        >
          Reset password
        </Button>

        {self && <span className="text-xs text-muted">(you)</span>}
      </div>
    );
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-negative/30 bg-negative-tint px-3 py-2 text-sm text-negative">
          {error}
        </p>
      )}

      {resetResult && (
        <div role="alert" className="mb-4 rounded-lg border border-warning/30 bg-warning-tint p-4">
          <p className="text-sm font-medium text-ink">
            New temporary password for {resetResult.email}
          </p>
          <p className="mt-1 text-xs text-muted">
            Shown once — copy it now and relay it to the rep directly. It won&apos;t be shown again.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded-md border border-line-strong bg-surface px-3 py-1.5 font-mono text-sm text-ink">
              {resetResult.tempPassword}
            </code>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => navigator.clipboard.writeText(resetResult.tempPassword)}
            >
              Copy
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setResetResult(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      <div className="divide-y divide-line border-y border-line md:hidden">
        {users.map((user) => (
          <div key={user.id} className={cn("py-3", ROW_HOVER)}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="truncate text-sm font-medium text-ink">{user.name ?? user.email}</h4>
                <p className="truncate text-xs text-muted">{user.email}</p>
              </div>
              {!user.active && <Badge tone="negative">Deactivated</Badge>}
            </div>
            <dl className="mt-2">
              <CardRow label="Joined" value={new Date(user.createdAt).toLocaleDateString()} />
              <CardRow label="Last active" value={lastActive(user)} />
            </dl>
            <div className="mt-2">
              <Controls user={user} layout="card" />
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="bg-brand-tint text-xs text-muted">
            <tr className="border-y border-line text-left">
              <th scope="col" className="px-3 py-3">User</th>
              <th scope="col" className="px-3 py-3">Status</th>
              <th scope="col" className="px-3 py-3">Last active</th>
              <th scope="col" className="px-3 py-3">Role / Team / Active</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className={cn("border-b border-line align-top", ROW_HOVER)}>
                <td className="px-3 py-3">
                  <div className="font-medium text-ink">{user.name ?? "—"}</div>
                  <div className="text-xs text-muted">{user.email}</div>
                </td>
                <td className="px-3 py-3">
                  {user.active ? (
                    <Badge tone="positive">Active</Badge>
                  ) : (
                    <Badge tone="negative">Deactivated</Badge>
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-muted">
                  <div>{lastActive(user)}</div>
                  <div>Joined {new Date(user.createdAt).toLocaleDateString()}</div>
                </td>
                <td className="px-3 py-3">
                  <Controls user={user} layout="row" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
