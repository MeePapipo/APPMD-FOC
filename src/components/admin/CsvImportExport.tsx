"use client";

import { useState } from "react";

/**
 * Export-then-edit-then-reimport for a master catalogue. Reloads the page on
 * a clean import (page state is otherwise a server-fetched snapshot passed
 * once to a client table — reconciling a bulk import row-by-row into that
 * local state isn't worth it when a full reload is one line and instant).
 */
export function CsvImportExport({
  label,
  exportHref,
  importUrl,
}: {
  label: string;
  exportHref: string;
  importUrl: string;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    setRowErrors([]);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(importUrl, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Import failed. Please try again.");
      const errors: string[] = body.rowErrors ?? [];
      setResult(`${body.created} created, ${body.updated} updated of ${body.total} row(s).`);
      setRowErrors(errors);
      if (errors.length === 0) setTimeout(() => window.location.reload(), 1200);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-line-strong bg-canvas p-3">
      <div className="flex flex-wrap items-center gap-3">
        <a href={exportHref} className="text-sm font-medium text-brand hover:underline">
          Export {label} CSV
        </a>
        <span className="text-line">·</span>
        <label>
          <input
            type="file"
            accept=".csv"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void onFile(file);
            }}
          />
          <span className="inline-flex cursor-pointer items-center rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas">
            {busy ? "Importing…" : `Import ${label} CSV`}
          </span>
        </label>
        {result && (
          <span className="text-xs text-positive">
            {result}
            {rowErrors.length === 0 && " — reloading…"}
          </span>
        )}
        {error && <span className="text-xs text-negative">{error}</span>}
      </div>
      {rowErrors.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-xs text-negative">
          {rowErrors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
