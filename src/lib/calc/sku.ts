import { ceil } from "./round";
import type { ItemLite } from "./types";

export interface SkuUnitsRow {
  index: number;
  item: ItemLite;
  units: number; // raw pieces before packaging
}

export interface CombinedQty {
  index: number;
  qty: number; // 0 unless this row is the "holder" for its materialNo group
}

/**
 * Groups items by materialNo (the same physical box can appear once per
 * system — cross-system sharing is real, including with cobas 4800: e.g.
 * "cobas omni Secondary Tubes 13x75" is one SKU ordered across 6800/5800/4800
 * alike), sums units across sibling rows FIRST, then rounds up ONCE against
 * packSize×coverage — never per-row-then-summed.
 *
 * "Holder" row = the first row (array order) whose own units > 0; all other
 * sibling rows get qty 0 so a later blind SUM over all rows doesn't
 * double-count. Using `.find()` here is deliberate: it already means "no
 * earlier sibling had units > 0" by construction — a cheaper-looking
 * "previous row is zero" check is NOT equivalent and breaks with 3+ mates
 * when a middle sibling is legitimately zero too (a real bug fixed in
 * ~/foc-excel/build.mjs on 2026-08-30).
 */
export function combineSiblingUnits(rows: SkuUnitsRow[]): CombinedQty[] {
  const byMaterial = new Map<string, number[]>();
  for (const r of rows) {
    const list = byMaterial.get(r.item.materialNo) ?? [];
    list.push(r.index);
    byMaterial.set(r.item.materialNo, list);
  }
  const unitsByIndex = new Map(rows.map((r) => [r.index, r.units]));

  return rows.map((row) => {
    const mates = byMaterial.get(row.item.materialNo)!;
    const holder = mates.find((idx) => (unitsByIndex.get(idx) ?? 0) > 0) ?? mates[0];
    if (row.item.onDemand || holder !== row.index) {
      return { index: row.index, qty: 0 };
    }
    const totalUnits = mates.reduce((sum, idx) => sum + (unitsByIndex.get(idx) ?? 0), 0);
    return { index: row.index, qty: ceil(totalUnits / (row.item.packSize * row.item.coverage)) };
  });
}
