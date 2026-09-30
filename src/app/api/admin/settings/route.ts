import { requireApiAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { settingsPatchSchema } from "@/lib/admin/settings";

export async function PATCH(request: Request) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const parsed = settingsPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }
  const { alert, tpb, focImport } = parsed.data;
  const actor = guard.email ?? "unknown";
  const audit: { entity: string; before: unknown; after: unknown }[] = [];

  if (alert && Object.keys(alert).length > 0) {
    const before = await prisma.alertSettings.findUnique({ where: { id: "singleton" } });
    const after = await prisma.alertSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...alert },
      update: alert,
    });
    audit.push({ entity: "AlertSettings", before, after });
  }
  if (tpb && Object.keys(tpb).length > 0) {
    const before = await prisma.tpbSettings.findUnique({ where: { id: "singleton" } });
    const after = await prisma.tpbSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...tpb },
      update: { ...tpb, asOf: new Date() },
    });
    audit.push({ entity: "TpbSettings", before, after });
  }

  if (focImport && Object.keys(focImport).length > 0) {
    const before = await prisma.focImportSettings.findUnique({ where: { id: "singleton" } });
    const after = await prisma.focImportSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...focImport },
      update: focImport,
    });
    audit.push({ entity: "FocImportSettings", before, after });
  }

  await prisma.auditLog.createMany({
    data: audit.map((a) => ({
      userEmail: actor,
      action: "update",
      entity: a.entity,
      entityId: "singleton",
      before: a.before ? JSON.parse(JSON.stringify(a.before)) : undefined,
      after: JSON.parse(JSON.stringify(a.after)),
    })),
  });

  const [alertNow, tpbNow, importNow] = await Promise.all([
    prisma.alertSettings.findUnique({ where: { id: "singleton" } }),
    prisma.tpbSettings.findUnique({ where: { id: "singleton" } }),
    prisma.focImportSettings.findUnique({ where: { id: "singleton" } }),
  ]);
  return Response.json({
    alert: alertNow ? { overPct6800: alertNow.overPct6800, overPct5800: alertNow.overPct5800, minOverUnits: alertNow.minOverUnits, netOverPct: alertNow.netOverPct, netMinExcess: alertNow.netMinExcess, focStandaloneMin: alertNow.focStandaloneMin } : null,
    focImport: importNow ? { allowedProductLines: importNow.allowedProductLines } : null,
    tpb: tpbNow ? { accountFloorRatio: tpbNow.accountFloorRatio, accountMinRuns: tpbNow.accountMinRuns, accountWindowMonths: tpbNow.accountWindowMonths } : null,
  });
}
