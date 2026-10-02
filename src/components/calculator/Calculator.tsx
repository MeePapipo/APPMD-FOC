"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import type { AccountDTO, AdditionalFocDTO, AssayDTO } from "@/lib/dto";
import type { SysCode, TestsBySystem } from "@/lib/calc/types";
import { computeReagents } from "@/lib/calc/reagents";
import { needsComment, type Adjustment, type AdjustmentMap } from "@/lib/calc/adjust";
import { AccountPicker } from "./AccountPicker";
import { Button } from "@/components/ui";
import { selectPreview, type ManualFocLine, type PreviewResult } from "@/lib/calc/preview";
import { CalculationPreview, OrderTotals } from "./CalculationPreview";
import { AllowancePanel } from "./AllowancePanel";
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
  boxes: string;
  /** Boxes of the same reagent given free (FOC / Bonus); "" = none. */
  free: string;
  freeOpen: boolean;
}

export function Calculator({ accounts, assays, additionalFoc }: {
  accounts: AccountDTO[];
  assays: AssayDTO[];
  additionalFoc: AdditionalFocDTO[];
}) {
  const router = useRouter();
  const [account, setAccount] = useState<AccountDTO | null>(null);
  const [lines, setLines] = useState<AssayLine[]>([{ id: 0, system: "6800", code: "", boxes: "", free: "", freeOpen: false }]);
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
  const [pickerKey, setPickerKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const busy = loading || submitting;

  // The rep orders in boxes; the engine works in tests, so each line's tests
  // are boxes x the assay's pack size (what the box is labelled as holding).
  const assayOf = (line: AssayLine) =>
    assays.find((assay) => assay.system === line.system && assay.code === line.code);
  const testsOf = (line: AssayLine) => Number(line.boxes) * (assayOf(line)?.packSize ?? 0);
  const freeTestsOf = (line: AssayLine) => Number(line.free) * (assayOf(line)?.packSize ?? 0);
  const selectedLines = lines.filter((line) => line.code || line.boxes || line.free);
  // Paid boxes and/or free boxes: a line given only free boxes (a breakdown compensation) is a valid order.
  const validLine = (line: AssayLine) =>
    !!assayOf(line) &&
    Number.isSafeInteger(Number(line.boxes)) && Number(line.boxes) >= 0 &&
    Number.isSafeInteger(Number(line.free)) && Number(line.free) >= 0 &&
    Number(line.boxes) + Number(line.free) > 0 &&
    Number.isSafeInteger(testsOf(line)) && Number.isSafeInteger(freeTestsOf(line));
  const testsBySys: TestsBySystem = {};
  const freeTestsBySys: TestsBySystem = {};
  for (const line of selectedLines.filter(validLine)) {
    if (testsOf(line) > 0) {
      const tests = testsBySys[line.system] ??= {};
      tests[line.code] = (tests[line.code] ?? 0) + testsOf(line);
    }
    if (freeTestsOf(line) > 0) {
      const tests = freeTestsBySys[line.system] ??= {};
      tests[line.code] = (tests[line.code] ?? 0) + freeTestsOf(line);
    }
  }
  const validOrder = selectedLines.length > 0 && selectedLines.every(validLine) &&
    [testsBySys, freeTestsBySys].every((by) => Object.values(by).every((tests) => Object.values(tests ?? {}).every(Number.isSafeInteger)));
  const reagents = computeReagents(assays, testsBySys, freeTestsBySys);

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
  const warningNotices = (preview?.tpbNotices ?? []).filter((n) => n.kind !== "account");
  const accountNotices = (preview?.tpbNotices ?? []).filter((n) => n.kind === "account");

  const selected = preview ? selectPreview(preview, optionalTicked, adjustments, manualLines) : null;

  // Anything worth losing: an account, a reagent line, a calculated preview or a free-choice give-away.
  const hasInput = !!account || selectedLines.length > 0 || !!preview || Object.keys(manualQty).length > 0;

  // Back to an empty order (account, reagents, adjustments, free-choice give-aways) so the rep can start again.
  function resetOrder() {
    if (requestInFlight.current || busy) return;
    if (hasInput && !window.confirm("Clear the account and everything entered on this order, and start again?")) return;
    setAccount(null);
    setLines([{ id: nextLineId.current++, system: "6800", code: "", boxes: "", free: "", freeOpen: false }]);
    setPreview(null);
    setStale(false);
    setOptionalTicked({});
    setAdjustments({});
    setManualQty({});
    setError(null);
    setPickerKey((key) => key + 1); // the picker keeps its own search text, so it is rebuilt
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

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
    const line: AssayLine = { id: nextLineId.current++, system: lines.at(-1)?.system ?? "6800", code: "", boxes: "", free: "", freeOpen: false };
    setLines((previous) => [...previous, line]);
    invalidatePreview();
  }

  function updateLine(id: number, update: Partial<Pick<AssayLine, "system" | "code" | "boxes" | "free" | "freeOpen">>) {
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
        body: JSON.stringify({ accountId: account.id, testsBySys, freeTestsBySys, optionalTicked }),
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
          freeTestsBySys,
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
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={resetOrder} disabled={busy || !hasInput} className="text-muted hover:text-ink">
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset order
        </Button>
      </div>
      <fieldset disabled={busy} className="min-w-0 border-b border-line pb-5">
        <legend className="mb-3 text-sm font-medium text-ink">1. Account</legend>
        <AccountPicker key={pickerKey} accounts={accounts} value={account} onChange={(value) => {
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
                          onChange={(event) => updateLine(line.id, { system: event.target.value as SysCode, code: "", boxes: "", free: "", freeOpen: false })}
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
                          required={!!line.boxes}
                          onChange={(event) => updateLine(line.id, { code: event.target.value, boxes: "", free: "", freeOpen: false })}
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
                        <label htmlFor={`boxes-${line.id}`} className="mb-1 block text-xs font-medium text-muted">Number of boxes</label>
                        <input
                          id={`boxes-${line.id}`}
                          type="number"
                          min={Number(line.free) > 0 ? 0 : 1}
                          max={Number.MAX_SAFE_INTEGER}
                          step={1}
                          required={!!line.code && !(Number(line.free) > 0)}
                          disabled={!line.code}
                          value={line.boxes}
                          onChange={(event) => updateLine(line.id, { boxes: event.target.value })}
                          className="no-spin w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm tabular-nums focus:outline-brand disabled:opacity-50"
                        />
                        {assay && validLine(line) && (
                          <p aria-live="polite" className="mt-1 text-xs tabular-nums text-muted">
                            = {testsOf(line).toLocaleString("en-US")} tests
                          </p>
                        )}
                      </div>
                      {assay && (
                        <div className="min-w-0 md:col-span-3">
                          {line.freeOpen || line.free ? (
                            <div className="flex flex-wrap items-end gap-3">
                              <div className="w-40 max-w-full">
                                <label htmlFor={`free-${line.id}`} className="mb-1 block text-xs font-medium text-muted">Free boxes (FOC / Bonus)</label>
                                <input
                                  id={`free-${line.id}`}
                                  type="number"
                                  min={0}
                                  max={Number.MAX_SAFE_INTEGER}
                                  step={1}
                                  value={line.free}
                                  onChange={(event) => updateLine(line.id, { free: event.target.value })}
                                  className="no-spin w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm tabular-nums focus:outline-brand"
                                />
                              </div>
                              <p className="min-w-0 flex-1 text-xs text-muted">
                                Main reagent given free (compensation, buy 10 get 1, method verification). It is run on the instrument, so the supporting items below are worked out on paid + free boxes; the free boxes are not billed.
                              </p>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => updateLine(line.id, { freeOpen: true })}
                              className="text-xs font-medium text-brand hover:underline"
                            >
                              + Free boxes of this reagent
                            </button>
                          )}
                        </div>
                      )}
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
          {!stale && warningNotices.length > 0 && (
            <div role="note" className="mb-4 rounded-lg border border-warning/20 bg-warning-tint px-3 py-2 text-sm text-warning">
              <p className="font-medium">Check the run estimates</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {warningNotices.map((notice) => (
                  <li key={`${notice.system}-${notice.code}`}>{notice.message}</li>
                ))}
              </ul>
            </div>
          )}
          {!stale && accountNotices.length > 0 && (
            <div role="note" className="mb-4 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-muted">
              <p className="font-medium text-ink">Run estimates for this account</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {accountNotices.map((notice) => (
                  <li key={`${notice.system}-${notice.code}`}>{notice.message}</li>
                ))}
              </ul>
            </div>
          )}
          {!stale && (preview.tpbUsed?.length ?? 0) > 0 && (
            <div className="mb-4 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-muted">
              <p className="font-medium text-ink">Samples per run used for the batch items</p>
              <ul className="mt-1 space-y-0.5 tabular-nums">
                {preview.tpbUsed!.map((t) => (
                  <li key={`${t.system}-${t.code}`}>
                    <span className="text-ink">{t.code}</span> ({t.system === "6800" ? "6800/8800" : t.system}): {t.tpb} per run
                    {t.runs !== null && <> → {t.runs} run{t.runs === 1 ? "" : "s"}</>} ·{" "}
                    {t.source === "account"
                      ? "this account's own figure"
                      : t.source === "floor-clamped"
                        ? "the floor (the account's own figure is too low)"
                        : t.source === "floor-default"
                          ? "default floor (no usage data)"
                          : t.own !== null
                            ? `national average (this account's own ${t.own}${t.ownRuns ? ` rests on only ${t.ownRuns} runs` : ""} is too thin to use)`
                            : "national average"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <CalculationPreview
            selected={selected}
            stale={stale}
            optionalTicked={optionalTicked}
            onToggle={toggleOptional}
            busy={busy}
            adjustments={adjustments}
            onAdjust={adjustLine}
          />
          {preview.allowance && (
            <div className="mt-6">
              <AllowancePanel
                allowance={preview.allowance}
                lines={[...selected.required, ...selected.selectedOptional]}
              />
            </div>
          )}
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
        <Button type="button" variant="ghost" onClick={resetOrder} disabled={busy || !hasInput} className="mr-auto text-muted hover:text-ink">
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset order
        </Button>
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
