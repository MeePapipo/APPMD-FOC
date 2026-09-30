"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

// FocActual.team stores the raw TLevel3 string from the Tableau source, not
// this app's own Team enum — hence the "ateam" param name and these literal
// values. The chips use the short names the reps know the teams by.
const TEAM_CHIPS = [
  { value: "TH - North", label: "North" },
  { value: "TH - South", label: "South" },
  { value: "TH - Private - BKK", label: "Private-BKK" },
  { value: "TH - BP", label: "BP" },
];

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
  accountNames,
  accountCount,
}: {
  view: "accounts" | "overview" | "alerts";
  years: number[];
  accountNames: string[];
  accountCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const get = (key: string) => searchParams.get(key) ?? "";
  const team = get("ateam");
  const measure = get("m") === "cost" ? "cost" : "qty";

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Year" value={get("year")} onChange={(e) => setParam("year", e.target.value)} className={selectClass}>
          <option value="">All years</option>
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

        <span className="ml-auto text-xs text-muted">{accountCount.toLocaleString()} ship-to account(s)</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TEAM_CHIPS.map((t) => (
          <Chip key={t.value} active={team === t.value} onClick={() => setParam("ateam", team === t.value ? "" : t.value)}>
            {t.label}
          </Chip>
        ))}
        {team && !TEAM_CHIPS.some((t) => t.value === team) && (
          <Chip active onClick={() => setParam("ateam", "")}>{team}</Chip>
        )}
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
                checked={get("sig") === "1"}
                onChange={(e) => setParam("sig", e.target.checked ? "1" : "")}
                className="h-4 w-4 rounded border-line-strong accent-brand"
              />
              Over quota only
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
