import { Prisma } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { accountCreateSchema } from "@/lib/admin/account";

export async function POST(request: Request) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const parsed = accountCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }

  let created;
  try {
    created = await prisma.account.create({ data: parsed.data });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      return Response.json({ error: "An account with this number already exists." }, { status: 409 });
    }
    console.error("create Account failed", cause);
    return Response.json({ error: "Create failed. Please try again." }, { status: 500 });
  }

  await prisma.auditLog.create({
    data: {
      userEmail: guard.email ?? "unknown",
      action: "create",
      entity: "Account",
      entityId: created.id,
      after: JSON.parse(JSON.stringify(created)),
    },
  });

  return Response.json({
    account: { id: created.id, accountNumber: created.accountNumber, accountName: created.accountName, active: created.active, uses: 0 },
  });
}
