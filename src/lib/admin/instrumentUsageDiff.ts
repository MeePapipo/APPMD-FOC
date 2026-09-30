/** One instrument x month x assay cell of eLP usage. */
export type UsageCell = { instrumentId: string; month: string; assay: string; runs: number; samples: number };

export const usageKey = (c: Pick<UsageCell, "instrumentId" | "month" | "assay">) => `${c.instrumentId}|${c.month}|${c.assay}`;

export type ClassifiedUsage = {
  fresh: UsageCell[];
  unchanged: number;
  changed: { cell: UsageCell; before: UsageCell }[];
};

/**
 * Sorts uploaded usage against what is stored, so a month can be uploaded again
 * (or two pulls can overlap) without double counting. A cell whose runs or
 * samples differ is reported as changed: eLP revises recent months, but the
 * admin decides whether to overwrite.
 */
export function classifyUsage(incoming: UsageCell[], existing: UsageCell[]): ClassifiedUsage {
  const stored = new Map(existing.map((c) => [usageKey(c), c]));
  const out: ClassifiedUsage = { fresh: [], unchanged: 0, changed: [] };
  for (const cell of incoming) {
    const before = stored.get(usageKey(cell));
    if (!before) out.fresh.push(cell);
    else if (before.runs === cell.runs && before.samples === cell.samples) out.unchanged++;
    else out.changed.push({ cell, before });
  }
  return out;
}
