"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

type Values = {
  overPct6800: number;
  overPct5800: number;
  minOverUnits: number;
  netOverPct: number;
  netMinExcess: number;
  focStandaloneMin: number;
  floorPct: number; // shown as a percentage, stored as a 0-1 ratio
  minRuns: number;
  windowMonths: number;
  productLines: string; // comma-separated Product (Tableau PL3) names to import
  formulaProducts: string; // comma-separated Products whose quota is the formula
};

const INPUT = "w-28 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm tabular-nums focus:border-brand focus:outline-none";

function Field({ id, label, hint, value, onChange, step = 1, max }: {
  id: string; label: string; hint: string; value: string; onChange: (v: string) => void; step?: number; max?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">{label}</label>
      <input id={id} type="number" min={0} max={max} step={step} required value={value} onChange={(e) => onChange(e.target.value)} className={INPUT} />
      <p className="mt-1 max-w-md text-xs text-muted">{hint}</p>
    </div>
  );
}

export function AdminSettingsForm({ initial }: { initial: Values }) {
  const [form, setForm] = useState(() => Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])) as Record<keyof Values, string>);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const set = (key: keyof Values) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alert: { overPct6800: Number(form.overPct6800), overPct5800: Number(form.overPct5800), minOverUnits: Number(form.minOverUnits), netOverPct: Number(form.netOverPct), netMinExcess: Number(form.netMinExcess), focStandaloneMin: Number(form.focStandaloneMin) },
          tpb: { accountFloorRatio: Number(form.floorPct) / 100, accountMinRuns: Number(form.minRuns), accountWindowMonths: Number(form.windowMonths) },
          focImport: {
            allowedProductLines: form.productLines.split(",").map((x) => x.trim()).filter(Boolean),
            formulaProducts: form.formulaProducts.split(",").map((x) => x.trim()).filter(Boolean),
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Save failed. Please check the values.");
      setMessage({ tone: "ok", text: "Saved." });
    } catch (cause) {
      setMessage({ tone: "error", text: cause instanceof Error ? cause.message : "Save failed." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-8">
      <section aria-labelledby="net-heading">
        <h2 id="net-heading" className="mb-1 text-sm font-semibold text-ink">Account over quota</h2>
        <p className="mb-4 max-w-2xl text-xs text-muted">
          The main alert. An account is over quota when the Bonus it was given, valued at master prices, is more than its
          whole entitlement by the percentage below <em>and</em> by at least the amount below. Items are added up first, so giving
          more of one item and less of another is not flagged. Optional items (tubes, sample cups, third-party) are left out.
        </p>
        <div className="flex flex-wrap gap-x-8 gap-y-5">
          <Field id="netpct" label="Bonus over entitlement by more than (%)" hint="25 means Bonus worth more than 125% of the entitlement." value={form.netOverPct} onChange={set("netOverPct")} step={1} max={1000} />
          <Field id="netmin" label="and by at least (THB)" hint="Small absolute overshoots are ignored." value={form.netMinExcess} onChange={set("netMinExcess")} step={1000} max={100000000} />
          <Field id="focmin" label="Stand-alone FOC flagged from (THB, selected year)" hint="FOC given with no reagent sale (it carries VAT) is not compared with the formula; an account is flagged once its FOC cost in the year selected on the Dashboard reaches this (the latest 12 months of data when the Year filter is All years)." value={form.focStandaloneMin} onChange={set("focStandaloneMin")} step={1000} max={100000000} />
        </div>
      </section>

      <section aria-labelledby="alert-heading">
        <h2 id="alert-heading" className="mb-1 text-sm font-semibold text-ink">Item Over Quota (information)</h2>
        <p className="mb-4 max-w-2xl text-xs text-muted">
          Shown on each item, not counted as an alert. Each reagent bill (a month with reagent sales) is allowed +1 of an item as extra Bonus: over quota by no more than the
          number of bills is a yellow Warning, over by more than that is a red Over Quota. The percentage below is used only when an account&apos;s bill count is unknown (no reagent sales in the period): then an item is red when the
          excess is at least the minimum number of units <em>and</em> more than that percentage of its entitlement, and yellow otherwise.
        </p>
        <div className="flex flex-wrap gap-x-8 gap-y-5">
          <Field id="pct6800" label="cobas 6800/8800: over by more than (%)" hint="Also used for cobas 4800. An account with both platforms uses the lower of the two percentages." value={form.overPct6800} onChange={set("overPct6800")} step={0.5} max={1000} />
          <Field id="pct5800" label="cobas 5800: over by more than (%)" hint="Used for accounts on cobas 5800 only." value={form.overPct5800} onChange={set("overPct5800")} step={0.5} max={1000} />
          <Field id="minunits" label="and at least (units)" hint="Smaller overshoots, such as rounding crumbs, are ignored." value={form.minOverUnits} onChange={set("minOverUnits")} step={0.5} max={1000} />
        </div>
      </section>

      <section aria-labelledby="tpb-heading">
        <h2 id="tpb-heading" className="mb-1 text-sm font-semibold text-ink">Per-account TPB</h2>
        <p className="mb-4 max-w-2xl text-xs text-muted">
          With enough runs, an account&apos;s own tests per run replaces the national TPB when working out how many
          runs an order needs. It is never taken below the floor, so a site that runs a few samples per run does not
          earn several times the consumables of a site that fills its plate.
        </p>
        <div className="flex flex-wrap gap-x-8 gap-y-5">
          <Field id="floor" label="Floor (% of national TPB)" hint="50 means the account's TPB is never counted as lower than half the national value." value={form.floorPct} onChange={set("floorPct")} step={1} max={100} />
          <Field id="minruns" label="Minimum runs to trust an account's own TPB" hint="Below this, the national TPB is used." value={form.minRuns} onChange={set("minRuns")} max={1000} />
          <Field id="window" label="Months of usage to pool" hint="The latest months loaded in Instrument usage." value={form.windowMonths} onChange={set("windowMonths")} max={24} />
        </div>
      </section>

      <section aria-labelledby="import-heading">
        <h2 id="import-heading" className="mb-1 text-sm font-semibold text-ink">FOC import: Products</h2>
        <p className="mb-4 max-w-2xl text-xs text-muted">
          The Tableau export covers every Product (PL3: Molecular Lab, Core Lab, ...) in the company. Only rows whose Product is listed
          here are imported, so Core Lab or NPC rows never mix into the Molecular figures.
        </p>
        <label htmlFor="lines" className="mb-1 block text-sm font-medium text-ink">Products to import (comma-separated)</label>
        <input id="lines" type="text" required value={form.productLines} onChange={(e) => set("productLines")(e.target.value)} className="w-full max-w-md rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none" />
        <p className="mt-1 max-w-md text-xs text-muted">Names as Tableau writes them, e.g. MOLECULAR LAB. Not case sensitive.</p>
              <label htmlFor="formula" className="mb-1 mt-4 block text-sm font-medium text-ink">Products whose quota is the formula (comma-separated)</label>
        <input id="formula" type="text" required value={form.formulaProducts} onChange={(e) => set("formulaProducts")(e.target.value)} className="w-full max-w-md rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none" />
        <p className="mt-1 max-w-md text-xs text-muted">These use the cumulative Calculator formula (Molecular Lab). Every other imported Product uses the yearly Quota(Year) from the Tableau file.</p>
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save settings"}</Button>
        {message && (
          <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-sm text-negative" : "text-sm text-positive"}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
