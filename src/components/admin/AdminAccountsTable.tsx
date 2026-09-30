"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ROW_HOVER } from "@/lib/hoverStyles";

type AccountRow = {
  id: string;
  accountNumber: string;
  accountName: string;
  active: boolean;
  uses: number; // orders + forecasts + quotas pointing at it
};

const INPUT = "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none";

export function AdminAccountsTable({ initialAccounts }: { initialAccounts: AccountRow[] }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ accountNumber: "", accountName: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ accountNumber: "", accountName: "" });

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? accounts.filter((a) => a.accountName.toLowerCase().includes(needle) || a.accountNumber.toLowerCase().includes(needle))
    : accounts;

  async function call(id: string | null, url: string, init: RequestInit, fallback: string) {
    setPendingId(id ?? "new");
    setError(null);
    try {
      const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? fallback);
      return data;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallback);
      return null;
    } finally {
      setPendingId(null);
    }
  }

  async function add() {
    const data = await call(null, "/api/admin/accounts", { method: "POST", body: JSON.stringify(draft) }, "Create failed. Please try again.");
    if (!data) return;
    setAccounts((previous) =>
      [...previous, data.account].sort((a, b) => a.accountName.localeCompare(b.accountName)),
    );
    setDraft({ accountNumber: "", accountName: "" });
    setAdding(false);
  }

  async function save(id: string) {
    const data = await call(id, `/api/admin/accounts/${id}`, { method: "PATCH", body: JSON.stringify(edit) }, "Update failed. Please try again.");
    if (!data) return;
    setAccounts((previous) =>
      previous
        .map((a) => (a.id === id ? { ...a, ...data.account } : a))
        .sort((a, b) => a.accountName.localeCompare(b.accountName)),
    );
    setEditingId(null);
  }

  async function toggleActive(account: AccountRow) {
    const data = await call(account.id, `/api/admin/accounts/${account.id}`, { method: "PATCH", body: JSON.stringify({ active: !account.active }) }, "Update failed. Please try again.");
    if (data) setAccounts((previous) => previous.map((a) => (a.id === account.id ? { ...a, ...data.account } : a)));
  }

  async function remove(account: AccountRow) {
    if (!window.confirm(`Delete ${account.accountNumber} — ${account.accountName}? This cannot be undone.`)) return;
    const data = await call(account.id, `/api/admin/accounts/${account.id}`, { method: "DELETE" }, "Delete failed. Please try again.");
    if (data) setAccounts((previous) => previous.filter((a) => a.id !== account.id));
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-negative/30 bg-negative-tint px-3 py-2 text-sm text-negative">
          {error}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <label htmlFor="account-search" className="sr-only">Search accounts</label>
          <input
            id="account-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or number"
            className={INPUT}
          />
        </div>
        <span className="text-sm text-muted">
          {shown.length === accounts.length ? `${accounts.length} accounts` : `${shown.length} of ${accounts.length} accounts`}
        </span>
        <Button type="button" size="sm" className="ml-auto" onClick={() => { setAdding((v) => !v); setError(null); }}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add account
        </Button>
      </div>

      {adding && (
        <form
          onSubmit={(e) => { e.preventDefault(); void add(); }}
          aria-label="New account"
          className="mb-4 grid gap-3 rounded-lg border border-line bg-surface p-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto]"
        >
          <div>
            <label htmlFor="new-account-number" className="mb-1 block text-xs font-medium text-muted">Account No</label>
            <input id="new-account-number" required maxLength={32} value={draft.accountNumber} onChange={(e) => setDraft({ ...draft, accountNumber: e.target.value })} className={cn(INPUT, "tabular-nums")} />
          </div>
          <div>
            <label htmlFor="new-account-name" className="mb-1 block text-xs font-medium text-muted">Account name (English)</label>
            <input id="new-account-name" required maxLength={200} value={draft.accountName} onChange={(e) => setDraft({ ...draft, accountName: e.target.value })} className={INPUT} />
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" size="sm" disabled={pendingId === "new"}>Save</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="divide-y divide-line border-y border-line">
        {shown.length === 0 && <p className="py-6 text-center text-sm text-muted">No accounts match.</p>}
        {shown.map((account) => {
          const busy = pendingId === account.id;
          const editing = editingId === account.id;
          return (
            <div key={account.id} className={cn("py-3", ROW_HOVER)}>
              {editing ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); void save(account.id); }}
                  aria-label={`Edit ${account.accountNumber}`}
                  className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto]"
                >
                  <div>
                    <label htmlFor={`number-${account.id}`} className="mb-1 block text-xs font-medium text-muted">Account No</label>
                    <input id={`number-${account.id}`} required maxLength={32} value={edit.accountNumber} onChange={(e) => setEdit({ ...edit, accountNumber: e.target.value })} className={cn(INPUT, "tabular-nums")} />
                  </div>
                  <div>
                    <label htmlFor={`name-${account.id}`} className="mb-1 block text-xs font-medium text-muted">Account name (English)</label>
                    <input id={`name-${account.id}`} required maxLength={200} value={edit.accountName} onChange={(e) => setEdit({ ...edit, accountName: e.target.value })} className={INPUT} />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button type="submit" size="sm" disabled={busy}>Save</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="w-24 shrink-0 text-sm tabular-nums text-muted">{account.accountNumber}</span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-ink">{account.accountName}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {!account.active && <Badge tone="negative">Inactive</Badge>}
                    {account.uses > 0 && <Badge>{account.uses} in use</Badge>}
                    <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => { setEditingId(account.id); setEdit({ accountNumber: account.accountNumber, accountName: account.accountName }); setError(null); }}>
                      Edit
                    </Button>
                    <Button type="button" variant={account.active ? "secondary" : "ghost"} size="sm" disabled={busy} onClick={() => toggleActive(account)}>
                      {account.active ? "Deactivate" : "Reactivate"}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={busy || account.uses > 0}
                      title={account.uses > 0 ? "Has orders, forecasts or quotas — deactivate instead" : "Delete this account"}
                      onClick={() => remove(account)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
