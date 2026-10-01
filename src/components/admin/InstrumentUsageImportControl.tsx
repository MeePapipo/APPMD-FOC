"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseLabTable, parseSamplesPerRun, type UsageParse } from "@/lib/admin/instrumentUsageImport";
import { Button } from "@/components/ui";

type Preview = { fileName: string; parsed: UsageParse; labs: Record<string, string> };
type Result = {
  newRows: number; unchanged: number; changed: number; updated: number;
  newInstruments: { serial: string; systemClass: string; labName: string | null; linked: boolean }[];
  unlinked: { serial: string; systemClass: string; labName: string | null }[];
  coverage: string[]; windowMonths: number;
};

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
const describe = (months: string[]) => (months.length === 0 ? "no months" : months.length <= 3 ? months.map(monthLabel).join(", ") : `${monthLabel(months[0])} – ${monthLabel(months.at(-1)!)} (${months.length} months)`);
const read = async (file: File) => new Uint8Array(await file.arrayBuffer());

/**
 * Admin upload of the eLP SamplesPerRunTable (one month per file; run it once per
 * month). Runs and samples per instrument x assay feed each account's own TPB.
 * The optional SamplesPerRunAVGTable only matters for serial numbers the system
 * has not met yet: it names their laboratory so they can be linked to an account.
 * The file is summarised in the browser; rows already stored are skipped.
 */
export function InstrumentUsageImportControl() {
  const router = useRouter();
  const [usageFile, setUsageFile] = useState<File | null>(null);
  const [labFile, setLabFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"idle" | "reading" | "uploading">("idle");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [updateChanged, setUpdateChanged] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function readFiles() {
    if (!usageFile) return;
    setBusy("reading");
    setError(null);
    setResult(null);
    setPreview(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 30)); // let "Reading" paint before the parse blocks
      const parsed = parseSamplesPerRun(await read(usageFile));
      if (parsed.rows.length === 0) throw new Error("No usage rows found in this file.");
      const labs = labFile ? parseLabTable(await read(labFile)) : {};
      setPreview({ fileName: usageFile.name, parsed, labs });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read these files.");
    } finally {
      setBusy("idle");
    }
  }

  async function upload() {
    if (!preview) return;
    setBusy("uploading");
    setError(null);
    try {
      const res = await fetch("/api/admin/instrument-usage/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: preview.parsed.rows, labs: preview.labs, updateChanged }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Import failed. Please try again.");
      setResult(data as Result);
      setPreview(null);
      setUsageFile(null);
      setLabFile(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed. Please try again.");
    } finally {
      setBusy("idle");
    }
  }

  const fileButton = "inline-flex cursor-pointer items-center rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-canvas";

  return (
    <div className="mb-6 rounded-lg border border-line-strong bg-canvas p-3">
      <p className="text-sm font-medium text-ink">Import instrument usage (per-account TPB)</p>
      <p className="mt-1 max-w-3xl text-xs text-muted">
        Upload the eLP <em>SamplesPerRunTable</em> for one month. Repeat for each month: months already loaded are skipped, so files can overlap.
        Add the <em>SamplesPerRunAVGTable</em> only when the file has instruments the system has not seen, so it can name their laboratory.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className={fileButton}>
          <input type="file" accept=".csv,.txt" className="hidden" disabled={busy !== "idle"} onChange={(e) => { setUsageFile(e.target.files?.[0] ?? null); setPreview(null); }} />
          {usageFile ? usageFile.name : "Choose SamplesPerRunTable"}
        </label>
        <label className={fileButton}>
          <input type="file" accept=".csv,.txt" className="hidden" disabled={busy !== "idle"} onChange={(e) => { setLabFile(e.target.files?.[0] ?? null); setPreview(null); }} />
          {labFile ? labFile.name : "Optional: AVG table"}
        </label>
        <Button type="button" size="sm" disabled={!usageFile || busy !== "idle"} onClick={() => void readFiles()}>
          {busy === "reading" ? "Reading…" : "Read file"}
        </Button>
      </div>

      {preview && (
        <div className="mt-3 rounded-lg border border-line bg-surface p-3">
          <p className="text-sm text-ink">
            <strong>{preview.fileName}</strong> covers {describe(preview.parsed.months)}: {preview.parsed.instruments} instrument(s), {preview.parsed.rows.length} instrument × assay row(s).
          </p>
          {Object.keys(preview.parsed.unknownTests).length > 0 && (
            <p className="mt-1 text-xs text-warning">
              Not counted (no matching assay): {Object.entries(preview.parsed.unknownTests).map(([t, n]) => `${t} (${n})`).join(", ")}.
            </p>
          )}
          <label className="mt-2 flex items-center gap-2 text-xs text-ink">
            <input type="checkbox" checked={updateChanged} onChange={(e) => setUpdateChanged(e.target.checked)} className="h-4 w-4 rounded border-line-strong accent-brand" disabled={busy !== "idle"} />
            Also overwrite stored figures that differ (eLP revised a month). Unticked, they are only counted.
          </label>
          <div className="mt-3 flex items-center gap-2">
            <Button type="button" size="sm" disabled={busy !== "idle"} onClick={() => void upload()}>{busy === "uploading" ? "Importing…" : "Import"}</Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy !== "idle"} onClick={() => setPreview(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {result && (
        <div role="status" className="mt-3 text-xs">
          <p className="text-positive">
            {result.newRows.toLocaleString()} new row(s) added, {result.unchanged.toLocaleString()} already there
            {result.changed ? `, ${result.changed} differ from what is stored (${updateChanged ? `${result.updated} updated` : "left as they were"})` : ""}.
            Usage now covers {describe(result.coverage)}; each account&apos;s TPB uses the latest {result.windowMonths} months.
          </p>
          {result.newInstruments.length > 0 && (
            <p className="mt-1 text-muted">New instruments: {result.newInstruments.map((i) => `${i.serial} ${i.systemClass}${i.labName ? ` (${i.labName})` : ""}${i.linked ? "" : " – not linked"}`).join("; ")}.</p>
          )}
          {result.unlinked.length > 0 && (
            <p className="mt-1 text-warning">
              {result.unlinked.length} instrument(s) have no account yet, so their usage is not used for any account&apos;s TPB. Link them on the Instruments tab.
            </p>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-negative">{error}</p>}
    </div>
  );
}
