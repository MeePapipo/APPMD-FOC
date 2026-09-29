import { requireApiAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { parseFocActualsCsv, type FocActualRow } from "@/lib/dashboard/focActualsImport";

function keyOf(r: Pick<FocActualRow, "year" | "month" | "accountName" | "materialNo" | "productName">) {
  return {
    year_month_accountName_materialNo_productName: {
      year: r.year,
      month: r.month,
      accountName: r.accountName,
      materialNo: r.materialNo,
      productName: r.productName,
    },
  };
}

export async function POST(request: Request) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof Blob)) {
    return Response.json({ error: "No file uploaded." }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseFocActualsCsv(Buffer.from(await file.arrayBuffer()));
  } catch (cause) {
    return Response.json(
      { error: cause instanceof Error ? cause.message : "Could not parse this file." },
      { status: 400 },
    );
  }

  if (parsed.rows.length === 0) {
    return Response.json({ error: "No valid rows found in this file." }, { status: 400 });
  }

  // Per-row upsert against the compound natural key IS the dedup mechanism:
  // a (year, month, account, product) combo that already exists gets its
  // values refreshed (Tableau data can be revised after the fact), a combo
  // that doesn't exist yet is created. A plain findUnique first (rather than
  // trusting upsert's own create/update branch silently) is what lets us
  // report accurate created/updated counts back to the admin.
  let created = 0;
  let updated = 0;
  for (const row of parsed.rows) {
    const where = keyOf(row);
    const existing = await prisma.focActual.findUnique({ where });
    await prisma.focActual.upsert({ where, create: row, update: row });
    if (existing) updated++;
    else created++;
  }

  await prisma.auditLog.create({
    data: {
      userEmail: guard.email ?? "unknown",
      action: "import",
      entity: "FocActualImport",
      entityId: `${parsed.meta.year ?? "unknown"}-${parsed.meta.months.join(",")}`,
      after: {
        year: parsed.meta.year,
        months: parsed.meta.months,
        created,
        updated,
        excludedTeam: parsed.meta.excludedTeam,
        excludedCategory: parsed.meta.excludedCategory,
        totalRows: parsed.rows.length,
      },
    },
  });

  return Response.json({
    created,
    updated,
    total: parsed.rows.length,
    year: parsed.meta.year,
    months: parsed.meta.months,
    excludedTeam: parsed.meta.excludedTeam,
    excludedCategory: parsed.meta.excludedCategory,
  });
}
