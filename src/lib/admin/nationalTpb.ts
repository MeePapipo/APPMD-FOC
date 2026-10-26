import { ASSAY_CODE_ALIASES, batchSystemOfClass } from "@/lib/calc/accountTpb";
import { MIN_MONTH_COVERAGE } from "@/lib/calc/tpbNotices";
import { pooledTpb } from "./tpb";

/**
 * National TPB from the imported eLP SamplesPerRun usage: every instrument in
 * the country, linked to an account or not, pooled over the chosen months.
 * Same estimator as the per-account TPB and the old image-read refresh:
 * total samples / total runs per system x assay code.
 */
export interface NationalUsageRow {
  month: string; // "2026-09"
  instrumentId: string;
  systemClass: string; // eLP "c5800" / "c6800" / "c8800" / "c4800"
  assay: string; // eLP assay family, before aliasing
  runs: number;
  samples: number;
}

export interface NationalTpbRow {
  system: "S6800" | "S5800";
  code: string;
  tpb: number;
  totalRuns: number;
  totalSamples: number;
  monthsWithData: string; // "3/4"
  instruments: number;
  confidence: "normal" | "low";
}

export interface NationalTpbResult {
  rows: NationalTpbRow[];
  /** "S6800|XYZ": usage for a code with no active master assay on that system, not proposed. */
  notInMaster: string[];
}

/**
 * `months` is the window; rows outside it are ignored. `masterCodes` holds
 * "S6800|HPV"-style keys of active master assays, so only codes the
 * Calculator can use are proposed. Low confidence = data in fewer than 75% of
 * the months (the Calculator's "limited data" rule) or fewer than `minRuns` runs.
 */
export function computeNationalTpb(
  usage: NationalUsageRow[],
  months: string[],
  masterCodes: Set<string>,
  minRuns: number,
): NationalTpbResult {
  const window = new Set(months);
  const acc = new Map<string, { runs: number; samples: number; months: Set<string>; instruments: Set<string> }>();
  for (const u of usage) {
    if (!window.has(u.month) || u.runs <= 0) continue;
    const sys = batchSystemOfClass(u.systemClass);
    if (!sys) continue;
    for (const code of ASSAY_CODE_ALIASES[u.assay] ?? [u.assay]) {
      const key = `S${sys}|${code}`;
      const cur = acc.get(key) ?? { runs: 0, samples: 0, months: new Set<string>(), instruments: new Set<string>() };
      cur.runs += u.runs;
      cur.samples += u.samples;
      cur.months.add(u.month);
      cur.instruments.add(u.instrumentId);
      acc.set(key, cur);
    }
  }

  const rows: NationalTpbRow[] = [];
  const notInMaster: string[] = [];
  for (const [key, a] of acc) {
    if (!masterCodes.has(key)) {
      notInMaster.push(key);
      continue;
    }
    const tpb = pooledTpb(a.runs, a.samples);
    if (tpb === null) continue;
    const [system, code] = key.split("|") as [NationalTpbRow["system"], string];
    const low = a.months.size / months.length < MIN_MONTH_COVERAGE || a.runs < minRuns;
    rows.push({
      system,
      code,
      tpb,
      totalRuns: a.runs,
      totalSamples: a.samples,
      monthsWithData: `${a.months.size}/${months.length}`,
      instruments: a.instruments.size,
      confidence: low ? "low" : "normal",
    });
  }
  rows.sort((x, y) => x.system.localeCompare(y.system) || x.code.localeCompare(y.code));
  return { rows, notInMaster: notInMaster.sort() };
}
