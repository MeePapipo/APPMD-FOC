/**
 * Per-account "Quota vs actual given" entitlement — Part 2 of the account
 * drill-down (see the approved plan). Ported deliberately, not derived on
 * the fly, from the reference project's `foc-core.js` (`evaluateSystem`,
 * `evaluate4800`, `buildEntitlement`) — that engine is already correct and
 * verified against this exact source data; this module reuses `foc-webapp`'s
 * OWN `MasterAssay`/`MasterItem`/`AdditionalFocItem`/`TpbEntry` tables and
 * OWN batch/driver primitives (`groupsFor`/`runsForSystem`/`unitsForItem`/
 * `unitsFor4800Item`) rather than forking a parallel copy of the master
 * workbook, so this can never drift from what the Calculator itself uses.
 *
 * Two load-bearing rules, confirmed against real data before writing this
 * (see the plan for how):
 *
 * 1. **Quota is driven by main-reagent packs received (Selling + FOC + Bonus
 *    Quantity), never `FocActual.tests`.** (Changed 2026-10-03: it used to be
 *    Selling only, but reagent given free is run on the instrument and needs
 *    the same supporting items, so counting sales alone left real FOC/Bonus
 *    above the quota. The free reagent's own cost stays a cost, never a quota
 *    comparison.) The caller passes `FocActual.soldQty` (unrestricted) as `sold`, not
 *    `revenueQty` — for a reagent-kit row the two are numerically identical
 *    (a reagent materialNo is always "Reagents, kits" category), but a
 *    non-reagent give-away item (an Additional FOC consumable, say) can
 *    still carry a real Selling Quantity movement that `revenueQty` would
 *    silently zero out. Confirmed against a real account: the reference
 *    shows a -1 Selling Qty on a non-reagent row that `revenueQty` reported
 *    as 0.
 * 2. **`MasterAssay.materialNo` does not uniquely imply a system** — 18 of
 *    25 distinct material numbers are shared between 6800 and 5800 (real
 *    reagent kits sold under one material number, run on either analyser).
 *    Which system(s) an account actually runs has to be *inferred* from a
 *    small set of platform-EXCLUSIVE consumables (`PLATFORM_MARKERS`),
 *    weighing the evidence rather than trusting bare presence — a single
 *    stray box of the "wrong" platform's plate must not flip the whole
 *    account. Verified these exact material numbers exist in this app's own
 *    `MasterItem`/`MasterAssay` tables with matching descriptions before
 *    trusting the port.
 */

import type { AssayLite, ItemLite } from "@/lib/calc/types";
import { groupsFor, runsForSystem } from "@/lib/calc/batches";
import { unitsForItem } from "@/lib/calc/driver";
import { buildTpbTable, type TpbTableInput } from "@/lib/calc/tpb";
import { ceil } from "@/lib/calc/round";

type Sys658 = "6800" | "5800";

/** Platform-EXCLUSIVE consumables — reagent kits are shared across 6800/5800
 * so they can't reveal the platform; these can't. Ported verbatim from
 * `foc-core.js` (confirmed present in this app's own MasterItem table). */
const PLATFORM_MARKERS: Record<Sys658, Record<string, string>> = {
  "6800": {
    "05534917001": "cobas omni Processing Plate",
    "05534925001": "cobas omni Pipette Tips",
    "05534941001": "cobas omni Amplification Plate",
  },
  "5800": {
    "04639642001": "Tip CORE TIPS with filter, 1 mL",
    "07345607001": "Tip CORE TIPS with filter, 300 uL",
    "08413975001": "cobas omni Processing Plate 24",
    "08413983001": "cobas omni Liquid Waste Plate 24",
    "08499853001": "cobas omni Amplification Plate 24",
  },
};

/** cobas 4800 reagents carry their own material numbers, so unlike
 * 6800-vs-5800 the platform is not a guess: presence alone is proof. */
const MARKERS_4800: Record<string, string> = {
  "05235901190": "cobas 4800 HPV AMP/DET 240T",
  "05235910190": "cobas 4800 HPV AMP/DET 960T",
  "05235952190": "cobas 4800 CT/NG AMP/DET 240T",
  "07865970190": "cobas 4800 CMV 120T",
  "06979564190": "cobas 4800 HBV 120T",
  "06979602190": "cobas 4800 HCV 120T",
  // Molecular oncology kits (cobas 4800_Oncology tab of the master file).
  "07659962001": "BRAF/NRAS Mutation Test",
  "07248563190": "cobas EGFR AMP/DET V2",
  "07989270001": "KRAS Mutation Test v2",
  "07003986190": "cobas 4800 PIK3CA",
  "05852170190": "cobas 4800 KRAS",
};

export type MaterialGiven = {
  sold: number; foc: number; bonus: number; freeCost: number; productName: string;
  /** Cost of the stand-alone FOC / of the Bonus part of `freeCost` (absent on hand-built entries). */
  focCost?: number; bonusCost?: number;
  /** The part of `focCost` inside the alert window (set when the caller gave a window). */
  focCostRecent?: number;
};

export type PlatformResult = { platform: string; basis: string; candidates: Sys658[]; has4800: boolean };

/** Weighs platform-marker evidence instead of trusting bare presence — a
 * side needs >=2x the other's distinct markers to win outright; anything
 * closer is a genuine dual-instrument lab ("both"). Ported verbatim from
 * `foc-core.js`'s `buildEntitlement` (the AMNAJCHAROEN HOSPITAL case: one
 * stray 6800 plate must not flip a 5800-only lab). */
export function detectPlatform(got: Map<string, MaterialGiven>): PlatformResult {
  const present = (sys: Sys658) =>
    Object.keys(PLATFORM_MARKERS[sys]).filter((m) => {
      const d = got.get(m);
      return d && d.sold + d.foc + d.bonus > 0;
    });
  const present6800 = present("6800");
  const present5800 = present("5800");
  const present48 = Object.keys(MARKERS_4800).filter((m) => {
    const d = got.get(m);
    return d && d.sold + d.foc + d.bonus > 0;
  });
  const has4800 = present48.length > 0;

  const named = (sys: Sys658, mats: string[]) => mats.map((m) => PLATFORM_MARKERS[sys][m]).join(", ");
  const nm6 = present6800.length;
  const nm5 = present5800.length;

  let platform: string;
  let basis: string;
  let candidates: Sys658[];
  if (nm6 && nm5) {
    if (nm6 >= nm5 * 2) {
      platform = "6800";
      candidates = ["6800"];
      basis = `Found ${named("6800", present6800)} (${nm6} types) · ${nm5} type(s) of 5800 items mixed in (${named("5800", present5800)}) — probably shipped for the wrong model`;
    } else if (nm5 >= nm6 * 2) {
      platform = "5800";
      candidates = ["5800"];
      basis = `Found ${named("5800", present5800)} (${nm5} types) · ${nm6} type(s) of 6800 items mixed in (${named("6800", present6800)}) — probably shipped for the wrong model`;
    } else {
      platform = "both";
      candidates = ["6800", "5800"];
      basis = "Model-specific consumables of both models found in similar numbers";
    }
  } else if (nm6) {
    platform = "6800";
    candidates = ["6800"];
    basis = "Found " + named("6800", present6800);
  } else if (nm5) {
    platform = "5800";
    candidates = ["5800"];
    basis = "Found " + named("5800", present5800);
  } else if (has4800) {
    platform = "4800";
    candidates = [];
    basis = "";
  } else {
    platform = "unknown";
    candidates = ["6800", "5800"];
    basis = "No model-specific consumable found — using the model that gives the larger quota, so flags are not overstated";
  }

  if (has4800) {
    const names = present48.map((m) => MARKERS_4800[m]).join(", ");
    basis = basis
      ? `${basis} · and cobas 4800 reagent found (${names}) — the 4800 quota is added separately`
      : `cobas 4800 reagent found (${names})`;
    platform = platform === "4800" ? "4800" : `${platform}+4800`;
  }

  return { platform, basis, candidates, has4800 };
}

/** materialNo -> first-matching assay for a system — "one material can serve
 * two codes (e.g. an HPV kit shared by a standard and a SurePath code); the
 * shipment can't be split, so the first code absorbs all of its tests",
 * ported verbatim from `foc-core.js`. Iteration order matches `assays`'
 * own order (MasterAssay's `sortOrder`, same as the Calculator uses). */
function firstAssayByMaterial(assays: AssayLite[], system: string): Map<string, AssayLite> {
  const map = new Map<string, AssayLite>();
  for (const a of assays) {
    if (a.system !== system) continue;
    if (!map.has(a.materialNo)) map.set(a.materialNo, a);
  }
  return map;
}

/** tests[code] = packs the customer actually received (sold + FOC + Bonus, > 0 only — a credit/return must
 * never produce a negative test volume) x pack size, for one system. Main reagent given free (a breakdown
 * compensation, "buy 10 get 1", a method verification) is run on the instrument like any other, so it earns
 * the same supporting items; its cost still shows as free cost and is never compared with a quota. */
function testsFromSelling(got: Map<string, MaterialGiven>, assayByMat: Map<string, AssayLite>): Record<string, number> {
  const tests: Record<string, number> = {};
  for (const [mat, a] of assayByMat) {
    const d = got.get(mat);
    const packs = d ? d.sold + d.foc + d.bonus : 0;
    if (packs > 0) tests[a.code] = (tests[a.code] ?? 0) + packs * a.packSize;
  }
  return tests;
}

export type SystemExpectation = { tests: Record<string, number>; batches: Record<string, number>; expected: Record<string, number> };

/** Expected item quantities for one of 6800/5800, reusing this app's own
 * `groupsFor`/`runsForSystem`/`unitsForItem` — the exact same batch/driver
 * primitives the Calculator itself runs on a real order, just fed a
 * Selling-Quantity-derived test vector instead of a rep's live input. */
function evaluate658(
  system: Sys658,
  got: Map<string, MaterialGiven>,
  assays: AssayLite[],
  items: ItemLite[],
  tpbInput: TpbTableInput,
): SystemExpectation {
  const assayByMat = firstAssayByMaterial(assays, system);
  const tests = testsFromSelling(got, assayByMat);
  const sysAssays = assays.filter((a) => a.system === system);
  const groups = groupsFor(system, sysAssays);
  const tpbTable = buildTpbTable(tpbInput);
  const runsMap = runsForSystem(system, groups, tests, tpbTable);
  const allCodes = sysAssays.map((a) => a.code);

  const expected: Record<string, number> = {};
  for (const item of items) {
    if (item.system !== system) continue;
    const units = unitsForItem(item, allCodes, groups, runsMap, tests);
    if (units <= 0) continue;
    const qty = ceil(units / (item.packSize * item.coverage));
    if (qty > 0) expected[item.materialNo] = (expected[item.materialNo] ?? 0) + qty;
  }
  // Batches, keyed by assay code (not batchRow) — every code in a merged
  // batch group shares its group's run count, matching `foc-core.js`'s own
  // `batches` shape (`g.codes.forEach(c => batches[c] = groupBatches[gr])`).
  const batches: Record<string, number> = {};
  for (const g of groups) {
    const runs = runsMap.get(g.batchRow) ?? 0;
    for (const code of g.codes) batches[code] = runs;
  }
  return { tests, batches, expected };
}

/** cobas 4800: no batch/TPB concept — a per-assay weighted-linear model
 * whose weights already bake in whatever batch division the source formula
 * had (see `engine4800.ts`). No `coverage` division here either — matches
 * `foc-core.js`'s `evaluate4800` exactly (`packSize` only). */
function evaluate4800(got: Map<string, MaterialGiven>, assays: AssayLite[], items: ItemLite[]): SystemExpectation {
  const assayByMat = firstAssayByMaterial(assays, "4800");
  const tests = testsFromSelling(got, assayByMat);

  // Several assay codes can share one material number (HPV and its SurePath twin; an oncology kit run on
  // Plasma or on Tissue). The sales data only knows the material, so the variant actually run is unknown:
  // per material, an item is credited at the variant that earns it most, never at the sum of the variants
  // (the kit volume cannot be split). Items whose variants weigh the same are unaffected.
  const variantsByMat = new Map<string, string[]>();
  for (const a of assays) {
    if (a.system !== "4800") continue;
    variantsByMat.set(a.materialNo, [...(variantsByMat.get(a.materialNo) ?? []), a.code]);
  }

  const expected: Record<string, number> = {};
  for (const item of items) {
    if (item.system !== "4800" || !item.weights) continue;
    let units = 0;
    if (item.onDemand) continue;
    for (const [mat, a] of assayByMat) {
      const matTests = tests[a.code] ?? 0;
      if (matTests <= 0) continue;
      const weights = item.weights as Record<string, number>;
      units += matTests * Math.max(0, ...(variantsByMat.get(mat) ?? [a.code]).map((code) => weights[code] ?? 0));
    }
    units = Math.round(units * 1e9) / 1e9; // deliberately not rounded to a whole unit before dividing by packSize
    if (units <= 0) continue;
    const qty = item.packSize ? ceil(units / item.packSize) : 0;
    if (qty > 0) expected[item.materialNo] = (expected[item.materialNo] ?? 0) + qty;
  }
  return { tests, batches: {}, expected };
}

export type EntitlementRow = {
  materialNo: string;
  productName: string;
  optional: boolean;
  expected: number;
  focQty: number;
  bonusQty: number;
  free: number; // FOC + Bonus actually given
  sold: number; // Selling Quantity ("ซื้อเอง")
  freeCost: number; // full cost of what was given, regardless of quota
  /**
   * "มูลค่าส่วนเกิน (฿)" — the EXCESS portion's value only, not the row's full
   * `freeCost`. For an "over" row these differ (confirmed against a real
   * account: LYS REAGENT had freeCost ฿251,828 but the reference's excess
   * column showed ฿182,172 = over(34) × unit(freeCost/free) — getting this
   * wrong by displaying `freeCost` here was a real, shipped bug, caught only
   * by hand-checking this specific column against the reference rather than
   * just expected/free/over/ratio). Zero for "within" rows (no excess by
   * definition). Equal to `freeCost` for noRule/reagent-excluded/
   * wrongPlatform/additional rows, where `over` is defined as the full
   * `free` amount (there's no quota to be "within", so the whole thing
   * counts as excess/unaccounted cost).
   */
  excessValue: number;
  over: number; // free - expected
  ratio: number | null; // free / expected, null when expected is 0
  bucket: "over" | "within" | "noRule" | "reagent" | "wrongPlatform" | "additional";
  /**
   * Over quota "in a meaningful way": `over` reaches `minOverUnits` AND the
   * excess is beyond the platform's percentage of the entitlement (or there is
   * no entitlement at all). Plain `over > 0` flags every rounding crumb.
   */
  significant: boolean;
  /**
   * How far over quota, judged per bill: each reagent bill is allowed +1 of an item as extra Bonus, so
   * over > bills is "critical" (red) and 1..bills is "warning" (yellow). The percentage rule above is only
   * used when the bill count is unknown. `significant` is true exactly when this is "critical". Null = not over.
   */
  severity: "critical" | "warning" | null;
};

/** Admin-tunable thresholds (AlertSettings): item-level `significant` and the account-level net rule. */
export type AlertThresholds = {
  overPct6800: number; overPct5800: number; minOverUnits: number;
  /** Account is over quota when Bonus value exceeds the entitled value by more than this %... */
  netOverPct: number;
  /** ...and by at least this many THB. */
  netMinExcess: number;
  /** Stand-alone FOC (no reagent sold with it) is flagged from this many THB. */
  focStandaloneMin: number;
};
export const DEFAULT_ALERT: AlertThresholds = {
  overPct6800: 15, overPct5800: 20, minOverUnits: 1, netOverPct: 25, netMinExcess: 20000, focStandaloneMin: 100000,
};

/** Account-level view: is the Bonus given, taken as a whole, more than the entitlement? */
export type NetSummary = {
  entitledValue: number; // formula entitlement at master prices (optional items left out)
  bonusValue: number; // Bonus given on the same items, same prices
  excessValue: number; // bonusValue - entitledValue (may be negative)
  overPct: number | null; // excess as % of the entitlement, null when there is none
  over: boolean; // beyond both the % and the THB threshold
  focStandaloneCost: number; // cost of stand-alone FOC across everything given (last 12 months when the window is set)
  focFlagged: boolean;
};

export function netVerdict(entitledValue: number, bonusValue: number, focStandaloneCost: number, a: AlertThresholds): NetSummary {
  const excessValue = bonusValue - entitledValue;
  const overPct = entitledValue > 0 ? (excessValue / entitledValue) * 100 : null;
  const over = excessValue >= a.netMinExcess && (entitledValue <= 0 || (overPct as number) > a.netOverPct);
  return {
    entitledValue: Math.round(entitledValue),
    bonusValue: Math.round(bonusValue),
    excessValue: Math.round(excessValue),
    overPct: overPct === null ? null : Math.round(overPct * 10) / 10,
    over,
    focStandaloneCost: Math.round(focStandaloneCost),
    focFlagged: focStandaloneCost >= a.focStandaloneMin,
  };
}

/**
 * Percentage that applies to an account's platform. A dual-platform account
 * gets the stricter figure; an unidentifiable one the looser, matching
 * detectPlatform's own "don't raise flags we can't back up" stance.
 */
export function alertPctFor(platform: string, a: AlertThresholds): number {
  if (platform === "5800") return a.overPct5800;
  if (platform === "both") return Math.min(a.overPct6800, a.overPct5800);
  if (platform === "unknown") return Math.max(a.overPct6800, a.overPct5800);
  return a.overPct6800; // 6800 and 4800
}

/**
 * Per-bill severity: +1 of an item per reagent bill is accepted, so over quota by up to the number of bills is a
 * yellow warning and more than that is critical (red). The % thresholds are only the fallback when the bill count is
 * unknown (`bills` null): they decide red there, and any other excess is yellow.
 */
export function overSeverity(over: number, expected: number, bills: number | null, pct: number, minOverUnits: number): "critical" | "warning" | null {
  if (over <= 0) return null;
  if (bills === null) return isSignificantOver(over, expected, pct, minOverUnits) ? "critical" : "warning";
  return over > bills ? "critical" : "warning";
}

export function isSignificantOver(over: number, expected: number, pct: number, minOverUnits: number): boolean {
  if (over < minOverUnits) return false;
  return expected <= 0 || (over / expected) * 100 > pct;
}

export type EntitlementResult = {
  platform: PlatformResult;
  assayTests: { code: string; tests: number; batches: number }[];
  rows: EntitlementRow[];
  totals: {
    overCost: number; withinCost: number; noRuleCost: number; reagentFreeCost: number; wrongPlatformCost: number; additionalCost: number;
    significantCount: number; // rows over quota beyond the alert thresholds (critical)
    significantCost: number; // their excess value
    warningCount: number; // rows over quota but within +1 per bill
  };
  net: NetSummary;
  /** Reagent bills the per-bill rule used; null when it was not given (percentage rule only). */
  bills: number | null;
};

/**
 * Full per-account entitlement, mirroring `foc-core.js`'s `buildEntitlement`
 * loop body for a single account. `got` must already be summed across the
 * account's full history (see `focAccountDetail.ts`'s convention).
 */
export function computeEntitlement(
  got: Map<string, MaterialGiven>,
  assays: AssayLite[],
  items: ItemLite[],
  additionalMats: Set<string>,
  tpbInput: TpbTableInput,
  alert: AlertThresholds = DEFAULT_ALERT,
  bills: number | null = null,
): EntitlementResult {
  const platformInfo = detectPlatform(got);
  const { candidates } = platformInfo;

  const results658 = candidates.map((sys) => ({ sys, ...evaluate658(sys, got, assays, items, tpbInput) }));
  // Per-material MAXIMUM across candidate systems, not the sum (the reagent
  // volume is unsplittable) and not "pick the bigger total" (that silently
  // dumps the losing system's own items into "no rule" — the AMNAJCHAROEN
  // HOSPITAL bug `foc-core.js` fixed on 2026-09-29). Ported verbatim.
  const expected658: Record<string, number> = {};
  for (const r of results658) {
    for (const mat in r.expected) expected658[mat] = Math.max(expected658[mat] ?? 0, r.expected[mat]);
  }
  const res48 = platformInfo.has4800 ? evaluate4800(got, assays, items) : { tests: {}, batches: {}, expected: {} };

  // Two tracks are additive (4800 reagents have their own material numbers,
  // so a dual-platform lab genuinely earns both), never maxed together.
  const expectedAll: Record<string, number> = { ...expected658 };
  for (const mat in res48.expected) expectedAll[mat] = (expectedAll[mat] ?? 0) + res48.expected[mat];

  const isReagentMat = (mat: string) =>
    candidates.some((s) => assays.some((a) => a.system === s && a.materialNo === mat)) ||
    assays.some((a) => a.system === "4800" && a.materialNo === mat);
  const hasRuleMat = (mat: string) =>
    candidates.some((s) => items.some((i) => i.system === s && i.materialNo === mat)) ||
    items.some((i) => i.system === "4800" && i.materialNo === mat && i.weights);
  const definedAnywhere = (mat: string) =>
    ["6800", "5800"].some((s) => items.some((i) => i.system === s && i.materialNo === mat)) ||
    items.some((i) => i.system === "4800" && i.materialNo === mat && i.weights) ||
    ["6800", "5800", "4800"].some((s) => assays.some((a) => a.system === s && a.materialNo === mat));
  const wrongPlatformMat = (mat: string) => !hasRuleMat(mat) && !isReagentMat(mat) && definedAnywhere(mat);

  const rows: EntitlementRow[] = [];
  const totals = { overCost: 0, withinCost: 0, noRuleCost: 0, reagentFreeCost: 0, wrongPlatformCost: 0, additionalCost: 0, significantCount: 0, significantCost: 0, warningCount: 0 };
  const alertPct = alertPctFor(platformInfo.platform, alert);
  // Account-level net: formula items only (optional tubes, sample cups and the like are
  // not tied to the formula), Bonus valued at master prices on both sides.
  let entitledValue = 0;
  let bonusValue = 0;
  let focStandaloneCost = 0;
  for (const d of got.values()) focStandaloneCost += d.focCostRecent ?? d.focCost ?? 0;

  const allMats = new Set<string>([...got.keys(), ...Object.keys(expectedAll)]);
  // An item the formula says the account earns but that was never given has no Tableau row, so no name: use the master's.
  const masterName = new Map<string, string>();
  for (const i of items) if (!masterName.has(i.materialNo)) masterName.set(i.materialNo, i.description);
  for (const mat of allMats) {
    const d = got.get(mat) ?? { sold: 0, foc: 0, bonus: 0, freeCost: 0, productName: masterName.get(mat) ?? mat };
    const free = d.foc + d.bonus;

    if (isReagentMat(mat)) {
      totals.reagentFreeCost += d.freeCost;
      // Main reagent given free — listed so the count matches the cost, but never a quota comparison.
      if (free > 0) {
        rows.push({ materialNo: mat, productName: d.productName, optional: false, expected: 0, focQty: d.foc, bonusQty: d.bonus, free, sold: d.sold, freeCost: d.freeCost, excessValue: d.freeCost, over: free, ratio: null, bucket: "reagent", significant: false, severity: null });
      }
      continue;
    }
    if (wrongPlatformMat(mat)) {
      if (free > 0) {
        totals.wrongPlatformCost += d.freeCost;
        rows.push({ materialNo: mat, productName: d.productName, optional: false, expected: 0, focQty: d.foc, bonusQty: d.bonus, free, sold: d.sold, freeCost: d.freeCost, excessValue: d.freeCost, over: free, ratio: null, bucket: "wrongPlatform", significant: false, severity: null });
      }
      continue;
    }
    if (additionalMats.has(mat)) {
      if (free > 0) {
        totals.additionalCost += d.freeCost;
        rows.push({ materialNo: mat, productName: d.productName, optional: false, expected: 0, focQty: d.foc, bonusQty: d.bonus, free, sold: d.sold, freeCost: d.freeCost, excessValue: d.freeCost, over: free, ratio: null, bucket: "additional", significant: false, severity: null });
      }
      continue;
    }
    if (!hasRuleMat(mat)) {
      if (free > 0) {
        totals.noRuleCost += d.freeCost;
        rows.push({ materialNo: mat, productName: d.productName, optional: false, expected: 0, focQty: d.foc, bonusQty: d.bonus, free, sold: d.sold, freeCost: d.freeCost, excessValue: d.freeCost, over: free, ratio: null, bucket: "noRule", significant: false, severity: null });
      }
      continue;
    }

    const exp = expectedAll[mat] ?? 0;
    if (free === 0 && exp === 0) continue;
    const over = free - exp;
    const ratio = exp > 0 ? free / exp : null;
    const item = items.find((i) => i.materialNo === mat && (candidates.includes(i.system as Sys658) || i.system === "4800"));
    const severity = overSeverity(over, exp, bills, alertPct, alert.minOverUnits);
    const row: EntitlementRow = {
      materialNo: mat,
      productName: d.productName,
      optional: item?.optional ?? false,
      expected: exp,
      focQty: d.foc,
      bonusQty: d.bonus,
      free,
      sold: d.sold,
      freeCost: d.freeCost,
      excessValue: over > 0 ? Math.round(over * (free ? d.freeCost / free : 0)) : 0,
      over,
      ratio,
      bucket: over > 0 ? "over" : "within",
      significant: severity === "critical",
      severity,
    };
    rows.push(row);
    if (!row.optional) {
      const unit = item?.price ?? (free ? d.freeCost / free : 0);
      entitledValue += exp * unit;
      bonusValue += d.bonus * unit;
    }
    if (over > 0) totals.overCost += row.excessValue;
    else totals.withinCost += d.freeCost;
    if (row.significant) {
      totals.significantCount += 1;
      totals.significantCost += row.excessValue;
    } else if (severity === "warning") {
      totals.warningCount += 1;
    }
  }
  totals.overCost = Math.round(totals.overCost);
  totals.significantCost = Math.round(totals.significantCost);

  // "Main reagent actually sent" summary line — every assay code that had any
  // test volume (sold + FOC + Bonus packs), across both the 6800/5800 candidate
  // results and the additive 4800 track. `batches` is 0 for 4800 codes (no
  // batch concept there) — the UI omits the "(N batches)" suffix in that case.
  const codesSeen = new Set<string>();
  for (const r of results658) for (const c of Object.keys(r.tests)) codesSeen.add(c);
  for (const c of Object.keys(res48.tests)) codesSeen.add(c);
  const assayTests = [...codesSeen].sort().map((code) => {
    const r658 = results658.find((r) => r.tests[code] > 0);
    return { code, tests: r658?.tests[code] ?? res48.tests[code] ?? 0, batches: r658?.batches[code] ?? 0 };
  });

  return { platform: platformInfo, assayTests, rows, totals, net: netVerdict(entitledValue, bonusValue, focStandaloneCost, alert), bills };
}
