import { z } from "zod";

/** Over-quota alert thresholds (AlertSettings). Percentages are of the entitled quantity. */
export const alertSettingsSchema = z
  .object({
    overPct6800: z.number().min(0).max(1000),
    overPct5800: z.number().min(0).max(1000),
    minOverUnits: z.number().min(0).max(1000),
  })
  .partial();

/** Per-account TPB rules (TpbSettings). `accountFloorRatio` is a fraction: 0.5 = half the national TPB. */
export const accountTpbSettingsSchema = z
  .object({
    accountFloorRatio: z.number().min(0).max(1),
    accountMinRuns: z.number().int().min(1).max(1000),
    accountWindowMonths: z.number().int().min(1).max(24),
  })
  .partial();

/** Tableau PL3 product lines the FOC import keeps, e.g. ["MOLECULAR LAB"]. */
export const focImportSettingsSchema = z
  .object({
    allowedProductLines: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
  })
  .partial();

export const settingsPatchSchema = z
  .object({ alert: alertSettingsSchema, tpb: accountTpbSettingsSchema, focImport: focImportSettingsSchema })
  .partial()
  .refine((v) => Object.values(v).some((part) => part && Object.keys(part).length > 0), {
    message: "No fields to update",
  });
