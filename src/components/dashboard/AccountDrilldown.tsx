"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { BarChart } from "./BarChart";
import { EntitlementTable } from "./EntitlementTable";
import { LineChart } from "./LineChart";
import { StatTile } from "./StatTile";

const REVENUE_COLOR = "#0b41cd";
const FOC_VALUE_COLOR = "#eb6834";
const money = (n: number) => `${Math.round(n).toLocaleString()} THB`;

type AccountDetail = {
  accountName: string;
  accountNumber: string | null;
  ownTpbUsed?: boolean;
  team: string | null;
  rep: string | null;
  summary: { revenue: number; focCost: number; bonusCost: number; totalCost: number; ratio: number };
  monthly: { key: string; label: string; revenue: number; focCost: number; bonusCost: number; focValue: number; ratio: number }[];
  productsGiven: { materialNo: string; productName: string; focQty: number; bonusQty: number; focCost: number; bonusCost: number; focValue: number }[];
  productsSold: { materialNo: string; productName: string; revenueQty: number; revenue: number }[];
  entitlement: {
    platform: { platform: string; basis: string; has4800: boolean };
    assayTests: { code: string; tests: number; batches: number }[];
    rows: {
      materialNo: string; productName: string; optional: boolean; expected: number; focQty: number; bonusQty: number;
      free: number; sold: number; freeCost: number; excessValue: number; over: number; ratio: number | null;
      bucket: "over" | "within" | "noRule" | "reagent" | "wrongPlatform" | "additional";
    }[];
    totals: { overCost: number; withinCost: number; noRuleCost: number; reagentFreeCost: number; wrongPlatformCost: number; additionalCost: number; significantCount: number; significantCost: number };
  };
};

/** Per-account deep-dive, opened from a row in `FocActualsAccountTable`.
 * Deliberately shows the account's full history regardless of the page's
 * year/month filter (see `/api/dashboard/account`) — this is "everything
 * about this account", not "this account within the current filter". Panel
 * order (header/KPIs -> monthly trend -> ratio line -> products given ->
 * quota table -> products sold) mirrors the reference dashboard's own
 * account modal exactly, per praditww's "ทำให้เหมือนต้นแบบ" ask. */
export function AccountDrilldown({ accountName, onClose }: { accountName: string; onClose: () => void }) {
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No reset-to-null here: the parent keys this component by `accountName`
    // (`key={selected}`), so switching accounts remounts with fresh state
    // rather than needing an effect to clear the previous account's data.
    let cancelled = false;
    fetch(`/api/dashboard/account?name=${encodeURIComponent(accountName)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to load account.");
        return res.json();
      })
      .then((data) => { if (!cancelled) setDetail(data); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load account."); });
    return () => { cancelled = true; };
  }, [accountName]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:p-8" onClick={onClose}>
      <div
        className="w-full max-w-4xl rounded-xl bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Details for ${accountName}`}
      >
        <div className="flex items-start justify-between gap-4 rounded-t-xl bg-brand p-5 text-white">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{accountName}</h2>
            {detail && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {detail.accountNumber && <Chip>No. {detail.accountNumber}</Chip>}
                {detail.team && <Chip>{detail.team}</Chip>}
                {detail.rep && detail.rep !== detail.team && <Chip>{detail.rep}</Chip>}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1.5 text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-5">
          {error && <p role="alert" className="py-8 text-center text-sm text-negative">{error}</p>}
          {!error && !detail && <p className="py-12 text-center text-sm text-muted">Loading…</p>}

          {detail && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <StatTile label="Revenue" value={money(detail.summary.revenue)} accent={REVENUE_COLOR} />
                <StatTile label="FOC cost" value={money(detail.summary.focCost)} accent={REVENUE_COLOR} />
                <StatTile label="Bonus cost" value={money(detail.summary.bonusCost)} accent={FOC_VALUE_COLOR} />
                <StatTile label="Total cost" value={money(detail.summary.totalCost)} />
                <StatTile
                  label="% cost/revenue"
                  value={Number.isFinite(detail.summary.ratio) ? `${(detail.summary.ratio * 100).toFixed(1)}%` : "N/A"}
                />
              </div>

              <div>
                <h3 className="mb-1 text-sm font-semibold text-ink">Monthly trend (full history)</h3>
                <p className="mb-3 text-xs text-muted">Independent of the page&apos;s month filter — every month of this account.</p>
                <BarChart
                  data={detail.monthly.map((m) => ({ category: m.label, values: { revenue: m.revenue, focValue: m.focValue } }))}
                  series={[
                    { key: "revenue", label: "Revenue", color: REVENUE_COLOR },
                    { key: "focValue", label: "FOC value", color: FOC_VALUE_COLOR },
                  ]}
                  valueFormat={(n) => n.toLocaleString()}
                />
              </div>

              <div>
                <h3 className="mb-1 text-sm font-semibold text-ink">% Total cost / revenue</h3>
                <LineChart
                  data={detail.monthly.map((m) => ({ label: m.label, value: Number.isFinite(m.ratio) ? m.ratio * 100 : null }))}
                  referenceValue={20}
                  referenceLabel="20% reference"
                />
              </div>

              <div>
                <h3 className="mb-3 text-sm font-semibold text-ink">Products given to this account</h3>
                {detail.productsGiven.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted">Nothing given away.</p>
                ) : (
                  <BarChart
                    data={detail.productsGiven.map((p) => ({ category: p.productName, values: { value: p.focValue } }))}
                    series={[{ key: "value", label: "FOC + Bonus value (THB)", color: FOC_VALUE_COLOR }]}
                    orientation="horizontal"
                    valueFormat={(n) => n.toLocaleString()}
                  />
                )}
              </div>

              {detail.ownTpbUsed && (
                <p className="-mb-3 text-xs text-muted">
                  Quota below is worked out with this account&apos;s own tests-per-run (never below half the national figure), not the national average.
                </p>
              )}
              <EntitlementTable entitlement={detail.entitlement} />

              <div>
                <h3 className="mb-3 text-sm font-semibold text-ink">Products sold to this account</h3>
                {detail.productsSold.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted">No revenue-category sales.</p>
                ) : (
                  <BarChart
                    data={detail.productsSold.map((p) => ({ category: p.productName, values: { value: p.revenue } }))}
                    series={[{ key: "value", label: "Revenue (THB)", color: REVENUE_COLOR }]}
                    orientation="horizontal"
                    valueFormat={(n) => n.toLocaleString()}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-white/15 px-2.5 py-1 font-medium">{children}</span>;
}
