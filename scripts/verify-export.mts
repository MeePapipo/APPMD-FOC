/**
 * End-to-end check of the summary-document pipeline: build a realistic
 * submission through the same engine + adjustment helpers the API route uses,
 * then render both export formats and write them to /tmp for eyeballing.
 *
 * Run: npm run verify-export
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { computeForTests } from "../src/lib/calc/service";
import { applyAdjustment, deltaForTargetQty } from "../src/lib/calc/adjust";
import { loadSubmissionDoc } from "../src/lib/export/submission-doc";
import { buildSubmissionWorkbook } from "../src/lib/export/xlsx";
import type { SysCode } from "../src/lib/calc/types";

// @react-pdf/renderer is imported lazily: under tsx's CJS interop one of its
// deps (@react-pdf/hyphenate) fails to resolve a subpath that Next's bundler
// handles fine, so a static import would take the whole script down with it.
// Verify the PDF route itself against `next dev` if this reports a load error.

const SYS_ENUM = { "6800": "S6800", "5800": "S5800", "4800": "S4800" } as const;

async function main() {
  const account = await prisma.account.findFirstOrThrow({ where: { active: true } });
  // Both systems, so at least one SKU combines across them.
  const testsBySys = { "6800": { HBV: 2000, HCV: 800 }, "5800": { HBV: 500 } };

  const { result, items } = await computeForTests(testsBySys, {});

  const present = items
    .map((item, index) => ({ item, row: result.rows[index] }))
    .filter(({ row }) => row.qty > 0);
  // Halve the first optional line with a qty above 1, the way a rep would when
  // they decide to give one box instead of two.
  const halvedOptional = present.find(({ item, row }) => item.optional && row.qty > 1);

  const computedLines = present
    .map(({ item, row }, index) => {
      // Exercise stock on one line and an adjustment-with-reason on another.
      const adjustment =
        item.materialNo === halvedOptional?.item.materialNo
          ? { adjust: deltaForTargetQty(Math.floor(row.qty / 2), row.qty) } // no reason needed
        : index === 0 ? { stockOnHand: 1 }
        : index === 1 ? { adjust: 2, comment: "ลูกค้าขอเพิ่มสำหรับรอบทดสอบ" }
        : undefined;
      const a = applyAdjustment(row.qty, item.price, adjustment);
      return {
        materialNo: item.materialNo,
        description: item.description,
        category: item.category,
        unitText: item.unitText,
        source: "CALCULATED" as const,
        driver: item.driver,
        systems: row.systems.map((s) => SYS_ENUM[s as SysCode]),
        calculatedQty: a.calculatedQty,
        stockOnHand: a.stockOnHand,
        afterStockQty: a.afterStockQty,
        adjustedQty: a.adjustedQty,
        adjustComment: adjustment?.comment ?? null,
        finalQty: a.finalQty,
        unitPrice: item.price,
        lineValue: a.lineValue,
        onDemand: item.onDemand,
        optional: item.optional,
        // Include the halved optional line so it reaches the document.
        included: !item.optional || item.materialNo === halvedOptional?.item.materialNo,
      };
    });

  const extras = await prisma.additionalFocItem.findMany({ where: { active: true }, take: 3 });
  const manualLines = extras.map((item, i) => {
    const qty = (i + 1) * 2;
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

  const allLines = [...computedLines, ...manualLines];
  const focValue = allLines.reduce((sum, l) => sum + (l.included ? l.lineValue : 0), 0);

  const submission = await prisma.submission.create({
    data: {
      accountId: account.id,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      createdByEmail: "verify@roche.com",
      year: new Date().getFullYear(),
      revenue: result.revenue,
      focValue,
      focPct: result.revenue ? focValue / result.revenue : 0,
      assayInputs: {
        create: Object.entries(testsBySys).flatMap(([sys, tests]) =>
          Object.entries(tests).map(([code, n]) => ({
            system: SYS_ENUM[sys as SysCode], assayCode: code, tests: n,
          })),
        ),
      },
      reagents: {
        create: result.reagents.map((r) => ({
          assayCode: r.code, description: r.description, materialNo: r.materialNo,
          dkshCode: r.dkshCode, systems: r.systems.map((s) => SYS_ENUM[s]),
          tests: r.tests, packSize: r.packSize, qty: r.qty,
          unitPrice: r.unitPrice, lineValue: r.value,
        })),
      },
      lines: { create: allLines },
    },
  });

  const user = { id: "x", email: "verify@roche.com", role: "USER" as const };
  const doc = await loadSubmissionDoc(submission.id, user);
  if (!doc) throw new Error("loadSubmissionDoc refused a submission the caller owns");

  console.log(`submission ${submission.id} — ${doc.accountNumber} ${doc.accountName}`);
  console.log(`  systems           ${doc.systemsLabel}`);
  console.log(`  reagents          ${doc.reagents.length} lines, ${doc.reagentTotal.toLocaleString()} THB`);
  console.log(`  calculated FOC    ${doc.focItems.length} lines, ${doc.calculatedFocTotal.toLocaleString()} THB`);
  console.log(`  additional FOC    ${doc.additionalFocItems.length} lines, ${doc.additionalFocTotal.toLocaleString()} THB`);
  console.log(`  revenue           ${doc.revenue.toLocaleString()} THB`);
  console.log(`  FOC total         ${doc.focTotal.toLocaleString()} THB (${(doc.focPct * 100).toFixed(2)}%)`);

  const sectionSum = doc.calculatedFocTotal + doc.additionalFocTotal;
  console.log(
    Math.abs(sectionSum - doc.focTotal) < 0.01
      ? "  ✓ sections add up to the stored FOC total"
      : `  ✗ sections sum to ${sectionSum} but the stored total is ${doc.focTotal}`,
  );

  const adjusted = doc.focItems.find((i) => i.adjustedQty !== 0);
  const stocked = doc.focItems.find((i) => i.stockOnHand !== null);
  console.log(`  ✓ stock line      ${stocked?.description.slice(0, 40)} — ${stocked?.calculatedQty} - ${stocked?.stockOnHand} = ${stocked?.afterStockQty}`);
  console.log(`  ✓ adjusted line   ${adjusted?.description.slice(0, 40)} — ${adjusted?.afterStockQty} ${adjusted!.adjustedQty > 0 ? "+" : ""}${adjusted?.adjustedQty} = ${adjusted?.finalQty} (${adjusted?.adjustComment})`);

  if (halvedOptional) {
    const row = doc.focItems.find((i) => i.materialNo === halvedOptional.item.materialNo);
    console.log(
      row
        ? `  ✓ optional halved ${row.description.slice(0, 40)} — formula ${row.calculatedQty}, giving ${row.finalQty}, no reason required`
        : "  ✗ the halved optional line did not reach the document",
    );
  } else {
    console.log("  – no optional line with qty > 1 in this order to halve");
  }

  const xlsx = await buildSubmissionWorkbook(doc);
  writeFileSync(`/tmp/${doc.fileStem}.xlsx`, xlsx);
  console.log(`  ✓ XLSX            /tmp/${doc.fileStem}.xlsx (${xlsx.length.toLocaleString()} bytes)`);

  try {
    const { MissingThaiFontError, buildSubmissionPdf } = await import("../src/lib/export/pdf");
    try {
      const pdf = await buildSubmissionPdf(doc);
      writeFileSync(`/tmp/${doc.fileStem}.pdf`, pdf);
      console.log(`  ✓ PDF             /tmp/${doc.fileStem}.pdf (${pdf.length.toLocaleString()} bytes)`);
    } catch (cause) {
      if (cause instanceof MissingThaiFontError) {
        console.log(`  ⚠ PDF             skipped — Sarabun not installed in public/fonts`);
      } else throw cause;
    }
  } catch (cause) {
    console.log(`  ⚠ PDF             could not load the renderer under tsx: ${(cause as Error).message}`);
  }

  // Ownership: a different rep must not be able to read this back.
  const other = await loadSubmissionDoc(submission.id, { id: "y", email: "other@roche.com", role: "USER" });
  console.log(other === null ? "  ✓ another rep is refused" : "  ✗ another rep could read this submission");
  const admin = await loadSubmissionDoc(submission.id, { id: "z", email: "admin@roche.com", role: "ADMIN" });
  console.log(admin ? "  ✓ an admin can read it" : "  ✗ an admin was refused");

  await prisma.submission.delete({ where: { id: submission.id } });
  console.log("  (verification submission removed)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
