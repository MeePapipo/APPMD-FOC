"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// FocActual.team stores the raw TLevel3 string from the Tableau source, not
// this app's own Team enum — hence the "ateam" param name (kept distinct from
// the Orders tab's enum-valued "team" param) and these literal values.
const TEAM_OPTIONS = [
  { value: "TH - North", label: "TH - North" },
  { value: "TH - South", label: "TH - South" },
  { value: "TH - Private - BKK", label: "TH - Private - BKK" },
  { value: "TH - BP", label: "TH - BP" },
  { value: "Unassigned", label: "Unassigned" },
];

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Exact Year/Month/Team + an account picker + a >20% cost/revenue toggle —
 * this tab's data is a periodic bulk import (not a live rolling window), so
 * unlike the Orders tab's `DashboardFilters`, the period picker is exact
 * rather than "last N months". Every param here narrows the whole tab, so
 * the "N ship-to accounts" count and every KPI/panel/table below always
 * agree. The account picker is a dropdown of the real account names in the
 * current year/month/team scope, not free text — account names in this
 * source data are inconsistently spelled/abbreviated (typos, "HOSP." vs
 * "HOSPITAL", stray punctuation), so typing to search is unreliable; picking
 * from the real list isn't. */
export function ActualsFilters({
  years,
  accountNames,
  accountCount,
}: {
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

  const selectClass =
    "rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm focus:outline-brand";

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <select
        value={searchParams.get("year") ?? ""}
        onChange={(e) => setParam("year", e.target.value)}
        className={selectClass}
      >
        <option value="">All years</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>

      <select
        value={searchParams.get("month") ?? ""}
        onChange={(e) => setParam("month", e.target.value)}
        className={selectClass}
      >
        <option value="">All months</option>
        {MONTH_LABELS.map((label, i) => (
          <option key={label} value={i + 1}>{label}</option>
        ))}
      </select>

      <select
        value={searchParams.get("ateam") ?? ""}
        onChange={(e) => setParam("ateam", e.target.value)}
        className={selectClass}
      >
        <option value="">All teams</option>
        {TEAM_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select
        value={searchParams.get("q") ?? ""}
        onChange={(e) => setParam("q", e.target.value)}
        className={`${selectClass} max-w-64`}
      >
        <option value="">All accounts</option>
        {accountNames.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={searchParams.get("hi") === "1"}
          onChange={(e) => setParam("hi", e.target.checked ? "1" : "")}
          className="h-4 w-4 rounded border-line-strong accent-brand"
        />
        Only accounts with cost/revenue &gt; 20%
      </label>

      <span className="ml-auto text-xs text-muted">{accountCount.toLocaleString()} ship-to account(s)</span>
    </div>
  );
}
