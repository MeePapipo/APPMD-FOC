import { z } from "zod";
import bcrypt from "bcryptjs";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { passwordSchema } from "@/lib/passwordPolicy";

const changeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

/**
 * Signed-in user changes their own password: the current one (a temporary one
 * from an admin reset counts) must be given, the new one follows the same rule
 * as registration. Clears `mustChangePassword`. Users who sign in through SSO
 * have no password here and are turned away.
 */
export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = changeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: session.id }, select: { id: true, email: true, passwordHash: true } });
  if (!user?.passwordHash) {
    return Response.json({ error: "This account signs in with Roche SSO and has no password to change." }, { status: 400 });
  }
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return Response.json({ error: "Current password is incorrect." }, { status: 400 });
  }
  if (currentPassword === newPassword) {
    return Response.json({ error: "The new password must be different from the current one." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: false },
  });
  // Never log the password itself.
  await prisma.auditLog.create({ data: { userEmail: user.email, action: "change-password", entity: "User", entityId: user.id } });

  return Response.json({ ok: true });
}
