"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Admin-only upload for the Tableau "Data for FOC" crosstab export — the
 * import endpoint itself enforces the admin gate; this control just doesn't
 * render for anyone else, matching praditww's decision that only importing
 * (not viewing) is admin-restricted. */
export function FocActualsImportControl() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/foc-actuals/import", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Import failed. Please try again.");
      setResult(
        `${body.created} created, ${body.updated} updated of ${body.total} row(s)` +
          (body.year ? ` (${body.year})` : "") +
          `. ${body.excludedTeam} row(s) excluded by team, ${body.excludedCategory} by category.`,
      );
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-line-strong bg-canvas p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">Import from Tableau (admin only)</p>
          <p className="text-xs text-muted">
            Upload the &quot;Data for FOC&quot; crosstab export. Re-uploading a file that
            overlaps a previous import updates those rows in place — nothing is duplicated.
          </p>
        </div>
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
          <span className="inline-flex cursor-pointer items-center rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark">
            {busy ? "Importing…" : "Upload CSV"}
          </span>
        </label>
      </div>
      {result && <p className="mt-2 text-xs text-positive">{result}</p>}
      {error && (
        <p role="alert" className="mt-2 text-xs text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
