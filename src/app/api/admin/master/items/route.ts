import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const SYSTEMS = ["S6800", "S5800", "S4800"] as const;
const DRIVERS = ["BATCH", "TEST"] as const;

/**
 * appliesTo/appliesToAll is a real three-state (All / None / Specific), not a
 * boolean-plus-list — see src/lib/calc/service.ts:54 for the engine's own
 * `appliesToAll ? null : appliesTo` translation this must stay consistent
 * with. weights is required (and non-empty) whenever the item is on S4800
 * and not onDemand, matching engine4800.ts's own throw condition — better to
 * reject here than let a rep's calculation blow up later.
 */
const baseFields = {
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
};

const createSchema = z
  .object(baseFields)
  .refine((v) => !v.appliesToAll || v.appliesTo.length === 0, {
    message: "appliesToAll and a non-empty appliesTo list are mutually exclusive",
    path: ["appliesTo"],
  })
  .refine((v) => v.system !== "S4800" || v.onDemand || (v.weights && Object.keys(v.weights).length > 0), {
    message: "cobas 4800 items need at least one assay weight unless marked on-demand",
    path: ["weights"],
  });

export async function GET(request: Request) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const params = new URL(request.url).searchParams;
  const system = params.get("system");
  const q = params.get("q")?.trim();

  const items = await prisma.masterItem.findMany({
    where: {
      ...(system && SYSTEMS.includes(system as (typeof SYSTEMS)[number])
        ? { system: system as (typeof SYSTEMS)[number] }
        : {}),
      ...(q
        ? {
            OR: [
              { description: { contains: q, mode: "insensitive" } },
              { materialNo: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ system: "asc" }, { sortOrder: "asc" }],
  });

  return Response.json({ items });
}

export async function POST(request: Request) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }

  let created;
  try {
    created = await prisma.masterItem.create({
      data: { ...parsed.data, weights: parsed.data.weights ?? Prisma.JsonNull },
    });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      return Response.json(
        { error: "An item with this system and material number already exists." },
        { status: 409 },
      );
    }
    console.error("create MasterItem failed", cause);
    return Response.json({ error: "Create failed. Please try again." }, { status: 500 });
  }

  await prisma.auditLog.create({
    data: {
      userEmail: guard.email ?? "unknown",
      action: "create",
      entity: "MasterItem",
      entityId: created.id,
      after: JSON.parse(JSON.stringify(created)),
    },
  });

  return Response.json({ item: created });
}
