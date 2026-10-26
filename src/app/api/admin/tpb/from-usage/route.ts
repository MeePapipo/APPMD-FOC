import { requireApiAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { computeNationalTpb } from "@/lib/admin/nationalTpb";

/**
 * Proposed national TPB table from the imported instrument usage, side by side
 * with what is stored now. Read-only: the admin ticks rows and saves them
 * through the normal PATCH /api/admin/tpb, so the audit trail is the same.
 * `?months=N` = the latest N imported months (default: all, up to 12).
 */
export async function GET(request: Request) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const available = (
    await prisma.instrumentUsageMonth.findMany({ distinct: ["month"], select: { month: true }, orderBy: { month: "desc" } })
  ).map((m) => m.month);
  if (available.length === 0) {
    return Response.json({ error: "No instrument usage imported yet. Import a SamplesPerRunTable first." }, { status: 400 });
  }
  const asked = Number(new URL(request.url).searchParams.get("months"));
  const n = Number.isInteger(asked) && asked > 0 ? Math.min(asked, available.length) : Math.min(available.length, 12);
  const months = available.slice(0, n).reverse();

  const [usage, assays, entries, settings] = await Promise.all([
    prisma.instrumentUsageMonth.findMany({
      where: { month: { in: months } },
      select: { month: true, instrumentId: true, assayCode: true, runs: true, samples: true, instrument: { select: { systemClass: true } } },
    }),
    prisma.masterAssay.findMany({ where: { active: true, system: { in: ["S6800", "S5800"] } }, select: { system: true, code: true } }),
    prisma.tpbEntry.findMany({ where: { system: { in: ["S6800", "S5800"] } }, select: { system: true, code: true, tpb: true, confidence: true, monthsWithData: true } }),
    prisma.tpbSettings.findUnique({ where: { id: "singleton" }, select: { accountMinRuns: true } }),
  ]);

  const { rows, notInMaster } = computeNationalTpb(
    usage.map((u) => ({ month: u.month, instrumentId: u.instrumentId, systemClass: u.instrument.systemClass, assay: u.assayCode, runs: u.runs, samples: u.samples })),
    months,
    new Set(assays.map((a) => `${a.system}|${a.code}`)),
    settings?.accountMinRuns ?? 8,
  );

  const current = new Map(entries.map((e) => [`${e.system}|${e.code}`, e]));
  const proposed = new Set(rows.map((r) => `${r.system}|${r.code}`));
  return Response.json({
    months,
    available: available.length,
    rows: rows.map((r) => {
      const c = current.get(`${r.system}|${r.code}`);
      return { ...r, current: c ? { tpb: c.tpb, confidence: c.confidence, monthsWithData: c.monthsWithData } : null };
    }),
    // Stored entries with no usage in the window: left as they are.
    noUsage: entries.filter((e) => !proposed.has(`${e.system}|${e.code}`)).map((e) => ({ system: e.system, code: e.code, tpb: e.tpb })),
    notInMaster,
  });
}
