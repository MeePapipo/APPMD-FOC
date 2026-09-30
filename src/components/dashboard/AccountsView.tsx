"use client";

import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { Badge } from "@/components/ui";
import { DownloadButton } from "@/components/DownloadButton";
import { cn } from "@/lib/cn";
import { ROW_HOVER } from "@/lib/hoverStyles";
import type { Measure } from "@/lib/dashboard/focAccountMatrix";
import { AccountDrilldown } from "./AccountDrilldown";
import { AccountMatrixPanel } from "./AccountMatrixPanel";
import { RatioBadge } from "./RatioBadge";

export type AccountListRow = {
  accountName: string;
  revenue: number;
  totalCost: number;
  ratio: number;
  overCount: number; // items over quota beyond the alert thresholds (cumulative)
  overCost: number; // their excess value
};

const money = (n: number) => Math.round(n).toLocaleString();

/** "PICHIT HOSPITAL  (0052027798)" -> name and number, for a two-line header. */
function splitName(full: string): { label: string; number: string | null } {
  const m = full.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  return m ? { label: m[1], number: m[2] } : { label: full, number: null };
}

/**
 * Accordion of accounts (already filtered and sorted by the server: over-quota
 * excess first, then total cost). Opening a row mounts its matrix, which
 * fetches on mount; closing unmounts it.
 */
export function AccountsView({
  rows,
  year,
  measure,
  exportQuery,
  openByDefault,
}: {
  rows: AccountListRow[];
  year: number;
  measure: Measure;
  /** The page's filter params, forwarded to the all-accounts CSV. */
  exportQuery: string;
  openByDefault: boolean;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(openByDefault ? rows.slice(0, 1).map((r) => r.accountName) : []));
  const [detail, setDetail] = useState<string | null>(null);

  function toggle(name: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs text-muted">
          Sorted by over-quota excess, then total cost. Expand an account for its {year} product-by-month table.
        </p>
        <DownloadButton href={`/api/dashboard/export${exportQuery ? `?${exportQuery}` : ""}`} label="All accounts CSV">
          <Download className="h-4 w-4" aria-hidden="true" />
        </DownloadButton>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No accounts for this filter.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {rows.map((r) => {
            const isOpen = open.has(r.accountName);
            const { label, number } = splitName(r.accountName);
            const panelId = `acct-${r.accountName.replace(/\W+/g, "-")}`;
            return (
              <li key={r.accountName}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggle(r.accountName)}
                  className={cn("flex w-full items-center gap-3 px-2 py-3 text-left", ROW_HOVER)}
                >
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", !isOpen && "-rotate-90")} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink" title={r.accountName}>{label}</div>
                    <div className="text-xs text-muted">{number ? `No. ${number}` : "—"}</div>
                  </div>
                  <dl className="hidden shrink-0 grid-cols-3 gap-6 text-right text-xs md:grid">
                    <div><dt className="text-muted">Revenue</dt><dd className="tabular-nums text-ink">{money(r.revenue)}</dd></div>
                    <div><dt className="text-muted">FOC+Bonus cost</dt><dd className="tabular-nums text-ink">{money(r.totalCost)}</dd></div>
                    <div><dt className="text-muted">Cost/revenue</dt><dd><RatioBadge ratio={r.ratio} /></dd></div>
                  </dl>
                  <div className="shrink-0 text-right">
                    {r.overCount > 0 ? (
                      <span title={`Excess value ${money(r.overCost)} THB, cumulative`}>
                        <Badge tone="negative">{r.overCount} over quota</Badge>
                      </span>
                    ) : null}
                    <div className="mt-1 text-xs tabular-nums text-muted md:hidden">
                      {money(r.totalCost)} · <RatioBadge ratio={r.ratio} />
                    </div>
                  </div>
                </button>
                {isOpen && (
                  <div id={panelId} className="border-t border-line/60 bg-canvas/40 px-1 md:px-3">
                    <AccountMatrixPanel
                      key={`${r.accountName}|${year}`}
                      name={r.accountName}
                      year={year}
                      measure={measure}
                      onFullDetail={() => setDetail(r.accountName)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {detail && <AccountDrilldown key={detail} accountName={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
