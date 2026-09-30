import { Workbook } from "exceljs";
import { requireApiAdmin } from "@/lib/api-auth";
import { applyTpbChanges, pooledTpb, tpbPatchSchema, TPB_SYSTEMS } from "@/lib/admin/tpb";

/**
 * Accepts the "FOC_TPB_SamplesPerBatch_by_Assay" style export directly —
 * matched by header name (case/punctuation-insensitive) rather than fixed
 * column position, so reordering columns in the source file doesn't break
 * this. Expected columns: System, Assay Code, Test per Batch (TPB), Months
 * with data, Total Runs, Total Samples, Confidence, Notes.
 */
function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const HEADER_MAP: Record<string, string> = {
  system: "system",
  assaycode: "code",
  code: "code",
  testperbatchtpb: "tpb",
  tpb: "tpb",
  monthswithdata: "monthsWithData",
  totalruns: "totalRuns",
  totalsamples: "totalSamples",
  confidence: "confidence",
  notes: "notes",
};

function normalizeSystem(raw: string): (typeof TPB_SYSTEMS)[number] | null {
  const s = raw.toLowerCase();
  if (s.includes("5800")) return "S5800";
  if (s.includes("6800") || s.includes("8800")) return "S6800";
  return null;
}

export async function POST(request: Request) {
  const guard = await requireApiAdmin();
  if (guard instanceof Response) return guard;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof Blob)) {
    return Response.json({ error: "No file uploaded." }, { status: 400 });
  }

  const workbook = new Workbook();
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    // exceljs's bundled type defs predate a newer Buffer shape; the value is
    // a real Buffer at runtime, this cast is type-only.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    return Response.json({ error: "Could not read this file as an Excel workbook." }, { status: 400 });
  }

  const sheet = workbook.getWorksheet("TPB by Assay") ?? workbook.worksheets[0];
  if (!sheet) {
    return Response.json({ error: "No worksheet found in the uploaded file." }, { status: 400 });
  }

  const columns: (string | undefined)[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    columns[colNumber] = HEADER_MAP[normalizeHeader(String(cell.value ?? ""))];
  });
  if (!columns.includes("system") || !columns.includes("code") || !columns.includes("tpb")) {
    return Response.json(
      { error: "Missing required columns — expected at least System, Assay Code, and TPB." },
      { status: 400 },
    );
  }

  const rawEntries: unknown[] = [];
  const rowErrors: string[] = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (row.cellCount === 0) continue;
    const record: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = columns[colNumber];
      if (key) record[key] = cell.value;
    });
    if (!record.system && !record.code) continue; // blank spacer row

    const system = normalizeSystem(String(record.system ?? ""));
    const code = String(record.code ?? "").trim();
    const tpb = Number(record.tpb);
    if (!system || !code || !Number.isFinite(tpb) || tpb <= 0) {
      rowErrors.push(`Row ${r}: could not read system/code/TPB (system=${record.system}, code=${record.code}, tpb=${record.tpb})`);
      continue;
    }

    const totalRuns = record.totalRuns !== undefined && record.totalRuns !== "" ? Number(record.totalRuns) : null;
    const totalSamples = record.totalSamples !== undefined && record.totalSamples !== "" ? Number(record.totalSamples) : null;

    rawEntries.push({
      action: "upsert",
      system,
      code,
      // Pooled samples/runs when the file carries both totals; the file's own
      // TPB column (a mean of monthly ratios) is only the fallback.
      tpb: pooledTpb(totalRuns, totalSamples) ?? tpb,
      confidence: String(record.confidence ?? "normal").trim().toLowerCase() === "low" ? "low" : "normal",
      monthsWithData: record.monthsWithData ? String(record.monthsWithData) : null,
      totalRuns,
      totalSamples,
      notes: record.notes ? String(record.notes) : null,
    });
  }

  if (rawEntries.length === 0) {
    return Response.json({ error: "No valid rows found in the uploaded file.", rowErrors }, { status: 400 });
  }

  const parsed = tpbPatchSchema.safeParse({ entries: rawEntries });
  if (!parsed.success) {
    return Response.json(
      { error: "Some rows didn't pass validation.", details: parsed.error.issues, rowErrors },
      { status: 400 },
    );
  }

  const { settingsNow, entriesNow, changed } = await applyTpbChanges(parsed.data, guard.email ?? "unknown");
  return Response.json({
    settings: settingsNow,
    entries: entriesNow,
    imported: rawEntries.length,
    changed,
    rowErrors,
  });
}
