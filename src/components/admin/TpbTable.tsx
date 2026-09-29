"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ROW_HOVER } from "@/lib/hoverStyles";

type TpbSystem = "S6800" | "S5800";

export type TpbEntryRow = {
  id: string;
  system: TpbSystem;
  code: string;
  tpb: number;
  confidence: string;
  monthsWithData: string | null;
  totalRuns: number | null;
  totalSamples: number | null;
  notes: string | null;
};

export type TpbSettingsData = {
  floor6800: number;
  floor5800: number;
  method: string | null;
} | null;

export type AssayOption = { system: TpbSystem | "S4800"; code: string; description: string };

const SYSTEM_LABELS: Record<TpbSystem, string> = { S6800: "cobas 6800/8800", S5800: "cobas 5800" };

type EditableFields = Pick<TpbEntryRow, "tpb" | "confidence" | "monthsWithData" | "totalRuns" | "totalSamples" | "notes">;

function editableOf(row: TpbEntryRow): EditableFields {
  const { tpb, confidence, monthsWithData, totalRuns, totalSamples, notes } = row;
  return { tpb, confidence, monthsWithData, totalRuns, totalSamples, notes };
}

export function TpbTable({
  initialEntries,
  initialSettings,
  assays,
}: {
  initialEntries: TpbEntryRow[];
  initialSettings: TpbSettingsData;
  assays: AssayOption[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [original, setOriginal] = useState(() => new Map(initialEntries.map((e) => [e.id, editableOf(e)])));
  const [floor6800, setFloor6800] = useState(initialSettings?.floor6800?.toString() ?? "24");
  const [floor5800, setFloor5800] = useState(initialSettings?.floor5800?.toString() ?? "6");
  const [method, setMethod] = useState(initialSettings?.method ?? "");
  const [settingsBaseline, setSettingsBaseline] = useState({
    floor6800: initialSettings?.floor6800?.toString() ?? "24",
    floor5800: initialSettings?.floor5800?.toString() ?? "6",
    method: initialSettings?.method ?? "",
  });
  const [addSystem, setAddSystem] = useState<TpbSystem>("S6800");
  const [addCode, setAddCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importRowErrors, setImportRowErrors] = useState<string[]>([]);

  const settingsDirty = floor6800 !== settingsBaseline.floor6800 || floor5800 !== settingsBaseline.floor5800 || method !== settingsBaseline.method;
  const dirtyIds = entries.filter((e) => {
    const base = original.get(e.id);
    return base && JSON.stringify(base) !== JSON.stringify(editableOf(e));
  });

  function patchRow(id: string, patch: Partial<EditableFields>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function codesFor(system: TpbSystem) {
    const used = new Set(entries.filter((e) => e.system === system).map((e) => e.code));
    return assays.filter((a) => a.system === system && !used.has(a.code));
  }

  async function saveChanges() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (settingsDirty) {
        body.settings = { floor6800: Number(floor6800), floor5800: Number(floor5800), method: method.trim() || null };
      }
      if (dirtyIds.length > 0) {
        body.entries = dirtyIds.map((e) => ({
          action: "upsert",
          system: e.system,
          code: e.code,
          tpb: e.tpb,
          confidence: e.confidence,
          monthsWithData: e.monthsWithData,
          totalRuns: e.totalRuns,
          totalSamples: e.totalSamples,
          notes: e.notes,
        }));
      }
      const response = await fetch("/api/admin/tpb", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Save failed. Please try again.");
      setEntries(data.entries);
      setOriginal(new Map((data.entries as TpbEntryRow[]).map((e) => [e.id, editableOf(e)])));
      setSettingsBaseline({
        floor6800: data.settings?.floor6800?.toString() ?? floor6800,
        floor5800: data.settings?.floor5800?.toString() ?? floor5800,
        method: data.settings?.method ?? method,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function addEntry() {
    if (!addCode) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/tpb", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [{ action: "upsert", system: addSystem, code: addCode, tpb: 24, confidence: "normal" }],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Add failed. Please try again.");
      setEntries(data.entries);
      setOriginal(new Map((data.entries as TpbEntryRow[]).map((e) => [e.id, editableOf(e)])));
      setAddCode("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Add failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File) {
    setBusy(true);
    setError(null);
    setImportResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/admin/tpb/import", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Import failed. Please try again.");
      setEntries(data.entries);
      setOriginal(new Map((data.entries as TpbEntryRow[]).map((e) => [e.id, editableOf(e)])));
      setImportResult(
        `Imported ${data.imported} row(s), ${data.changed} changed.` +
          (data.rowErrors?.length ? ` ${data.rowErrors.length} row(s) skipped — see below.` : ""),
      );
      setImportRowErrors(data.rowErrors ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(id: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/tpb", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: [{ action: "delete", id }] }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Delete failed. Please try again.");
      setEntries(data.entries);
      setOriginal(new Map((data.entries as TpbEntryRow[]).map((e) => [e.id, editableOf(e)])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delete failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-negative/30 bg-negative-tint px-3 py-2 text-sm text-negative">
          {error}
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-line-strong bg-canvas p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">Import from Excel</p>
          <p className="text-xs text-muted">
            Upload the &quot;TPB by Assay&quot; export straight from eLP — matched by column name, so
            System / Assay Code / TPB / Months with data / Total Runs / Total Samples /
            Confidence / Notes can be in any order. Rows upsert by system + code.
          </p>
          {importResult && <p className="mt-1 text-xs text-positive">{importResult}</p>}
          {importRowErrors.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-xs text-negative">
              {importRowErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
        <label className="shrink-0">
          <input
            type="file"
            accept=".xlsx"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void importFile(file);
            }}
          />
          <span className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark">
            {busy ? "Importing…" : "Upload .xlsx"}
          </span>
        </label>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-line-strong bg-canvas p-4 sm:grid-cols-4">
        <label className="text-xs font-medium text-muted">
          Floor — cobas 6800/8800
          <input type="number" min={1} value={floor6800} onChange={(e) => setFloor6800(e.target.value)} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs font-medium text-muted">
          Floor — cobas 5800
          <input type="number" min={1} value={floor5800} onChange={(e) => setFloor5800(e.target.value)} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label className="sm:col-span-2 text-xs font-medium text-muted">
          Methodology note
          <input value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-muted">
          Add entry — system
          <select value={addSystem} onChange={(e) => { setAddSystem(e.target.value as TpbSystem); setAddCode(""); }} className="mt-1 block rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm">
            {(Object.keys(SYSTEM_LABELS) as TpbSystem[]).map((s) => (
              <option key={s} value={s}>{SYSTEM_LABELS[s]}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-muted">
          Assay code
          <select value={addCode} onChange={(e) => setAddCode(e.target.value)} className="mt-1 block rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm">
            <option value="">Select…</option>
            {codesFor(addSystem).map((a) => (
              <option key={a.code} value={a.code}>{a.code}</option>
            ))}
          </select>
        </label>
        <Button type="button" variant="secondary" size="sm" onClick={addEntry} disabled={!addCode || busy}>
          Add entry
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-brand-tint text-xs text-muted">
            <tr className="border-y border-line text-left">
              <th scope="col" className="px-3 py-3">System / Code</th>
              <th scope="col" className="px-3 py-3 text-right">TPB</th>
              <th scope="col" className="px-3 py-3">Confidence</th>
              <th scope="col" className="px-3 py-3">Months of data</th>
              <th scope="col" className="px-3 py-3 text-right">Total runs</th>
              <th scope="col" className="px-3 py-3 text-right">Total samples</th>
              <th scope="col" className="px-3 py-3">Notes</th>
              <th scope="col" className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {entries.map((row) => {
              const desc = assays.find((a) => a.system === row.system && a.code === row.code)?.description;
              return (
                <tr key={row.id} className={cn("border-b border-line align-top", ROW_HOVER)}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-ink">{row.code}</div>
                    <div className="text-xs text-muted">{SYSTEM_LABELS[row.system]}{desc ? ` · ${desc}` : ""}</div>
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min={1} value={row.tpb} onChange={(e) => patchRow(row.id, { tpb: Number(e.target.value) })} className="w-20 rounded-lg border border-line-strong bg-surface px-2 py-1 text-right text-sm" />
                  </td>
                  <td className="px-3 py-2">
                    <select value={row.confidence} onChange={(e) => patchRow(row.id, { confidence: e.target.value })} className="rounded-lg border border-line-strong bg-surface px-2 py-1 text-sm">
                      <option value="normal">normal</option>
                      <option value="low">low</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input value={row.monthsWithData ?? ""} onChange={(e) => patchRow(row.id, { monthsWithData: e.target.value || null })} className="w-24 rounded-lg border border-line-strong bg-surface px-2 py-1 text-sm" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min={0} value={row.totalRuns ?? ""} onChange={(e) => patchRow(row.id, { totalRuns: e.target.value === "" ? null : Number(e.target.value) })} className="w-20 rounded-lg border border-line-strong bg-surface px-2 py-1 text-right text-sm" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min={0} value={row.totalSamples ?? ""} onChange={(e) => patchRow(row.id, { totalSamples: e.target.value === "" ? null : Number(e.target.value) })} className="w-24 rounded-lg border border-line-strong bg-surface px-2 py-1 text-right text-sm" />
                  </td>
                  <td className="px-3 py-2">
                    <input value={row.notes ?? ""} onChange={(e) => patchRow(row.id, { notes: e.target.value || null })} className="w-40 rounded-lg border border-line-strong bg-surface px-2 py-1 text-sm" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button type="button" variant="ghost" size="sm" className="text-negative" onClick={() => deleteEntry(row.id)} disabled={busy}>
                      Delete
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button type="button" onClick={saveChanges} disabled={busy || (!settingsDirty && dirtyIds.length === 0)}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
        {(settingsDirty || dirtyIds.length > 0) && (
          <p className="text-xs text-muted">
            {dirtyIds.length > 0 ? `${dirtyIds.length} entry row(s) changed` : ""}
            {settingsDirty && dirtyIds.length > 0 ? " · " : ""}
            {settingsDirty ? "floor/method settings changed" : ""}
          </p>
        )}
      </div>
    </div>
  );
}
