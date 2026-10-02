import type { AssayLite, ReagentResult, SysCode, TestsBySystem } from "./types";
import { ceil } from "./round";

type ReagentAssay = Pick<
  AssayLite,
  "system" | "code" | "description" | "materialNo" | "dkshCode" | "packSize" | "price"
>;

/**
 * Main reagent kits, combined across 6800/5800 before rounding. `freeTestsBySys` is the same kit given free:
 * rounded on its own (the rep enters whole boxes) and kept out of qty/value, which are what the order bills.
 */
export function computeReagents(assays: ReagentAssay[], testsBySys: TestsBySystem, freeTestsBySys: TestsBySystem = {}): ReagentResult[] {
  return assays
    .filter((assay) => assay.system === "6800" || assay.system === "4800")
    .flatMap((assay) => {
      const candidates: SysCode[] = assay.system === "4800" ? ["4800"] : ["6800", "5800"];
      const testsOf = (by: TestsBySystem, system: SysCode) => by[system]?.[assay.code] ?? 0;
      const systems = candidates.filter((system) => testsOf(testsBySys, system) > 0 || testsOf(freeTestsBySys, system) > 0);
      const tests = systems.reduce((sum, system) => sum + testsOf(testsBySys, system), 0);
      const freeTests = systems.reduce((sum, system) => sum + testsOf(freeTestsBySys, system), 0);
      if (tests <= 0 && freeTests <= 0) return [];
      const qty = tests > 0 ? ceil(tests / assay.packSize) : 0;
      return [{
        code: assay.code,
        description: assay.description ?? assay.code,
        materialNo: assay.materialNo,
        dkshCode: assay.dkshCode ?? null,
        systems,
        tests,
        packSize: assay.packSize,
        qty,
        unitPrice: assay.price,
        value: qty * (assay.price ?? 0),
        freeTests,
        freeQty: freeTests > 0 ? ceil(freeTests / assay.packSize) : 0,
      }];
    });
}
