/**
 * Request schemas shared by /api/calculate and /api/submissions.
 *
 * These are the real trust boundary: the equivalent checks in Calculator.tsx
 * are a UX affordance only and are bypassed by anyone calling the API
 * directly, so every bound the engine relies on has to be restated here.
 */
import { z } from "zod";

/** Well past any real order (a full year of 8800 at capacity is ~1M tests). */
const MAX_TESTS = 10_000_000;
/** No system has anywhere near this many assay codes; caps request fan-out. */
const MAX_CODES_PER_SYSTEM = 200;
/** Guards the adjustments map, which is keyed by arbitrary client strings. */
const MAX_ADJUSTMENTS = 500;
/** Exported so the stepper can stop at the same figure the wire rejects. */
export const MAX_ADJUST_MAGNITUDE = 10_000;

const testVector = z
  .record(z.string().min(1).max(64), z.number().int().positive().max(MAX_TESTS))
  .refine((v) => Object.keys(v).length <= MAX_CODES_PER_SYSTEM, {
    message: `At most ${MAX_CODES_PER_SYSTEM} assay codes per system`,
  });

/**
 * Strict: a mistyped system key (say "8800") would otherwise be stripped
 * silently, and the order would be quoted as if those tests were never entered.
 */
export const testsBySysSchema = z.strictObject({
  "6800": testVector.optional(),
  "5800": testVector.optional(),
  "4800": testVector.optional(),
});

export const optionalTickedSchema = z.record(z.string().min(1).max(64), z.boolean());

/**
 * Per-materialNo stock/adjust input. `adjust` is a signed delta (see
 * src/lib/calc/adjust.ts).
 *
 * The "a non-zero adjustment needs a comment" rule is NOT enforced here: it
 * only applies to required lines, and this map is keyed by materialNo with no
 * way to tell which of those are optional. The submit route applies it once
 * the engine has told it which line is which.
 */
export const adjustmentsSchema = z
  .record(
    z.string().min(1).max(64),
    z.object({
      stockOnHand: z.number().int().nonnegative().max(MAX_ADJUST_MAGNITUDE).optional(),
      adjust: z.number().int().min(-MAX_ADJUST_MAGNITUDE).max(MAX_ADJUST_MAGNITUDE).optional(),
      comment: z.string().trim().max(500).optional(),
    }),
  )
  .refine((v) => Object.keys(v).length <= MAX_ADJUSTMENTS, {
    message: `At most ${MAX_ADJUSTMENTS} adjusted lines`,
  });

export const calculateSchema = z.object({
  /** With an account the run counts use that account's own TPB; without one, the national TPB. */
  accountId: z.string().min(1).max(64).optional(),
  testsBySys: testsBySysSchema,
  optionalTicked: optionalTickedSchema.optional(),
});

/**
 * Free-choice give-aways: materialNo -> packs. Quantities only — the price is
 * read from AdditionalFocItem server-side, so a tampered request cannot
 * understate the FOC value of what was handed out.
 */
export const additionalFocSchema = z
  .record(z.string().min(1).max(64), z.number().int().positive().max(MAX_ADJUST_MAGNITUDE))
  .refine((v) => Object.keys(v).length <= MAX_ADJUSTMENTS, {
    message: `At most ${MAX_ADJUSTMENTS} additional items`,
  });

export const createSubmissionSchema = z.object({
  accountId: z.string().min(1).max(64),
  testsBySys: testsBySysSchema,
  optionalTicked: optionalTickedSchema.optional(),
  adjustments: adjustmentsSchema.optional(),
  additionalFoc: additionalFocSchema.optional(),
});
