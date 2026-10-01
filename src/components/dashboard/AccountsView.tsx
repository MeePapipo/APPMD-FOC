"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download } from "lucide-react";
import { DownloadButton } from "@/components/DownloadButton";
import { cn } from "@/lib/cn";
import { ROW_HOVER } from "@/lib/hoverStyles";
import type { Measure } from "@/lib/dashboard/focAccountMatrix";
import { AccountDrawer } from "./AccountDrawer";
import { AccountDrilldown } from "./AccountDrilldown";
import {
  columnsFor,
  costDelta,
  ACCOUNT_NAME_COLUMN,
  FocOnlyCell,
  QuotaCell,
  Sparkline,
  compareValues,
  money,
  splitName,
  type AccountRow,
} from "./accountColumns";
import { RatioBadge } from "./RatioBadge";

export type { AccountRow } from "./accountColumns";

const PAGE = 100;

type Sort = { key: string; desc: boolean };
const DEFAULT_SORT: Sort = { key: "quota", desc: true }; // flagged first by net excess, then cost

/** Keep `acct` in the address bar without adding history entries. */
function syncUrl(name: string | null) {
  const url = new URL(window.location.href);
  if (name) url.searchParams.set("acct", name);
  else url.searchParams.delete("acct");
  window.history.replaceState(window.history.state, "", url);
}

/** After the drawer closes, hand focus back to the (visible) row that opened it. */
function focusRow(name: string) {
  requestAnimationFrame(() => {
    const els = [...document.querySelectorAll<HTMLElement>("[data-acct-row]")].filter((el) => el.dataset.acctRow === name && el.offsetParent !== null);
    els[0]?.focus();
  });
}

/**
 * Master-detail list of accounts: a compact sortable table (cards on phones),
 * one line per account, and a slide-over drawer with the product x month
 * matrix. The server hands over every account in scope; sorting, the text
 * filter and "show more" are client-side.
 */
export function AccountsView({
  rows,
  year,
  measure,
  exportQuery,
  initialAcct,
  itemGroups,
  product,
  quotaMode,
  allYears,
}: {
  rows: AccountRow[];
  year: number;
  measure: Measure;
  /** The page's filter params, forwarded to the all-accounts CSV. */
  exportQuery: string;
  /** `acct` search param: the account whose drawer opens on load. */
  initialAcct: string | null;
  /** `ig` search param, "" = default Item Groups. */
  itemGroups: string;
  /** `pl3` search param, "" = the default Product. */
  product: string;
  quotaMode: "formula" | "annual";
  /** The Year filter is "All years": the summary tiles cover every loaded month, not just `year`. */
  allYears: boolean;
}) {
  const columns = useMemo(() => columnsFor(quotaMode === "annual"), [quotaMode]);
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [filter, setFilter] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<string | null>(() => (initialAcct && rows.some((r) => r.accountName === initialAcct) ? initialAcct : null));
  const [detail, setDetail] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const col = sort.key === "accountName" ? ACCOUNT_NAME_COLUMN : columns.find((c) => c.key === sort.key);
    const value = col?.sortValue ?? ((r: AccountRow) => r.totalCost);
    const dir = sort.desc ? -1 : 1;
    return [...rows].sort((a, b) => dir * compareValues(value(a), value(b)) || b.totalCost - a.totalCost || a.accountName.localeCompare(b.accountName));
  }, [rows, sort, columns]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? sorted.filter((r) => r.accountName.toLowerCase().includes(q)) : sorted;
  }, [sorted, filter]);

  const selectedIndex = selected ? visible.findIndex((r) => r.accountName === selected) : -1;
  const selectedRow = selected ? rows.find((r) => r.accountName === selected) ?? null : null;

  // The account opened from the URL may sit past the first page of rows.
  const shownCount = Math.max(shown, selectedIndex + 1);
  const page = visible.slice(0, shownCount);

  function onSort(key: string) {
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "accountName" }));
  }

  function open(name: string) {
    setSelected(name);
    syncUrl(name);
  }

  const close = useCallback(() => {
    if (selected) focusRow(selected);
    setSelected(null);
    syncUrl(null);
  }, [selected]);

  const step = useCallback(
    (delta: -1 | 1) => {
      const next = visible[selectedIndex + delta];
      if (selectedIndex < 0 || !next) return;
      setSelected(next.accountName);
      syncUrl(next.accountName);
    },
    [visible, selectedIndex],
  );

  const sortIcon = (key: string) =>
    sort.key === key ? (sort.desc ? <ArrowDown className="h-3 w-3" aria-hidden="true" /> : <ArrowUp className="h-3 w-3" aria-hidden="true" />) : null;
  const ariaSort = (key: string) => (sort.key === key ? (sort.desc ? "descending" : "ascending") : undefined);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setShown(PAGE); }}
          placeholder="Filter by name or number"
          aria-label="Filter accounts by name or number"
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm focus:outline-brand sm:w-72"
        />
        <p className="text-xs text-muted">
          {visible.length.toLocaleString()} account(s). Click a row for its {year} product-by-month table.
        </p>
        <div className="ml-auto">
          <DownloadButton href={`/api/dashboard/export${exportQuery ? `?${exportQuery}` : ""}`} label="All accounts CSV">
            <Download className="h-4 w-4" aria-hidden="true" />
          </DownloadButton>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No accounts for this filter.</p>
      ) : (
        <>
          {/* Phone: one compact card per account. */}
          <ul className="divide-y divide-line border-y border-line md:hidden">
            {page.map((r) => {
              const { label, number } = splitName(r.accountName);
              return (
                <li key={r.accountName}>
                  <button
                    type="button"
                    data-acct-row={r.accountName}
                    onClick={() => open(r.accountName)}
                    className={cn("flex w-full items-center gap-3 px-2 py-3 text-left", ROW_HOVER)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{label}</div>
                      <div className="text-xs text-muted">{number ? `No. ${number}` : "—"}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-muted">
                        <span>{money(r.totalCost)}</span>
                        {costDelta(r)}
                        <RatioBadge ratio={r.ratio} />
                      </div>
                      {(r.net || r.annual) && (
                        <div className="mt-1.5 flex flex-wrap items-start gap-x-4 gap-y-1">
                          <QuotaCell row={r} align="left" />
                          {r.net && r.net.focStandaloneCost > 0 && (
                            <span className="text-[11px] text-muted">FOC only <FocOnlyCell row={r} /></span>
                          )}
                        </div>
                      )}
                    </div>
                    <Sparkline values={r.monthlyCost} year={year} />
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Desktop: one line per account under a sticky header. */}
          <table className="hidden w-full text-sm md:table">
            <thead className="text-xs text-muted">
              <tr>
                {[ACCOUNT_NAME_COLUMN, ...columns].map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={ariaSort(c.key)}
                    title={c.hint}
                    className={cn("sticky top-[68px] z-10 border-y border-line bg-brand-tint px-3 py-2 font-medium", c.align === "right" ? "text-right" : "text-left")}
                  >
                    {c.sortValue ? (
                      <button type="button" onClick={() => onSort(c.key)} className={cn("inline-flex items-center gap-1 hover:text-ink", sort.key === c.key && "text-ink")}>
                        {c.label}
                        {sortIcon(c.key)}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page.map((r) => {
                const { label, number } = splitName(r.accountName);
                return (
                  <tr
                    key={r.accountName}
                    onClick={() => open(r.accountName)}
                    className={cn("cursor-pointer border-b border-line/60", ROW_HOVER, r.accountName === selected && "bg-brand-tint/60")}
                  >
                    <td className="max-w-0 px-3 py-2">
                      <button
                        type="button"
                        data-acct-row={r.accountName}
                        aria-haspopup="dialog"
                        className="block w-full text-left"
                        title={r.accountName}
                      >
                        <span className="block truncate font-medium text-ink">{label}</span>
                        <span className="block text-xs text-muted">{number ? `No. ${number}` : "—"}</span>
                      </button>
                    </td>
                    {columns.map((c) => (
                      <td key={c.key} className={cn("px-3 py-2", c.align === "right" && "text-right")}>{c.cell(r, { year })}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {visible.length > shownCount && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setShown(shownCount + PAGE)}
                className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-brand hover:bg-canvas"
              >
                Show {Math.min(PAGE, visible.length - shownCount)} more
              </button>
              <p className="mt-1 text-xs text-muted">Showing {shownCount.toLocaleString()} of {visible.length.toLocaleString()}</p>
            </div>
          )}
        </>
      )}

      {selectedRow && (
        <AccountDrawer
          row={selectedRow}
          position={selectedIndex + 1}
          total={visible.length}
          year={year}
          measure={measure}
          itemGroups={itemGroups}
          product={product}
          quotaMode={quotaMode}
          allYears={allYears}
          suspended={detail !== null}
          onClose={close}
          onStep={step}
          onFullDetail={() => setDetail(selectedRow.accountName)}
        />
      )}
      {detail && <AccountDrilldown key={detail} accountName={detail} year={year} product={product} itemGroups={itemGroups} onClose={() => setDetail(null)} />}
    </div>
  );
}
