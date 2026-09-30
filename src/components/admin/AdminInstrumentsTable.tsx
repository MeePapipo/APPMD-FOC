"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ROW_HOVER } from "@/lib/hoverStyles";

type Account = { id: string; accountNumber: string; accountName: string };
type InstrumentRow = {
  id: string;
  serial: string;
  systemClass: string;
  labName: string | null;
  account: Account | null;
  months: string[];
};

const label = (a: Account) => `${a.accountNumber} — ${a.accountName}`;
const INPUT = "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none";

export function AdminInstrumentsTable({ instruments, accounts }: { instruments: InstrumentRow[]; accounts: Account[] }) {
  const [rows, setRows] = useState(instruments);
  const [query, setQuery] = useState("");
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const byLabel = new Map(accounts.map((a) => [label(a), a]));
  const needle = query.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (!unlinkedOnly || !r.account) &&
      (!needle || [r.serial, r.systemClass, r.labName ?? "", r.account ? label(r.account) : ""].some((t) => t.toLowerCase().includes(needle))),
  );

  async function link(row: InstrumentRow, account: Account | null) {
    if ((row.account?.id ?? null) === (account?.id ?? null)) return;
    setPendingId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/instruments/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account?.id ?? null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Update failed. Please try again.");
      setRows((previous) => previous.map((r) => (r.id === row.id ? { ...r, account: data.instrument.account } : r)));
      setDrafts(({ [row.id]: _omit, ...rest }) => (void _omit, rest));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  function onInput(row: InstrumentRow, value: string) {
    setDrafts((d) => ({ ...d, [row.id]: value }));
    if (value === "") void link(row, null);
    else if (byLabel.has(value)) void link(row, byLabel.get(value)!);
  }

  return (
    <div>
      <datalist id="instrument-accounts">
        {accounts.map((a) => (
          <option key={a.id} value={label(a)} />
        ))}
      </datalist>
      {error && <p role="alert" className="mb-4 rounded-lg border border-negative/30 bg-negative-tint px-3 py-2 text-sm text-negative">{error}</p>}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <label htmlFor="instrument-search" className="sr-only">Search instruments</label>
          <input id="instrument-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search serial, lab or account" className={INPUT} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={unlinkedOnly} onChange={(e) => setUnlinkedOnly(e.target.checked)} className="h-4 w-4 rounded border-line-strong accent-brand" />
          Not linked to an account only
        </label>
        <span className="text-sm text-muted">{shown.length} of {rows.length} instruments</span>
      </div>

      <div className="divide-y divide-line border-y border-line">
        {shown.length === 0 && <p className="py-6 text-center text-sm text-muted">No instruments match.</p>}
        {shown.map((row) => (
          <div key={row.id} className={cn("grid gap-3 py-3 md:grid-cols-[6rem_5rem_minmax(0,1fr)_minmax(0,1.3fr)]", ROW_HOVER)}>
            <div className="text-sm tabular-nums text-ink">{row.serial}</div>
            <div className="text-sm text-muted">{row.systemClass}</div>
            <div className="min-w-0 text-sm">
              <span className="text-ink">{row.labName ?? <span className="text-muted">(no lab name)</span>}</span>
              <span className="mt-0.5 block text-xs text-muted">{row.months.length ? `usage: ${row.months.join(", ")}` : "no usage loaded"}</span>
            </div>
            <div className="min-w-0">
              <label htmlFor={`acc-${row.id}`} className="sr-only">Account for {row.serial} {row.systemClass}</label>
              <input
                id={`acc-${row.id}`}
                list="instrument-accounts"
                value={drafts[row.id] ?? (row.account ? label(row.account) : "")}
                disabled={pendingId === row.id}
                placeholder="Type an account name or number"
                onChange={(e) => onInput(row, e.target.value)}
                className={INPUT}
              />
              {!row.account && <span className="mt-1 inline-block"><Badge tone="warning">Not linked</Badge></span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
