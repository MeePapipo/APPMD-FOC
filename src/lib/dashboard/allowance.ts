import { prisma } from "@/lib/prisma";
import type { AllowanceInfo } from "@/lib/calc/preview";
import type { AssayLite, ItemLite } from "@/lib/calc/types";
import type { TpbTableInput } from "@/lib/calc/tpb";
import { buildGot } from "./accountGiven";
import { computeEntitlement } from "./entitlement";
import { loadAlertThresholds } from "./alertSettings";

/**
 * What is left of an account's cumulative give-away allowance once the order
 * being previewed is counted. Same engine as the Dashboard drilldown: the
 * account's whole billed history (Tableau) plus this order's reagent packs,
 * rounded once on the total — never per order, which would inflate the quota
 * a little with every small order.
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
  const [rows, latest, additional, alert] = await Promise.all([
    prisma.focActual.findMany({
      where: { accountName: { contains: `(${accountNumber.padStart(10, "0")})` } },
      select: { materialNo: true, productName: true, soldQty: true, focQty: true, bonusQty: true, focCost: true, bonusCost: true },
    }),
    prisma.focActual.findFirst({ orderBy: [{ year: "desc" }, { month: "desc" }], select: { year: true, month: true } }),
    prisma.additionalFocItem.findMany({ where: { active: true }, select: { materialNo: true } }),
    loadAlertThresholds(),
  ]);

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
    hasHistory: rows.length > 0,
    lines,
  };
}
