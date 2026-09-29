import type { AssayLite, ItemLite, TestsBySystem } from "./types";
import type { TpbTableInput } from "./tpb";
import { computeSubmission } from "./engine";
import { ceil } from "./round";

const QUOTA_BUFFER = 1.1;

export interface QuotaAllotment {
  materialNo: string;
  allottedQty: number;
}

/**
 * Annual FOC quota = the same engine used for real orders, fed annual test
 * volumes instead of a per-order volume, plus a 10% buffer for repeat runs /
 * instrument downtime. Reusing computeSubmission (not a parallel formula) is
 * what guarantees forecast math always matches real-order math.
 *
 * Forecasts always count every optional item as ticked — the quota is meant
 * to cover the account's full annual freebie entitlement, not a guess at
 * which optional items a specific future order will include. Non-"holder"
 * sibling rows in a combined-SKU group return 0 here by construction (see
 * sku.ts) — callers should upsert Quota by materialNo and simply skip zeros.
 */
export function annualToQuota(
  items: ItemLite[],
  assays: AssayLite[],
  annualTestsBySys: TestsBySystem,
  tpbInput: TpbTableInput,
): QuotaAllotment[] {
  const optionalTicked = Object.fromEntries(
    items.filter((i) => i.optional).map((i) => [i.materialNo, true]),
  );
  const result = computeSubmission(items, assays, annualTestsBySys, tpbInput, { optionalTicked });
  return items
    .map((item, index) => ({
      materialNo: item.materialNo,
      allottedQty: ceil(result.rows[index].qty * QUOTA_BUFFER),
    }))
    .filter((q) => q.allottedQty > 0);
}
