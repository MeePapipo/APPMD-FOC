"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ROW_HOVER } from "@/lib/hoverStyles";
import type { NationalTpbRow } from "@/lib/admin/nationalTpb";

type ProposalRow = NationalTpbRow & { current: { tpb: number; confidence: string; monthsWithData: string | null } | null };
type Proposal = {
  months: string[];
  available: number;
  rows: ProposalRow[];
  noUsage: { system: string; code: string; tpb: number }[];
  notInMaster: string[];
};

const SYSTEM_LABELS: Record<NationalTpbRow["system"], string> = { S6800: "cobas 6800/8800", S5800: "cobas 5800" };
/** A change bigger than this is highlighted for a second look before saving. */
const BIG_CHANGE = 0.2;

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
const keyOf = (r: { system: string; code: string }) => `${r.system}|${r.code}`;

/**
 * Proposes the national TPB table from the imported eLP usage (all instruments
 * in Thailand, pooled samples / runs) next to the stored values. Nothing is
 * saved until the admin reviews the table and saves the ticked rows.
 */
export function NationalTpbFromUsage() {
  const router = useRouter();
  const [monthsWanted, setMonthsWanted] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"idle" | "loading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function calculate() {
    setBusy("loading");
    setError(null);
    setSaved(null);
    try {
      const res = await fetch(`/api/admin/tpb/from-usage${monthsWanted ? `?months=${monthsWanted}` : ""}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not calculate. Please try again.");
      const p = data as Proposal;
      setProposal(p);
      setMonthsWanted(String(p.months.length));
      setPicked(new Set(p.rows.map(keyOf)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not calculate. Please try again.");
    } finally {
      setBusy("idle");
    }
  }

  async function save() {
    if (!proposal) return;
    const span = `${monthLabel(proposal.months[0])} – ${monthLabel(proposal.months.at(-1)!)}`;
    const rows = proposal.rows.filter((r) => picked.has(keyOf(r)));
    setBusy("saving");
    setError(null);
    try {
      const res = await fetch("/api/admin/tpb", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            method: `Imported eLP SamplesPerRun usage, ${span} (${proposal.months.length} months), Thailand, all instruments. TPB = total samples / total runs per system x assay; c6800+c8800 pooled, c4800 excluded.`,
          },
          entries: rows.map((r) => ({
            action: "upsert",
            system: r.system,
            code: r.code,
            tpb: r.tpb,
            confidence: r.confidence,
            monthsWithData: r.monthsWithData,
            totalRuns: r.totalRuns,
            totalSamples: r.totalSamples,
            notes: `From imported eLP usage, ${span}, ${r.instruments} instrument(s).`,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Save failed. Please try again.");
      setSaved(`${rows.length} TPB value(s) saved. The Calculator and Dashboard use them from now on.`);
      setProposal(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed. Please try again.");
    } finally {
      setBusy("idle");
    }
  }

  function toggle(key: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="mb-6 rounded-lg border border-line-strong bg-canvas p-3">
      <p className="text-sm font-medium text-ink">National TPB from imported usage</p>
      <p className="mt-1 max-w-3xl text-xs text-muted">
        Pools every instrument in the imported usage (linked to an account or not) over the latest months:
        TPB = total samples / total runs per system × assay. cobas 6800 and 8800 are pooled; cobas 4800 is left out (its quantities follow its own formula).
        Review the table, untick anything you want to keep as it is, then save. Import complete months only.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-muted">
          Latest months
          <input
            type="number"
            min={1}
            max={proposal?.available ?? 24}
            placeholder="all (max 12)"
            value={monthsWanted}
            onChange={(e) => setMonthsWanted(e.target.value)}
            className="mt-1 block w-32 rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm"
          />
        </label>
        <Button type="button" size="sm" disabled={busy !== "idle"} onClick={() => void calculate()}>
          {busy === "loading" ? "Calculating…" : proposal ? "Recalculate" : "Calculate"}
        </Button>
      </div>

      {proposal && (
        <div className="mt-3 rounded-lg border border-line bg-surface p-3">
          <p className="text-sm text-ink">
            {monthLabel(proposal.months[0])} – {monthLabel(proposal.months.at(-1)!)} ({proposal.months.length} of {proposal.available} imported month(s)).
            Rows changing by more than {BIG_CHANGE * 100}% are highlighted.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="bg-brand-tint text-xs text-muted">
                <tr className="border-y border-line text-left">
                  <th scope="col" className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={picked.size === proposal.rows.length}
                      onChange={(e) => setPicked(e.target.checked ? new Set(proposal.rows.map(keyOf)) : new Set())}
                      className="h-4 w-4 rounded border-line-strong accent-brand"
                    />
                  </th>
                  <th scope="col" className="px-3 py-2">System / Code</th>
                  <th scope="col" className="px-3 py-2 text-right">Current TPB</th>
                  <th scope="col" className="px-3 py-2 text-right">New TPB</th>
                  <th scope="col" className="px-3 py-2 text-right">Change</th>
                  <th scope="col" className="px-3 py-2 text-right">Runs</th>
                  <th scope="col" className="px-3 py-2 text-right">Samples</th>
                  <th scope="col" className="px-3 py-2">Months</th>
                  <th scope="col" className="px-3 py-2 text-right">Instruments</th>
                  <th scope="col" className="px-3 py-2">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {proposal.rows.map((r) => {
                  const key = keyOf(r);
                  const change = r.current ? (r.tpb - r.current.tpb) / r.current.tpb : null;
                  const big = change === null || Math.abs(change) > BIG_CHANGE;
                  return (
                    <tr key={key} className={cn("border-b border-line", ROW_HOVER, big && "bg-warning-tint")}>
                      <td className="px-3 py-2">
                        <input type="checkbox" aria-label={`Save ${r.code} ${SYSTEM_LABELS[r.system]}`} checked={picked.has(key)} onChange={() => toggle(key)} className="h-4 w-4 rounded border-line-strong accent-brand" />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-ink">{r.code}</div>
                        <div className="text-xs text-muted">{SYSTEM_LABELS[r.system]}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{r.current ? r.current.tpb : "none"}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums text-ink">{r.tpb}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{change === null ? "new" : `${change > 0 ? "+" : ""}${Math.round(change * 100)}%`}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.totalRuns.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.totalSamples.toLocaleString()}</td>
                      <td className="px-3 py-2">{r.monthsWithData}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.instruments}</td>
                      <td className={cn("px-3 py-2", r.confidence === "low" && "text-warning")}>{r.confidence}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {proposal.noUsage.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              No usage in these months, kept as stored: {proposal.noUsage.map((e) => `${e.code} (${e.system === "S5800" ? "5800" : "6800/8800"}, ${e.tpb})`).join(", ")}.
            </p>
          )}
          {proposal.notInMaster.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              Usage with no active master assay on that system, not proposed: {proposal.notInMaster.map((k) => k.replace("S5800|", "5800 ").replace("S6800|", "6800/8800 ")).join(", ")}.
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <Button type="button" size="sm" disabled={busy !== "idle" || picked.size === 0} onClick={() => void save()}>
              {busy === "saving" ? "Saving…" : `Save ${picked.size} selected`}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy !== "idle"} onClick={() => setProposal(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {saved && <p role="status" className="mt-2 text-xs text-positive">{saved}</p>}
      {error && <p role="alert" className="mt-2 text-xs text-negative">{error}</p>}
    </div>
  );
}
