"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Measure } from "@/lib/dashboard/focAccountMatrix";
import { AccountMatrixPanel } from "./AccountMatrixPanel";
import { QuotaCell, money, splitName, type AccountRow } from "./accountColumns";
import { RatioBadge } from "./RatioBadge";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Right-hand slide-over for one account: KPIs, Previous/Next through the list
 * as currently sorted, and the product x month matrix. Full-screen sheet on
 * phones. Esc closes, focus moves in and (by the parent) back to the row,
 * Tab stays inside. `suspended` hands the keyboard to a modal opened above it.
 */
export function AccountDrawer({
  row,
  position,
  total,
  year,
  measure,
  itemGroups,
  product,
  quotaMode,
  suspended,
  onClose,
  onStep,
  onFullDetail,
}: {
  row: AccountRow;
  position: number; // 1-based place in the sorted list, 0 when filtered out
  total: number;
  year: number;
  measure: Measure;
  /** The `ig` URL param ("|"-separated Item Groups), "" = default groups. */
  itemGroups: string;
  /** The `pl3` URL param, "" = default Product. */
  product: string;
  quotaMode: "formula" | "annual";
  suspended: boolean;
  onClose: () => void;
  onStep: (delta: -1 | 1) => void;
  onFullDetail: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const { label, number } = splitName(row.accountName);

  useEffect(() => {
    panelRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    if (suspended) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "Tab" && panelRef.current) {
        const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === panelRef.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
        return;
      }
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || t?.closest("input, select, textarea, [contenteditable]")) return;
      if (e.key === "ArrowDown" || e.key === "j" || e.key === "J") { e.preventDefault(); onStep(1); }
      else if (e.key === "ArrowUp" || e.key === "k" || e.key === "K") { e.preventDefault(); onStep(-1); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [suspended, onClose, onStep]);

  const navBtn = "inline-flex items-center gap-1 rounded-lg border border-line-strong px-2.5 py-1.5 text-sm text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={row.accountName}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full flex-col overflow-y-auto bg-surface shadow-xl outline-none md:w-[min(1100px,94vw)]"
      >
        <div className="sticky top-0 z-20 border-b border-line bg-surface px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-semibold text-ink" title={row.accountName}>{label}</h2>
              <p className="text-xs text-muted">{number ? `No. ${number}` : "—"}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" className={navBtn} disabled={position <= 1} onClick={() => onStep(-1)} aria-label="Previous account">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Previous</span>
              </button>
              <span className="hidden text-xs tabular-nums text-muted sm:inline" aria-live="polite">{position > 0 ? `${position} / ${total}` : `– / ${total}`}</span>
              <button type="button" className={navBtn} disabled={position === 0 || position >= total} onClick={() => onStep(1)} aria-label="Next account">
                <span className="hidden sm:inline">Next</span><ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
            <div><dt className="text-muted">Revenue</dt><dd className="tabular-nums text-ink">{money(row.revenue)}</dd></div>
            <div><dt className="text-muted">FOC+Bonus cost</dt><dd className="tabular-nums text-ink">{money(row.totalCost)}</dd></div>
            <div><dt className="text-muted">Cost/revenue</dt><dd><RatioBadge ratio={row.ratio} /></dd></div>
            <div><dt className="text-muted">Quota</dt><dd><QuotaCell row={row} align="left" /></dd></div>
          </dl>
          <p className="mt-2 hidden text-[11px] text-muted md:block">Esc closes · ↑ ↓ or J K for the previous / next account</p>
        </div>
        <div className="px-3 md:px-5">
          <AccountMatrixPanel key={`${row.accountName}|${year}|${itemGroups}|${product}`} name={row.accountName} year={year} measure={measure} itemGroups={itemGroups} product={product} quotaMode={quotaMode} onFullDetail={onFullDetail} />
        </div>
      </aside>
    </div>
  );
}
