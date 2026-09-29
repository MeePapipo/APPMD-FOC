/** Prints a generated summary workbook as text, for eyeballing the layout. */
import ExcelJS from "exceljs";

const file = process.argv[2];
if (!file) throw new Error("usage: tsx scripts/dump-xlsx.mts <file.xlsx>");

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const ws = wb.worksheets[0];
console.log(`sheet ${JSON.stringify(ws.name)} · printArea ${ws.pageSetup.printArea}`);
ws.eachRow({ includeEmpty: false }, (row, n) => {
  const cells = (row.values as unknown[]).slice(1).map((v) => (v == null ? "" : String(v)));
  const line = cells
    .map((c) => (c.length > 24 ? `${c.slice(0, 24)}…` : c))
    .filter((c) => c !== "")
    .join(" | ");
  if (line) console.log(String(n).padStart(3), line);
});
