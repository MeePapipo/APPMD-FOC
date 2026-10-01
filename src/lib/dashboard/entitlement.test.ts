import { describe, expect, it } from "vitest";
import { alertPctFor, computeEntitlement, detectPlatform, isSignificantOver, overSeverity, netVerdict, DEFAULT_ALERT, type MaterialGiven } from "./entitlement";
import type { AssayLite, ItemLite } from "@/lib/calc/types";
import type { TpbTableInput } from "@/lib/calc/tpb";

function given(overrides: Partial<MaterialGiven> = {}): MaterialGiven {
  return { sold: 0, foc: 0, bonus: 0, freeCost: 0, productName: "Item", ...overrides };
}

describe("detectPlatform", () => {
  it("picks 6800 outright when only 6800 markers are present", () => {
    const got = new Map([["05534925001", given({ sold: 1 })]]); // cobas omni Pipette Tips (6800)
    const r = detectPlatform(got);
    expect(r).toMatchObject({ platform: "6800", candidates: ["6800"] });
  });

  it("picks 5800 outright when only 5800 markers are present", () => {
    const got = new Map([["04639642001", given({ sold: 1 })]]); // Tip CORE TIPS 1mL (5800)
    const r = detectPlatform(got);
    expect(r).toMatchObject({ platform: "5800", candidates: ["5800"] });
  });

  it("calls it 'both' when marker counts are close (not >=2x)", () => {
    const got = new Map([
      ["05534925001", given({ sold: 1 })], // 6800: 1 marker
      ["04639642001", given({ sold: 1 })], // 5800: 1 marker
    ]);
    const r = detectPlatform(got);
    expect(r.platform).toBe("both");
    expect(r.candidates).toEqual(["6800", "5800"]);
  });

  it("a single stray marker must not flip a lab that's actually the other platform (>=2x rule)", () => {
    // 2 real 5800 markers vs 1 stray 6800 marker — 5800 wins outright (2 >= 1*2).
    const got = new Map([
      ["04639642001", given({ sold: 1 })],
      ["07345607001", given({ sold: 1 })],
      ["05534925001", given({ sold: 1 })], // the stray
    ]);
    const r = detectPlatform(got);
    expect(r.platform).toBe("5800");
    expect(r.candidates).toEqual(["5800"]);
  });

  it("cobas 4800 markers are proof outright, not a guess, and combine additively with a 6800/5800 read", () => {
    const got = new Map([
      ["05534925001", given({ sold: 1 })], // 6800
      ["05235901190", given({ sold: 1 })], // cobas 4800 HPV 240T
    ]);
    const r = detectPlatform(got);
    expect(r).toMatchObject({ platform: "6800+4800", has4800: true, candidates: ["6800"] });
  });

  it("falls back to 'unknown' (both candidates) when no marker is present at all", () => {
    const got = new Map([["99999999999", given({ sold: 1 })]]);
    const r = detectPlatform(got);
    expect(r).toMatchObject({ platform: "unknown", candidates: ["6800", "5800"] });
  });

  it("ignores a marker material with zero net movement (sold+foc+bonus all 0)", () => {
    const got = new Map([["05534925001", given({ sold: 0, foc: 0, bonus: 0 })]]);
    const r = detectPlatform(got);
    expect(r.platform).toBe("unknown");
  });
});

describe("computeEntitlement", () => {
  const tpbInput: TpbTableInput = { floors: { "6800": 24, "5800": 6 }, values: [] };

  const assays: AssayLite[] = [
    { system: "6800", code: "HIV", description: "HIV", materialNo: "REAGENT-HIV", batchRow: 1, packSize: 96, price: 1000 },
  ];
  const items: ItemLite[] = [
    // BATCH-driven consumable, applies to every assay on the system.
    {
      system: "6800", materialNo: "CONS-BATCH", description: "Batch consumable", driver: "BATCH",
      appliesTo: null, consumption: 1, coverage: 1, packSize: 10, price: 100, onDemand: false, optional: false,
    },
    // TEST-driven consumable.
    {
      system: "6800", materialNo: "CONS-TEST", description: "Test consumable", driver: "TEST",
      appliesTo: null, consumption: 0.5, coverage: 1, packSize: 5, price: 50, onDemand: false, optional: false,
    },
  ];

  function got(overrides: Record<string, Partial<MaterialGiven>>): Map<string, MaterialGiven> {
    const m = new Map<string, MaterialGiven>();
    for (const [mat, o] of Object.entries(overrides)) m.set(mat, given(o));
    return m;
  }

  it("main reagent given free goes to the reagent bucket, never a quota row", () => {
    const g = got({
      "05534925001": { sold: 1 }, // force platform = 6800
      "REAGENT-HIV": { sold: 10, foc: 1, bonus: 0, freeCost: 500 },
    });
    const result = computeEntitlement(g, assays, items, new Set(), tpbInput);
    expect(result.totals.reagentFreeCost).toBe(500);
    expect(result.rows.find((r) => r.materialNo === "REAGENT-HIV")).toBeUndefined();
  });

  it("flags over-entitlement with the correct excess qty and value, from Selling Quantity — not from FOC/Bonus given", () => {
    // Selling Qty 96 packs of REAGENT-HIV x packSize 96 = 9216 tests sold.
    // BATCH: 9216 tests / TPB floor 24 = 384 batches -> CONS-BATCH qty = ceil(384*1/10) = 39.
    // Given 50 (foc 20 + bonus 30) -> over = 50 - 39 = 11.
    const g = got({
      "05534925001": { sold: 1 },
      "REAGENT-HIV": { sold: 96, foc: 0, bonus: 0 },
      "CONS-BATCH": { foc: 20, bonus: 30, sold: 0, freeCost: 5000 },
    });
    const result = computeEntitlement(g, assays, items, new Set(), tpbInput);
    const row = result.rows.find((r) => r.materialNo === "CONS-BATCH");
    expect(row).toMatchObject({ expected: 39, free: 50, over: 11, bucket: "over" });
    expect(result.totals.overCost).toBe(11 * (5000 / 50));
  });

  it("excessValue is the EXCESS portion's value only, not the row's full freeCost — a real, shipped bug this test guards against", () => {
    // Confirmed against a real account: the reference dashboard's own
    // "มูลค่าส่วนเกิน (฿)" column for an over row is `over × unit`, not the
    // row's full freeCost — the first version of this code displayed
    // freeCost there instead and was only caught by hand-checking this exact
    // column against a real reference number (LYS REAGENT: freeCost
    // ฿251,828 but the reference showed ฿182,172 = 34 × (251828/47)).
    const g = got({
      "05534925001": { sold: 1 },
      "REAGENT-HIV": { sold: 96, foc: 0, bonus: 0 },
      "CONS-BATCH": { foc: 20, bonus: 30, freeCost: 5000 }, // exp 39, free 50, over 11, unit 100
    });
    const result = computeEntitlement(g, assays, items, new Set(), tpbInput);
    const row = result.rows.find((r) => r.materialNo === "CONS-BATCH")!;
    expect(row.freeCost).toBe(5000);
    expect(row.excessValue).toBe(1100); // 11 × (5000/50), NOT 5000
  });

  it("excessValue is 0 for a within-entitlement row — there is no excess by definition", () => {
    const g = got({
      "05534925001": { sold: 1 },
      "REAGENT-HIV": { sold: 96, foc: 0, bonus: 0 },
      "CONS-BATCH": { foc: 5, bonus: 0, freeCost: 500 }, // exp 39, free 5 -> within
    });
    const result = computeEntitlement(g, assays, items, new Set(), tpbInput);
    const row = result.rows.find((r) => r.materialNo === "CONS-BATCH")!;
    expect(row.bucket).toBe("within");
    expect(row.excessValue).toBe(0);
    expect(row.freeCost).toBe(500); // freeCost itself is untouched
  });

  it("a free reagent box must never inflate its own quota (Selling Quantity only, not tests given)", () => {
    // Same setup as above but the reagent itself was also given 1000 packs
    // for free — if quota used total tests (sold+foc+bonus) this would blow
    // the CONS-BATCH quota way up. It must not move at all.
    const g1 = got({
      "05534925001": { sold: 1 },
      "REAGENT-HIV": { sold: 96, foc: 0, bonus: 0 },
      "CONS-BATCH": { foc: 20, bonus: 30, freeCost: 5000 },
    });
    const g2 = got({
      "05534925001": { sold: 1 },
      "REAGENT-HIV": { sold: 96, foc: 1000, bonus: 0 }, // free reagent given, same Selling Qty
      "CONS-BATCH": { foc: 20, bonus: 30, freeCost: 5000 },
    });
    const r1 = computeEntitlement(g1, assays, items, new Set(), tpbInput);
    const r2 = computeEntitlement(g2, assays, items, new Set(), tpbInput);
    expect(r1.rows.find((r) => r.materialNo === "CONS-BATCH")?.expected).toBe(
      r2.rows.find((r) => r.materialNo === "CONS-BATCH")?.expected,
    );
  });

  it("a negative (credit/return) Selling Quantity must not produce a negative test volume", () => {
    const g = got({
      "05534925001": { sold: 1 },
      "REAGENT-HIV": { sold: -10, foc: 0, bonus: 0 },
    });
    const result = computeEntitlement(g, assays, items, new Set(), tpbInput);
    expect(result.assayTests.find((a) => a.code === "HIV")?.tests ?? 0).toBe(0);
  });

  it("an item given away with no rule on any system goes to the no-rule bucket", () => {
    const g = got({
      "05534925001": { sold: 1 },
      "MYSTERY-ITEM": { foc: 1, bonus: 0, freeCost: 300 },
    });
    const result = computeEntitlement(g, assays, items, new Set(), tpbInput);
    expect(result.totals.noRuleCost).toBe(300);
    const row = result.rows.find((r) => r.materialNo === "MYSTERY-ITEM")!;
    expect(row.bucket).toBe("noRule");
    // No quota exists for a no-rule item, so its whole cost counts as excess
    // — excessValue equals freeCost here (unlike an "over" row, where it's
    // only the portion beyond quota).
    expect(row.excessValue).toBe(300);
  });

  it("an item on the Additional FOC list is tracked separately from a genuinely unmodelled leftover", () => {
    const g = got({
      "05534925001": { sold: 1 },
      "PPT-TUBE": { foc: 1, bonus: 0, freeCost: 100 },
    });
    const result = computeEntitlement(g, assays, items, new Set(["PPT-TUBE"]), tpbInput);
    expect(result.totals.additionalCost).toBe(100);
    expect(result.totals.noRuleCost).toBe(0);
  });

  it("an item ruled on a platform this account does not have is flagged wrong-platform, not no-rule", () => {
    const itemsBoth: ItemLite[] = [
      ...items,
      {
        system: "5800", materialNo: "CONS-5800-ONLY", description: "5800-only consumable", driver: "TEST",
        appliesTo: null, consumption: 1, coverage: 1, packSize: 1, price: 10, onDemand: false, optional: false,
      },
    ];
    const g = got({
      "05534925001": { sold: 1 }, // this account is 6800
      "CONS-5800-ONLY": { foc: 1, bonus: 0, freeCost: 50 },
    });
    const result = computeEntitlement(g, assays, itemsBoth, new Set(), tpbInput);
    expect(result.totals.wrongPlatformCost).toBe(50);
    expect(result.rows.find((r) => r.materialNo === "CONS-5800-ONLY")?.bucket).toBe("wrongPlatform");
  });
});

describe("alert thresholds", () => {
  const A = { ...DEFAULT_ALERT, overPct6800: 15, overPct5800: 20, minOverUnits: 1 };

  it("picks the platform's percentage; both = stricter, unknown = looser", () => {
    expect(alertPctFor("6800", A)).toBe(15);
    expect(alertPctFor("4800", A)).toBe(15);
    expect(alertPctFor("5800", A)).toBe(20);
    expect(alertPctFor("both", A)).toBe(15);
    expect(alertPctFor("unknown", A)).toBe(20);
  });

  it("needs both the unit floor and the percentage", () => {
    expect(isSignificantOver(1, 10, 15, 1)).toBe(false); // 10% over: a unit, but under 15%
    expect(isSignificantOver(2, 10, 15, 1)).toBe(true); // 20% over
    expect(isSignificantOver(0.5, 2, 15, 1)).toBe(false); // 25% but under a whole unit
    expect(isSignificantOver(3, 20, 15, 1)).toBe(false); // exactly 15% is not beyond 15%
    expect(isSignificantOver(4, 20, 15, 1)).toBe(true);
  });

  it("any give-away with no entitlement at all counts once it reaches the unit floor", () => {
    expect(isSignificantOver(1, 0, 15, 1)).toBe(true);
    expect(isSignificantOver(0, 0, 15, 1)).toBe(false);
  });
});

describe("netVerdict (account-level Over Quota)", () => {
  const A = { ...DEFAULT_ALERT, netOverPct: 25, netMinExcess: 20000, focStandaloneMin: 10000 }; // FOC threshold pinned here so the cases do not depend on the default

  it("is over only when both the percentage and the THB excess are exceeded", () => {
    expect(netVerdict(100000, 130000, 0, A).over).toBe(true); // +30%, 30k
    expect(netVerdict(100000, 124000, 0, A).over).toBe(false); // +24%
    expect(netVerdict(50000, 65000, 0, A).over).toBe(false); // +30% but only 15k
    expect(netVerdict(100000, 120000, 0, A).over).toBe(false); // exactly 20k but 20% < 25%
  });

  it("an account given Bonus items with no entitlement at all is over once the THB floor is reached", () => {
    expect(netVerdict(0, 25000, 0, A)).toMatchObject({ over: true, overPct: null });
    expect(netVerdict(0, 5000, 0, A).over).toBe(false);
  });

  it("giving less than the entitlement is never over, however items are mixed", () => {
    const v = netVerdict(141000, 62000, 0, A);
    expect(v.over).toBe(false);
    expect(v.excessValue).toBe(-79000);
  });

  it("flags stand-alone FOC on its own threshold, independent of the formula", () => {
    expect(netVerdict(100, 50, 9999, A).focFlagged).toBe(false);
    expect(netVerdict(100, 50, 10000, A).focFlagged).toBe(true);
  });
});

describe("overSeverity: +1 extra Bonus accepted per reagent bill", () => {
  // pct 1000 so only the per-bill rule can decide; minOverUnits 1.
  it("is null when not over", () => {
    expect(overSeverity(0, 10, 3, 1000, 1)).toBeNull();
    expect(overSeverity(-4, 10, 3, 1000, 1)).toBeNull();
  });
  it("is a warning from +1 up to the number of bills", () => {
    expect(overSeverity(1, 321, 3, 1000, 1)).toBe("warning");
    expect(overSeverity(3, 321, 3, 1000, 1)).toBe("warning");
  });
  it("is critical beyond the number of bills", () => {
    expect(overSeverity(4, 321, 3, 1000, 1)).toBe("critical");
  });
  it("lets the percentage rule raise a small overshoot to critical", () => {
    expect(overSeverity(2, 4, 10, 15, 1)).toBe("critical");
  });
  it("without a bill count falls back to the percentage rule", () => {
    expect(overSeverity(36, 321, null, 15, 1)).toBe("warning");
    expect(overSeverity(60, 321, null, 15, 1)).toBe("critical");
  });
});
