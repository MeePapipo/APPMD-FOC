import { z } from "zod";

// Account numbers are Salesforce/DKSH ship-to numbers (8 digits today); allow
// letters and dashes so an unusual one is not rejected, but no whitespace.
const accountNumber = z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9-]+$/, "Letters, digits and dashes only");
const accountName = z.string().trim().min(1).max(200);

export const accountCreateSchema = z.object({ accountNumber, accountName });

export const accountPatchSchema = z
  .object({ accountNumber, accountName, active: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

/** What stops an account being deleted: anything that points at it by id. */
export function usageMessage(uses: { submissions: number; annualForecasts: number; quotas: number }): string | null {
  const parts = [
    uses.submissions && `${uses.submissions} order${uses.submissions === 1 ? "" : "s"}`,
    uses.annualForecasts && `${uses.annualForecasts} forecast${uses.annualForecasts === 1 ? "" : "s"}`,
    uses.quotas && `${uses.quotas} quota${uses.quotas === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return parts.length ? `This account is used by ${parts.join(", ")} — deactivate it instead of deleting.` : null;
}
