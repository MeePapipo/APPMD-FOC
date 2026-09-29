import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { TpbTable, type TpbEntryRow } from "@/components/admin/TpbTable";

export default async function AdminTpbPage() {
  await requireAdmin();

  const [settings, entries, assays] = await Promise.all([
    prisma.tpbSettings.findUnique({ where: { id: "singleton" } }),
    prisma.tpbEntry.findMany({
      where: { system: { in: ["S6800", "S5800"] } },
      orderBy: [{ system: "asc" }, { code: "asc" }],
      select: {
        id: true,
        system: true,
        code: true,
        tpb: true,
        confidence: true,
        monthsWithData: true,
        totalRuns: true,
        totalSamples: true,
        notes: true,
      },
    }),
    prisma.masterAssay.findMany({
      where: { active: true },
      select: { system: true, code: true, description: true },
      orderBy: [{ system: "asc" }, { sortOrder: "asc" }],
    }),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-ink">Tests per batch (TPB)</h1>
      <p className="mb-6 text-sm text-muted">
        Real usage-derived batch sizes per system × assay, refreshed periodically from eLP
        (see the elp-tpb-refresh workflow). A code with no entry here falls back to the
        floor value for its system. This directly changes BATCH-driver quantity math.
      </p>
      <TpbTable
        initialEntries={entries as TpbEntryRow[]}
        initialSettings={settings}
        assays={assays}
      />
    </div>
  );
}
