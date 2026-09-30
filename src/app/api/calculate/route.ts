import { getSessionUser } from "@/lib/session";
import { computeForTests } from "@/lib/calc/service";
import { calculateSchema } from "@/lib/calc/schema";
import { prisma } from "@/lib/prisma";
import { loadAllowance } from "@/lib/dashboard/allowance";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = calculateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }

  // A data-integrity problem in MasterAssay/MasterItem throws inside the
  // engine. Without this the client gets Next's HTML error page while it is
  // parsing the body as JSON looking for `.error`, turning one failure into two.
  let computed;
  try {
    computed = await computeForTests(
      parsed.data.testsBySys,
      { optionalTicked: parsed.data.optionalTicked },
      parsed.data.accountId,
    );
  } catch (cause) {
    console.error("calculate failed", cause);
    return Response.json({ error: "Calculation failed. Please try again." }, { status: 500 });
  }
  const { result, items, assays, tpbInput, tpbNotices } = computed;

  // Remaining give-away allowance for the chosen account. A failure here must not
  // take the calculation down with it: the order is still quotable without it.
  let allowance = null;
  if (parsed.data.accountId) {
    try {
      const account = await prisma.account.findUnique({ where: { id: parsed.data.accountId }, select: { accountNumber: true } });
      if (account) {
        allowance = await loadAllowance({
          accountNumber: account.accountNumber,
          reagents: result.reagents.map((r) => ({ materialNo: r.materialNo, description: r.description, qty: r.qty })),
          assays,
          items,
          tpbInput,
        });
      }
    } catch (cause) {
      console.error("allowance failed", cause);
    }
  }

  const lines = items
    .map((item, index) => ({ item, row: result.rows[index] }))
    .filter(({ row }) => row.qty > 0 || row.value > 0)
    .map(({ item, row }) => ({
      materialNo: item.materialNo,
      dkshCode: item.dkshCode ?? null,
      description: item.description,
      category: item.category,
      usageType: item.usageType,
      unitText: item.unitText,
      system: item.system,
      onDemand: item.onDemand,
      optional: item.optional,
      qty: row.qty,
      unitPrice: item.price,
      value: row.value,
    }));

  return Response.json({
    reagents: result.reagents,
    lines,
    revenue: result.revenue,
    focValue: result.focValue,
    focPct: result.focPct,
    tpbNotices,
    allowance,
  });
}
