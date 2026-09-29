import type { AssayLite, ReagentResult, SysCode, TestsBySystem } from "./types";
import { ceil } from "./round";

type ReagentAssay = Pick<
  AssayLite,
  "system" | "code" | "description" | "materialNo" | "dkshCode" | "packSize" | "price"
>;

export function computeReagents(assays: ReagentAssay[], testsBySys: TestsBySystem): ReagentResult[] {
  return assays
    .filter((assay) => assay.system === "6800" || assay.system === "4800")
    .flatMap((assay) => {
      const candidates: SysCode[] = assay.system === "4800" ? ["4800"] : ["6800", "5800"];
      const systems = candidates.filter((system) => (testsBySys[system]?.[assay.code] ?? 0) > 0);
      const tests = systems.reduce((sum, system) => sum + (testsBySys[system]?.[assay.code] ?? 0), 0);
      if (tests <= 0) return [];
      const qty = ceil(tests / assay.packSize);
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
      }];
    });
}