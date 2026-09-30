import type { BatchSysCode, TestsBySystem } from "./types";
import type { TpbDetail } from "./accountTpb";

export interface TpbMeta {
  system: BatchSysCode;
  code: string;
  tpb: number;
  confidence: string;
  monthsWithData: string | null; // "4/8" — months with usage data out of the window
}

export interface TpbNotice {
  system: BatchSysCode;
  code: string;
  /** no-data / limited are warnings; account is informational (the account's own TPB was used). */
  kind: "no-data" | "limited" | "account";
  message: string;
}

/** Below this share of months with data the TPB is treated as thin evidence. */
const MIN_MONTH_COVERAGE = 0.75;

function coverage(monthsWithData: string | null): number | null {
  const m = monthsWithData?.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m || Number(m[2]) === 0) return null;
  return Number(m[1]) / Number(m[2]);
}

/**
 * Flags the assays in an order whose run count leans on weak TPB evidence: no
 * usage data at all (the system floor is used instead), or an entry marked
 * low-confidence / covering too few months. Only assays actually ordered are
 * reported, and only on the 6800/5800 systems — 4800 has no TPB.
 */
export function tpbNotices(
  meta: TpbMeta[],
  floors: Record<BatchSysCode, number>,
  testsBySys: TestsBySystem,
  detail?: Map<string, TpbDetail>,
): TpbNotice[] {
  const byKey = new Map(meta.map((m) => [`${m.system}|${m.code}`, m]));
  const notices: TpbNotice[] = [];
  for (const system of ["6800", "5800"] as const) {
    for (const [code, tests] of Object.entries(testsBySys[system] ?? {})) {
      if ((tests ?? 0) <= 0) continue;
      // The account's own TPB replaced the national one: say so instead of
      // warning about the national value's coverage.
      const d = detail?.get(`${system}|${code}`);
      if (d?.source === "account") {
        notices.push({ system, code, kind: "account", message: `${code}: this account's own ${d.tpb} tests per run is used (${d.runs} runs; national ${d.national}).` });
        continue;
      }
      if (d?.source === "floor-clamped") {
        notices.push({ system, code, kind: "account", message: `${code}: this account runs ${d.own} tests per run, so the floor of ${d.tpb} (${Math.round((d.tpb! / d.national!) * 100)}% of national ${d.national}) is used.` });
        continue;
      }
      const entry = byKey.get(`${system}|${code}`);
      if (!entry) {
        notices.push({ system, code, kind: "no-data", message: `${code}: no usage data, so the default ${floors[system]} tests per run is used.` });
        continue;
      }
      const cov = coverage(entry.monthsWithData);
      if (entry.confidence === "low" || (cov !== null && cov < MIN_MONTH_COVERAGE)) {
        const months = entry.monthsWithData ? ` (data for ${entry.monthsWithData} months)` : "";
        notices.push({ system, code, kind: "limited", message: `${code}: tests per run (${entry.tpb}) rests on limited usage data${months}, so run counts are less reliable.` });
      }
    }
  }
  return notices;
}
