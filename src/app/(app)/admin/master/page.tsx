import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { MasterAssayTable } from "@/components/admin/MasterAssayTable";
import { MasterItemTable } from "@/components/admin/MasterItemTable";
import { CsvImportExport } from "@/components/admin/CsvImportExport";

export default async function AdminMasterPage() {
  await requireAdmin();

  const [assays, items] = await Promise.all([
    prisma.masterAssay.findMany({
      orderBy: [{ system: "asc" }, { sortOrder: "asc" }],
      select: {
        id: true,
        system: true,
        code: true,
        materialNo: true,
        description: true,
        dkshCode: true,
        batchRow: true,
        batchLabel: true,
        packSize: true,
        price: true,
        category: true,
        usageType: true,
        usageGroup: true,
        packText: true,
        unitText: true,
        active: true,
      },
    }),
    prisma.masterItem.findMany({
      orderBy: [{ system: "asc" }, { sortOrder: "asc" }],
      select: {
        id: true,
        system: true,
        materialNo: true,
        description: true,
        dkshCode: true,
        group: true,
        category: true,
        usageType: true,
        usageGroup: true,
        packText: true,
        unitText: true,
        priceText: true,
        optional: true,
        onDemand: true,
        packSize: true,
        consumption: true,
        coverage: true,
        price: true,
        driver: true,
        appliesTo: true,
        appliesToAll: true,
        weights: true,
        active: true,
      },
    }),
  ]);

  const assayOptions = assays.map((a) => ({ system: a.system, code: a.code, description: a.description }));

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-1 text-xl font-semibold text-ink">Main reagents (MasterAssay)</h1>
        <p className="mb-4 text-sm text-muted">The reagents reps order test volumes against.</p>
        <CsvImportExport
          label="assays"
          exportHref="/api/admin/master/assays/export"
          importUrl="/api/admin/master/assays/import"
        />
        <MasterAssayTable initialAssays={assays} />
      </section>
      <section>
        <h2 className="mb-1 text-xl font-semibold text-ink">FOC formula items (MasterItem)</h2>
        <p className="mb-4 text-sm text-muted">
          The give-away items the formula computes quantities for. Deactivating an item
          removes it from future calculations immediately — past orders are unaffected.
        </p>
        <CsvImportExport
          label="items"
          exportHref="/api/admin/master/items/export"
          importUrl="/api/admin/master/items/import"
        />
        <MasterItemTable
          initialItems={items.map((i) => ({ ...i, weights: i.weights as Record<string, number> | null }))}
          assays={assayOptions}
        />
      </section>
    </div>
  );
}
