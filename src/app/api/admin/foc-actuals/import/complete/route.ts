import { z } from "zod";
import { requireApiAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { loadDataThrough } from "@/lib/dashboard/dataThrough";

const count = z.number().int().nonnegative();
const bodySchema = z.object({
  periods: z.array(z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) })).max(240),
  fresh: count, unchanged: count, relabelled: count, changed: count, updated: count,
  excludedTeam: count, excludedCategory: count, excludedProductLine: count,
  fileName: z.string().max(200).optional(),
});

/** The browser calls this once after the last chunk: one audit entry per import, and the fresh "data through" stamp. */
export async function POST(request: Request) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { periods, ...summary } = parsed.data;

  const sorted = [...periods].sort((a, b) => a.year - b.year || a.month - b.month);
  const span = sorted.length ? `${sorted[0].year}-${sorted[0].month}..${sorted.at(-1)!.year}-${sorted.at(-1)!.month}` : "";
  await prisma.auditLog.create({
    data: {
      userEmail: guard.email ?? "unknown",
      action: "import",
      entity: "FocActualImport",
      entityId: span,
      after: { periods: sorted, ...summary },
    },
  });

  return Response.json({ dataThrough: await loadDataThrough() });
}
