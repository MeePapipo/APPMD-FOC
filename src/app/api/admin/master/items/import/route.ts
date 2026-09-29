import { requireApiAdmin } from "@/lib/api-auth";
import { parseCsvRecords } from "@/lib/csv";
import { csvRecordToMasterItemInput, masterItemRowSchema, upsertMasterItemRow } from "@/lib/admin/masterItem";

export async function POST(request: Request) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof Blob)) {
    return Response.json({ error: "No file uploaded." }, { status: 400 });
  }

  const records = parseCsvRecords(await file.text());
  if (records.length === 0) {
    return Response.json({ error: "No rows found in the uploaded file." }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  const rowErrors: string[] = [];

  for (let i = 0; i < records.length; i++) {
    const parsed = masterItemRowSchema.safeParse(csvRecordToMasterItemInput(records[i]));
    if (!parsed.success) {
      rowErrors.push(
        `Row ${i + 2} (${records[i].materialNo || "?"}): ${parsed.error.issues.map((x) => x.message).join("; ")}`,
      );
      continue;
    }
    try {
      const result = await upsertMasterItemRow(parsed.data, guard.email ?? "unknown");
      if (result.status === "created") created++;
      else updated++;
    } catch (cause) {
      rowErrors.push(
        `Row ${i + 2} (${records[i].materialNo}): ${cause instanceof Error ? cause.message : "failed to save"}`,
      );
    }
  }

  return Response.json({ created, updated, rowErrors, total: records.length });
}
