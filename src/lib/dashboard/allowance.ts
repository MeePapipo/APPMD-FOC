import { prisma } from "@/lib/prisma";
import type { AllowanceInfo } from "@/lib/calc/preview";
import type { AssayLite, ItemLite } from "@/lib/calc/types";
import type { TpbTableInput } from "@/lib/calc/tpb";
import { buildGot } from "./accountGiven";
import { computeEntitlement } from "./entitlement";
import { loadAlertThresholds } from "./alertSettings";
import { LEGACY_PRODUCT } from "./importSettings";

/**
 * What is left of an account's give-away allowance for the latest year in the
 * import, once the order being previewed is counted. Same engine as the
 * Dashboard drilldown: that year's billed history (Tableau) plus this order's
 * reagent packs, rounded once on the total — never per order, which would
 * inflate the quota a little with every small order.
 *
 * An account's FOC rows are found by the zero-padded account number that ends
 * the ship-to name, e.g. "PICHIT HOSPITAL  (0052027798)".
 */
export async function loadAllowance(args: {
  accountNumber: string;
  reagents: { materialNo: string; description: string; qty: number }[];
  assays: AssayLite[];
  items: ItemLite[];
  tpbInput: TpbTableInput;
}): Promise<AllowanceInfo> {
  const { accountNumber, reagents, assays, items, tpbInput } = args;
  const [fetched, latest, additional, alert] = await Promise.all([
    prisma.focActual.findMany({
      // Molecular Lab only: the same account also buys Core Lab and Pathology items from other Products.
      where: { accountName: { contains: `(${accountNumber.padStart(10, "0")})` }, OR: [{ product: LEGACY_PRODUCT }, { product: null }] },
      select: { year: true, materialNo: true, productName: true, soldQty: true, focQty: true, bonusQty: true, focCost: true, bonusCost: true },
    }),
    prisma.focActual.findFirst({ orderBy: [{ year: "desc" }, { month: "desc" }], select: { year: true, month: true } }),
    prisma.additionalFocItem.findMany({ where: { active: true }, select: { materialNo: true } }),
    loadAlertThresholds(),
  ]);

  // The allowance is for the latest year in the import: what was billed and given in that year, against the
  // quota that year's reagent sales (plus this order) earn. Earlier years are closed and not counted.
  const rows = latest ? fetched.filter((r) => r.year === latest.year) : fetched;
  const got = buildGot(rows);
  // This order is not in Tableau yet: add its reagent packs as if already sold.
  for (const r of reagents) {
    const d = got.get(r.materialNo) ?? { sold: 0, foc: 0, bonus: 0, freeCost: 0, productName: r.description };
    d.sold += r.qty;
    got.set(r.materialNo, d);
  }

  const { rows: entitlementRows } = computeEntitlement(got, assays, items, new Set(additional.map((a) => a.materialNo)), tpbInput, alert);
  const lines: AllowanceInfo["lines"] = {};
  for (const row of entitlementRows) {
    if (row.bucket !== "over" && row.bucket !== "within") continue; // only items with a quota rule
    lines[row.materialNo] = { given: row.free, entitled: row.expected, remaining: row.expected - row.free };
  }
  return {
    asOf: latest ? `${latest.year}-${String(latest.month).padStart(2, "0")}` : null,
    year: latest?.year ?? null,
    hasHistory: rows.length > 0,
    lines,
  };
}
