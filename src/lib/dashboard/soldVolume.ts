/**
 * Reagent volume in boxes and tests instead of money. A box's test count comes
 * from the master assay pack size when the material is known; otherwise from
 * the "192T"/"480T"/"24T" the product name carries (kits outside the master,
 * e.g. mutation tests); otherwise it is unknown and only boxes are shown.
 */
const TESTS_IN_NAME = /(\d{1,5})\s*T\b/i;

export function testsPerBox(materialNo: string, productName: string, packByMaterial: Record<string, number>): number | null {
  const pack = packByMaterial[materialNo];
  if (pack && pack > 0) return pack;
  const m = TESTS_IN_NAME.exec(productName);
  return m ? Number(m[1]) : null;
}

export type SoldProduct = { materialNo: string; productName: string; revenueQty: number; revenue: number };
export type SoldVolume = SoldProduct & { boxes: number; testsPerBox: number | null; tests: number | null };

export function withVolume(products: SoldProduct[], packByMaterial: Record<string, number>): SoldVolume[] {
  return products.map((p) => {
    const per = testsPerBox(p.materialNo, p.productName, packByMaterial);
    return { ...p, boxes: p.revenueQty, testsPerBox: per, tests: per === null ? null : p.revenueQty * per };
  });
}
