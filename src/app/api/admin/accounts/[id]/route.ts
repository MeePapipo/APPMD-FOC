import { Prisma } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { accountPatchSchema, usageMessage } from "@/lib/admin/account";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const { id } = await params;
  const parsed = accountPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }

  const before = await prisma.account.findUnique({ where: { id } });
  if (!before) return Response.json({ error: "Account not found" }, { status: 404 });

  let updated;
  try {
    // Submissions snapshot the number and name at order time, so renaming an
    // account here never rewrites history.
    updated = await prisma.account.update({ where: { id }, data: parsed.data });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      return Response.json({ error: "Another account already uses this number." }, { status: 409 });
    }
    console.error("update Account failed", cause);
    return Response.json({ error: "Update failed. Please try again." }, { status: 500 });
  }

  await prisma.auditLog.create({
    data: {
      userEmail: guard.email ?? "unknown",
      action: "update",
      entity: "Account",
      entityId: id,
      before: JSON.parse(JSON.stringify(before)),
      after: JSON.parse(JSON.stringify(updated)),
    },
  });

  return Response.json({
    account: { id: updated.id, accountNumber: updated.accountNumber, accountName: updated.accountName, active: updated.active },
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const { id } = await params;
  const before = await prisma.account.findUnique({
    where: { id },
    include: { _count: { select: { submissions: true, annualForecasts: true, quotas: true } } },
  });
  if (!before) return Response.json({ error: "Account not found" }, { status: 404 });

  const blocked = usageMessage(before._count);
  if (blocked) return Response.json({ error: blocked }, { status: 409 });

  try {
    await prisma.account.delete({ where: { id } });
  } catch (cause) {
    // Something started pointing at it between the check and the delete.
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2003") {
      return Response.json({ error: "This account is now in use — deactivate it instead of deleting." }, { status: 409 });
    }
    console.error("delete Account failed", cause);
    return Response.json({ error: "Delete failed. Please try again." }, { status: 500 });
  }

  const { _count, ...account } = before;
  void _count;
  await prisma.auditLog.create({
    data: {
      userEmail: guard.email ?? "unknown",
      action: "delete",
      entity: "Account",
      entityId: id,
      before: JSON.parse(JSON.stringify(account)),
    },
  });

  return Response.json({ ok: true });
}
