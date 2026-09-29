"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { AccountDTO, AdditionalFocDTO, AssayDTO } from "@/lib/dto";
import type { SysCode, TestsBySystem } from "@/lib/calc/types";
import { computeReagents } from "@/lib/calc/reagents";
import { needsComment, type Adjustment, type AdjustmentMap } from "@/lib/calc/adjust";
import { AccountPicker } from "./AccountPicker";
import { Button } from "@/components/ui";
import { selectPreview, type ManualFocLine, type PreviewResult } from "@/lib/calc/preview";
import { CalculationPreview, OrderTotals } from "./CalculationPreview";
import { ReagentQuantities } from "./ReagentQuantities";
import { AdditionalFocPicker, type ManualQuantities } from "./AdditionalFocPicker";
import { CategorySection } from "@/components/CategorySection";

const SYSTEM_LABELS: Record<SysCode, string> = {
  "6800": "cobas 6800/8800",
  "5800": "cobas 5800",
  "4800": "cobas 4800",
};

interface AssayLine {
  id: number;
  system: SysCode;
  code: string;
  tests: string;
}

export function Calculator({ accounts, assays, additionalFoc }: {
  accounts: AccountDTO[];
  assays: AssayDTO[];
  additionalFoc: AdditionalFocDTO[];
}) {
  const router = useRouter();
  const [account, setAccount] = useState<AccountDTO | null>(null);
  const [lines, setLines] = useState<AssayLine[]>([{ id: 0, system: "6800", code: "", tests: "" }]);
  const nextLineId = useRef(1);
  const requestInFlight = useRef(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  // The preview survives edits and is flagged stale instead of being thrown
  // away, so a rep tweaking one line still has the previous figures on screen
  // to compare against rather than a blank panel.
  const [stale, setStale] = useState(false);
  const [optionalTicked, setOptionalTicked] = useState<Record<string, boolean>>({});
  const [adjustments, setAdjustments] = useState<AdjustmentMap>({});
  // Free-choice give-aways. Independent of the engine, so editing them does
  // not make the calculated preview stale.
  const [manualQty, setManualQty] = useState<ManualQuantities>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const busy = loading || submitting;

  const selectedLines = lines.filter((line) => line.code || line.tests);
  const validLine = (line: AssayLine) =>
    assays.some((assay) => assay.system === line.system && assay.code === line.code) &&
    Number.isSafeInteger(Number(line.tests)) && Number(line.tests) > 0;
  const testsBySys: TestsBySystem = {};
  for (const line of selectedLines.filter(validLine)) {
    const tests = testsBySys[line.system] ??= {};
    tests[line.code] = (tests[line.code] ?? 0) + Number(line.tests);
  }
  const validOrder = selectedLines.length > 0 && selectedLines.every(validLine) &&
    Object.values(testsBySys).every((tests) => Object.values(tests ?? {}).every(Number.isSafeInteger));
  const reagents = computeReagents(assays, testsBySys);

  // Only lines actually in the current preview can block the order — leftover
  // adjustments for reagents the rep has since removed must not wedge it.
  const missingComment = (preview?.lines ?? []).some(
    (line) => needsComment(adjustments[line.materialNo], line.optional),
  );
  const canConfirm = !!preview && !stale && !missingComment && !busy;

  const manualLines: ManualFocLine[] = additionalFoc
    .filter((item) => (manualQty[item.materialNo] ?? 0) > 0)
    .map((item) => ({
      materialNo: item.materialNo,
      description: item.description,
      dkshCode: item.dkshCode,
      packSize: item.packSize,
      unitText: item.unitText,
      unitPrice: item.price,
      qty: manualQty[item.materialNo],
    }));

  // Computed once and shared: the item tables and the closing totals are now
  // rendered in different places on the page and must not disagree.
  const selected = preview ? selectPreview(preview, optionalTicked, adjustments, manualLines) : null;

  function invalidatePreview() {
    setStale(true);
    setError(null);
  }

  function adjustLine(materialNo: string, patch: Partial<Adjustment>) {
    if (requestInFlight.current) return;
    setAdjustments((previous) => ({ ...previous, [materialNo]: { ...previous[materialNo], ...patch } }));
  }

  function setManual(materialNo: string, qty: number | undefined) {
    if (requestInFlight.current) return;
    setManualQty((previous) => {
      if (qty !== undefined) return { ...previous, [materialNo]: qty };
      const next = { ...previous };
      delete next[materialNo];
      return next;
    });
  }

  // Surface errors wherever the rep is looking — the alert lives at the foot of
  // a page that can run several screens long.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [error]);

  function addLine() {
    if (requestInFlight.current) return;
    const line: AssayLine = { id: nextLineId.current++, system: lines.at(-1)?.system ?? "6800", code: "", tests: "" };
    setLines((previous) => [...previous, line]);
    invalidatePreview();
  }

  function updateLine(id: number, update: Partial<Pick<AssayLine, "system" | "code" | "tests">>) {
    if (requestInFlight.current) return;
    setLines((previous) => previous.map((line) => line.id === id ? { ...line, ...update } : line));
    invalidatePreview();
  }

  function removeLine(id: number) {
    if (requestInFlight.current) return;
    setLines((previous) => previous.filter((line) => line.id !== id));
    invalidatePreview();
  }

  function toggleOptional(materialNo: string) {
    if (!preview || requestInFlight.current) return;
    setOptionalTicked((previous) => ({ ...previous, [materialNo]: !previous[materialNo] }));
  }

  async function calculate() {
    if (!account || !validOrder || requestInFlight.current) return;
    requestInFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testsBySys, optionalTicked }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Calculation failed. Please try again.");
      }
      setPreview(await response.json());
      setStale(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Calculation failed. Please try again.");
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  }

  async function submit() {
    if (!account || !validOrder || !canConfirm || requestInFlight.current) return;
    requestInFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: account.id,
          testsBySys,
          optionalTicked,
          adjustments,
          // Quantities only — the server re-prices from the catalogue.
          additionalFoc: Object.fromEntries(manualLines.map((l) => [l.materialNo, l.qty])),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Submit failed. Please try again.");
      }
      const { id } = await response.json();
      router.push(`/history/${id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Submit failed. Please try again.");
      requestInFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <fieldset disabled={busy} className="min-w-0 border-b border-line pb-5">
        <legend className="mb-3 text-sm font-medium text-ink">1. Account</legend>
        <AccountPicker accounts={accounts} value={account} onChange={(value) => {
          if (requestInFlight.current) return;
          setAccount(value);
          invalidatePreview();
        }} />
      </fieldset>

      <section aria-labelledby="main-reagents-heading" className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="main-reagents-heading" className="text-sm font-medium text-ink">2. Main reagents</h2>
          <Button type="button" variant="secondary" size="sm" onClick={addLine} disabled={busy}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add reagent
          </Button>
        </div>
        {/* The submit button lives at the foot of the page, not here — see the
            action bar below. It stays wired to this form via its `form`
            attribute so Enter in a field still calculates. */}
        <form id="calculator-form" aria-label="Main reagent order" onSubmit={(event) => { event.preventDefault(); void calculate(); }}>
          <fieldset disabled={busy} className="min-w-0">
            <div className="divide-y divide-line border-y border-line">
              {lines.map((line, index) => {
                const assay = assays.find((candidate) => candidate.system === line.system && candidate.code === line.code);
                return (
                  <div key={line.id} role="group" aria-label={`Reagent ${index + 1}`} className="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-3 py-4">
                    <div className="grid min-w-0 gap-3 md:grid-cols-[10rem_minmax(0,1fr)_8rem]">
                      <div className="min-w-0">
                        <label htmlFor={`system-${line.id}`} className="mb-1 block text-xs font-medium text-muted">System</label>
                        <select
                          id={`system-${line.id}`}
                          value={line.system}
                          onChange={(event) => updateLine(line.id, { system: event.target.value as SysCode, code: "", tests: "" })}
                          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus:outline-brand"
                        >
                          {(Object.keys(SYSTEM_LABELS) as SysCode[]).map((system) => (
                            <option key={system} value={system}>{SYSTEM_LABELS[system]}</option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-0">
                        <label htmlFor={`assay-${line.id}`} className="mb-1 block text-xs font-medium text-muted">Main reagent / Assay</label>
                        <select
                          id={`assay-${line.id}`}
                          value={line.code}
                          required={!!line.tests}
                          onChange={(event) => updateLine(line.id, { code: event.target.value, tests: "" })}
                          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus:outline-brand"
                        >
                          <option value="">Select reagent...</option>
                          {assays.filter((candidate) => candidate.system === line.system).map((candidate) => (
                            <option key={candidate.code} value={candidate.code}>{candidate.code} - {candidate.description}</option>
                          ))}
                        </select>
                        {assay && <p className="mt-1 break-words text-xs text-muted">{assay.packSize} tests/box · Material {assay.materialNo}</p>}
                      </div>
                      <div className="min-w-0">
                        <label htmlFor={`tests-${line.id}`} className="mb-1 block text-xs font-medium text-muted">Number of tests</label>
                        <input
                          id={`tests-${line.id}`}
                          type="number"
                          min={1}
                          max={Number.MAX_SAFE_INTEGER}
                          step={1}
                          required={!!line.code}
                          disabled={!line.code}
                          value={line.tests}
                          onChange={(event) => updateLine(line.id, { tests: event.target.value })}
                          className="no-spin w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm tabular-nums focus:outline-brand disabled:opacity-50"
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove reagent ${index + 1}`}
                      title={`Remove reagent ${index + 1}`}
                      onClick={() => removeLine(line.id)}
                      className="mt-5 h-11 w-11 self-start text-negative"
                    >
                      <Trash2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </fieldset>

          {reagents.length > 0 ? (
            <ReagentQuantities reagents={reagents} />
          ) : <p role="status" className="py-4 text-sm text-muted">No main reagent quantities yet.</p>}

        </form>
      </section>

      {preview && selected && (
        <section aria-label="Order review" className="border-t border-line pt-5">
          <CalculationPreview
            selected={selected}
            stale={stale}
            optionalTicked={optionalTicked}
            onToggle={toggleOptional}
            busy={busy}
            adjustments={adjustments}
            onAdjust={adjustLine}
          />
        </section>
      )}

      {/* Shown only once the rep has calculated an order — these are a free
          choice made after seeing what the formula already gives away, and
          they do not invalidate the preview the way editing a reagent line
          does. Last section before the confirm button. */}
      {preview && selected && (
        <CategorySection
          category="choice"
          id="additional-foc-heading"
          title="Third party FOC"
          subtitle="Items you can give away on top of the calculated order. Quantities here are your choice — nothing derives them — and they count towards the FOC total."
        >
          <AdditionalFocPicker
            catalogue={additionalFoc}
            quantities={manualQty}
            onChange={setManual}
            disabled={busy}
          />
        </CategorySection>
      )}

      {preview && selected && <OrderTotals selected={selected} revenue={preview.revenue} />}

      {/* One action bar at the foot of the page. Both buttons can be present at
          once when the order has been edited since it was last calculated:
          recalculating is then the only sensible next step, so confirming is
          disabled until it happens. */}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-5">
        {missingComment && !stale && (
          <p role="status" className="text-sm text-negative">
            Add a comment for every adjusted quantity before confirming.
          </p>
        )}
        {(!preview || stale) && (
          <Button type="submit" form="calculator-form" disabled={!account || !validOrder || busy}>
            {loading ? "Calculating order..." : preview ? "Recalculate order" : "Submit order"}
          </Button>
        )}
        {preview && (
          <Button type="button" onClick={submit} disabled={!canConfirm}>
            {submitting ? "Saving order..." : "Confirm order"}
          </Button>
        )}
      </div>

      {error && <p ref={errorRef} role="alert" tabIndex={-1} className="text-sm text-negative">{error}</p>}
    </div>
  );
}
