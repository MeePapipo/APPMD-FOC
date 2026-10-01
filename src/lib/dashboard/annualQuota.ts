/**
 * Annual-quota Products (Core Lab, Pathology...): the quota is a figure set for
 * the year and carried in the Tableau export as Quota(Year), repeated on every
 * month that has activity, so the quota of an account x item x year is that one
 * repeated value (the largest seen), never a sum. Given = FOC + Bonus units in
 * the year. Formula Products (Molecular Lab) do not use any of this.
 */
export type AnnualFact = {
  accountName: string;
  materialNo: string;
  productName: string;
  year: number;
  annualQuota: number | null;
  focQty: number;
  bonusQty: number;
};

export type QuotaBand = "green" | "amber" | "red";

/** The Core Lab dashboard's bands: green below 80%, amber 80-100%, red above 100%. */
export function quotaBand(pct: number): QuotaBand {
  return pct > 100 ? "red" : pct >= 80 ? "amber" : "green";
}

export type AnnualItem = {
  materialNo: string;
  productName: string;
  quota: number; // 0 = no annual quota set
  given: number;
  focQty: number;
  bonusQty: number;
  pct: number | null; // null when there is no quota
  diff: number; // given - quota
  /** Over the quota by at least the admin's minimum number of units. */
  over: boolean;
};

/** One account's items for a year. Items with neither a quota nor anything given are left out. */
export function annualItems(facts: AnnualFact[], year: number, minOverUnits = 1): AnnualItem[] {
  const by = new Map<string, { productName: string; quota: number; focQty: number; bonusQty: number }>();
  for (const f of facts) {
    if (f.year !== year) continue;
    const key = f.materialNo || f.productName;
    const cur = by.get(key) ?? { productName: f.productName, quota: 0, focQty: 0, bonusQty: 0 };
    cur.quota = Math.max(cur.quota, f.annualQuota ?? 0);
    cur.focQty += f.focQty;
    cur.bonusQty += f.bonusQty;
    by.set(key, cur);
  }
  const out: AnnualItem[] = [];
  for (const [materialNo, v] of by) {
    const given = v.focQty + v.bonusQty;
    if (v.quota === 0 && given === 0) continue;
    const diff = given - v.quota;
    out.push({
      materialNo,
      productName: v.productName,
      quota: v.quota,
      given,
      focQty: v.focQty,
      bonusQty: v.bonusQty,
      pct: v.quota > 0 ? (given / v.quota) * 100 : null,
      diff,
      over: v.quota > 0 && diff >= minOverUnits && given > v.quota,
    });
  }
  return out;
}

export type AnnualSummary = { itemsWithQuota: number; itemsOver: number; excessUnits: number };

export function summariseAnnual(items: AnnualItem[]): AnnualSummary {
  let itemsWithQuota = 0, itemsOver = 0, excessUnits = 0;
  for (const i of items) {
    if (i.quota <= 0) continue;
    itemsWithQuota++;
    if (i.over) {
      itemsOver++;
      excessUnits += i.diff;
    }
  }
  return { itemsWithQuota, itemsOver, excessUnits };
}

/** Every account's summary for the year, keyed by ship-to name. */
export function annualSummaries(facts: AnnualFact[], year: number, minOverUnits = 1): Map<string, AnnualSummary & { items: AnnualItem[] }> {
  const byAccount = new Map<string, AnnualFact[]>();
  for (const f of facts) {
    if (f.year !== year) continue;
    const list = byAccount.get(f.accountName) ?? [];
    list.push(f);
    byAccount.set(f.accountName, list);
  }
  const out = new Map<string, AnnualSummary & { items: AnnualItem[] }>();
  for (const [name, list] of byAccount) {
    const items = annualItems(list, year, minOverUnits);
    out.set(name, { ...summariseAnnual(items), items });
  }
  return out;
}
