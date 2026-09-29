"use client";

import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { AdditionalFocDTO } from "@/lib/dto";
import { Button, CardRow } from "@/components/ui";
import { DkshCell, ProductCell } from "@/components/ProductCell";
import { cn } from "@/lib/cn";
import { ROW_HOVER } from "@/lib/hoverStyles";

const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

/** materialNo -> packs the rep is giving away. Absent = not on the order. */
export type ManualQuantities = Record<string, number>;

/**
 * Free-choice give-aways: no formula produces these, the rep picks the item
 * and the quantity. Kept as a separate step from the calculated preview so it
 * is obvious which numbers the tool derived and which a human chose.
 */
export function AdditionalFocPicker({ catalogue, quantities, onChange, disabled }: {
  catalogue: AdditionalFocDTO[];
  quantities: ManualQuantities;
  onChange: (materialNo: string, qty: number | undefined) => void;
  disabled: boolean;
}) {
  const baseId = useId();
  // A row stays visible while its key exists, even at zero, so clearing the
  // input to retype a number does not make the row disappear under the cursor.
  // Only the remove button drops it.
  const chosen = catalogue.filter((item) => quantities[item.materialNo] !== undefined);
  const available = catalogue.filter((item) => quantities[item.materialNo] === undefined);
  const total = chosen.reduce(
    (sum, item) => sum + (quantities[item.materialNo] ?? 0) * (item.price ?? 0),
    0,
  );

  if (catalogue.length === 0) {
    return (
      <p className="py-3 text-sm text-muted">
        No additional give-away items are set up yet.
      </p>
    );
  }

  // The explanatory blurb lives on the enclosing CategorySection.
  return (
    <div className="min-w-0 space-y-3">
      {chosen.length > 0 && (
        <>
        {/* Card per give-away below `md`, the same swap the rest of the order
            screen makes. Both copies are in the DOM, so the quantity box needs
            a per-view id prefix or its label would focus the hidden one. */}
        <ul className="divide-y divide-line border-y border-line md:hidden">
          {chosen.map((item) => {
            const qty = quantities[item.materialNo] ?? 0;
            const inputId = `${baseId}-card-${item.materialNo}`;
            return (
              <li key={item.materialNo} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <ProductCell description={item.description} materialNo={item.materialNo}>
                    {item.unitText && <div className="text-xs text-muted">{item.unitText}</div>}
                    <div className="font-mono text-xs text-muted">DKSH {item.dkshCode ?? "—"}</div>
                  </ProductCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${item.description}`}
                    title={`Remove ${item.description}`}
                    disabled={disabled}
                    onClick={() => onChange(item.materialNo, undefined)}
                    className="h-11 w-11 shrink-0 text-negative"
                  >
                    <Trash2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                  </Button>
                </div>
                <dl className="mt-2 border-t border-line pt-2">
                  <CardRow
                    label="THB / pack"
                    value={item.price === null ? "—" : money(item.price)}
                  />
                  <CardRow label="Value (THB)" value={money(qty * (item.price ?? 0))} />
                  <CardRow
                    label="Quantity (packs)"
                    value={
                      <>
                        <label htmlFor={inputId} className="sr-only">
                          Quantity of {item.description}
                        </label>
                        <input
                          id={inputId}
                          type="number"
                          min={0}
                          step={1}
                          value={qty}
                          disabled={disabled}
                          onChange={(event) => onChange(item.materialNo, toQty(event.target.value))}
                          className="no-spin w-24 rounded-lg border border-line-strong bg-surface px-2 py-1 text-right text-sm tabular-nums focus:outline-brand disabled:opacity-50"
                        />
                      </>
                    }
                  />
                </dl>
              </li>
            );
          })}
        </ul>
        {/* Outside the list: a total is not one of the give-aways, and counting
            it as a list item misreports the length to a screen reader. */}
        <div className="flex items-center justify-between gap-3 border-b border-line py-3 text-sm font-semibold text-ink md:hidden">
          <span>Third party FOC total</span>
          <span className="tabular-nums">{money(total)}</span>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[34rem] text-sm tabular-nums">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th scope="col" className="py-2 pr-3">Item</th>
                <th scope="col" className="py-2 pr-3">DKSH</th>
                <th scope="col" className="py-2 pr-3 text-right">THB / pack</th>
                <th scope="col" className="py-2 pr-3 text-right">Value (THB)</th>
                <th scope="col" className="py-2 pr-3 text-right">Quantity (packs)</th>
                <th scope="col" className="py-2" />
              </tr>
            </thead>
            <tbody>
              {chosen.map((item) => {
                const qty = quantities[item.materialNo] ?? 0;
                const inputId = `${baseId}-row-${item.materialNo}`;
                return (
                  <tr key={item.materialNo} className={cn("border-b border-line/60 align-top", ROW_HOVER)}>
                    <td className="py-2 pr-3">
                      <ProductCell description={item.description} materialNo={item.materialNo}>
                        {item.unitText && <div className="text-xs text-muted">{item.unitText}</div>}
                      </ProductCell>
                    </td>
                    <td className="py-2 pr-3"><DkshCell code={item.dkshCode} /></td>
                    <td className="py-2 pr-3 text-right">
                      {item.price === null ? "—" : money(item.price)}
                    </td>
                    <td className="py-2 pr-3 text-right">{money(qty * (item.price ?? 0))}</td>
                    <td className="py-2 pr-3 text-right">
                      <label htmlFor={inputId} className="sr-only">
                        Quantity of {item.description}
                      </label>
                      <input
                        id={inputId}
                        type="number"
                        min={0}
                        step={1}
                        value={qty}
                        disabled={disabled}
                        onChange={(event) => onChange(item.materialNo, toQty(event.target.value))}
                        className="no-spin w-24 rounded-lg border border-line-strong bg-surface px-2 py-1 text-right text-sm tabular-nums focus:outline-brand disabled:opacity-50"
                      />
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${item.description}`}
                        title={`Remove ${item.description}`}
                        disabled={disabled}
                        onClick={() => onChange(item.materialNo, undefined)}
                        className="h-9 w-9 text-negative"
                      >
                        <Trash2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold text-ink">
                <th scope="row" className="py-2 pr-3 text-left">Third party FOC total</th>
                <td />
                <td />
                <td className="py-2 pr-3 text-right">{money(total)}</td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        </>
      )}

      {available.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor={`${baseId}-add`} className="mb-1 block text-xs font-medium text-muted">
              Add a give-away item
            </label>
            <select
              id={`${baseId}-add`}
              value=""
              disabled={disabled}
              onChange={(event) => {
                if (event.target.value) onChange(event.target.value, 1);
              }}
              className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus:outline-brand disabled:opacity-50"
            >
              <option value="">Select an item…</option>
              {available.map((item) => (
                <option key={item.materialNo} value={item.materialNo}>
                  {item.description}
                  {item.price === null ? "" : ` — ${money(item.price)} THB/pack`}
                </option>
              ))}
            </select>
          </div>
          <Plus className="mb-2.5 h-4 w-4 text-muted" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

/** Blank reads as zero — the row stays, it just stops counting. */
function toQty(raw: string): number {
  if (raw.trim() === "") return 0;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? Math.max(0, value) : 0;
}
