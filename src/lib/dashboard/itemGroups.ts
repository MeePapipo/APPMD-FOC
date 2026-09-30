/**
 * "Item Group" = Tableau's Product Category Text. The dashboard's original
 * numbers covered these four; the import now keeps every group so the others
 * can be looked at too, but the default view stays on the original four.
 */
export const DEFAULT_ITEM_GROUPS = ["Reagents, kits", "Controls", "Auxillaries", "Consumables"] as const;

/** Rows imported before the group was stored (null) count as default, so history does not vanish. */
export function inItemGroups(category: string | null, selected: readonly string[] | null): boolean {
  if (selected === null || selected.length === 0) return category === null || (DEFAULT_ITEM_GROUPS as readonly string[]).includes(category);
  return category !== null && selected.includes(category);
}
