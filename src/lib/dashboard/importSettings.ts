import { prisma } from "@/lib/prisma";

export const DEFAULT_PRODUCT_LINES = ["MOLECULAR LAB", "PATHOLOGY LAB", "CORE LAB"];

/** The Tableau PL3 product lines the FOC import keeps (admin-editable). */
export async function loadAllowedProductLines(): Promise<string[]> {
  const row = await prisma.focImportSettings.findUnique({ where: { id: "singleton" } });
  return row && row.allowedProductLines.length > 0 ? row.allowedProductLines : DEFAULT_PRODUCT_LINES;
}

/** Rows imported before Product was stored belong to Molecular Lab, the only Product loaded then. */
export const LEGACY_PRODUCT = "MOLECULAR LAB";

export const productOf = (product: string | null): string => product ?? LEGACY_PRODUCT;

/**
 * Which Products are imported, and which of them use the Calculator formula as
 * their quota (every other Product uses the annual Quota(Year) from Tableau).
 */
export async function loadProductSettings(): Promise<{ allowed: string[]; formula: string[] }> {
  const row = await prisma.focImportSettings.findUnique({ where: { id: "singleton" } });
  return {
    allowed: row && row.allowedProductLines.length > 0 ? row.allowedProductLines : DEFAULT_PRODUCT_LINES,
    formula: row && row.formulaProducts.length > 0 ? row.formulaProducts : [LEGACY_PRODUCT],
  };
}
