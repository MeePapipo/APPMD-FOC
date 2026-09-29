import bcrypt from "bcryptjs";
import { requireApiAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { generateTempPassword } from "@/lib/generateTempPassword";

/**
 * Admin-assisted password reset — the app has no email sending capability,
 * so there's no self-service "forgot password" link (praditww's explicit
 * choice over building one, 2026-09-29). An admin generates a fresh
 * temporary password here and relays it to the rep out of band (chat,
 * phone); the rep signs in with it like any other password — no forced
 * change-on-first-login flow, matching the scope actually asked for.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id }, select: { email: true } });
  if (!target) return Response.json({ error: "User not found" }, { status: 404 });

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  await prisma.user.update({ where: { id }, data: { passwordHash } });

  // Never log the password itself — only that a reset happened and by whom.
  await prisma.auditLog.create({
    data: { userEmail: guard.email ?? "unknown", action: "reset-password", entity: "User", entityId: id },
  });

  return Response.json({ email: target.email, tempPassword });
}
