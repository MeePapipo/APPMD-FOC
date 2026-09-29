import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const SYSTEMS = ["S6800", "S5800", "S4800"] as const;
const DRIVERS = ["BATCH", "TEST"] as const;

const patchSchema = z
  .object({
    system: z.enum(SYSTEMS),
    materialNo: z.string().trim().min(1).max(64),
    description: z.string().trim().min(1).max(300),
    dkshCode: z.string().trim().max(64).nullish(),
    group: z.string().trim().min(1).max(60),
    category: z.string().trim().max(120).nullish(),
    usageType: z.string().trim().max(120).nullish(),
    usageGroup: z.string().trim().max(120).nullish(),
    packText: z.string().trim().max(120).nullish(),
    unitText: z.string().trim().max(120).nullish(),
    priceText: z.string().trim().max(120).nullish(),
    optional: z.boolean(),
    onDemand: z.boolean(),
    packSize: z.number().int().positive(),
    consumption: z.number(),
    coverage: z.number().positive(),
    price: z.number().nonnegative().nullish(),
    driver: z.enum(DRIVERS),
    appliesToAll: z.boolean(),
    appliesTo: z.array(z.string().trim().min(1)),
    weights: z.record(z.string(), z.number()).nullish(),
    active: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" })
  .refine(
    (v) => v.appliesToAll === undefined || v.appliesTo === undefined || !v.appliesToAll || v.appliesTo.length === 0,
    { message: "appliesToAll and a non-empty appliesTo list are mutually exclusive", path: ["appliesTo"] },
  );

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }

  const before = await prisma.masterItem.findUnique({ where: { id } });
  if (!before) return Response.json({ error: "Item not found" }, { status: 404 });

  // A resulting S4800, non-onDemand item still needs weights — check against
  // the merged (existing + patched) state, since a PATCH may only touch one
  // of these fields at a time.
  const merged = { ...before, ...parsed.data };
  const mergedWeights = (merged.weights as Record<string, number> | null | undefined) ?? null;
  if (merged.system === "S4800" && !merged.onDemand && (!mergedWeights || Object.keys(mergedWeights).length === 0)) {
    return Response.json(
      { error: "cobas 4800 items need at least one assay weight unless marked on-demand." },
      { status: 400 },
    );
  }

  const { weights, ...rest } = parsed.data;
  let updated;
  try {
    updated = await prisma.masterItem.update({
      where: { id },
      data: { ...rest, ...(weights !== undefined ? { weights: weights ?? Prisma.JsonNull } : {}) },
    });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      return Response.json(
        { error: "Another item already uses this system and material number." },
        { status: 409 },
      );
    }
    console.error("update MasterItem failed", cause);
    return Response.json({ error: "Update failed. Please try again." }, { status: 500 });
  }

  await prisma.auditLog.create({
    data: {
      userEmail: guard.email ?? "unknown",
      action: "update",
      entity: "MasterItem",
      entityId: id,
      before: JSON.parse(JSON.stringify(before)),
      after: JSON.parse(JSON.stringify(updated)),
    },
  });

  return Response.json({ item: updated });
}
