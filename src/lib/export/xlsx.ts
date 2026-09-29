/**
 * Builds the "ใบสรุป FOC" workbook — a values-only record of one submitted
 * order, laid out like sheet 2 of the v1 workbook (~/foc-excel/build.mjs:734).
 *
 * Deliberately formula-free, unlike v1: there the sheet had to double as the
 * calculator, so stock and adjustments were live inputs. Here those are already
 * captured in the app, and this file is the record of what was actually
 * ordered — a recipient editing a cell must not silently change the totals.
 */
import ExcelJS from "exceljs";
import {
  ADDITIONAL_FOC_HEADERS,
  FOC_ITEM_HEADERS,
  REAGENT_HEADERS,
  formatThaiDate,
  type SubmissionDoc,
} from "./submission-doc";

const BRAND = "FF0B41CD";
const INK = "FF121212";
const MUTED = "FF706B69";
const LINE = "FFDDD9D5";
const NET_TINT = "FFD1FADF"; // same highlight v1 puts on the net-quantity column
// Amber pair mirroring the app's --warning-tint / --warning, restated here for
// the same reason pdf.tsx restates it: this file cannot read the CSS tokens.
const WARN_TINT = "FFFDF3E6";
const WARN_INK = "FF9B5400";
const MONEY = "#,##0";

const BASE: Partial<ExcelJS.Font> = { name: "Sarabun", size: 10, color: { argb: INK } };
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: LINE } },
  left: { style: "thin", color: { argb: LINE } },
  bottom: { style: "thin", color: { argb: LINE } },
  right: { style: "thin", color: { argb: LINE } },
};

export async function buildSubmissionWorkbook(doc: SubmissionDoc): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FOC Calculator";
  wb.created = doc.createdAt;

  const ws = wb.addWorksheet("ใบสรุป FOC", {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });
  // Column widths carried over from v1 so a printed page breaks the same way.
  ws.columns = [
    { width: 3 }, { width: 18 }, { width: 54 }, { width: 15 }, { width: 13 },
    { width: 24 }, { width: 21 }, { width: 16 }, { width: 20 }, { width: 16 },
    { width: 17 }, { width: 12 }, { width: 13 }, { width: 17 }, { width: 30 },
  ];

  ws.mergeCells("A1:I1");
  ws.getRow(1).height = 34;
  const title = ws.getCell("A1");
  title.value = "  ใบสรุปของแถม (FOC Summary)";
  title.font = { ...BASE, size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  title.alignment = { vertical: "middle" };

  const info: [string, string][] = [
    ["Account", `${doc.accountNumber} — ${doc.accountName}`],
    ["ผู้แทนขาย", doc.repEmail],
    ["วันที่", formatThaiDate(doc.createdAt)],
    ["System", doc.systemsLabel],
  ];
  info.forEach(([label, value], index) => {
    const r = 3 + index;
    const labelCell = ws.getCell(`B${r}`);
    labelCell.value = label;
    labelCell.font = { ...BASE, color: { argb: MUTED } };
    ws.mergeCells(`C${r}:I${r}`);
    const valueCell = ws.getCell(`C${r}`);
    valueCell.value = value;
    valueCell.font = { ...BASE, bold: true };
  });

  if (doc.status === "VOID") {
    const voided = ws.getCell("B8");
    voided.value = "ใบนี้ถูกยกเลิก (VOID)";
    voided.font = { ...BASE, bold: true, color: { argb: "FFA30014" } };
  }

  let row = 9;
  // Above the tables, like the PDF: the tinted cells are 12 columns in, which
  // is past where an approver scrolls before deciding.
  if (doc.overGive.lineCount > 0) {
    ws.mergeCells(`B${row}:I${row}`);
    const banner = ws.getCell(`B${row}`);
    banner.value =
      `Extra Bonus: ${doc.overGive.lineCount} รายการ · +${doc.overGive.packs} หน่วย · ` +
      `${doc.overGive.value.toLocaleString()} THB — ` +
      `ปริมาณที่ไฮไลต์สีเหลืองสูงกว่าที่สูตรคำนวณหลังหักสินค้าคงเหลือ โปรดพิจารณาความจำเป็นก่อนอนุมัติ`;
    banner.font = { ...BASE, bold: true, color: { argb: WARN_INK } };
    banner.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WARN_TINT } };
    row += 2;
  }
  row = section(ws, row, " น้ำยาหลักที่สั่ง (Main Reagent)", 15);
  row = header(ws, row, 3, [...REAGENT_HEADERS]);
  for (const reagent of doc.reagents) {
    writeRow(ws, row, 3, [
      reagent.description,
      reagent.materialNo,
      reagent.dkshCode ?? "—",
      reagent.tests,
      reagent.qty,
      reagent.value,
    ], { moneyFrom: 6 });
    row += 1;
  }
  if (doc.reagents.length === 0) {
    ws.getCell(row, 3).value = "— ไม่มีน้ำยาหลักในใบนี้ —";
    ws.getCell(row, 3).font = { ...BASE, italic: true, color: { argb: MUTED } };
    row += 1;
  }
  row = total(ws, row + 1, "รวมมูลค่าน้ำยา", doc.reagentTotal);

  row = section(ws, row + 2, " ของแถม (FOC Items)", 15);
  row = header(ws, row, 2, [...FOC_ITEM_HEADERS]);
  for (const item of doc.focItems) {
    writeRow(ws, row, 2, [
      item.group,
      item.description,
      item.materialNo,
      item.dkshCode ?? "—",
      item.packText ?? "—",
      item.calculatedQty,
      item.stockOnHand ?? "—",
      item.afterStockQty,
      item.unitPrice ?? "—",
      item.grossValue,
      item.adjustedQty === 0 ? "—" : item.adjustedQty,
      item.finalQty,
      item.finalValue,
      item.adjustComment ?? "",
    ], { moneyFrom: 7, moneyTo: 15 });
    const overGiven = item.overGiveQty > 0;
    const net = ws.getCell(row, 13); // จำนวนสุทธิ — the quantity actually shipped
    net.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: overGiven ? WARN_TINT : NET_TINT },
    };
    net.font = { ...BASE, bold: true, ...(overGiven ? { color: { argb: WARN_INK } } : {}) };
    if (overGiven) {
      // Column 12 is ปรับ (+/-): tinting it too makes the pair read as one flag
      // rather than a lone coloured number that could pass for the usual green.
      const adjusted = ws.getCell(row, 12);
      adjusted.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WARN_TINT } };
      adjusted.font = { ...BASE, bold: true, color: { argb: WARN_INK } };
    }
    row += 1;
  }
  if (doc.focItems.length === 0) {
    ws.getCell(row, 2).value = "— ไม่มีของแถมในใบนี้ —";
    ws.getCell(row, 2).font = { ...BASE, italic: true, color: { argb: MUTED } };
    row += 1;
  }

  if (doc.additionalFocItems.length > 0) {
    row = section(ws, row + 1, " ของแถมเพิ่มเติมที่ผู้แทนเลือกเอง (Third party FOC)", 15);
    row = header(ws, row, 3, [...ADDITIONAL_FOC_HEADERS]);
    for (const item of doc.additionalFocItems) {
      writeRow(ws, row, 3, [
        item.description,
        item.materialNo,
        item.dkshCode ?? "—",
        item.packText ?? "—",
        item.qty,
        item.unitPrice ?? "—",
        item.value,
      ], { moneyFrom: 7 });
      row += 1;
    }
    row = total(ws, row + 1, "รวมของแถมเพิ่มเติม", doc.additionalFocTotal);
  }

  row = total(ws, row + 1, "รวมมูลค่า FOC", doc.focTotal);
  const pctLabel = ws.getCell(`G${row}`);
  pctLabel.value = "คิดเป็น % ของยอดขาย";
  pctLabel.font = { ...BASE, bold: true };
  const pct = ws.getCell(`H${row}`);
  pct.value = doc.focPct;
  pct.numFmt = "0.00%";
  pct.font = { ...BASE, bold: true, size: 12 };
  row += 1;

  ws.pageSetup.printArea = `A1:O${row + 2}`;

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function section(ws: ExcelJS.Worksheet, row: number, label: string, width: number): number {
  ws.mergeCells(row, 1, row, width);
  const cell = ws.getCell(row, 1);
  cell.value = label;
  cell.font = { ...BASE, bold: true, color: { argb: BRAND } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F9FF" } };
  ws.getRow(row).height = 22;
  return row + 1;
}

function header(ws: ExcelJS.Worksheet, row: number, firstCol: number, labels: string[]): number {
  labels.forEach((label, index) => {
    const cell = ws.getCell(row, firstCol + index);
    cell.value = label;
    cell.font = { ...BASE, bold: true, color: { argb: MUTED } };
    cell.alignment = { wrapText: true, vertical: "bottom" };
    cell.border = BORDER;
  });
  ws.getRow(row).height = 30;
  return row + 1;
}

function writeRow(
  ws: ExcelJS.Worksheet,
  row: number,
  firstCol: number,
  values: (string | number)[],
  { moneyFrom, moneyTo }: { moneyFrom: number; moneyTo?: number },
): void {
  values.forEach((value, index) => {
    const col = firstCol + index;
    const cell = ws.getCell(row, col);
    cell.value = value;
    cell.font = BASE;
    cell.border = BORDER;
    cell.alignment = { vertical: "top", wrapText: typeof value === "string" && value.length > 40 };
    if (typeof value === "number" && col >= moneyFrom && col <= (moneyTo ?? Infinity)) {
      cell.numFmt = MONEY;
    }
  });
}

function total(ws: ExcelJS.Worksheet, row: number, label: string, value: number): number {
  const labelCell = ws.getCell(`G${row}`);
  labelCell.value = label;
  labelCell.font = { ...BASE, bold: true };
  const valueCell = ws.getCell(`H${row}`);
  valueCell.value = value;
  valueCell.numFmt = MONEY;
  valueCell.font = { ...BASE, bold: true, size: 12 };
  return row + 1;
}
