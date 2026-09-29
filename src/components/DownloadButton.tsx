"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";

/**
 * Downloads a file from an API route, surfacing failures as text.
 *
 * A plain `<a href download>` cannot do this: the browser commits to saving
 * whatever comes back before anyone checks the status, so a JSON error body
 * lands in the downloads folder as a file named after the route ("pdf.json")
 * and the user is told only that the site "wasn't available". Fetching first
 * means an error is read and shown where it was triggered.
 */
export function DownloadButton({ href, label, children }: {
  href: string;
  label: string;
  children?: ReactNode;
}) {
  const [state, setState] = useState<"idle" | "working">("idle");
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  async function download() {
    if (state === "working") return;
    setState("working");
    setError(null);
    try {
      const response = await fetch(href);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Download failed (${response.status}).`);
      }
      const blob = await response.blob();
      // Filename comes from the server's Content-Disposition; the anchor's own
      // download attribute is only a fallback for when that header is absent.
      const suggested = /filename="([^"]+)"/.exec(
        response.headers.get("content-disposition") ?? "",
      )?.[1];

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = suggested ?? "";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Revoking immediately can cancel the save in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Download failed.");
    } finally {
      setState("idle");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void download()}
        disabled={state === "working"}
        aria-describedby={error ? errorId : undefined}
        className="inline-flex items-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-sm font-medium text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
      >
        {children}
        {state === "working" ? "Preparing…" : label}
      </button>
      {error && (
        <p id={errorId} role="alert" className="max-w-xs text-right text-xs text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
