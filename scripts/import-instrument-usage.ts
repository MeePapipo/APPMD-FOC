/**
 * Loads eLP instrument usage (runs/samples per instrument x assay x month) and
 * the serial -> account map into Instrument / InstrumentUsageMonth, which drive
 * per-account TPB (src/lib/calc/accountTpb.ts).
 *
 * Inputs (both produced from the SamplesPerRun exports, see the "Read me" sheet
 * of the map workbook):
 *   - the usage CSV    (month, serial, system_class, ..., account_no, assay, runs, samples)
 *   - the map workbook (sheet "Instrument map"; the yellow OVERRIDE columns win
 *                       over the auto-matched account)
 *
 * Safe to rerun: instruments are upserted by (serial, system class); for every
 * month present in the CSV that month's usage is replaced, other months stay.
 * An instrument whose account cannot be resolved is stored unlinked and listed.
 *
 * Run:
 *   DATABASE_URL=<db> npm run import-instrument-usage -- [usage.csv] [map.xlsx]
 * Against Neon from the Roche network use the WebSocket driver automatically
 * (host ends .neon.tech) and set NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL.");
neonConfig.webSocketConstructor = ws;
const prisma = new PrismaClient({
  adapter: new URL(url).hostname.endsWith(".neon.tech")
    ? new PrismaNeon({ connectionString: url })
    : new PrismaPg({ connectionString: url }),
});

const HOME = process.env.HOME ?? "/home/praditww";
const CSV_PATH = process.argv[2] ?? join(HOME, "elp/data/tpb_by_serial_assay_2026-06_09.csv");
const MAP_PATH =
  process.argv[3] ?? "/mnt/c/Users/praditww/Desktop/Claude Project/foc-calculator/Serial_Account_Map_2026-06_09.xlsx";

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\n") { cur.push(field.replace(/\r$/, "")); rows.push(cur); cur = []; field = ""; }
    else field += c;
  }
  if (field || cur.length) { cur.push(field); rows.push(cur); }
  const [header, ...body] = rows.filter((r) => r.length > 1);
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const cellText = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return String((v as { result?: unknown; text?: unknown }).result ?? (v as { text?: unknown }).text ?? "").trim();
  return String(v).trim();
};

async function main() {
  const usage = parseCsv(readFileSync(CSV_PATH, "utf8").replace(/^﻿/, ""));

  // Overrides from the workbook, keyed "serial|class".
  const override = new Map<string, { no: string; name: string }>();
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(MAP_PATH);
    const sheet = wb.getWorksheet("Instrument map");
    sheet?.eachRow((row, n) => {
      if (n === 1) return;
      const no = cellText(row.getCell(10).value), name = cellText(row.getCell(11).value);
      if (no || name) override.set(`${cellText(row.getCell(1).value)}|${cellText(row.getCell(2).value)}`, { no, name });
    });
  } catch {
    console.warn(`No map workbook at ${MAP_PATH}; using the auto-matched accounts only.`);
  }

  const accounts = await prisma.account.findMany({ select: { id: true, accountNumber: true, accountName: true } });
  const byNumber = new Map(accounts.map((a) => [a.accountNumber, a.id]));
  const byName = new Map(accounts.map((a) => [a.accountName.trim().toUpperCase(), a.id]));
  // eLP and the app spell the same lab slightly differently (HOSP. / HOSPITAL, CO.,LTD).
  const norm = (s: string) =>
    s.toUpperCase().replace(/\bHOSP\b\.?/g, "HOSPITAL").replace(/[^A-Z0-9]+/g, " ")
      .replace(/\b(CO|LTD|LIMITED|THE|OF|AND|PUBLIC|COMPANY)\b/g, "").replace(/\s+/g, " ").trim();
  const byNormName = new Map(accounts.map((a) => [norm(a.accountName), a.id]));

  // One record per instrument; the auto account comes from the CSV.
  const instruments = new Map<string, { serial: string; systemClass: string; lab: string; autoNo: string }>();
  for (const r of usage) {
    const k = `${r.serial}|${r.system_class}`;
    const cur = instruments.get(k) ?? { serial: r.serial, systemClass: r.system_class, lab: "", autoNo: "" };
    if (r.laboratory_eLP) cur.lab = r.laboratory_eLP;
    if (r.account_no) cur.autoNo = r.account_no;
    instruments.set(k, cur);
  }

  const idByKey = new Map<string, string>();
  const unlinked: string[] = [];
  for (const [k, i] of instruments) {
    const o = override.get(k);
    const accountId =
      (o?.no && byNumber.get(o.no)) || (o?.name && byName.get(o.name.toUpperCase())) || (i.autoNo && byNumber.get(i.autoNo)) || (i.lab && byNormName.get(norm(i.lab))) || null;
    if (!accountId) unlinked.push(`${i.serial} ${i.systemClass} ${i.lab}`);
    const row = await prisma.instrument.upsert({
      where: { serial_systemClass: { serial: i.serial, systemClass: i.systemClass } },
      create: { serial: i.serial, systemClass: i.systemClass, labName: i.lab || null, accountId },
      update: { labName: i.lab || null, accountId },
    });
    idByKey.set(k, row.id);
  }

  const months = [...new Set(usage.map((r) => r.month))].sort();
  for (const month of months) {
    await prisma.instrumentUsageMonth.deleteMany({ where: { month, instrumentId: { in: [...idByKey.values()] } } });
    const data = usage
      .filter((r) => r.month === month)
      .map((r) => ({
        instrumentId: idByKey.get(`${r.serial}|${r.system_class}`)!,
        month,
        assayCode: r.assay,
        runs: Number(r.runs),
        samples: Number(r.samples),
      }));
    for (let i = 0; i < data.length; i += 500) await prisma.instrumentUsageMonth.createMany({ data: data.slice(i, i + 500) });
    console.log(`${month}: ${data.length} instrument x assay rows`);
  }
  console.log(`Instruments: ${instruments.size} (${override.size} with an override), unlinked: ${unlinked.length}`);
  if (unlinked.length) console.log("Unlinked:\n  " + unlinked.join("\n  "));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
