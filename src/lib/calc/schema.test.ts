import { describe, expect, it } from "vitest";
import { calculateSchema, createSubmissionSchema } from "./schema";

const base = { accountId: "acc-1", testsBySys: { "6800": { HBV: 100 } } };

describe("test volume validation", () => {
  it("accepts a normal order", () => {
    expect(calculateSchema.safeParse({ testsBySys: { "6800": { HBV: 1000 } } }).success).toBe(true);
  });

  it.each([
    ["a fraction", 10.5],
    ["zero", 0],
    ["a negative", -5],
    ["an absurd volume", 99_000_000],
  ])("rejects %s — the client-side check is bypassable", (_label, tests) => {
    expect(calculateSchema.safeParse({ testsBySys: { "6800": { HBV: tests } } }).success).toBe(false);
  });

  it("rejects an unknown system key", () => {
    expect(calculateSchema.safeParse({ testsBySys: { "9800": { HBV: 1 } } }).success).toBe(false);
  });

  it("caps how many assay codes one system can carry", () => {
    const flood = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`A${i}`, 1]));
    expect(calculateSchema.safeParse({ testsBySys: { "6800": flood } }).success).toBe(false);
  });
});

describe("submission adjustments", () => {
  it("accepts a stock deduction with no comment", () => {
    const parsed = createSubmissionSchema.safeParse({
      ...base,
      adjustments: { "M-1": { stockOnHand: 3 } },
    });
    expect(parsed.success).toBe(true);
  });

  it("leaves the missing-reason rule to the route, which knows what is optional", () => {
    // The schema cannot tell an optional give-away from a driver-mandated line
    // by materialNo alone, so it accepts this and the route rejects it.
    expect(createSubmissionSchema.safeParse({
      ...base,
      adjustments: { "M-1": { adjust: -2 } },
    }).success).toBe(true);
  });

  it("accepts a non-zero adjustment with a reason", () => {
    const parsed = createSubmissionSchema.safeParse({
      ...base,
      adjustments: { "M-1": { adjust: 2, comment: "Customer starting a new assay" } },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects negative stock on hand", () => {
    expect(createSubmissionSchema.safeParse({
      ...base,
      adjustments: { "M-1": { stockOnHand: -1 } },
    }).success).toBe(false);
  });

  it("works with no adjustments at all", () => {
    expect(createSubmissionSchema.safeParse(base).success).toBe(true);
  });
});
