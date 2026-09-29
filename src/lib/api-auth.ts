import { getSessionUser, type SessionUser } from "@/lib/session";

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
  return user;
}

export async function requireApiAdmin(): Promise<SessionUser | Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });
  return user;
}
