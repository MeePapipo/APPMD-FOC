import { z } from "zod";
import { requireApiAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  /** The account this instrument sits at now; null unlinks it. */
  accountId: z.string().min(1).max(64).nullable(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const before = await prisma.instrument.findUnique({ where: { id } });
  if (!before) return Response.json({ error: "Instrument not found" }, { status: 404 });

  if (parsed.data.accountId) {
    const account = await prisma.account.findUnique({ where: { id: parsed.data.accountId }, select: { id: true } });
    if (!account) return Response.json({ error: "Account not found" }, { status: 404 });
  }

  const updated = await prisma.instrument.update({
    where: { id },
    data: { accountId: parsed.data.accountId },
    include: { account: { select: { id: true, accountNumber: true, accountName: true } } },
  });

  await prisma.auditLog.create({
    data: {
      userEmail: guard.email ?? "unknown",
      action: "update",
      entity: "Instrument",
      entityId: id,
      before: JSON.parse(JSON.stringify(before)),
      after: JSON.parse(JSON.stringify({ ...updated, account: undefined })),
    },
  });

  return Response.json({ instrument: { id: updated.id, account: updated.account } });
}
