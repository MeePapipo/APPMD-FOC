import { requireApiAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv";
import { MASTER_ITEM_CSV_COLUMNS, masterItemToCsvRow } from "@/lib/admin/masterItem";

export async function GET() {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const items = await prisma.masterItem.findMany({ orderBy: [{ system: "asc" }, { sortOrder: "asc" }] });
  const csv = toCsv([
    [...MASTER_ITEM_CSV_COLUMNS],
    ...items.map((i) => masterItemToCsvRow({ ...i, weights: i.weights as Record<string, number> | null })),
  ]);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="master-items.csv"',
    },
  });
}
