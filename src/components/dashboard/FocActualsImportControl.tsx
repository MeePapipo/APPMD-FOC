"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseFocActualsCsv, type ParseResult } from "@/lib/dashboard/focActualsImport";
import { describePeriods, periodLabel } from "@/lib/dashboard/period";
import type { DataThrough } from "@/lib/dashboard/dataThrough";
import { Button } from "@/components/ui";

const CHUNK_ROWS = 3000;

type Preview = { fileName: string; parsed: ParseResult };
type Totals = { fresh: number; unchanged: number; relabelled: number; changed: number; updated: number };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Import failed. Please try again.");
  return data as T;
}

/**
 * Admin-only upload of the Tableau "Data for FOC" crosstab export. The file is
 * read in the browser (it can be ~30 MB and covers every product line); only the
 * rows that belong to the configured product lines are sent, in chunks. Rows
 * already stored are skipped, so the same month can be uploaded again or two
 * pulls can overlap: only new rows are added. The import endpoint enforces the
 * admin gate; this control just isn't rendered for anyone else.
 */
export function FocActualsImportControl({ allowedProductLines, dataThrough }: { allowedProductLines: string[]; dataThrough: DataThrough }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "reading" | "preview" | "uploading">("idle");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [updateChanged, setUpdateChanged] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = phase === "reading" || phase === "uploading";

  async function onFile(file: File) {
    setPhase("reading");
    setError(null);
    setResult(null);
    setPreview(null);
    try {
      // Let the "Reading" state paint before the synchronous parse blocks the page.
      await new Promise((resolve) => setTimeout(resolve, 30));
      const parsed = parseFocActualsCsv(new Uint8Array(await file.arrayBuffer()), { allowedProductLines });
      if (parsed.rows.length === 0) throw new Error(`No rows for ${allowedProductLines.join(", ")} in this file.`);
      setPreview({ fileName: file.name, parsed });
      setPhase("preview");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read this file.");
      setPhase("idle");
    }
  }

  async function upload() {
    if (!preview) return;
    const { rows, meta } = preview.parsed;
    setPhase("uploading");
    setError(null);
    try {
      const totals: Totals = { fresh: 0, unchanged: 0, relabelled: 0, changed: 0, updated: 0 };
      const chunks = Math.ceil(rows.length / CHUNK_ROWS);
      for (let i = 0; i < chunks; i++) {
        setProgress(`Uploading part ${i + 1} of ${chunks}…`);
        const r = await postJson<Totals>("/api/admin/foc-actuals/import", { rows: rows.slice(i * CHUNK_ROWS, (i + 1) * CHUNK_ROWS), updateChanged });
        totals.fresh += r.fresh; totals.unchanged += r.unchanged; totals.relabelled += r.relabelled; totals.changed += r.changed; totals.updated += r.updated;
      }
      const done = await postJson<{ dataThrough: DataThrough }>("/api/admin/foc-actuals/import/complete", {
        periods: meta.periods, ...totals,
        excludedTeam: meta.excludedTeam, excludedCategory: meta.excludedCategory, excludedProductLine: meta.excludedProductLine,
        fileName: preview.fileName,
      });
      const through = done.dataThrough.latest ? periodLabel(done.dataThrough.latest.year, done.dataThrough.latest.month) : "—";
      setResult(
        `${describePeriods(meta.periods)} read. ${totals.fresh.toLocaleString()} new row(s) added, ${totals.unchanged.toLocaleString()} already there` +
          (totals.relabelled ? `, ${totals.relabelled.toLocaleString()} had only their team/rep label refreshed` : "") +
          (totals.changed ? `, ${totals.changed.toLocaleString()} differ from what is stored (${updateChanged ? `${totals.updated.toLocaleString()} updated` : "left as they were"})` : "") +
          `. Data now runs through ${through}.`,
      );
      setPreview(null);
      setPhase("idle");
      router.refresh();
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : "Import failed."} Rows sent before the failure are already saved; uploading the same file again continues where it stopped.`);
      setPhase("preview");
    } finally {
      setProgress("");
    }
  }

  const current = dataThrough.latest ? periodLabel(dataThrough.latest.year, dataThrough.latest.month) : null;

  return (
    <div className="mb-6 rounded-lg border border-line-strong bg-canvas p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">Import from Tableau (admin only)</p>
          <p className="text-xs text-muted">
            Upload the &quot;Data for FOC&quot; crosstab export (one month, one or two years, any product lines). Only {allowedProductLines.join(", ")} rows are kept; rows already stored are skipped, so overlapping months are safe.
            {current ? ` Data currently runs through ${current}.` : " No data loaded yet."}
          </p>
        </div>
        <label>
          <input
            type="file"
            accept=".csv,.txt"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void onFile(file);
            }}
          />
          <span className="inline-flex cursor-pointer items-center rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark">
            {phase === "reading" ? "Reading file…" : phase === "uploading" ? "Importing…" : "Choose CSV"}
          </span>
        </label>
      </div>

      {preview && (
        <div className="mt-3 rounded-lg border border-line bg-surface p-3">
          <p className="text-sm text-ink">
            <strong>{preview.fileName}</strong> covers {describePeriods(preview.parsed.meta.periods)}: {preview.parsed.rows.length.toLocaleString()} row(s) kept.
          </p>
          <p className="mt-1 text-xs text-muted">
            Left out: {preview.parsed.meta.excludedProductLine.toLocaleString()} other product line, {preview.parsed.meta.excludedTeam.toLocaleString()} by team, {preview.parsed.meta.excludedCategory.toLocaleString()} by category.
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs text-ink">
            <input type="checkbox" checked={updateChanged} onChange={(e) => setUpdateChanged(e.target.checked)} className="h-4 w-4 rounded border-line-strong accent-brand" disabled={busy} />
            Also overwrite stored rows whose figures differ (Tableau revised them). Unticked, they are only counted.
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => void upload()} disabled={busy}>{phase === "uploading" ? progress || "Importing…" : "Import"}</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setPreview(null); setPhase("idle"); }} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}

      {result && <p role="status" className="mt-2 text-xs text-positive">{result}</p>}
      {error && <p role="alert" className="mt-2 text-xs text-negative">{error}</p>}
    </div>
  );
}
