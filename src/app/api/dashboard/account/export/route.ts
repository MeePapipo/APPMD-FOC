import { requireApiUser } from "@/lib/api-auth";
import { loadAccountDetail } from "@/lib/dashboard/accountDetailLoader";
import { buildAccountMatrix, type Measure } from "@/lib/dashboard/focAccountMatrix";
import { accountMatrixCsv } from "@/lib/dashboard/focExports";
import { MissingThaiFontError } from "@/lib/export/pdf";
import { buildAccountMatrixPdf } from "@/lib/export/accountMatrixPdf";

/** One account's product x month matrix as CSV or PDF: ?name=&year=&format=csv|pdf&measure=qty|cost. */
export async function GET(request: Request) {
  const guard = await requireApiUser();
  if (guard instanceof Response) return guard;

  const params = new URL(request.url).searchParams;
  const name = params.get("name");
  if (!name) return Response.json({ error: "Missing account name" }, { status: 400 });
  const format = params.get("format") ?? "csv";
  if (format !== "csv" && format !== "pdf") return Response.json({ error: "format must be csv or pdf" }, { status: 400 });
  const measure: Measure = params.get("measure") === "cost" ? "cost" : "qty";

  const detail = await loadAccountDetail(name);
  if (!detail) return Response.json({ error: "Account not found" }, { status: 404 });

  const askedYear = Number(params.get("year"));
  const year = Number.isInteger(askedYear) && askedYear > 0 ? askedYear : Math.max(...detail.rows.map((r) => r.year));
  const matrix = buildAccountMatrix(detail.rows, year);
  const account = { name, number: detail.accountNumber, team: detail.team, rep: detail.rep };
  // ASCII only: the account name can be Thai, which a header cannot carry.
  const fileStem = `FOC-${(detail.accountNumber ?? "account").replace(/[^A-Za-z0-9_-]/g, "")}-${year}-${measure}`;
  const headers = { "Cache-Control": "private, no-store" };

  if (format === "csv") {
    return new Response(accountMatrixCsv(account, matrix, detail.entitlement.rows, measure), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${fileStem}.csv"` },
    });
  }

  let buffer: Buffer;
  try {
    buffer = await buildAccountMatrixPdf({ ...account, matrix, entitlement: detail.entitlement.rows, measure });
  } catch (cause) {
    if (cause instanceof MissingThaiFontError) {
      console.error(cause.message);
      return Response.json({ error: "PDF export is unavailable: the Thai font is not installed. Use the CSV export instead." }, { status: 503 });
    }
    throw cause;
  }
  return new Response(new Uint8Array(buffer), {
    headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileStem}.pdf"` },
  });
}
