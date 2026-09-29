export type MasterSystem = "S6800" | "S5800" | "S4800";

export const SYSTEM_LABELS: Record<MasterSystem, string> = {
  S6800: "cobas 6800/8800",
  S5800: "cobas 5800",
  S4800: "cobas 4800",
};

/** Accepts either the human label ("cobas 6800/8800") or the raw enum value
 * ("S6800") — both contain the same distinguishing digits, so one substring
 * check handles both without needing separate cases. */
export function parseSystemLabel(raw: string): MasterSystem | null {
  const s = raw.toLowerCase();
  if (s.includes("4800")) return "S4800";
  if (s.includes("5800")) return "S5800";
  if (s.includes("6800") || s.includes("8800")) return "S6800";
  return null;
}
