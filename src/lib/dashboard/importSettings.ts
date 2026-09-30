import { prisma } from "@/lib/prisma";

export const DEFAULT_PRODUCT_LINES = ["MOLECULAR LAB"];

/** The Tableau PL3 product lines the FOC import keeps (admin-editable). */
export async function loadAllowedProductLines(): Promise<string[]> {
  const row = await prisma.focImportSettings.findUnique({ where: { id: "singleton" } });
  return row && row.allowedProductLines.length > 0 ? row.allowedProductLines : DEFAULT_PRODUCT_LINES;
}
