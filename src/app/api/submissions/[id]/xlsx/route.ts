import { requireApiUser } from "@/lib/api-auth";
import { loadSubmissionDoc } from "@/lib/export/submission-doc";
import { buildSubmissionWorkbook } from "@/lib/export/xlsx";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser();
  if (guard instanceof Response) return guard;

  const { id } = await params;
  // Null covers both "no such submission" and "not yours" — a rep must not be
  // able to probe for other reps' submission ids by the status code.
  const doc = await loadSubmissionDoc(id, guard);
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 });

  const buffer = await buildSubmissionWorkbook(doc);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${doc.fileStem}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
