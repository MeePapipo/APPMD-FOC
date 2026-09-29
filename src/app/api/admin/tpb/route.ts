import { requireApiAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyTpbChanges, tpbPatchSchema } from "@/lib/admin/tpb";

export async function GET() {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const [settings, entries] = await Promise.all([
    prisma.tpbSettings.findUnique({ where: { id: "singleton" } }),
    prisma.tpbEntry.findMany({ orderBy: [{ system: "asc" }, { code: "asc" }] }),
  ]);

  return Response.json({ settings, entries });
}

export async function PATCH(request: Request) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const parsed = tpbPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }

  const { settingsNow, entriesNow } = await applyTpbChanges(parsed.data, guard.email ?? "unknown");
  return Response.json({ settings: settingsNow, entries: entriesNow });
}
