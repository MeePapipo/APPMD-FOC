import { z } from "zod";

/**
 * Shared password rule for self-registration (and any future reset flow) —
 * one source of truth so the API validation and the UI hint text can never
 * drift apart. praditww's ask: uppercase + lowercase + a number, at least 6
 * characters combined — kept at a minimum length of 8 here (stronger than
 * asked) since that was already the enforced minimum before this rule
 * existed; only the character-class requirement is new.
 */
export const PASSWORD_HINT = "At least 8 characters, with an uppercase letter, a lowercase letter, and a number.";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(200)
  .regex(/[A-Z]/, "Password must include an uppercase letter.")
  .regex(/[a-z]/, "Password must include a lowercase letter.")
  .regex(/[0-9]/, "Password must include a number.");
