import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { summariseOverGive } from "@/lib/calc/adjust";
import { Card, Badge } from "@/components/ui";

/** One screenful plus headroom; "Show more" widens the window from the URL. */
const PAGE_SIZE = 50;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const user = await requireUser();
  const { show } = await searchParams;
  const requested = Number(show);
  const take = Number.isSafeInteger(requested)
    ? Math.min(Math.max(requested, PAGE_SIZE), 1000)
    : PAGE_SIZE;

  const where = user.role === "ADMIN" ? {} : { createdByEmail: user.email ?? "__none__" };
  // The over-give flag is derived (finalQty vs afterStockQty), not a stored
  // column, so the rows have to come along. Three floats per line on a page
  // capped at 1000 submissions — cheap enough to avoid denormalising.
  const [submissions, total] = await Promise.all([
    prisma.submission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      include: {
        lines: {
          where: { included: true, source: { not: "MANUAL" } },
          select: { finalQty: true, afterStockQty: true, calculatedQty: true },
        },
      },
    }),
    prisma.submission.count({ where }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold text-ink">
        {user.role === "ADMIN" ? "All submissions" : "Your submissions"}
      </h1>
      <p className="mb-6 text-sm text-muted">
        Every submitted order — this is the record that proves the calculator is being used.
      </p>

      <Card className="divide-y divide-line">
        {submissions.length === 0 && (
          <p className="p-6 text-center text-sm text-muted">No submissions yet.</p>
        )}
        {submissions.map((s) => {
          const overGive = summariseOverGive(
            // afterStockQty predates nothing in practice, but it is nullable in
            // the schema; fall back the same way the document loader does.
            s.lines.map((l) => ({
              finalQty: l.finalQty,
              afterStockQty: l.afterStockQty ?? l.calculatedQty,
            })),
            () => 0,
          );
          return (
            <Link
              key={s.id}
              href={`/history/${s.id}`}
              className="flex flex-col gap-2 p-4 text-sm transition-colors duration-150 hover:bg-canvas sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-ink">{s.accountName}</div>
                {/* Wraps on a phone rather than truncating: the rep's email is
                    the longest part and the date after it is what admins scan. */}
                <div className="text-xs text-muted">
                  {s.accountNumber} · {s.createdByEmail} · {s.createdAt.toLocaleDateString()}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-col sm:items-end sm:gap-1 sm:text-right">
                <div className="text-ink">{Number(s.focValue).toLocaleString()} THB FOC</div>
                <div className="flex items-center gap-1">
                  {overGive.lineCount > 0 && (
                    <Badge tone="warning">Extra Bonus: {overGive.lineCount}</Badge>
                  )}
                  <Badge tone={s.status === "VOID" ? "negative" : "positive"}>{s.status}</Badge>
                </div>
              </div>
            </Link>
          );
        })}
      </Card>

      {submissions.length < total && (
        <div className="mt-4 text-center text-sm">
          <p className="mb-2 text-muted">Showing {submissions.length} of {total}</p>
          <Link
            href={`/history?show=${take + PAGE_SIZE}`}
            className="font-medium text-brand hover:underline"
          >
            Show more
          </Link>
        </div>
      )}
    </div>
  );
}
