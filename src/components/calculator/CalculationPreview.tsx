"use client";

import { previewGroup, selectPreview, type AdjustedLine } from "@/lib/calc/preview";
import {
  deltaForTargetQty,
  needsComment,
  overGiveQty,
  summariseOverGive,
  type Adjustment,
  type AdjustmentMap,
} from "@/lib/calc/adjust";
import { MAX_ADJUST_MAGNITUDE } from "@/lib/calc/schema";
import { Badge, CardRow, QtyStepper } from "@/components/ui";
import { DkshCell, ProductCell } from "@/components/ProductCell";
import { CategorySection, type Category } from "@/components/CategorySection";
import { cn } from "@/lib/cn";
import { ROW_HOVER } from "@/lib/hoverStyles";

const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

/** The driver-calculated groups, in the order reps expect, each with its wash. */
const GROUPS: { group: "Quality control" | "Common additional" | "Additional"; category: Category }[] = [
  { group: "Quality control", category: "qc" },
  { group: "Common additional", category: "common" },
  { group: "Additional", category: "additional" },
];

export interface AdjustHandlers {
  adjustments: AdjustmentMap;
  onAdjust: (materialNo: string, patch: Partial<Adjustment>) => void;
}

/** The computed view of an order, shared by the preview and the totals. */
export type SelectedPreview = ReturnType<typeof selectPreview>;

export function CalculationPreview({ selected, stale, optionalTicked, onToggle, busy, adjustments, onAdjust }: {
  selected: SelectedPreview;
  stale: boolean;
  optionalTicked: Record<string, boolean>;
  onToggle: (materialNo: string) => void;
  busy: boolean;
} & AdjustHandlers) {
  const editing = { adjustments, onAdjust, disabled: stale || busy };
  // Only lines actually on the order count — an over-give on an optional item
  // the rep has since unticked is not being given to anyone.
  const overGive = summariseOverGive(
    [...selected.required, ...selected.selectedOptional],
    (line) => line.unitPrice ?? 0,
  );

  return (
    <div className="min-w-0 space-y-5">
      {stale && (
        <p role="status" className="rounded-lg bg-warning-tint p-3 text-sm text-warning">
          Order changed. Submit order again before confirming.
        </p>
      )}
      {/* A reminder, not a gate: handing over extra is allowed, it just has to
          be a deliberate choice the approver can see rather than a number that
          slipped through. The required-line reason field still blocks submit. */}
      {overGive.lineCount > 0 && (
        <p role="status" className="rounded-lg bg-warning-tint p-3 text-sm text-warning">
          <span className="font-semibold">
            Extra Bonus: {overGive.lineCount} รายการ · +{overGive.packs} หน่วย ·{" "}
            {money(overGive.value)} THB
          </span>
          <span className="mt-1 block">
            Giving more than the calculated quantity after stock. This is highlighted on the order
            form for the approving line manager — make sure each one is necessary.
          </span>
        </p>
      )}
      {/* Empty categories are dropped rather than rendered as a tinted card
          saying "nothing here" — on a long order that is several screens of
          colour carrying no information. */}
      {GROUPS.map(({ group, category }) => {
        const lines = selected.required.filter((line) => previewGroup(line) === group);
        if (lines.length === 0) return null;
        return (
          <CategorySection key={group} category={category} title={group}>
            <ItemTable
              lines={lines}
              empty=""
              showUsageBasis={group === "Additional"}
              {...editing}
            />
          </CategorySection>
        );
      })}

      {/* Explicit id below: `CategorySection` derives one from the category,
          and the driver-calculated "Additional" group above already uses it. */}
      {selected.optional.length > 0 && (
      <CategorySection
        category="additional"
        id="optional-additional-heading"
        title="Additional (optional)"
      >
        <div className="divide-y divide-line">
          {selected.optional.map((line) => (
            <label key={line.materialNo} className="flex items-start gap-3 py-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-brand"
                checked={optionalTicked[line.materialNo] === true}
                disabled={stale || busy}
                onChange={() => onToggle(line.materialNo)}
                aria-label={`Include ${line.description}`}
              />
              <span className="min-w-0">
                <span className="block font-medium">{line.description}</span>
                <span className="block font-mono text-xs text-muted">
                  REF {line.materialNo}
                  {line.dkshCode ? ` · DKSH ${line.dkshCode}` : ""}
                </span>
                <span className="text-xs text-muted">
                  {line.finalQty} packs · {money(line.lineValue)} THB if selected
                </span>
              </span>
            </label>
          ))}
        </div>
        {selected.selectedOptional.length > 0 && (
          <>
            <h4 className="mb-2 mt-4 text-sm font-medium text-ink">Selected optional items</h4>
            <ItemTable lines={selected.selectedOptional} empty="" {...editing} />
          </>
        )}
      </CategorySection>
      )}

      {/* No table for the rep's own give-aways here: the picker further down
          the page already lists them with live quantities, and showing the
          same rows twice invites the two to be read as separate orders. Their
          contribution surfaces in OrderTotals, which is rendered after that
          picker so every figure it quotes is already on screen above it. */}
    </div>
  );
}

/**
 * The closing summary. Lives outside CalculationPreview because it has to sit
 * below the rep's own give-aways — a total printed above one of its inputs
 * reads as stale even when it is live.
 */
export function OrderTotals({ selected, revenue }: { selected: SelectedPreview; revenue: number }) {
  return (
    <section aria-labelledby="review-order-heading" className="border-t border-line pt-5">
      <h2 id="review-order-heading" className="mb-3 text-sm font-medium text-ink">3. Review Order</h2>
      <ol aria-live="polite" aria-label="Order totals" className="list-decimal space-y-2 pl-5 text-sm tabular-nums">
        <li>Reagent Value: {money(revenue)} THB</li>
        {selected.manualValue > 0 && (
          <li>
            Calculated FOC {money(selected.focValue - selected.manualValue)} + additional{" "}
            {money(selected.manualValue)} THB
          </li>
        )}
        <li>FOC cost: {money(selected.focValue)} THB</li>
        <li className="font-semibold text-ink">% FOC/Revenue: {(selected.focPct * 100).toFixed(1)} %</li>
      </ol>
    </section>
  );
}

const cellInput =
  "w-20 rounded-lg border border-line-strong bg-surface px-2 py-1 text-right text-sm tabular-nums no-spin " +
  "focus:outline-brand disabled:opacity-50";

function ItemTable({ lines, empty, showUsageBasis = true, adjustments, onAdjust, disabled }: {
  lines: AdjustedLine[];
  empty: string;
  showUsageBasis?: boolean;
  disabled: boolean;
} & AdjustHandlers) {
  if (lines.length === 0) return <p className="py-2 text-sm text-muted">{empty}</p>;
  // Each table holds one kind of line, so the editable column can be labelled
  // for what it actually does there.
  const givingOptional = lines.every((line) => line.optional);
  const adjustLabel = givingOptional ? "Qty to give" : "Adjust (+/−)";
  const cellProps = (line: AdjustedLine, idPrefix: IdPrefix) => ({
    line,
    adjustment: adjustments[line.materialNo],
    disabled,
    onAdjust,
    idPrefix,
  });

  return (
    <>
      {/* Nine columns need ~960px, so the card view runs all the way to `lg`:
          switching at `md` would still leave a tablet scrolling sideways while
          typing into the stock box. Every cell the table shows is repeated
          here — the derived figures are what reps check the order against, so
          none of them hide behind a disclosure. The controls themselves are
          shared components, which is also what keeps the two copies' element
          ids distinct. */}
      <ul className="divide-y divide-line border-y border-line lg:hidden">
        {lines.map((line) => (
          <li key={line.materialNo} className="py-3">
            <ProductCell description={line.description} materialNo={line.materialNo}>
              <div className="font-mono text-xs text-muted">DKSH {line.dkshCode ?? "—"}</div>
            </ProductCell>
            {line.onDemand && (
              <div className="mt-1">
                <Badge tone="neutral">On demand — ordered separately</Badge>
              </div>
            )}
            <dl className="mt-2 border-t border-line pt-2">
              {showUsageBasis && <CardRow label="Usage basis" value={line.unitText ?? "—"} />}
              <CardRow label="Calculated" value={line.calculatedQty} />
              <CardRow label="Stock on hand" value={<StockInput {...cellProps(line, "card")} />} />
              <CardRow label="After stock" value={line.afterStockQty} />
              <CardRow label={adjustLabel} value={<AdjustControl {...cellProps(line, "card")} />} />
              <CardRow label="Value (THB)" value={money(line.lineValue)} />
              <CardRow
                label="Final qty"
                value={<FinalQty line={line} />}
                className="border-t border-line pt-2"
              />
            </dl>
            <CommentField {...cellProps(line, "card")} />
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto lg:block">
      {/* Wider than it was: the adjust cell now holds a stepper, not a bare box. */}
      <table className="w-full min-w-[60rem] text-sm tabular-nums">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th scope="col" className="py-2 pr-3">Item</th>
            <th scope="col" className="py-2 pr-3">DKSH</th>
            {showUsageBasis && <th scope="col" className="py-2 pr-3">Usage basis</th>}
            <th scope="col" className="py-2 pr-3 text-right">Calculated</th>
            <th scope="col" className="py-2 pr-3 text-right">Stock on hand</th>
            <th scope="col" className="py-2 pr-3 text-right">After stock</th>
            <th scope="col" className="py-2 pr-3 text-right">
              {givingOptional ? "Qty to give" : "Adjust (+/−)"}
            </th>
            {/* Value before quantity: quantity is what actually gets shipped, so
                it stays in the rightmost, most-scanned column app-wide. */}
            <th scope="col" className="py-2 pr-3 text-right">Value (THB)</th>
            <th scope="col" className="w-28 py-2 text-right text-sm font-semibold text-ink">
              Final qty
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.materialNo} className={cn("border-b border-line/60 align-top", ROW_HOVER)}>
              <td className="py-2 pr-3">
                <ProductCell description={line.description} materialNo={line.materialNo} />
                {line.onDemand && (
                  <Badge tone="neutral">On demand — ordered separately</Badge>
                )}
                <CommentField {...cellProps(line, "row")} />
              </td>
              <td className="py-2 pr-3"><DkshCell code={line.dkshCode} /></td>
              {showUsageBasis && <td className="py-2 pr-3">{line.unitText ?? "—"}</td>}
              <td className="py-2 pr-3 text-right">{line.calculatedQty}</td>
              <td className="py-2 pr-3 text-right"><StockInput {...cellProps(line, "row")} /></td>
              <td className="py-2 pr-3 text-right">{line.afterStockQty}</td>
              <td className="py-2 pr-3 text-right">
                <AdjustControl {...cellProps(line, "row")} showCaption />
              </td>
              <td className="py-2 pr-3 text-right">{money(line.lineValue)}</td>
              <td className="py-2 text-right"><FinalQty line={line} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

/**
 * The card and the table are both in the DOM at every width — one of them is
 * just `display:none` — so every `id` would otherwise be duplicated and a
 * `<label htmlFor>` could point at the copy the user cannot see.
 */
type IdPrefix = "card" | "row";

interface CellProps {
  line: AdjustedLine;
  adjustment: Adjustment | undefined;
  disabled: boolean;
  onAdjust: AdjustHandlers["onAdjust"];
  idPrefix: IdPrefix;
}

/**
 * Shows 0 rather than a dash so the field reads as live and already-applied.
 * Clearing it still reports `undefined`, which persists as null — the schema
 * keeps "not stated" distinct from a stated zero.
 */
function StockInput({ line, adjustment, disabled, onAdjust, idPrefix }: CellProps) {
  const id = `${idPrefix}-stock-${line.materialNo}`;
  return (
    <>
      <label htmlFor={id} className="sr-only">Stock on hand for {line.description}</label>
      <input
        id={id}
        type="number"
        min={0}
        step={1}
        value={adjustment?.stockOnHand ?? 0}
        disabled={disabled}
        onChange={(event) => onAdjust(line.materialNo, { stockOnHand: parseOptionalInt(event.target.value) })}
        className={cellInput}
      />
    </>
  );
}

function AdjustControl({ line, adjustment, disabled, onAdjust, idPrefix, showCaption }: CellProps & {
  /** The table's column header is further away than the card's own label. */
  showCaption?: boolean;
}) {
  if (line.optional) {
    return (
      <>
        {/* Optional give-aways: the rep picks how many to hand over, so offer
            the quantity itself rather than making them do the delta
            arithmetic. */}
        <QtyStepper
          id={`${idPrefix}-give-${line.materialNo}`}
          label={`Quantity to give for ${line.description}`}
          value={line.finalQty}
          min={0}
          max={MAX_ADJUST_MAGNITUDE}
          disabled={disabled}
          onChange={(value) =>
            onAdjust(line.materialNo, {
              adjust: deltaForTargetQty(value, line.afterStockQty),
            })
          }
        />
        {showCaption && <span className="mt-0.5 block text-xs text-muted">give</span>}
      </>
    );
  }
  return (
    <QtyStepper
      id={`${idPrefix}-adjust-${line.materialNo}`}
      label={`Adjustment for ${line.description}`}
      value={adjustment?.adjust ?? 0}
      // Same bound the submit schema enforces, so the stepper cannot build an
      // order the server will 400 on.
      min={-MAX_ADJUST_MAGNITUDE}
      max={MAX_ADJUST_MAGNITUDE}
      disabled={disabled}
      onChange={(value) => onAdjust(line.materialNo, { adjust: value })}
    />
  );
}

/**
 * Required reason for handing over MORE than calculated; submit stays
 * blocked without it. A negative adjustment (giving fewer) never shows this
 * field at all — see `needsComment` in src/lib/calc/adjust.ts.
 */
function CommentField({ line, adjustment, disabled, onAdjust, idPrefix }: CellProps) {
  if (line.optional || (adjustment?.adjust ?? 0) <= 0) return null;
  const id = `${idPrefix}-adjust-comment-${line.materialNo}`;
  const errorId = `${id}-error`;
  const missing = needsComment(adjustment, line.optional);
  return (
    <div className="mt-1">
      <label htmlFor={id} className="sr-only">Comment for adjusting {line.description}</label>
      <input
        id={id}
        type="text"
        value={adjustment?.comment ?? ""}
        disabled={disabled}
        required
        aria-invalid={missing}
        aria-describedby={missing ? errorId : undefined}
        placeholder="Comment: reason for the adjustment (required)"
        onChange={(event) => onAdjust(line.materialNo, { comment: event.target.value })}
        className={
          "w-full max-w-sm rounded-lg border bg-surface px-2 py-1 text-sm focus:outline-brand disabled:opacity-50 " +
          (missing ? "border-negative" : "border-line-strong")
        }
      />
      {missing && (
        <p id={errorId} className="mt-1 text-xs text-negative">
          A comment is required before this order can be confirmed.
        </p>
      )}
    </div>
  );
}

/**
 * The quantity that actually ships — tinted and oversized so it survives a
 * glance down a 9-column table, and the closing line of every card. Green
 * normally, amber when it exceeds what the formula justified.
 */
function FinalQty({ line }: { line: AdjustedLine }) {
  const extraGiven = overGiveQty(line);
  return (
    <>
      <span
        className={
          "inline-block min-w-[3rem] rounded-lg px-2 py-1 text-base font-semibold tabular-nums " +
          (extraGiven > 0 ? "bg-warning-tint text-warning" : "bg-positive-tint text-ink")
        }
      >
        {line.finalQty}
      </span>
      {extraGiven > 0 && (
        <span className="mt-1 block">
          <Badge tone="warning">Extra Bonus: +{extraGiven}</Badge>
        </span>
      )}
    </>
  );
}

/** "" clears the field back to "not stated"; anything unparseable is ignored. */
function parseOptionalInt(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : undefined;
}
