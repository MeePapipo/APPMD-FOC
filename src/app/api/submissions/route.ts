import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { computeForTests } from "@/lib/calc/service";
import { createSubmissionSchema } from "@/lib/calc/schema";
import { applyAdjustment, needsComment } from "@/lib/calc/adjust";
import type { SysCode } from "@/lib/calc/types";

const SYS_ENUM: Record<SysCode, "S6800" | "S5800" | "S4800"> = {
  "6800": "S6800",
  "5800": "S5800",
  "4800": "S4800",
};

export async function POST(request: Request) {
  const guard = await requireApiUser();
  if (guard instanceof Response) return guard;
  const user = guard;

  const parsed = createSubmissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }
  const { accountId, testsBySys, optionalTicked, adjustments = {}, additionalFoc = {} } = parsed.data;

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });

  const hasAnyTests = Object.values(testsBySys).some(
    (v) => v && Object.values(v).some((n) => n > 0),
  );
  if (!hasAnyTests) return Response.json({ error: "No test volumes entered" }, { status: 400 });

  let computed;
  try {
    computed = await computeForTests(testsBySys, { optionalTicked });
  } catch (cause) {
    console.error("submission compute failed", cause);
    return Response.json({ error: "Calculation failed. Please try again." }, { status: 500 });
  }
  const { result, items } = computed;

  // Quantities are always recomputed server-side; the client may only supply
  // the two human inputs (stock on hand and the manual adjustment), which are
  // applied here with the same helper the preview uses.
  const lines = items
    .map((item, index) => ({ item, row: result.rows[index] }))
    .filter(({ row }) => row.qty > 0)
    .map(({ item, row }) => {
      const included = !item.optional || optionalTicked?.[item.materialNo] === true;
      const adjusted = applyAdjustment(row.qty, item.price, adjustments[item.materialNo]);
      return {
        materialNo: item.materialNo,
        description: item.description,
        category: item.category,
        unitText: item.unitText,
        source: "CALCULATED" as const,
        driver: item.driver,
        systems: row.systems.map((system) => SYS_ENUM[system]),
        calculatedQty: adjusted.calculatedQty,
        stockOnHand: adjusted.stockOnHand,
        afterStockQty: adjusted.afterStockQty,
        adjustedQty: adjusted.adjustedQty,
        adjustComment: adjustments[item.materialNo]?.comment?.trim() || null,
        finalQty: adjusted.finalQty,
        unitPrice: item.price,
        // Unticked optional items stay on the record at zero value, matching
        // how the engine prices them, so the line history is complete.
        lineValue: included ? adjusted.lineValue : 0,
        onDemand: item.onDemand,
        optional: item.optional,
        included,
      };
    });

  // Overriding a driver-mandated quantity needs a written reason. Optional
  // give-aways are exempt — choosing how many to hand over is the rep's call.
  // This lives here, not in the zod schema, because only the engine knows
  // which materialNo is optional.
  const unexplained = items
    .filter((item) => needsComment(adjustments[item.materialNo], item.optional))
    .map((item) => item.materialNo);
  if (unexplained.length > 0) {
    return Response.json(
      { error: `A comment is required for the adjusted quantity on: ${unexplained.join(", ")}` },
      { status: 400 },
    );
  }

  // Free-choice give-aways: quantity comes from the rep, everything else from
  // the catalogue. An inactive or unknown materialNo is rejected outright
  // rather than saved at an unknown price.
  const requestedMaterials = Object.keys(additionalFoc);
  const catalogue = requestedMaterials.length
    ? await prisma.additionalFocItem.findMany({
        where: { materialNo: { in: requestedMaterials }, active: true },
      })
    : [];
  if (catalogue.length !== requestedMaterials.length) {
    const known = new Set(catalogue.map((item) => item.materialNo));
    const unknown = requestedMaterials.filter((m) => !known.has(m));
    return Response.json(
      { error: `Unknown additional FOC item(s): ${unknown.join(", ")}` },
      { status: 400 },
    );
  }

  const manualLines = catalogue.map((item) => {
    const qty = additionalFoc[item.materialNo];
    return {
      materialNo: item.materialNo,
      description: item.description,
      category: "Additional FOC",
      unitText: item.unitText,
      source: "MANUAL" as const,
      driver: null,
      systems: [],
      calculatedQty: qty,
      stockOnHand: null,
      afterStockQty: qty,
      adjustedQty: 0,
      adjustComment: null,
      finalQty: qty,
      unitPrice: item.price,
      lineValue: qty * (item.price ?? 0),
      onDemand: false,
      optional: false,
      included: true,
    };
  });

  const allLines = [...lines, ...manualLines];

  // The headline FOC figure has to be the post-stock, post-adjustment total
  // plus whatever the rep threw in by hand — result.focValue is the raw driver
  // output and would contradict the summary document the rep just approved.
  const focValue = allLines.reduce((sum, line) => sum + (line.included ? line.lineValue : 0), 0);
  const revenue = result.revenue;

  const submission = await prisma.submission.create({
    data: {
      accountId: account.id,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      createdById: user.id,
      createdByEmail: user.email ?? "",
      year: new Date().getFullYear(),
      revenue,
      focValue,
      focPct: revenue ? focValue / revenue : 0,
      assayInputs: {
        create: (Object.entries(testsBySys) as [SysCode, Record<string, number> | undefined][]).flatMap(
          ([sys, tests]) =>
            Object.entries(tests ?? {})
              .filter(([, n]) => n > 0)
              .map(([code, n]) => ({ system: SYS_ENUM[sys], assayCode: code, tests: n })),
        ),
      },
      reagents: {
        create: result.reagents.map((reagent) => ({
          assayCode: reagent.code,
          description: reagent.description,
          materialNo: reagent.materialNo,
          dkshCode: reagent.dkshCode,
          systems: reagent.systems.map((system) => SYS_ENUM[system]),
          tests: reagent.tests,
          packSize: reagent.packSize,
          qty: reagent.qty,
          unitPrice: reagent.unitPrice,
          lineValue: reagent.value,
        })),
      },
      lines: { create: allLines },
    },
  });

  return Response.json({ id: submission.id });
}
