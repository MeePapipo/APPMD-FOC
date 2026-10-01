import { z } from "zod";
import type { Prisma } from "@prisma/client";

/** What an admin's clear / restore applies to. Day boundaries are Thailand time (the users' own). */
export const historyScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }),
  z.object({ kind: z.literal("user"), email: z.string().trim().toLowerCase().min(3).max(254) }),
  z.object({ kind: z.literal("account"), accountNumber: z.string().trim().min(1).max(40) }),
  z.object({ kind: z.literal("before"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-01-31") }),
]);
export type HistoryScope = z.infer<typeof historyScopeSchema>;
export type HistoryAction = "clear" | "restore";

/**
 * Rows a clear or restore touches: clear hides SUBMITTED orders (sets VOID), restore brings VOID ones back.
 * `before` is exclusive: orders created strictly before 00:00 of that day.
 */
export function historyWhere(scope: HistoryScope, action: HistoryAction): Prisma.SubmissionWhereInput {
  const status = action === "clear" ? "SUBMITTED" : "VOID";
  switch (scope.kind) {
    case "all":
      return { status };
    case "user":
      return { status, createdByEmail: scope.email };
    case "account":
      return { status, accountNumber: scope.accountNumber };
    case "before":
      return { status, createdAt: { lt: new Date(`${scope.date}T00:00:00+07:00`) } };
  }
}
