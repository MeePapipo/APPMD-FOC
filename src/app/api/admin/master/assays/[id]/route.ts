import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const SYSTEMS = ["S6800", "S5800", "S4800"] as const;

const patchSchema = z
  .object({
    system: z.enum(SYSTEMS),
    code: z.string().trim().min(1).max(64),
    materialNo: z.string().trim().min(1).max(64),
    description: z.string().trim().min(1).max(300),
    dkshCode: z.string().trim().max(64).nullish(),
    batchRow: z.number().int().nullish(),
    batchLabel: z.string().trim().max(120).nullish(),
    packSize: z.number().int().positive(),
    price: z.number().nonnegative().nullish(),
    category: z.string().trim().max(120).nullish(),
    usageType: z.string().trim().max(120).nullish(),
    usageGroup: z.string().trim().max(120).nullish(),
    packText: z.string().trim().max(120).nullish(),
    unitText: z.string().trim().max(120).nullish(),
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

  const before = await prisma.masterAssay.findUnique({ where: { id } });
  if (!before) return Response.json({ error: "Assay not found" }, { status: 404 });

  let updated;
  try {
    updated = await prisma.masterAssay.update({ where: { id }, data: parsed.data });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      return Response.json(
        { error: "Another assay already uses this system and code." },
        { status: 409 },
      );
    }
    console.error("update MasterAssay failed", cause);
    return Response.json({ error: "Update failed. Please try again." }, { status: 500 });
  }

  await prisma.auditLog.create({
    data: {
      userEmail: guard.email ?? "unknown",
      action: "update",
      entity: "MasterAssay",
      entityId: id,
      before: JSON.parse(JSON.stringify(before)),
      after: JSON.parse(JSON.stringify(updated)),
    },
  });

  return Response.json({ assay: updated });
}
