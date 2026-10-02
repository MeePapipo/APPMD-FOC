import { z } from "zod";
import { requireApiAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const patchSchema = z
  .object({
    role: z.enum(["USER", "ADMIN"]),
    team: z.enum(["NORTH", "SOUTH", "PRIVATE", "BUSINESS_PARTNER", "THAI_RED_CROSS", "MD"]).nullable(),
    active: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }

  // An admin can't demote or deactivate their own account here — that would
  // either lock them out immediately (active) or just be confusing (role),
  // with no one else in the session able to undo it.
  if (id === guard.id && ("role" in parsed.data || "active" in parsed.data)) {
    return Response.json(
      { error: "You cannot change your own role or active status." },
      { status: 400 },
    );
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { role: true, team: true, active: true },
  });
  if (!target) return Response.json({ error: "User not found" }, { status: 404 });

  const updated = await prisma.user.update({
    where: { id },
    data: parsed.data,
    select: { id: true, email: true, name: true, role: true, team: true, active: true, createdAt: true },
  });

  await prisma.auditLog.create({
    data: {
      userEmail: guard.email ?? "unknown",
      action: "update",
      entity: "User",
      entityId: id,
      before: target,
      after: { role: updated.role, team: updated.team, active: updated.active },
    },
  });

  return Response.json({ user: updated });
}
