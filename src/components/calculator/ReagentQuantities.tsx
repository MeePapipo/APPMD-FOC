import type { ReagentResult } from "@/lib/calc/types";
import { DkshCell } from "@/components/ProductCell";
import { CategorySection } from "@/components/CategorySection";
import { CardRow } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ROW_HOVER } from "@/lib/hoverStyles";

const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 0 });

export function ReagentQuantities({ reagents }: { reagents: ReagentResult[] }) {
  const tests = reagents.reduce((total, reagent) => total + reagent.tests, 0);
  const boxes = reagents.reduce((total, reagent) => total + reagent.qty, 0);
  const revenue = reagents.reduce((total, reagent) => total + reagent.value, 0);

  return (
    <CategorySection category="reagent" title="Order quantities" className="mt-5">
      <div className="divide-y divide-line border-y border-line md:hidden">
        {reagents.map((reagent) => (
          <div key={`${reagent.systems.join("-")}-${reagent.code}`} className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="break-words text-sm font-medium text-ink">{reagent.code}</h4>
                <p className="text-xs text-muted">{reagent.systems.map((system) => system === "6800" ? "cobas 6800/8800" : `cobas ${system}`).join(" + ")}</p>
              </div>
              <dl className="shrink-0 text-right">
                <dt className="text-xs text-muted">Quantity</dt>
                <dd className="text-sm font-semibold text-brand">{number(reagent.qty)} boxes</dd>
              </dl>
            </div>
            <p className="mt-2 break-words text-xs text-muted">{reagent.description}</p>
            <p className="font-mono text-xs text-muted">
              REF {reagent.materialNo}
              {reagent.dkshCode ? ` · DKSH ${reagent.dkshCode}` : ""}
            </p>
            <dl className="mt-2">
              <CardRow label="Tests" value={number(reagent.tests)} />
              <CardRow label="Tests/box" value={number(reagent.packSize)} />
              <CardRow
                label="Value (THB)"
                value={reagent.unitPrice === null ? "Price unavailable" : number(reagent.value)}
              />
            </dl>
          </div>
        ))}
        <dl className="grid grid-cols-2 gap-2 py-3 text-sm font-semibold tabular-nums">
          <dt>Total quantity</dt><dd className="text-right">{number(boxes)} boxes</dd>
          <dt>Total (THB)</dt><dd className="text-right">{number(revenue)}</dd>
        </dl>
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[36rem] text-sm tabular-nums">
          <thead className="bg-brand-tint text-xs text-muted">
            <tr className="border-y border-line text-left">
              <th scope="col" className="px-3 py-3">Main reagent</th>
              <th scope="col" className="px-3 py-3">DKSH</th>
              <th scope="col" className="px-3 py-3 text-right">Tests</th>
              <th scope="col" className="px-3 py-3 text-right">Tests/box</th>
              <th scope="col" className="px-3 py-3 text-right">Value (THB)</th>
              <th scope="col" className="px-3 py-3 text-right">Quantity (boxes)</th>
            </tr>
          </thead>
          <tbody>
            {reagents.map((reagent) => (
              <tr key={`${reagent.systems.join("-")}-${reagent.code}`} className={cn("border-b border-line", ROW_HOVER)}>
                <th scope="row" className="px-3 py-3 text-left font-normal">
                  <div className="font-medium text-ink">{reagent.code}</div>
                  <div className="max-w-sm break-words text-xs text-muted">{reagent.description}</div>
                  <div className="font-mono text-xs text-muted">REF {reagent.materialNo}</div>
                  <div className="text-xs text-muted">{reagent.systems.map((system) => system === "6800" ? "cobas 6800/8800" : `cobas ${system}`).join(" + ")}</div>
                </th>
                <td className="px-3 py-3"><DkshCell code={reagent.dkshCode} /></td>
                <td className="px-3 py-3 text-right">{number(reagent.tests)}</td>
                <td className="px-3 py-3 text-right">{number(reagent.packSize)}</td>
                <td className="px-3 py-3 text-right">{reagent.unitPrice === null ? "Price unavailable" : number(reagent.value)}</td>
                <td className="px-3 py-3 text-right font-semibold text-brand"><output aria-label={`Quantity ${reagent.code}`}>{number(reagent.qty)}</output></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-b border-line font-semibold text-ink">
              <th scope="row" className="px-3 py-3 text-left">Total</th>
              <td />
              <td className="px-3 py-3 text-right">{number(tests)}</td>
              <td />
              <td className="px-3 py-3 text-right">{number(revenue)}</td>
              <td className="px-3 py-3 text-right">{number(boxes)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </CategorySection>
  );
}