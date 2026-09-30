import { BE_OFFSET, THAI_MONTHS } from "@/lib/dashboard/focActualsImport";
import { englishLabName, instrumentKey } from "./instrumentMap";

/**
 * Parsers for the two eLP "SamplesPerRun" exports (UTF-16 LE, tab-delimited).
 * Client-safe on purpose: the usage export is ~60 MB for one month, so the
 * browser reads it and sends only the summarised rows (a few hundred) to the server.
 *
 * SamplesPerRunTable: one row per instrument x run start x test x kit lot, one
 * column per run id; a filled cell is that test's sample count in that run.
 * SamplesPerRunAVGTable: one row per instrument with its laboratory name.
 */

/** eLP test name -> the master-data assay family. Other names are reported, not guessed. */
export const ELP_TEST_TO_ASSAY: Record<string, string> = {
  "HPV-GT": "HPV", U_HPV_GT: "HPV",
  "HIV-1": "HIVQ",
  "HIV-1/2Qual-Serum/Plasma": "HIVQL",
  MPX: "MPX", "MPX-E": "MPX",
  HBV: "HBV", "HBV-RNA-RUO": "HBVRNA",
  HCV: "HCV", CMV: "CMV", HEV: "HEV", EBV: "EBV", BKV: "BKV",
  "CT/NG": "CTNG",
  MTB: "MTB", "MTB-RIF/INH": "RIFINH",
  "SCoV2-QL": "SARS",
};

export type UsageRow = { month: string; serial: string; systemClass: string; assay: string; runs: number; samples: number };

export type UsageParse = {
  rows: UsageRow[];
  months: string[]; // "2026-09", oldest first
  instruments: number;
  unknownTests: Record<string, number>; // eLP test names with no assay mapping -> cells seen
};

function decode(buf: Uint8Array): string {
  const utf16 = buf[0] === 0xff && buf[1] === 0xfe;
  return new TextDecoder(utf16 ? "utf-16le" : "utf-8").decode(buf).replace(/^﻿/, "");
}

/** "วันอังคาร, 01 กันยายน 2569" -> "2026-09". */
export function monthOfThaiDate(text: string): string | null {
  const m = text.match(/(\d{1,2})\s+(\S+)\s+(\d{4})/);
  if (!m || !(m[2] in THAI_MONTHS)) return null;
  const year = Number(m[3]) - BE_OFFSET;
  return `${year}-${String(THAI_MONTHS[m[2]]).padStart(2, "0")}`;
}

export function parseSamplesPerRun(buf: Uint8Array): UsageParse {
  // Line by line, never holding the whole grid: one month is ~5,500 rows x ~5,000 columns.
  const lines = decode(buf).split("\n");
  const header = lines[1]?.replace(/\r$/, "").split("\t") ?? [];
  if (header[0] !== "System Class" || header[1] !== "System Serial No" || header[4] !== "Test Name") {
    throw new Error("ไม่ใช่ไฟล์ SamplesPerRunTable จาก eLP (ไม่พบหัวคอลัมน์ System Class / System Serial No / Test Name)");
  }

  // A run can carry several tests (and a test several kit lots); a "run" for TPB is one (run, test) pair.
  const pairs = new Map<string, { month: string; serial: string; systemClass: string; assay: string; samples: number }>();
  const unknownTests: Record<string, number> = {};
  let lastDate = "";
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line === "\r") continue;
    const cells = line.replace(/\r$/, "").split("\t");
    if (cells[2]) lastDate = cells[2]; // merged date cells can come through blank
    const month = monthOfThaiDate(cells[2] || lastDate);
    const systemClass = cells[0], serial = cells[1], test = cells[4];
    if (!month || !serial || !systemClass || !test) continue;
    const assay = ELP_TEST_TO_ASSAY[test];
    for (let c = 7; c < cells.length; c++) {
      const v = cells[c];
      if (!v) continue;
      const samples = Number(v.replace(/,/g, ""));
      if (!Number.isFinite(samples)) continue;
      if (!assay) { unknownTests[test] = (unknownTests[test] ?? 0) + 1; continue; }
      const key = `${c}|${test}|${serial}|${systemClass}`;
      const cur = pairs.get(key) ?? { month, serial, systemClass, assay, samples: 0 };
      cur.samples += samples;
      pairs.set(key, cur);
    }
  }

  const agg = new Map<string, UsageRow>();
  for (const p of pairs.values()) {
    const key = `${p.month}|${instrumentKey(p.serial, p.systemClass)}|${p.assay}`;
    const cur = agg.get(key) ?? { month: p.month, serial: p.serial, systemClass: p.systemClass, assay: p.assay, runs: 0, samples: 0 };
    cur.runs += 1;
    cur.samples += p.samples;
    agg.set(key, cur);
  }
  const rows = [...agg.values()].sort((a, b) => a.month.localeCompare(b.month) || a.serial.localeCompare(b.serial) || a.assay.localeCompare(b.assay));
  return {
    rows,
    months: [...new Set(rows.map((r) => r.month))].sort(),
    instruments: new Set(rows.map((r) => instrumentKey(r.serial, r.systemClass))).size,
    unknownTests,
  };
}

/** SamplesPerRunAVGTable -> "serial|class" -> English laboratory name. */
export function parseLabTable(buf: Uint8Array): Record<string, string> {
  const lines = decode(buf).split("\n").filter((l) => l.trim());
  const header = lines[0]?.replace(/\r$/, "").split("\t") ?? [];
  const idx = { lab: header.indexOf("Laboratory"), cls: header.indexOf("System Class"), serial: header.indexOf("System Serial No") };
  if (idx.lab < 0 || idx.cls < 0 || idx.serial < 0) {
    throw new Error("ไม่ใช่ไฟล์ SamplesPerRunAVGTable จาก eLP (ไม่พบหัวคอลัมน์ Laboratory / System Class / System Serial No)");
  }
  const labs: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const cells = line.replace(/\r$/, "").split("\t");
    const name = englishLabName(cells[idx.lab] ?? "");
    if (name && cells[idx.serial] && cells[idx.cls]) labs[instrumentKey(cells[idx.serial], cells[idx.cls])] = name;
  }
  return labs;
}
