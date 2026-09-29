import { requireApiAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const q = new URL(request.url).searchParams.get("q")?.trim();
  const users = await prisma.user.findMany({
    where: q
      ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }
      : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      team: true,
      active: true,
      createdAt: true,
    },
  });

  return Response.json({ users });
}
