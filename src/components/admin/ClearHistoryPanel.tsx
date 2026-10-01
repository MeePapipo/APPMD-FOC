"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

type Kind = "all" | "user" | "account" | "before";
const selectClass = "rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm focus:outline-brand";

/**
 * Admin-only: hide submitted orders from Order History (they are marked VOID, never deleted) or, in the
 * cleared view, bring them back. The scope is chosen here; the count shown comes from a dry run so the
 * confirmation says exactly how many orders it touches.
 */
export function ClearHistoryPanel({
  mode,
  users,
  accounts,
}: {
  mode: "clear" | "restore";
  users: string[];
  accounts: { accountNumber: string; accountName: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("all");
  const [email, setEmail] = useState(users[0] ?? "");
  const [accountNumber, setAccountNumber] = useState(accounts[0]?.accountNumber ?? "");
  const [date, setDate] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scope =
    kind === "all" ? { kind } : kind === "user" ? { kind, email } : kind === "account" ? { kind, accountNumber } : date ? { kind, date } : null;
  const scopeKey = JSON.stringify(scope);
  const verb = mode === "clear" ? "Clear" : "Restore";

  useEffect(() => {
    if (!open || !scope) return;
    let cancelled = false;
    fetch("/api/admin/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, action: mode, dryRun: true }),
    })
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setCount(typeof json.count === "number" ? json.count : null); })
      .catch(() => { if (!cancelled) setCount(null); });
    return () => { cancelled = true; };
    // `scope` is rebuilt every render; scopeKey is its value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scopeKey, mode]);

  async function run() {
    if (!scope || !count) return;
    const text =
      mode === "clear"
        ? `Hide ${count} order${count === 1 ? "" : "s"} from Order History? They are not deleted: you can restore them from "Show cleared". Accounts with orders stay protected from deletion.`
        : `Restore ${count} order${count === 1 ? "" : "s"} to Order History?`;
    if (!window.confirm(text)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, action: mode }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Failed. Please try again.");
      setOpen(false);
      setCount(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>{verb} history…</Button>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-3 text-sm">
      <select aria-label="Scope" value={kind} onChange={(e) => { setKind(e.target.value as Kind); setCount(null); }} className={selectClass}>
        <option value="all">All orders</option>
        <option value="user">One user</option>
        <option value="account">One account</option>
        <option value="before">Before a date</option>
      </select>
      {kind === "user" && (
        <select aria-label="User" value={email} onChange={(e) => setEmail(e.target.value)} className={selectClass}>
          {users.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      )}
      {kind === "account" && (
        <select aria-label="Account" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className={selectClass}>
          {accounts.map((a) => <option key={a.accountNumber} value={a.accountNumber}>{a.accountName} ({a.accountNumber})</option>)}
        </select>
      )}
      {kind === "before" && <input type="date" aria-label="Before date" value={date} onChange={(e) => setDate(e.target.value)} className={selectClass} />}
      <span className="text-xs text-muted" aria-live="polite">{scope ? (count === null ? "Counting…" : `${count} order${count === 1 ? "" : "s"}`) : "Pick a date"}</span>
      <Button type="button" size="sm" variant={mode === "clear" ? "danger" : "primary"} disabled={busy || !count} onClick={run}>{busy ? "Working…" : verb}</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => { setOpen(false); setError(null); }}>Cancel</Button>
      {error && <p role="alert" className="w-full text-sm text-negative">{error}</p>}
    </div>
  );
}
