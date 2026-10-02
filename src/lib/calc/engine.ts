import { mergeTests, type AssayLite, type BatchSysCode, type ComputeOptions, type ComputeResult, type ItemLite, type SysCode, type TestsBySystem } from "./types";
import { buildTpbTable, type TpbTableInput } from "./tpb";
import { groupsFor, runsForSystem } from "./batches";
import { unitsForItem } from "./driver";
import { unitsFor4800Item } from "./engine4800";
import { combineSiblingUnits } from "./sku";
import { computeReagents } from "./reagents";

const BATCH_SYSTEMS: BatchSysCode[] = ["6800", "5800"];

/**
 * Computes one submission spanning any mix of systems in a single pass. This
 * mirrors ~/foc-excel/verify.mjs's modelMixed(), with two corrections applied
 * deliberately (see driver.ts and engine4800.ts for why):
 *
 *  1. cobas 6800/8800 and 5800 share a driver+batch/TPB model; cobas 4800 has
 *     no batch/TPB concept and uses a per-assay weighted-linear model instead.
 *  2. SKU combining (sku.ts) runs across ALL systems together in one pass —
 *     some physical consumables are the same SKU shared across 4800 and
 *     6800/5800 (confirmed via shared material numbers in
 *     ~/foc-excel/data/items.json), so combining them separately per system
 *     would double-round and produce wrong box counts.
 */
export function computeSubmission(
  items: ItemLite[],
  assays: AssayLite[],
  paidTestsBySys: TestsBySystem,
  tpbInput: TpbTableInput,
  opts: ComputeOptions = {},
): ComputeResult {
  // The supporting items follow every test run on the instrument, paid or free; revenue is paid tests only.
  const testsBySys = mergeTests(paidTestsBySys, opts.freeTestsBySys);
  const tpbTable = buildTpbTable(tpbInput);
  const optionalTicked = opts.optionalTicked ?? {};

  const groups = Object.fromEntries(
    BATCH_SYSTEMS.map((sys) => [sys, groupsFor(sys, assays)]),
  ) as Record<BatchSysCode, ReturnType<typeof groupsFor>>;

  const runs = Object.fromEntries(
    BATCH_SYSTEMS.map((sys) => [sys, runsForSystem(sys, groups[sys], testsBySys[sys] ?? {}, tpbTable)]),
  ) as Record<BatchSysCode, Map<number, number>>;

  const allCodesFor = Object.fromEntries(
    BATCH_SYSTEMS.map((sys) => [sys, assays.filter((a) => a.system === sys).map((a) => a.code)]),
  ) as Record<BatchSysCode, string[]>;

  const units = items.map((item) => {
    if (item.system === "4800") {
      return unitsFor4800Item(item, testsBySys["4800"] ?? {});
    }
    const sys = item.system as BatchSysCode;
    return unitsForItem(item, allCodesFor[sys], groups[sys], runs[sys], testsBySys[sys] ?? {});
  });

  const skuRows = items.map((item, index) => ({ index, item, units: units[index] }));
  const combined = combineSiblingUnits(skuRows);

  // Which systems actually fed each SKU, recovered from the pre-combine units.
  // sku.ts collapses siblings onto one holder row, so without this the holder
  // would look like a single-system line even when 6800 and 5800 both fed it.
  const systemsByMaterial = new Map<string, SysCode[]>();
  items.forEach((item, index) => {
    if (units[index] <= 0) return;
    const seen = systemsByMaterial.get(item.materialNo) ?? [];
    if (!seen.includes(item.system)) seen.push(item.system);
    systemsByMaterial.set(item.materialNo, seen);
  });

  const rows = items.map((item, index) => {
    const qty = combined[index].qty;
    const counted = !item.optional || optionalTicked[item.materialNo] === true;
    const value = counted ? qty * (item.price ?? 0) : 0;
    return { qty, value, systems: systemsByMaterial.get(item.materialNo) ?? [item.system] };
  });

  // Assay-kit revenue: 6800 and 5800 share reagent kits/pricing per assay code
  // (verified invariant — see engine.test.ts), so their test volumes combine
  // before rounding, same as SKU combining above. cobas 4800 uses entirely
  // distinct kits/codes (never shares a code string with 6800/5800), so its
  // revenue is simply additive.
  const reagents = computeReagents(assays, paidTestsBySys, opts.freeTestsBySys);
  const revenue = reagents.reduce((sum, reagent) => sum + reagent.value, 0);

  const focValue = rows.reduce((sum, r) => sum + r.value, 0);
  return { reagents, rows, runs, revenue, focValue, focPct: revenue ? focValue / revenue : 0 };
}
