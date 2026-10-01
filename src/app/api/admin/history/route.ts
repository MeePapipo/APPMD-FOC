import { z } from "zod";
import { requireApiAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { historyScopeSchema, historyWhere } from "@/lib/admin/history";

const bodySchema = z.object({
  scope: historyScopeSchema,
  action: z.enum(["clear", "restore"]),
  dryRun: z.boolean().optional(),
});

/**
 * Admin clears (hides) or restores submitted orders from Order History. Nothing is deleted: the order
 * is marked VOID, so it drops out of every list and download but can be restored, and the change is
 * written to the audit log. Calculations never read submissions (Calculator allowance and the Dashboard
 * use the Tableau import), so a clear changes no figure. `dryRun` only counts the rows.
 */
export async function POST(request: Request) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }
  const { scope, action, dryRun } = parsed.data;
  const where = historyWhere(scope, action);

  if (dryRun) return Response.json({ count: await prisma.submission.count({ where }) });

  const now = new Date();
  const { count } = await prisma.submission.updateMany({
    where,
    data:
      action === "clear"
        ? { status: "VOID", editedById: guard.id, editedByEmail: guard.email ?? "unknown", editedAt: now }
        : { status: "SUBMITTED", editedById: guard.id, editedByEmail: guard.email ?? "unknown", editedAt: now },
  });
  await prisma.auditLog.create({
    data: {
      userEmail: guard.email ?? "unknown",
      action: action === "clear" ? "clear-history" : "restore-history",
      entity: "Submission",
      after: { scope, count },
    },
  });
  return Response.json({ count });
}
