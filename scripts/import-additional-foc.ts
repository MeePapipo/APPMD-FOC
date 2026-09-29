/**
 * Loads the free-choice give-away catalogue (AdditionalFocItem) from
 * "Addtional FOC.xlsx" — the typo is in the customer's filename, not here.
 *
 * Unlike import-foc-excel.ts this parses the workbook directly: there is no
 * extract step in ~/foc-excel for this sheet, and it is a flat nine-row table
 * that the product team edits in Excel and re-sends.
 *
 * Items are upserted by materialNo and anything no longer in the sheet is
 * deactivated rather than deleted, so submissions that already reference it
 * keep rendering.
 *
 * Run: npm run import-additional-foc -- [path/to/Addtional FOC.xlsx]
 */
import "dotenv/config";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DEFAULT_PATH =
  "/mnt/c/Users/praditww/Desktop/Claude Project/foc-calculator/Addtional FOC.xlsx";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/** Header label -> field. Matched case-insensitively so minor edits survive. */
const COLUMNS = {
  "material number": "materialNo",
  "dksh code": "dkshCode",
  "product no.": "description",
  "pack size": "packSize",
  "price (thb)/หน่วย": "price",
} as const;

type Field = (typeof COLUMNS)[keyof typeof COLUMNS];

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "result" in value) return String(value.result ?? "");
  if (typeof value === "object" && "text" in value) return String(value.text ?? "");
  return String(value).trim();
}

function cellNumber(value: ExcelJS.CellValue): number | null {
  const text = cellText(value).replace(/,/g, "");
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const file = process.argv[2] ?? DEFAULT_PATH;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error(`No worksheet in ${file}`);

  // Locate columns by header text rather than position — the sheet is
  // hand-maintained and columns have moved before.
  const headerRow = ws.getRow(1);
  const fieldByCol = new Map<number, Field>();
  headerRow.eachCell((cell, col) => {
    const key = cellText(cell.value).toLowerCase();
    const field = COLUMNS[key as keyof typeof COLUMNS];
    if (field) fieldByCol.set(col, field);
  });

  const missing = Object.values(COLUMNS).filter((f) => ![...fieldByCol.values()].includes(f));
  if (missing.length) {
    throw new Error(`Missing column(s) in ${file}: ${missing.join(", ")}. Found: ${headerRow.values}`);
  }

  const seen: string[] = [];
  let sortOrder = 0;

  for (let rowNumber = 2; rowNumber <= ws.rowCount; rowNumber++) {
    const row = ws.getRow(rowNumber);
    const raw: Partial<Record<Field, ExcelJS.CellValue>> = {};
    for (const [col, field] of fieldByCol) raw[field] = row.getCell(col).value;

    const materialNo = cellText(raw.materialNo);
    const description = cellText(raw.description);
    if (!materialNo || !description) continue; // blank spacer row

    const packSize = cellNumber(raw.packSize) ?? 1;
    const data = {
      dkshCode: cellText(raw.dkshCode) || null,
      description,
      packSize,
      unitText: packSize > 1 ? `${packSize} per pack` : null,
      price: cellNumber(raw.price),
      active: true,
      sortOrder: sortOrder++,
    };

    await prisma.additionalFocItem.upsert({
      where: { materialNo },
      create: { materialNo, ...data },
      update: data,
    });
    seen.push(materialNo);
  }

  const { count: deactivated } = await prisma.additionalFocItem.updateMany({
    where: { materialNo: { notIn: seen }, active: true },
    data: { active: false },
  });

  console.log(`Additional FOC catalogue: ${seen.length} active, ${deactivated} deactivated`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
