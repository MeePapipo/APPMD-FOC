/**
 * Product x Jan..Dec matrix for one account and one year — the Accounts view's
 * expanded row and its CSV/PDF exports. Pure: takes the account's `FocActual`
 * facts (any years), so the route, the exports and the tests share one
 * definition of "what lands in a cell".
 */

export type MatrixFact = {
  year: number;
  month: number;
  materialNo: string;
  productName: string;
  focQty: number;
  bonusQty: number;
  focCost: number;
  bonusCost: number;
};

export type MatrixCell = { focQty: number; bonusQty: number; focCost: number; bonusCost: number };

export type MatrixRow = {
  materialNo: string;
  productName: string;
  /** Index 0 = January. Always 12 cells, zero-filled. */
  months: MatrixCell[];
  ytd: MatrixCell;
  /** The whole previous calendar year. */
  prior: MatrixCell;
};

export type AccountMatrix = {
  year: number;
  rows: MatrixRow[];
  totals: { months: MatrixCell[]; ytd: MatrixCell; prior: MatrixCell };
};

export type Measure = "qty" | "cost";
/** Which part of FOC + Bonus a cell shows. */
export type Split = "both" | "foc" | "bonus";

export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const emptyCell = (): MatrixCell => ({ focQty: 0, bonusQty: 0, focCost: 0, bonusCost: 0 });

function addInto(target: MatrixCell, f: MatrixCell) {
  target.focQty += f.focQty;
  target.bonusQty += f.bonusQty;
  target.focCost += f.focCost;
  target.bonusCost += f.bonusCost;
}

const isEmpty = (c: MatrixCell) => c.focQty === 0 && c.bonusQty === 0 && c.focCost === 0 && c.bonusCost === 0;

/** The number a cell shows for the chosen measure and FOC/Bonus split. */
export function cellValue(cell: MatrixCell, measure: Measure, split: Split = "both"): number {
  const foc = measure === "qty" ? cell.focQty : cell.focCost;
  const bonus = measure === "qty" ? cell.bonusQty : cell.bonusCost;
  return split === "foc" ? foc : split === "bonus" ? bonus : foc + bonus;
}

/**
 * One row per product that was given anything in `year` or the year before,
 * sorted by the year's total cost (then quantity) so the heavy items lead.
 * Facts from other years are ignored; months outside 1..12 are dropped.
 */
export function buildAccountMatrix(facts: MatrixFact[], year: number): AccountMatrix {
  const byProduct = new Map<string, MatrixRow>();
  const totals = { months: Array.from({ length: 12 }, emptyCell), ytd: emptyCell(), prior: emptyCell() };

  for (const f of facts) {
    const inYear = f.year === year;
    if (!inYear && f.year !== year - 1) continue;
    if (inYear && (f.month < 1 || f.month > 12)) continue;
    const key = f.materialNo || f.productName;
    let row = byProduct.get(key);
    if (!row) {
      row = { materialNo: f.materialNo, productName: f.productName, months: Array.from({ length: 12 }, emptyCell), ytd: emptyCell(), prior: emptyCell() };
      byProduct.set(key, row);
    }
    if (inYear) {
      addInto(row.months[f.month - 1], f);
      addInto(row.ytd, f);
      addInto(totals.months[f.month - 1], f);
      addInto(totals.ytd, f);
    } else {
      addInto(row.prior, f);
      addInto(totals.prior, f);
    }
  }

  const rows = [...byProduct.values()]
    .filter((r) => !isEmpty(r.ytd) || !isEmpty(r.prior))
    .sort((a, b) => {
      const cost = (r: MatrixRow) => r.ytd.focCost + r.ytd.bonusCost;
      const qty = (r: MatrixRow) => r.ytd.focQty + r.ytd.bonusQty;
      return cost(b) - cost(a) || qty(b) - qty(a) || a.productName.localeCompare(b.productName);
    });
  return { year, rows, totals };
}
