import { z } from "zod";
import { requireApiAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { classifyUsage, type UsageCell } from "@/lib/admin/instrumentUsageDiff";
import { instrumentKey, normalizeName } from "@/lib/admin/instrumentMap";

// The browser reads the (~60 MB) eLP export and sends the summarised rows, a few
// hundred per month, so the request stays small.
export const maxDuration = 60;

const rowSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  serial: z.string().min(1).max(32),
  systemClass: z.string().min(1).max(16),
  assay: z.string().min(1).max(32),
  runs: z.number().int().positive().max(1_000_000),
  samples: z.number().int().nonnegative().max(100_000_000),
});
const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(6000),
  /** "serial|class" -> English lab name, from the optional SamplesPerRunAVGTable. */
  labs: z.record(z.string().max(40), z.string().max(200)).refine((v) => Object.keys(v).length <= 1000).optional(),
  updateChanged: z.boolean().optional(),
});

export async function POST(request: Request) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }
  const { rows, labs = {}, updateChanged = false } = parsed.data;

  // Instruments: create the ones we have not seen, and link them to an account
  // by lab name when the AVG table was supplied.
  const keys = [...new Map(rows.map((r) => [instrumentKey(r.serial, r.systemClass), { serial: r.serial, systemClass: r.systemClass }])).entries()];
  const accounts = await prisma.account.findMany({ select: { id: true, accountName: true } });
  const accountByName = new Map(accounts.map((a) => [normalizeName(a.accountName), a.id]));
  const existingInstruments = await prisma.instrument.findMany({ where: { OR: keys.map(([, k]) => k) } });
  const byKey = new Map(existingInstruments.map((i) => [instrumentKey(i.serial, i.systemClass), i]));

  const newInstruments: { serial: string; systemClass: string; labName: string | null; linked: boolean }[] = [];
  for (const [key, k] of keys) {
    const lab = labs[key] ?? null;
    const match = lab ? accountByName.get(normalizeName(lab)) ?? null : null;
    const known = byKey.get(key);
    if (!known) {
      const created = await prisma.instrument.create({ data: { ...k, labName: lab, accountId: match } });
      byKey.set(key, created);
      newInstruments.push({ ...k, labName: lab, linked: !!match });
    } else if (!known.accountId && match) {
      // Existing but unlinked: the lab table can now link it. A linked instrument is never re-pointed here.
      byKey.set(key, await prisma.instrument.update({ where: { id: known.id }, data: { accountId: match, labName: known.labName ?? lab } }));
    } else if (!known.labName && lab) {
      await prisma.instrument.update({ where: { id: known.id }, data: { labName: lab } });
    }
  }

  const incoming: UsageCell[] = rows.map((r) => ({
    instrumentId: byKey.get(instrumentKey(r.serial, r.systemClass))!.id,
    month: r.month, assay: r.assay, runs: r.runs, samples: r.samples,
  }));
  const months = [...new Set(incoming.map((c) => c.month))];
  const existing = await prisma.instrumentUsageMonth.findMany({
    where: { month: { in: months }, instrumentId: { in: [...new Set(incoming.map((c) => c.instrumentId))] } },
    select: { instrumentId: true, month: true, assayCode: true, runs: true, samples: true },
  });
  const { fresh, unchanged, changed } = classifyUsage(
    incoming,
    existing.map((e) => ({ instrumentId: e.instrumentId, month: e.month, assay: e.assayCode, runs: e.runs, samples: e.samples })),
  );

  await prisma.instrumentUsageMonth.createMany({
    data: fresh.map((c) => ({ instrumentId: c.instrumentId, month: c.month, assayCode: c.assay, runs: c.runs, samples: c.samples })),
    skipDuplicates: true,
  });
  let updated = 0;
  if (updateChanged && changed.length > 0) {
    await prisma.$transaction(
      changed.map(({ cell }) =>
        prisma.instrumentUsageMonth.update({
          where: { instrumentId_month_assayCode: { instrumentId: cell.instrumentId, month: cell.month, assayCode: cell.assay } },
          data: { runs: cell.runs, samples: cell.samples },
        }),
      ),
    );
    updated = changed.length;
  }

  const unlinked = [...byKey.values()].filter((i) => !i.accountId).map((i) => ({ serial: i.serial, systemClass: i.systemClass, labName: i.labName }));
  const coverage = (await prisma.instrumentUsageMonth.findMany({ distinct: ["month"], select: { month: true }, orderBy: { month: "asc" } })).map((m) => m.month);
  const tpb = await prisma.tpbSettings.findUnique({ where: { id: "singleton" }, select: { accountWindowMonths: true } });

  await prisma.auditLog.create({
    data: {
      userEmail: guard.email ?? "unknown",
      action: "import",
      entity: "InstrumentUsageImport",
      entityId: months.sort().join(","),
      after: { months, newRows: fresh.length, unchanged, changed: changed.length, updated, newInstruments: newInstruments.length, unlinked: unlinked.length },
    },
  });

  return Response.json({
    newRows: fresh.length, unchanged, changed: changed.length, updated,
    newInstruments, unlinked, coverage, windowMonths: tpb?.accountWindowMonths ?? 4,
  });
}
