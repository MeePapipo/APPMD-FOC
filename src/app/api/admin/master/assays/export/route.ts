import { requireApiAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv";
import { MASTER_ASSAY_CSV_COLUMNS, masterAssayToCsvRow } from "@/lib/admin/masterAssay";

export async function GET() {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const assays = await prisma.masterAssay.findMany({ orderBy: [{ system: "asc" }, { sortOrder: "asc" }] });
  const csv = toCsv([[...MASTER_ASSAY_CSV_COLUMNS], ...assays.map(masterAssayToCsvRow)]);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="master-assays.csv"',
    },
  });
}
