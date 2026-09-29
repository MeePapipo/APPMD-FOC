import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const TPB_SYSTEMS = ["S6800", "S5800"] as const;

export const tpbEntryUpsertSchema = z.object({
  action: z.literal("upsert"),
  system: z.enum(TPB_SYSTEMS),
  code: z.string().trim().min(1).max(64),
  tpb: z.number().positive(),
  confidence: z.enum(["normal", "low"]).default("normal"),
  monthsWithData: z.string().trim().max(60).nullish(),
  totalRuns: z.number().int().nonnegative().nullish(),
  totalSamples: z.number().int().nonnegative().nullish(),
  notes: z.string().trim().max(500).nullish(),
});

export const tpbEntryDeleteSchema = z.object({ action: z.literal("delete"), id: z.string().min(1) });

export const tpbPatchSchema = z.object({
  settings: z
    .object({
      floor6800: z.number().int().positive(),
      floor5800: z.number().int().positive(),
      method: z.string().trim().max(500).nullish(),
    })
    .partial()
    .optional(),
  entries: z.array(z.discriminatedUnion("action", [tpbEntryUpsertSchema, tpbEntryDeleteSchema])).optional(),
});

export type TpbPatchInput = z.infer<typeof tpbPatchSchema>;

/**
 * Shared apply logic for the TPB bulk PATCH endpoint (used by the admin UI's
 * inline table) and the xlsx import endpoint — both just build the same
 * `{ settings, entries }` shape and call this, so the upsert/delete/audit
 * behavior can't drift between the two entry points.
 */
export async function applyTpbChanges(input: TpbPatchInput, actorEmail: string) {
  const { settings, entries } = input;
  const auditRows: Prisma.AuditLogCreateManyInput[] = [];

  if (settings && Object.keys(settings).length > 0) {
    const before = await prisma.tpbSettings.findUnique({ where: { id: "singleton" } });
    const after = await prisma.tpbSettings.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        floor6800: settings.floor6800 ?? 24,
        floor5800: settings.floor5800 ?? 6,
        method: settings.method,
        asOf: new Date(),
      },
      update: { ...settings, asOf: new Date() },
    });
    auditRows.push({
      userEmail: actorEmail,
      action: "update",
      entity: "TpbSettings",
      entityId: "singleton",
      before: before ? JSON.parse(JSON.stringify(before)) : null,
      after: JSON.parse(JSON.stringify(after)),
    });
  }

  for (const entry of entries ?? []) {
    if (entry.action === "delete") {
      const before = await prisma.tpbEntry.findUnique({ where: { id: entry.id } });
      if (!before) continue;
      await prisma.tpbEntry.delete({ where: { id: entry.id } });
      auditRows.push({
        userEmail: actorEmail,
        action: "delete",
        entity: "TpbEntry",
        entityId: entry.id,
        before: JSON.parse(JSON.stringify(before)),
      });
      continue;
    }

    const { action, ...data } = entry;
    void action;
    const before = await prisma.tpbEntry.findUnique({
      where: { system_code: { system: data.system, code: data.code } },
    });
    const after = await prisma.tpbEntry.upsert({
      where: { system_code: { system: data.system, code: data.code } },
      create: { ...data, asOf: new Date() },
      update: { ...data, asOf: new Date() },
    });
    auditRows.push({
      userEmail: actorEmail,
      action: before ? "update" : "create",
      entity: "TpbEntry",
      entityId: after.id,
      before: before ? JSON.parse(JSON.stringify(before)) : null,
      after: JSON.parse(JSON.stringify(after)),
    });
  }

  if (auditRows.length > 0) {
    await prisma.auditLog.createMany({ data: auditRows });
  }

  const [settingsNow, entriesNow] = await Promise.all([
    prisma.tpbSettings.findUnique({ where: { id: "singleton" } }),
    prisma.tpbEntry.findMany({ orderBy: [{ system: "asc" }, { code: "asc" }] }),
  ]);

  return { settingsNow, entriesNow, changed: auditRows.length };
}
