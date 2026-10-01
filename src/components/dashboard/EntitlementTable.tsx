"use client";

import { Fragment, useState } from "react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ROW_HOVER } from "@/lib/hoverStyles";

type EntitlementRow = {
  materialNo: string;
  productName: string;
  optional: boolean;
  expected: number;
  focQty: number;
  bonusQty: number;
  free: number;
  sold: number;
  freeCost: number;
  excessValue: number;
  over: number;
  ratio: number | null;
  bucket: "over" | "within" | "noRule" | "reagent" | "wrongPlatform" | "additional";
  significant?: boolean; // critical: over quota beyond +1 per bill or the admin's % threshold
  severity?: "critical" | "warning" | null; // warning: over, but within +1 per bill
};

type Entitlement = {
  platform: { platform: string; basis: string; has4800: boolean };
  assayTests: { code: string; tests: number; batches: number }[];
  rows: EntitlementRow[];
  totals: { overCost: number; withinCost: number; noRuleCost: number; reagentFreeCost: number; wrongPlatformCost: number; additionalCost: number; significantCount: number; significantCost: number; warningCount: number };
  bills?: number | null;
};

const money = (n: number) => `${Math.round(n).toLocaleString()}`;

type SortKey = "productName" | "expected" | "focQty" | "bonusQty" | "free" | "over" | "ratio" | "excessValue";

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "productName", label: "สินค้า" },
  { key: "expected", label: "Quota", align: "right" },
  { key: "focQty", label: "FOC", align: "right" },
  { key: "bonusQty", label: "Bonus", align: "right" },
  { key: "free", label: "รวมแถม", align: "right" },
  { key: "over", label: "ส่วนเกิน", align: "right" },
  { key: "ratio", label: "เท่าของสิทธิ์", align: "right" },
  { key: "excessValue", label: "มูลค่าส่วนเกิน (฿)", align: "right" },
];

// A null ratio ("ไม่มีสิทธิ์" — something given against a zero quota) sorts as
// worse than any finite ratio, matching how the rest of this dashboard
// treats an undefined-denominator ratio as an extreme, not a missing value.
function sortValue(r: EntitlementRow, key: SortKey): number | string {
  if (key === "productName") return r.productName;
  if (key === "ratio") return r.ratio === null ? Infinity : r.ratio;
  return r[key];
}

const BUCKETS: { key: EntitlementRow["bucket"]; title: string; hint: string; totalKey: keyof Entitlement["totals"]; defaultOpen?: boolean }[] = [
  { key: "over", title: "Over Quota", hint: "Given more than the quota", totalKey: "overCost", defaultOpen: true },
  { key: "within", title: "อยู่ในสิทธิ์", hint: "แถมเท่ากับหรือน้อยกว่าสิทธิ์", totalKey: "withinCost" },
  { key: "noRule", title: "ไม่มีสูตรคำนวณ", hint: "ไม่มีทั้งในไฟล์ master และในรายการ Additional FOC", totalKey: "noRuleCost" },
  { key: "reagent", title: "น้ำยาหลักแถมฟรี", hint: "ไม่นำมาเทียบ — เป็นการตัดสินใจเชิงพาณิชย์", totalKey: "reagentFreeCost" },
  { key: "wrongPlatform", title: "ส่งผิดรุ่นเครื่อง", hint: "มีสูตรคำนวณ แต่เป็นของรุ่นเครื่องที่ account นี้ไม่ได้ใช้", totalKey: "wrongPlatformCost" },
  { key: "additional", title: "Additional FOC", hint: "ของแถมที่ไม่ผูกกับ assay จึงไม่มี Quota — คิดเป็นต้นทุนที่เสียไป", totalKey: "additionalCost" },
];

/** "Quota vs actual given" — Part 2 of the account drill-down. Mirrors the
 * reference dashboard's own layout closely (Thai copy, same column set,
 * same bucket grouping) per praditww's explicit "ทำให้เหมือนต้นแบบ" ask. See
 * `src/lib/dashboard/entitlement.ts` for the computation and its verification
 * against this exact reference. */
export function EntitlementTable({ entitlement, period = null }: { entitlement: Entitlement; period?: string | null }) {
  const [open, setOpen] = useState<Set<string>>(new Set(BUCKETS.filter((b) => b.defaultOpen).map((b) => b.key)));
  const [sortKey, setSortKey] = useState<SortKey>("excessValue");
  const [desc, setDesc] = useState(true);

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function onSort(key: SortKey) {
    if (key === sortKey) setDesc((d) => !d);
    else {
      setSortKey(key);
      setDesc(true);
    }
  }

  const byBucket = new Map<string, EntitlementRow[]>();
  for (const r of entitlement.rows) {
    const list = byBucket.get(r.bucket) ?? [];
    list.push(r);
    byBucket.set(r.bucket, list);
  }
  for (const list of byBucket.values()) {
    list.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return desc ? -cmp : cmp;
    });
  }

  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-ink">Quota เท่าไร vs แถมจริงเท่าไร</h3>
      <p className="mb-1 text-xs text-muted">
        รุ่นเครื่องที่ใช้คิด: cobas {entitlement.platform.platform.replace("+4800", "")}
        {entitlement.platform.has4800 && " + cobas 4800"} · {entitlement.platform.basis}
      </p>
      {entitlement.assayTests.length > 0 && (
        <p className="mb-1 text-xs text-muted">
          น้ำยาหลักที่ส่งจริง:{" "}
          {entitlement.assayTests
            .map((a) => `${a.code} ${a.tests.toLocaleString()} tests${a.batches > 0 ? ` (${a.batches.toLocaleString()} batches)` : ""}`)
            .join(" · ")}
        </p>
      )}
      <p className="mb-1 text-xs text-muted">{period ? `เฉพาะปี ${period}` : "ครอบคลุมทั้งช่วงข้อมูล"} ไม่ขึ้นกับตัวกรองเดือน · จำนวนเป็นกล่อง</p>
      {typeof entitlement.bills === "number" && (
        <p className="mb-3 text-xs text-muted">
          บิลน้ำยา (เดือนที่มียอดขาย) {entitlement.bills.toLocaleString()} บิล · แถมเกินสิทธิ์ไม่เกิน +{entitlement.bills.toLocaleString()} = <span className="font-medium text-warning">Warning</span> (เหลือง) · เกินกว่านั้น = <span className="font-medium text-negative">Over Quota</span> (แดง)
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line bg-canvas text-left">
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={c.align === "right" ? "py-2 pr-3 text-right" : "py-2 pl-3 pr-3"}
                >
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
            {BUCKETS.map((b) => {
              const rows = byBucket.get(b.key) ?? [];
              const total = entitlement.totals[b.totalKey];
              if (rows.length === 0 && total === 0) return null;
              const isOpen = open.has(b.key);
              return (
                <Fragment key={b.key}>
                  <tr className="border-b border-line bg-canvas/60">
                    <td colSpan={7} className="py-2 pl-3 pr-3">
                      <button type="button" onClick={() => toggle(b.key)} className="inline-flex items-center gap-1.5 text-left font-medium text-ink">
                        <span aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
                        {b.title} · {rows.length} รายการ · {b.hint}
                      </button>
                    </td>
                    <td className="py-2 pl-3 pr-3 text-right font-semibold text-ink">฿{money(total)}</td>
                  </tr>
                  {isOpen &&
                    rows.map((r) => {
                      const hasQuota = r.bucket === "over" || r.bucket === "within";
                      return (
                        <tr key={r.materialNo} className={cn("border-b border-line/60", ROW_HOVER)}>
                          <td className="py-2 pl-3 pr-3">
                            <span className="text-ink">{r.productName}</span>
                            {r.optional && (
                              <span className="ml-2 align-middle">
                                <Badge tone="neutral">Optional</Badge>
                              </span>
                            )}
                            {r.significant && (
                              <span className="ml-2 align-middle">
                                <Badge tone="negative">Over Quota</Badge>
                              </span>
                            )}
                            {!r.significant && r.severity === "warning" && (
                              <span className="ml-2 align-middle">
                                <Badge tone="warning">Warning</Badge>
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-muted">{hasQuota ? r.expected.toLocaleString() : "—"}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-muted">{r.focQty.toLocaleString()}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-muted">{r.bonusQty.toLocaleString()}</td>
                          <td className="py-2 pr-3 text-right tabular-nums font-medium text-ink">{r.free.toLocaleString()}</td>
                          <td className={`py-2 pr-3 text-right tabular-nums font-medium ${r.significant ? "text-negative" : r.severity === "warning" ? "text-warning" : "text-muted"}`}>
                            {hasQuota ? (r.over > 0 ? `+${r.over.toLocaleString()}` : r.over.toLocaleString()) : "—"}
                          </td>
                          <td className={`py-2 pr-3 text-right tabular-nums font-medium text-muted`}>
                            {r.ratio !== null ? `${r.ratio.toFixed(2)}×` : hasQuota ? "ไม่มีสิทธิ์" : "—"}
                          </td>
                          <td className="py-2 pl-3 pr-3 text-right tabular-nums text-ink">฿{money(r.excessValue)}</td>
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
