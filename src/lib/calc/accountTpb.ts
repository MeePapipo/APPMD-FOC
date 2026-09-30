import type { BatchSysCode, TestsBySystem } from "./types";
import type { TpbTableInput } from "./tpb";

/**
 * Per-account TPB. An account's own samples-per-run replaces the national TPB
 * when there is enough evidence, but is never taken below a share of the
 * national value: a site running 5 samples per run would otherwise be entitled
 * to several times the consumables of a site filling its plate.
 *
 *   effective = max(own, floorRatio x national)     (own needs >= minRuns runs)
 */
export interface AccountTpbSettings {
  floorRatio: number;
  minRuns: number;
}

export interface OwnTpb {
  runs: number;
  samples: number;
}

export type TpbSource = "account" | "floor-clamped" | "national";

export interface TpbDetail {
  system: BatchSysCode;
  code: string;
  tpb: number | undefined; // undefined = no data at all, the system floor applies
  source: TpbSource;
  national: number | undefined;
  own?: number; // the account's raw value when it had any data
  runs?: number;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export function effectiveTpb(
  own: OwnTpb | undefined,
  national: number | undefined,
  settings: AccountTpbSettings,
): Pick<TpbDetail, "tpb" | "source" | "own" | "runs"> {
  if (!own || own.runs <= 0 || own.samples <= 0) return { tpb: national, source: "national" };
  const ownValue = round2(own.samples / own.runs);
  if (own.runs < settings.minRuns || national === undefined) {
    return { tpb: national, source: "national", own: ownValue, runs: own.runs };
  }
  const floor = round2(settings.floorRatio * national);
  return ownValue < floor
    ? { tpb: floor, source: "floor-clamped", own: ownValue, runs: own.runs }
    : { tpb: ownValue, source: "account", own: ownValue, runs: own.runs };
}

/** eLP reports one "HIV-1"/"SARS" test; the master data splits them into several codes that share a batch line. */
export const ASSAY_CODE_ALIASES: Record<string, string[]> = {
  HIVQ: ["HIVQ", "HIVQ_PSC"],
  SARS: ["SARS192", "SARS480"],
};

/** Usage rows of one account, already reduced to the months in the window. */
export interface UsageRow {
  system: BatchSysCode;
  assay: string; // eLP assay code, before aliasing
  runs: number;
  samples: number;
}

export function sumOwn(rows: UsageRow[]): Map<string, OwnTpb> {
  const own = new Map<string, OwnTpb>();
  for (const r of rows) {
    for (const code of ASSAY_CODE_ALIASES[r.assay] ?? [r.assay]) {
      const key = `${r.system}|${code}`;
      const cur = own.get(key) ?? { runs: 0, samples: 0 };
      cur.runs += r.runs;
      cur.samples += r.samples;
      own.set(key, cur);
    }
  }
  return own;
}

/** The latest `n` distinct months present. Months are "YYYY-MM", so string order is time order. */
export function latestMonths(months: Iterable<string>, n: number): Set<string> {
  return new Set([...new Set(months)].sort().reverse().slice(0, n));
}

/**
 * National TPB table with this account's own values laid over it, plus what
 * was decided per assay (for the audit trail and the Calculator's notes).
 */
export function resolveAccountTpb(
  national: TpbTableInput,
  own: Map<string, OwnTpb>,
  settings: AccountTpbSettings,
): { input: TpbTableInput; detail: Map<string, TpbDetail> } {
  const detail = new Map<string, TpbDetail>();
  const values = new Map<string, TpbTableInput["values"][number]>();
  for (const v of national.values) values.set(`${v.system}|${v.code}`, v);

  const keys = new Set([...values.keys(), ...own.keys()]);
  for (const key of keys) {
    const [system, code] = key.split("|") as [BatchSysCode, string];
    const nat = values.get(key)?.tpb;
    const eff = effectiveTpb(own.get(key), nat, settings);
    detail.set(key, { system, code, national: nat, ...eff });
    if (eff.tpb !== undefined) values.set(key, { system, code, tpb: eff.tpb });
  }
  return { input: { floors: national.floors, values: [...values.values()] }, detail };
}

/** What each assay in an order was computed with — stored on the submission. */
export function basisForOrder(detail: Map<string, TpbDetail>, testsBySys: TestsBySystem, floors: Record<BatchSysCode, number>) {
  const out: { system: BatchSysCode; code: string; tpb: number; source: TpbSource | "floor-default"; national: number | null; own: number | null; runs: number | null }[] = [];
  for (const system of ["6800", "5800"] as const) {
    for (const [code, tests] of Object.entries(testsBySys[system] ?? {})) {
      if ((tests ?? 0) <= 0) continue;
      const d = detail.get(`${system}|${code}`);
      out.push({
        system,
        code,
        tpb: d?.tpb ?? floors[system],
        source: d?.tpb === undefined ? "floor-default" : d.source,
        national: d?.national ?? null,
        own: d?.own ?? null,
        runs: d?.runs ?? null,
      });
    }
  }
  return out;
}
