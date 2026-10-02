"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { ALL_YEARS } from "@/lib/dashboard/filters";
import { DEFAULT_ITEM_GROUPS } from "@/lib/dashboard/itemGroups";
import { productLabel } from "@/lib/dashboard/accountQuota";

// FocActual.team stores the raw TLevel3 string from the Tableau source, not
// this app's own Team enum — hence the "ateam" param name and these literal
// values. The chips use the short names the reps know the teams by.
const TEAM_ORDER = ["TH - North", "TH - South", "TH - Private - BKK", "TH - BP"];
const TEAM_LABELS: Record<string, string> = {
  "TH - Private - BKK": "Private-BKK",
  "TH - Private - UPC": "Private-UPC",
  "TH - ThaiRedCross": "Thai Red Cross",
  "TH - TD": "TD",
  "TH - NPC": "NPC",
};
/** One chip per Team that has data for the chosen Product: the usual four first, then the rest A-Z. */
export function teamChips(choices: string[]): { value: string; label: string }[] {
  const rank = (t: string) => (TEAM_ORDER.includes(t) ? TEAM_ORDER.indexOf(t) : TEAM_ORDER.length);
  return [...choices]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((value) => ({ value, label: TEAM_LABELS[value] ?? value.replace(/^TH - /, "") }));
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const selectClass = "rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm focus:outline-brand";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        active ? "border-brand bg-brand-tint font-medium text-brand" : "border-line-strong bg-surface text-ink hover:bg-canvas",
      )}
    >
      {children}
    </button>
  );
}

/** Year + month range, team chips and an account picker — this data is a
 * periodic bulk import (not a live rolling window), so the period is exact
 * rather than "last N months". Every param narrows the whole view, so the
 * "N ship-to accounts" count and every figure below always agree. The account
 * picker is a dropdown of the real names in the current scope, not free text:
 * names in this source data are inconsistently spelled ("HOSP." vs
 * "HOSPITAL", typos), so typing to search is unreliable. `view` adds the
 * controls that only make sense there: Top 10, the measure toggle and the
 * over-quota filter on Accounts, the >20% filter on Overview. All state lives
 * in the URL so a view is bookmarkable. */
export function ActualsFilters({
  view,
  years,
  year,
  accountNames,
  accountCount,
  itemGroupChoices,
  teamChoices,
  product,
  defaultProduct,
  productChoices,
  quotaMode,
}: {
  view: "accounts" | "overview" | "alerts";
  years: number[];
  /** The year in effect: the picked one, the latest when none is in the URL, "" for all years. */
  year: string;
  accountNames: string[];
  accountCount: number;
  /** Every Item Group present in the data. */
  itemGroupChoices: string[];
  teamChoices: string[];
  /** The Product shown, the default one (left out of the URL) and every Product in the data. */
  product: string;
  defaultProduct: string;
  productChoices: string[];
  quotaMode: "formula" | "annual";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The figures are computed on the server, so a filter click takes a moment. Keep the page where it is
  // (scroll: false) and dim the bar while the new figures load, instead of jumping.
  const [pending, startTransition] = useTransition();
  const go = (params: URLSearchParams) => startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    go(params);
  }

  // Another Product has other accounts and Item Groups, so the account, Item Group and flag picks do not carry over.
  function setProduct(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== defaultProduct) params.set("pl3", value);
    else params.delete("pl3");
    for (const k of ["acct", "ig", "sig", "q"]) params.delete(k);
    go(params);
  }

  const annual = quotaMode === "annual";
  const get = (key: string) => searchParams.get(key) ?? "";
  const chips = teamChips(teamChoices);
  // A Team that has no rows under this Product is ignored by the server, so it must not look selected here.
  const team = chips.some((t) => t.value === get("ateam")) ? get("ateam") : "";
  const measure = get("m") === "cost" ? "cost" : "qty";

  return (
    <div className={cn("mb-6 space-y-3 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Product" value={product} onChange={(e) => setProduct(e.target.value)} className={selectClass}>
          {(productChoices.includes(product) ? productChoices : [product, ...productChoices]).map((p) => (
            <option key={p} value={p}>{productLabel(p)}</option>
          ))}
        </select>

        <select aria-label="Year" value={year || ALL_YEARS} onChange={(e) => setParam("year", e.target.value)} className={selectClass}>
          <option value={ALL_YEARS}>All years</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <div className="flex items-center gap-1.5 text-sm text-muted">
          <select aria-label="From month" value={get("month")} onChange={(e) => setParam("month", e.target.value)} className={selectClass}>
            <option value="">All months</option>
            {MONTH_LABELS.map((label, i) => (
              <option key={label} value={i + 1}>{label}</option>
            ))}
          </select>
          <span aria-hidden="true">–</span>
          <select aria-label="To month" value={get("mto")} onChange={(e) => setParam("mto", e.target.value)} className={selectClass}>
            <option value="">{get("month") ? "Same month" : "To month"}</option>
            {MONTH_LABELS.map((label, i) => (
              <option key={label} value={i + 1}>{label}</option>
            ))}
          </select>
        </div>

        <select
          aria-label="Account"
          value={get("q")}
          onChange={(e) => setParam("q", e.target.value)}
          className={`${selectClass} max-w-64`}
        >
          <option value="">All accounts</option>
          {accountNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        <ItemGroupFilter annual={annual} choices={itemGroupChoices} value={get("ig")} onChange={(v) => setParam("ig", v)} />

        <span className="ml-auto text-xs text-muted">{accountCount.toLocaleString()} ship-to account(s)</span>
      </div>

      {annual && (
        <p className="text-xs text-muted">
          Quota = the yearly quota set in Tableau (Quota(Year)); % = FOC + Bonus given in the year / quota
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {chips.map((t) => (
          <Chip key={t.value} active={team === t.value} onClick={() => setParam("ateam", team === t.value ? "" : t.value)}>
            {t.label}
          </Chip>
        ))}
        {view === "accounts" && (
          <Chip active={get("top") === "1"} onClick={() => setParam("top", get("top") === "1" ? "" : "1")}>
            Top 10 by cost
          </Chip>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
          {view === "accounts" && (
            <div role="group" aria-label="Measure" className="inline-flex overflow-hidden rounded-lg border border-line-strong text-sm">
              {([["qty", "FOC+Bonus qty"], ["cost", "Cost (THB)"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={measure === value}
                  onClick={() => setParam("m", value === "qty" ? "" : value)}
                  className={cn("px-3 py-1.5", measure === value ? "bg-brand text-white" : "bg-surface text-ink hover:bg-canvas")}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {view === "accounts" && (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                aria-label={annual ? "Accounts with an item over its yearly quota only" : "Flagged accounts only: over quota or stand-alone FOC past its threshold"}
                checked={get("sig") === "1"}
                onChange={(e) => setParam("sig", e.target.checked ? "1" : "")}
                className="h-4 w-4 rounded border-line-strong accent-brand"
              />
              {annual ? "Over Quota only" : "Flagged only"}
            </label>
          )}
          {view === "accounts" && (
            <label className="flex items-center gap-2 text-sm text-ink" title="Hide accounts with no revenue, whose cost/revenue shows as N/A">
              <input
                type="checkbox"
                aria-label="Exclude accounts with no revenue (cost/revenue N/A)"
                checked={get("xna") === "1"}
                onChange={(e) => setParam("xna", e.target.checked ? "1" : "")}
                className="h-4 w-4 rounded border-line-strong accent-brand"
              />
              Exclude N/A
            </label>
          )}
          {view === "overview" && (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={get("hi") === "1"}
                onChange={(e) => setParam("hi", e.target.checked ? "1" : "")}
                className="h-4 w-4 rounded border-line-strong accent-brand"
              />
              Only accounts with cost/revenue &gt; 20%
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

const DEFAULTS: readonly string[] = DEFAULT_ITEM_GROUPS;

/** Item Group picker: a `<details>` of checkboxes writing the "|"-separated `ig` param (empty = the default groups). */
function ItemGroupFilter({ choices, value, onChange, annual }: { choices: string[]; value: string; onChange: (v: string) => void; annual: boolean }) {
  const picked = value.split("|").map((x) => x.trim()).filter(Boolean);
  // Annual-quota Products show every group by default, so the shortcut means All.
  const defaults = annual ? choices : choices.filter((c) => DEFAULTS.includes(c));
  const current = picked.length > 0 ? picked : defaults;
  const [open, setOpen] = useState(false);

  function write(next: string[]) {
    const same = next.length === defaults.length && next.every((g) => defaults.includes(g));
    onChange(same || next.length === 0 ? "" : next.join("|"));
  }
  function toggle(group: string) {
    write(current.includes(group) ? current.filter((g) => g !== group) : [...current, group]);
  }

  return (
    <details
      className="relative"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className={cn(selectClass, "flex cursor-pointer list-none items-center gap-2 select-none")} aria-label="Item Group">
        Item Group
        <span className="rounded-full bg-brand-tint px-1.5 text-xs font-medium tabular-nums text-brand">
          {picked.length > 0 ? picked.length : annual ? "All" : "Default"}
        </span>
      </summary>
      <div className="absolute left-0 z-30 mt-1 w-64 rounded-lg border border-line-strong bg-surface p-3 shadow-lg">
        <div className="mb-2 flex gap-2 text-xs">
          <button type="button" onClick={() => onChange("")} className="rounded-full border border-line-strong px-2.5 py-0.5 text-ink hover:bg-canvas">{annual ? "All" : "Default"}</button>
          {!annual && <button type="button" onClick={() => onChange(choices.join("|"))} className="rounded-full border border-line-strong px-2.5 py-0.5 text-ink hover:bg-canvas">All</button>}
          <button type="button" onClick={() => setOpen(false)} className="ml-auto text-muted hover:text-ink">Close</button>
        </div>
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {choices.map((g) => (
            <li key={g}>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={current.includes(g)} onChange={() => toggle(g)} className="h-4 w-4 rounded border-line-strong accent-brand" />
                <span className="truncate" title={g}>{g}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
