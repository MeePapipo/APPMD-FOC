import { requireApiUser } from "@/lib/api-auth";
import { loadSubmissionDoc } from "@/lib/export/submission-doc";
import { MissingThaiFontError, buildSubmissionPdf } from "@/lib/export/pdf";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser();
  if (guard instanceof Response) return guard;

  const { id } = await params;
  // Null covers both "no such submission" and "not yours" — a rep must not be
  // able to probe for other reps' submission ids by the status code.
  const doc = await loadSubmissionDoc(id, guard);
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 });

  let buffer: Buffer;
  try {
    buffer = await buildSubmissionPdf(doc);
  } catch (cause) {
    if (cause instanceof MissingThaiFontError) {
      console.error(cause.message);
      return Response.json(
        { error: "PDF export is unavailable: the Thai font is not installed. Use Excel export instead." },
        { status: 503 },
      );
    }
    throw cause;
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${doc.fileStem}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
