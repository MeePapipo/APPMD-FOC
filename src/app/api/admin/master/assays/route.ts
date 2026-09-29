import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const SYSTEMS = ["S6800", "S5800", "S4800"] as const;

const createSchema = z.object({
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
  active: z.boolean().optional(),
});

export async function GET(request: Request) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const params = new URL(request.url).searchParams;
  const system = params.get("system");
  const q = params.get("q")?.trim();

  const assays = await prisma.masterAssay.findMany({
    where: {
      ...(system && SYSTEMS.includes(system as (typeof SYSTEMS)[number])
        ? { system: system as (typeof SYSTEMS)[number] }
        : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { materialNo: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ system: "asc" }, { sortOrder: "asc" }],
  });

  return Response.json({ assays });
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
    // srcRow only means anything for rows imported from the master
    // spreadsheet — 0 for anything created here, audit-only, never evaluated.
    created = await prisma.masterAssay.create({ data: { ...parsed.data, srcRow: 0 } });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      return Response.json(
        { error: "An assay with this system and code already exists." },
        { status: 409 },
      );
    }
    console.error("create MasterAssay failed", cause);
    return Response.json({ error: "Create failed. Please try again." }, { status: 500 });
  }

  await prisma.auditLog.create({
    data: {
      userEmail: guard.email ?? "unknown",
      action: "create",
      entity: "MasterAssay",
      entityId: created.id,
      after: JSON.parse(JSON.stringify(created)),
    },
  });

  return Response.json({ assay: created });
}
