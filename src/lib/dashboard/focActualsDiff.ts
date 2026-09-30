import type { FocActualRow } from "./focActualsImport";

/** The natural key of a FocActual row — the DB's unique index. */
export const focKey = (r: Pick<FocActualRow, "year" | "month" | "accountName" | "materialNo" | "productName">) =>
  `${r.year}|${r.month}|${r.accountName}|${r.materialNo}|${r.productName}`;

const NUMERIC: (keyof FocActualRow)[] = [
  "revenue", "revenueQty", "soldQty", "focCost", "focQty", "bonusCost", "bonusQty", "totalCost", "tests",
];

/** Same figures (the importer rounds to whole numbers, so exact comparison is right). */
export function sameFigures(a: FocActualRow, b: FocActualRow): boolean {
  return NUMERIC.every((k) => a[k] === b[k]);
}

/** Same figures and same labels (team, rep, Item Group). */
export function sameRow(a: FocActualRow, b: FocActualRow): boolean {
  return (
    sameFigures(a, b) &&
    (a.team ?? null) === (b.team ?? null) &&
    (a.rep ?? null) === (b.rep ?? null) &&
    (a.category ?? null) === (b.category ?? null)
  );
}

export type Classified = {
  fresh: FocActualRow[]; // not in the database yet
  unchanged: number; // already there, identical
  /** Same key and figures, but a label moved (rep reassigned, or the Item Group was not stored yet): safe to refresh. */
  relabelled: FocActualRow[];
  changed: { row: FocActualRow; before: FocActualRow }[]; // same key, different figures
};

/**
 * Sorts uploaded rows against what is stored, so a month can be uploaded again
 * (or two pulls can overlap) without double-counting: only `fresh` rows are
 * inserted by default. Tableau does revise past months (credits, returns), so
 * `changed` rows are reported rather than silently dropped or overwritten.
 * A row whose only difference is a label (team/rep: the same sales, a rep
 * reassigned since the earlier pull; or an Item Group that was not stored on
 * older imports) is `relabelled`: no figure moves, so the label is refreshed.
 */
export function classifyRows(incoming: FocActualRow[], existing: FocActualRow[]): Classified {
  const stored = new Map(existing.map((r) => [focKey(r), r]));
  const out: Classified = { fresh: [], unchanged: 0, relabelled: [], changed: [] };
  for (const row of incoming) {
    const before = stored.get(focKey(row));
    if (!before) out.fresh.push(row);
    else if (sameRow(row, before)) out.unchanged++;
    else if (sameFigures(row, before)) out.relabelled.push(row);
    else out.changed.push({ row, before });
  }
  return out;
}
