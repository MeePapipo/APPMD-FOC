import { getSessionUser, type SessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/** A user on an admin-issued temporary password may only change it: every other API call is refused until they do. */
async function passwordChangeRequired(user: SessionUser): Promise<Response | null> {
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { mustChangePassword: true } });
  return account?.mustChangePassword ? Response.json({ error: "Password change required" }, { status: 403 }) : null;
}

/**
 * Guard for route handlers. Returns the user, or a Response to return early.
 * Usage:
 *   const guard = await requireApiUser();
 *   if (guard instanceof Response) return guard;
 *   const user = guard;
 */
export async function requireApiUser(): Promise<SessionUser | Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return (await passwordChangeRequired(user)) ?? user;
}

export async function requireApiAdmin(): Promise<SessionUser | Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });
  return (await passwordChangeRequired(user)) ?? user;
}
