import { notFound } from "next/navigation";
import { FileSpreadsheet, FileText } from "lucide-react";
import { requireUser } from "@/lib/session";
import { SYSTEM_SHORT_LABELS, loadSubmissionDoc } from "@/lib/export/submission-doc";
import { Card, Badge, CardRow } from "@/components/ui";
import { DkshCell, ProductCell } from "@/components/ProductCell";
import { DownloadButton } from "@/components/DownloadButton";
import { cn } from "@/lib/cn";
import { ROW_HOVER } from "@/lib/hoverStyles";

const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const qty = (n: number | null) => (n === null ? "—" : n.toLocaleString());

export default async function SubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const doc = await loadSubmissionDoc(id, user);
  if (!doc) notFound();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">{doc.accountName}</h1>
          <p className="text-sm text-muted">
            {doc.accountNumber} · submitted by {doc.repEmail} on {doc.createdAt.toLocaleString()}
          </p>
          <p className="text-sm text-muted">{doc.systemsLabel}</p>
        </div>
        <div className="flex items-start gap-2">
          <DownloadButton href={`/api/submissions/${doc.id}/pdf`} label="Download PDF">
            <FileText className="h-4 w-4" aria-hidden="true" />
          </DownloadButton>
          <DownloadButton href={`/api/submissions/${doc.id}/xlsx`} label="Download Excel">
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
          </DownloadButton>
        </div>
      </div>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-medium text-ink">Test volumes entered</h2>
        {doc.assayInputs.length === 0 ? (
          <p className="text-sm text-muted">No test volumes recorded.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2 md:grid-cols-3">
            {doc.assayInputs.map((a) => (
              <li key={`${a.system}-${a.assayCode}`} className="text-muted">
                <span className="text-ink">{a.assayCode}</span> ({SYSTEM_SHORT_LABELS[a.system]}):{" "}
                {a.tests.toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium text-ink">Main reagents ordered</h2>
        {doc.reagents.length === 0 ? (
          <p className="text-sm text-muted">No main reagents recorded for this order.</p>
        ) : (
          <>
          <ul className="divide-y divide-line border-y border-line md:hidden">
            {doc.reagents.map((r) => (
              <li key={r.materialNo} className="py-3">
                <ProductCell description={r.description} materialNo={r.materialNo}>
                  <div className="font-mono text-xs text-muted">DKSH {r.dkshCode ?? "—"}</div>
                </ProductCell>
                <dl className="mt-2 border-t border-line pt-2">
                  <CardRow label="Tests" value={r.tests.toLocaleString()} />
                  <CardRow label="Value" value={money(r.value)} />
                  <CardRow label="Boxes" value={<span className="font-medium">{r.qty}</span>} />
                </dl>
              </li>
            ))}
          </ul>
          {/* Outside the list — a total is not one of the reagents ordered. */}
          <div className="flex items-center justify-between gap-3 border-b border-line py-3 text-sm font-semibold text-ink md:hidden">
            <span>Total</span>
            <span className="tabular-nums">{money(doc.reagentTotal)}</span>
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[36rem] text-sm tabular-nums">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th scope="col" className="py-1 pr-2">Item</th>
                  <th scope="col" className="py-1 pr-2">DKSH</th>
                  <th scope="col" className="py-1 pr-2 text-right">Tests</th>
                  <th scope="col" className="py-1 pr-2 text-right">Value</th>
                  <th scope="col" className="py-1 text-right">Boxes</th>
                </tr>
              </thead>
              <tbody>
                {doc.reagents.map((r) => (
                  <tr key={r.materialNo} className={cn("border-b border-line/60 align-top", ROW_HOVER)}>
                    <td className="py-1.5 pr-2">
                      <ProductCell description={r.description} materialNo={r.materialNo} />
                    </td>
                    <td className="py-1.5 pr-2"><DkshCell code={r.dkshCode} /></td>
                    <td className="py-1.5 pr-2 text-right">{r.tests.toLocaleString()}</td>
                    <td className="py-1.5 pr-2 text-right">{money(r.value)}</td>
                    <td className="py-1.5 text-right font-medium">{r.qty}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold text-ink">
                  <th scope="row" className="py-1.5 pr-2 text-left">Total</th>
                  <td />
                  <td />
                  <td className="py-1.5 pr-2 text-right">{money(doc.reagentTotal)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          </>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">Order lines</h2>
          <div className="flex items-center gap-2">
            {doc.overGive.lineCount > 0 && (
              <Badge tone="warning">Extra Bonus: {doc.overGive.lineCount} รายการ</Badge>
            )}
            <Badge tone={doc.status === "VOID" ? "negative" : "positive"}>{doc.status}</Badge>
          </div>
        </div>
        {/* The approver's cue. Deliberately keyed on the quantity, not on
            adjustComment: optional give-aways are exempt from the reason
            field, so a comment-only trigger would hide exactly the lines a rep
            is freest to inflate. */}
        {doc.overGive.lineCount > 0 && (
          <p className="mb-3 rounded-lg bg-warning-tint p-3 text-sm text-warning">
            <span className="font-semibold">
              Extra Bonus: {doc.overGive.lineCount} รายการ · +{doc.overGive.packs} หน่วย ·{" "}
              {money(doc.overGive.value)} THB
            </span>
            <span className="mt-1 block">
              These quantities are above the calculated amount after stock on hand. Consider
              whether each is necessary before approving.
            </span>
          </p>
        )}
        {doc.focItems.length === 0 ? (
          <p className="text-sm text-muted">No FOC items on this order.</p>
        ) : (
          <>
          {/* Eight columns need ~768px, so the cards run to `lg` — same
              threshold the calculator's preview uses for the same reason. */}
          <ul className="divide-y divide-line border-y border-line lg:hidden">
            {doc.focItems.map((l) => (
              <li
                key={l.materialNo}
                className={"px-2 py-3 " + (l.overGiveQty > 0 ? "bg-warning-tint" : "")}
              >
                <ProductCell description={l.description} materialNo={l.materialNo}>
                  <div className="font-mono text-xs text-muted">DKSH {l.dkshCode ?? "—"}</div>
                  <div className="text-xs text-muted">{l.group}</div>
                  {l.overGiveQty > 0 && (
                    <div className="text-xs font-medium text-warning">
                      Extra Bonus: +{l.overGiveQty}
                    </div>
                  )}
                  {l.adjustComment && (
                    <div className="text-xs text-warning">Comment: {l.adjustComment}</div>
                  )}
                </ProductCell>
                <dl className="mt-2 border-t border-line pt-2">
                  <CardRow label="Calculated" value={l.calculatedQty} />
                  <CardRow label="Stock on hand" value={qty(l.stockOnHand)} />
                  <CardRow label="After stock" value={l.afterStockQty} />
                  <CardRow label="Adjust" value={l.adjustedQty === 0 ? "—" : l.adjustedQty} />
                  <CardRow label="Value" value={money(l.finalValue)} />
                  <CardRow
                    label="Quantity"
                    value={<span className="text-base font-semibold text-ink">{l.finalQty}</span>}
                    className="border-t border-line pt-2"
                  />
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[48rem] text-sm tabular-nums">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th scope="col" className="py-1 pr-2">Item</th>
                  <th scope="col" className="py-1 pr-2">DKSH</th>
                  <th scope="col" className="py-1 pr-2 text-right">Calculated</th>
                  <th scope="col" className="py-1 pr-2 text-right">Stock on hand</th>
                  <th scope="col" className="py-1 pr-2 text-right">After stock</th>
                  <th scope="col" className="py-1 pr-2 text-right">Adjust</th>
                  <th scope="col" className="py-1 pr-2 text-right">Value</th>
                  <th scope="col" className="py-1 text-right">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {doc.focItems.map((l) => (
                  <tr
                    key={l.materialNo}
                    className={
                      "border-b border-line/60 align-top " +
                      (l.overGiveQty > 0 ? "bg-warning-tint" : "")
                    }
                  >
                    <td className="py-1.5 pr-2">
                      <ProductCell description={l.description} materialNo={l.materialNo}>
                        <div className="text-xs text-muted">{l.group}</div>
                        {l.overGiveQty > 0 && (
                          <div className="text-xs font-medium text-warning">
                            Extra Bonus: +{l.overGiveQty}
                          </div>
                        )}
                        {l.adjustComment && (
                          <div className="text-xs text-warning">Comment: {l.adjustComment}</div>
                        )}
                      </ProductCell>
                    </td>
                    <td className="py-1.5 pr-2"><DkshCell code={l.dkshCode} /></td>
                    <td className="py-1.5 pr-2 text-right">{l.calculatedQty}</td>
                    <td className="py-1.5 pr-2 text-right">{qty(l.stockOnHand)}</td>
                    <td className="py-1.5 pr-2 text-right">{l.afterStockQty}</td>
                    <td className="py-1.5 pr-2 text-right">{l.adjustedQty === 0 ? "—" : l.adjustedQty}</td>
                    <td className="py-1.5 pr-2 text-right">{money(l.finalValue)}</td>
                    <td className="py-1.5 text-right text-base font-semibold text-ink">
                      {l.finalQty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        {doc.additionalFocItems.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-medium text-ink">Third party FOC (chosen by the rep)</h3>
            <ul className="divide-y divide-line border-y border-line md:hidden">
              {doc.additionalFocItems.map((a) => (
                <li key={a.materialNo} className="py-3">
                  <ProductCell description={a.description} materialNo={a.materialNo}>
                    {a.packText && <div className="text-xs text-muted">{a.packText}</div>}
                    <div className="font-mono text-xs text-muted">DKSH {a.dkshCode ?? "—"}</div>
                  </ProductCell>
                  <dl className="mt-2 border-t border-line pt-2">
                    <CardRow
                      label="THB / pack"
                      value={a.unitPrice === null ? "—" : money(a.unitPrice)}
                    />
                    <CardRow label="Value" value={money(a.value)} />
                    <CardRow label="Quantity" value={<span className="font-medium">{a.qty}</span>} />
                  </dl>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[34rem] text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th scope="col" className="py-1 pr-2">Item</th>
                    <th scope="col" className="py-1 pr-2">DKSH</th>
                    <th scope="col" className="py-1 pr-2 text-right">THB / pack</th>
                    <th scope="col" className="py-1 pr-2 text-right">Value</th>
                    <th scope="col" className="py-1 text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.additionalFocItems.map((a) => (
                    <tr key={a.materialNo} className={cn("border-b border-line/60 align-top", ROW_HOVER)}>
                      <td className="py-1.5 pr-2">
                        <ProductCell description={a.description} materialNo={a.materialNo}>
                          {a.packText && <div className="text-xs text-muted">{a.packText}</div>}
                        </ProductCell>
                      </td>
                      <td className="py-1.5 pr-2"><DkshCell code={a.dkshCode} /></td>
                      <td className="py-1.5 pr-2 text-right">{a.unitPrice === null ? "—" : money(a.unitPrice)}</td>
                      <td className="py-1.5 pr-2 text-right">{money(a.value)}</td>
                      <td className="py-1.5 text-right font-medium">{a.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:justify-end sm:gap-6">
          <div className="text-muted">Revenue {money(doc.revenue)} THB</div>
          {doc.additionalFocTotal > 0 && (
            <div className="text-muted">
              Calculated {money(doc.calculatedFocTotal)} + additional {money(doc.additionalFocTotal)}
            </div>
          )}
          <div className="font-semibold text-ink">
            FOC {money(doc.focTotal)} THB ({(doc.focPct * 100).toFixed(1)}%)
          </div>
        </div>
      </Card>
    </div>
  );
}

