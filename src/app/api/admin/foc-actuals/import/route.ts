import { z } from "zod";
import { requireApiAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { classifyRows } from "@/lib/dashboard/focActualsDiff";
import type { FocActualRow } from "@/lib/dashboard/focActualsImport";

// The browser parses the (~30 MB) Tableau export and sends the rows in chunks,
// so every request stays far below serverless body limits and time limits.
export const maxDuration = 60;

const MAX_ROWS_PER_REQUEST = 5000;
const num = z.number().finite();
const rowSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  team: z.string().max(100).nullable(),
  rep: z.string().max(200).nullable(),
  category: z.string().max(100).nullable(),
  accountName: z.string().min(1).max(300),
  materialNo: z.string().max(64),
  productName: z.string().min(1).max(300),
  revenue: num, revenueQty: num, soldQty: num, focCost: num, focQty: num, bonusCost: num, bonusQty: num, totalCost: num, tests: num,
});
const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(MAX_ROWS_PER_REQUEST),
  /** Also overwrite stored rows whose figures differ (Tableau revised them). Off by default. */
  updateChanged: z.boolean().optional(),
});

const SELECT = {
  year: true, month: true, team: true, rep: true, category: true, accountName: true, materialNo: true, productName: true,
  revenue: true, revenueQty: true, soldQty: true, focCost: true, focQty: true, bonusCost: true, bonusQty: true, totalCost: true, tests: true,
} as const;

export async function POST(request: Request) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }
  const { rows, updateChanged = false } = parsed.data;

  // One query for everything stored in the chunk's months, not one per row.
  const periods = [...new Map(rows.map((r) => [`${r.year}|${r.month}`, { year: r.year, month: r.month }])).values()];
  const existing = (await prisma.focActual.findMany({
    where: { OR: periods },
    select: SELECT,
  })) as FocActualRow[];

  const { fresh, unchanged, relabelled, changed } = classifyRows(rows, existing);

  for (let i = 0; i < fresh.length; i += 1000) {
    // skipDuplicates is a safety net for two admins importing at once.
    await prisma.focActual.createMany({ data: fresh.slice(i, i + 1000), skipDuplicates: true });
  }

  // Same figures, new team/rep/Item Group label: always refreshed.
  for (let i = 0; i < relabelled.length; i += 100) {
    await prisma.$transaction(
      relabelled.slice(i, i + 100).map((row) =>
        prisma.focActual.update({
          where: {
            year_month_accountName_materialNo_productName: {
              year: row.year, month: row.month, accountName: row.accountName, materialNo: row.materialNo, productName: row.productName,
            },
          },
          data: { team: row.team, rep: row.rep, category: row.category },
        }),
      ),
    );
  }

  let updated = 0;
  if (updateChanged) {
    for (let i = 0; i < changed.length; i += 100) {
      const batch = changed.slice(i, i + 100);
      await prisma.$transaction(
        batch.map(({ row }) =>
          prisma.focActual.update({
            where: {
              year_month_accountName_materialNo_productName: {
                year: row.year, month: row.month, accountName: row.accountName, materialNo: row.materialNo, productName: row.productName,
              },
            },
            data: row,
          }),
        ),
      );
      updated += batch.length;
    }
  }

  return Response.json({ fresh: fresh.length, unchanged, relabelled: relabelled.length, changed: changed.length, updated });
}
