"use client";

import { useMemo, useState } from "react";
import { AccountDrilldown } from "./AccountDrilldown";
import { RatioBadge } from "./RatioBadge";
import { cn } from "@/lib/cn";
import { ROW_HOVER } from "@/lib/hoverStyles";

export type AccountRow = {
  accountName: string;
  revenue: number;
  focCost: number;
  bonusCost: number;
  totalCost: number;
  ratio: number;
};

type SortKey = keyof Omit<AccountRow, "accountName"> | "accountName";

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "accountName", label: "Account" },
  { key: "revenue", label: "Revenue", align: "right" },
  { key: "focCost", label: "FOC cost", align: "right" },
  { key: "bonusCost", label: "Bonus cost", align: "right" },
  { key: "totalCost", label: "Total cost", align: "right" },
  { key: "ratio", label: "% cost/revenue", align: "right" },
];

const money = (n: number) => Math.round(n).toLocaleString();

/** Client-side sort only — `rows` arrive already filtered by the server
 * component (year/month/team/search/threshold), so sorting never needs a
 * round trip. Default sort matches the "Top 10 by cost" panel above it. */
export function FocActualsAccountTable({ rows }: { rows: AccountRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("totalCost");
  const [desc, setDesc] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return desc ? -cmp : cmp;
    });
    return copy;
  }, [rows, sortKey, desc]);

  function onSort(key: SortKey) {
    if (key === sortKey) setDesc((d) => !d);
    else {
      setSortKey(key);
      setDesc(true);
    }
  }

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No accounts for this filter.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-line text-left">
            {COLUMNS.map((c) => (
              <th key={c.key} scope="col" className={c.align === "right" ? "py-2 pl-3 text-right" : "py-2 pr-3"}>
                <button
                  type="button"
                  onClick={() => onSort(c.key)}
                  className="inline-flex items-center gap-1 font-medium text-muted hover:text-ink"
                >
                  {c.label}
                  {sortKey === c.key && <span aria-hidden="true">{desc ? "↓" : "↑"}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.accountName} className={cn("border-b border-line/60", ROW_HOVER)}>
              <td className="max-w-xs truncate py-2 pr-3">
                <button
                  type="button"
                  onClick={() => setSelected(r.accountName)}
                  className="truncate text-left text-brand hover:underline"
                  title={r.accountName}
                >
                  {r.accountName}
                </button>
              </td>
              <td className="py-2 pl-3 text-right tabular-nums">{money(r.revenue)}</td>
              <td className="py-2 pl-3 text-right tabular-nums">{money(r.focCost)}</td>
              <td className="py-2 pl-3 text-right tabular-nums">{money(r.bonusCost)}</td>
              <td className="py-2 pl-3 text-right tabular-nums">{money(r.totalCost)}</td>
              <td className="py-2 pl-3 text-right">
                <RatioBadge ratio={r.ratio} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && <AccountDrilldown key={selected} accountName={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
