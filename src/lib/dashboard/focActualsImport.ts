/**
 * Parses the Tableau "Data for FOC" crosstab export — the same file the
 * standalone FOC Data_Tableau dashboard uses. Its `foc-core.js`'s
 * `parseTableauCsv` is the reference this ports faithfully, including the
 * exact business rules below (team exclusions, category reclassification,
 * revenue-only-for-"Reagents, kits"); that file belongs to a different,
 * separately-maintained project and was only ever read for reference here,
 * never edited.
 *
 * The export is NOT a plain CSV despite the extension: UTF-16LE with a BOM,
 * tab-delimited, with 4 header rows before data starts (a blank/"Date" row,
 * measure names, Buddhist-calendar year, then the real column headers/Thai
 * month names), and a trailing grand-total row.
 */

const DIM = { TLEVEL3: 0, TLEVEL6: 1, SHIPNUM: 3, SHIPNAME: 4, STATE: 5, PL3: 6, PL6: 8, CATEGORY: 9, PRODUCT: 10 };
const N_DIM = 11;
const TOTAL_MEASURES = [
  "Quantity(Custom)",
  "Revenue(Custom)",
  "Selling Quantity",
  "Bonus Quantity",
  "FOC Quantity",
  "Bonus Cost",
  "CoGs(Custom)",
  "FOC Cost",
  "NumberOfTests(Custom)",
  "Total Cost",
  "Quota(Year)",
];
export const THAI_MONTHS: Record<string, number> = {
  มกราคม: 1,
  กุมภาพันธ์: 2,
  มีนาคม: 3,
  เมษายน: 4,
  พฤษภาคม: 5,
  มิถุนายน: 6,
  กรกฎาคม: 7,
  สิงหาคม: 8,
  กันยายน: 9,
  ตุลาคม: 10,
  พฤศจิกายน: 11,
  ธันวาคม: 12,
};
export const BE_OFFSET = 543;

const REVENUE_CATEGORY = "Reagents, kits";
const EXCLUDED_TEAMS = new Set(["TH - ThaiRedCross", "TH - TD", "TH - RCSC", "TH - FMI"]);

// Tableau leaves Product Category Text blank on real reagent/control rows;
// dropping them would understate revenue — classify by SKU name instead.
const BLANK_CATEGORY_EXCLUDE_PL6 = new Set(["458150 - MD Instruments", "458211 - MD Systems Support"]);
const HARDWARE_KEYWORDS = [
  "MOTOR", "CABLE", "MINI PC", "DATA MANAGER", "PCBA", "PCB ", "SENSOR", "PUMP", "BELT",
  "GRIPPER", "NEEDLE", "THERMAL CYCLER", "IPC ", "IPC(", "TROLLEY", "BARCODE READER", "USB HUB",
  "USB 3", "LAMP", "LUBRICANT", "SEAL ", "FRAME", "FLAP", "HEAD SAMPLE", "PLATE SUPPORT",
  "CONTROL UNIT", "KIT UPGRADE HW", "KIT MAINTENANCE", "FILTER DUST", "CONTAINER", "TWN3",
  "NFC USB", "LOCK DEVICE", "BLOCK THERMAL", "SOLID WASTE BOX",
];
const CONTROL_KEYWORDS = ["RMC", "CONTROLS", "NEG RMC", "BUFF NEG", "PPX"];
const AUXILLARY_KEYWORDS = ["WASH", "LYS ", "SPEC DIL", "MGP", "SAMPLE PREP", "CYT PREP", "UTIL CHAN"];
const CONSUMABLE_KEYWORDS = ["TUBE", "TIP", "PLATE", "PIPET", "TONER", "CRYOTUBE", "BROOM", "BAG"];
const KIT_TEST_COUNT_RE = /\bKIT\b.*\d+\s*T\b/;

function classifyBlankCategory(pl6: string, productName: string): string | null {
  if (BLANK_CATEGORY_EXCLUDE_PL6.has(pl6) || !productName) return null;
  const name = productName.toUpperCase();
  if (name.includes("SETLMT")) return null;
  if (HARDWARE_KEYWORDS.some((k) => name.includes(k))) return null;
  if (CONTROL_KEYWORDS.some((k) => name.includes(k))) return "Controls";
  if (KIT_TEST_COUNT_RE.test(name)) return "Reagents, kits";
  if (AUXILLARY_KEYWORDS.some((k) => name.includes(k))) return "Auxillaries";
  if (CONSUMABLE_KEYWORDS.some((k) => name.includes(k))) return "Consumables";
  return null;
}

/** Standing rule carried over from the reference tool: never abbreviate
 * HOSPITAL, including in join keys. */
const cleanName = (n: string) => n.replace(/\bHOSP\./gi, "HOSPITAL").trim();

// Uint8Array (a Buffer is one) and TextDecoder, not Buffer, so the same parser
// runs in the browser: the admin upload parses the ~30 MB export client-side.
function decodeExport(buf: Uint8Array): string {
  // Tableau's crosstab export is UTF-16 LE with a BOM; older ones are UTF-8.
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buf).replace(/^﻿/, "");
  }
  const text = new TextDecoder("utf-8").decode(buf).replace(/^﻿/, "");
  if (text.includes("ShipToAccountName")) return text;
  throw new Error("อ่านไฟล์ไม่ออก — ต้องเป็น crosstab export จาก Tableau (UTF-16, tab-delimited)");
}

/** One line into cells, honouring "quoted, cells" (Tableau quotes a cell only when it needs to). */
function splitLine(line: string, delim: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}

/**
 * The first `n` cells of a line that has no quotes, without splitting the other
 * ~280 cells: a file is tens of thousands of rows wide, and most rows belong to
 * product lines that are dropped right after these identifying cells are read.
 */
function leadingFields(line: string, n: number, delim: string): string[] {
  const out: string[] = [];
  let pos = 0;
  for (let k = 0; k < n; k++) {
    const next = line.indexOf(delim, pos);
    if (next === -1) {
      out.push(line.slice(pos));
      break;
    }
    out.push(line.slice(pos, next));
    pos = next + 1;
  }
  return out;
}

const toNum = (s: string | undefined): number => {
  if (!s) return 0;
  const n = Number(
    String(s)
      .trim()
      .replace(/^"|"$/g, "")
      .replace(/,/g, ""),
  );
  return Number.isFinite(n) ? n : 0;
};

const PRODUCT_CODE_RE = /^(\S+)\s+-\s+(.*)$/;
function splitProduct(raw: string): { code: string; name: string } {
  if (!raw) return { code: "", name: "(ไม่ระบุสินค้า)" };
  const m = PRODUCT_CODE_RE.exec(raw.trim());
  return m ? { code: m[1], name: m[2].trim() } : { code: "", name: raw.trim() };
}

export type FocActualRow = {
  year: number;
  month: number;
  team: string | null;
  rep: string | null;
  /** Item Group (Tableau "Product Category Text"); null on rows stored before it was kept. */
  category: string | null;
  accountName: string;
  materialNo: string;
  productName: string;
  revenue: number;
  revenueQty: number;
  soldQty: number;
  focCost: number;
  focQty: number;
  bonusCost: number;
  bonusQty: number;
  totalCost: number;
  tests: number;
};

export type ParseOptions = {
  /**
   * Keep only rows whose PL3 (product line, e.g. "MOLECULAR LAB") is in this
   * list. Undefined = keep every product line. The raw export covers the whole
   * company; MD's dashboard must not mix in Core Lab or NPC rows.
   */
  allowedProductLines?: string[];
};

export type ParseResult = {
  rows: FocActualRow[];
  meta: {
    /** Latest year in the file (kept for older callers); a file can carry several. */
    year: number | null;
    /** Distinct months in the file, across all years (kept for older callers). */
    months: number[];
    /** Every (year, month) the file carries — one pull is one month for two years. */
    periods: { year: number; month: number }[];
    excludedTeam: number;
    excludedCategory: number;
    excludedProductLine: number;
  };
};

export function parseFocActualsCsv(buf: Uint8Array, options: ParseOptions = {}): ParseResult {
  const allowedPl3 = options.allowedProductLines ? new Set(options.allowedProductLines.map((x) => x.trim().toUpperCase())) : null;
  const text = decodeExport(buf);
  const delim = text.slice(0, Math.max(text.indexOf("\n"), 0)).includes("\t") ? "\t" : ",";
  // Line by line, never holding the whole grid: a year of months for two years is ~170 MB.
  const lines = text.split("\n");
  while (lines.length > 0 && lines[lines.length - 1].replace(/\r$/, "") === "") lines.pop();
  if (lines.length < 5) throw new Error("ไฟล์สั้นผิดปกติ — ไม่เหมือน crosstab export ของ Tableau");
  const head = lines.slice(0, 4).map((l) => splitLine(l.replace(/\r$/, ""), delim));
  const measureRow = head[1];
  const yearRow = head[2];
  const labelRow = head[3];

  // A period is one (year, month). A single pull can carry the same month for
  // two years side by side (2568 and 2569 columns), so columns are indexed by
  // period — indexing by month alone let the later year overwrite the earlier.
  const totalIdx: Record<string, number> = {};
  const periodIdx: Record<string, Record<string, number>> = {};
  for (const m of TOTAL_MEASURES) periodIdx[m] = {};
  const periodKey = (year: number, month: number) => `${year}|${month}`;
  for (let i = N_DIM; i < measureRow.length; i++) {
    const measure = measureRow[i];
    if (!TOTAL_MEASURES.includes(measure)) continue;
    if (yearRow[i] === "รวม") {
      if (!(measure in totalIdx)) totalIdx[measure] = i;
    } else if (labelRow[i] in THAI_MONTHS) {
      const yearBE = parseInt(yearRow[i], 10);
      if (!Number.isFinite(yearBE)) continue;
      periodIdx[measure][periodKey(yearBE - BE_OFFSET, THAI_MONTHS[labelRow[i]])] = i;
    }
  }
  const missing = TOTAL_MEASURES.filter((m) => !(m in totalIdx));
  if (missing.length) throw new Error("CSV ขาดคอลัมน์รวมที่ต้องมี: " + missing.join(", "));

  const periods = Object.keys(periodIdx["Revenue(Custom)"])
    .map((k) => {
      const [year, month] = k.split("|").map(Number);
      return { year, month };
    })
    .sort((a, b) => a.year - b.year || a.month - b.month);
  const year = periods.length ? Math.max(...periods.map((p) => p.year)) : null;
  const monthsInFile = [...new Set(periods.map((p) => p.month))].sort((a, b) => a - b);
  const dataLines = lines.slice(4, -1); // the last line is the grand total
  const maxTotal = Math.max(...Object.values(totalIdx));

  const byKey = new Map<string, FocActualRow>();
  let excludedTeam = 0;
  let excludedCategory = 0;
  let excludedProductLine = 0;

  for (const line of dataLines) {
    const raw = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (!raw) continue;
    const quoted = raw.indexOf('"') !== -1;
    // d = the identifying cells; the full row is split only for rows that survive the filters.
    const d = quoted ? splitLine(raw, delim) : leadingFields(raw, N_DIM, delim);
    const tlevel3 = d[DIM.TLEVEL3];
    const shipName = d[DIM.SHIPNAME] ? cleanName(d[DIM.SHIPNAME]) : "(ไม่ระบุ Ship-to)";
    let category = d[DIM.CATEGORY] ?? "";
    if (allowedPl3 && !allowedPl3.has((d[DIM.PL3] ?? "").trim().toUpperCase())) {
      excludedProductLine++;
      continue;
    }
    if (!tlevel3 || /RED\s*CROSS/i.test(shipName) || EXCLUDED_TEAMS.has(tlevel3)) {
      excludedTeam++;
      continue;
    }
    // Every labelled Item Group is kept (the dashboard filters by it). A blank one is
    // classified from the product name; hardware and unclassifiable products stay out.
    if (category === "") category = classifyBlankCategory(d[DIM.PL6], d[DIM.PRODUCT]) ?? "";
    if (category === "") {
      excludedCategory++;
      continue;
    }
    const r = quoted ? d : raw.split(delim);
    if (r.length <= maxTotal) continue;
    const tlevel6 = r[DIM.TLEVEL6] || "(ไม่ระบุ Rep)";
    const product = splitProduct(r[DIM.PRODUCT]);
    const isRevenue = category === REVENUE_CATEGORY;

    for (const { year: resolvedYear, month } of periods) {
      const k = periodKey(resolvedYear, month);
      const soldQty = toNum(r[periodIdx["Selling Quantity"][k]]);
      const revenue = isRevenue ? toNum(r[periodIdx["Revenue(Custom)"][k]]) : 0;
      const focCost = toNum(r[periodIdx["FOC Cost"][k]]);
      const focQty = toNum(r[periodIdx["FOC Quantity"][k]]);
      const bonusCost = toNum(r[periodIdx["Bonus Cost"][k]]);
      const bonusQty = toNum(r[periodIdx["Bonus Quantity"][k]]);
      const tests = toNum(r[periodIdx["NumberOfTests(Custom)"][k]]);
      const totalCost = toNum(r[periodIdx["Total Cost"][k]]);
      if (!(revenue || soldQty || focCost || focQty || bonusCost || bonusQty || tests || totalCost)) continue;

      // Aggregate rather than overwrite: the source crosstab normally has one
      // row per (account, product), but if the same key ever repeats within
      // one file, summing is the safe behavior against the DB's unique key.
      const key = `${resolvedYear}|${month}|${shipName}|${product.code}|${product.name}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.revenue += Math.round(revenue);
        existing.revenueQty += Math.round(isRevenue ? soldQty : 0);
        existing.soldQty += Math.round(soldQty);
        existing.focCost += Math.round(focCost);
        existing.focQty += Math.round(focQty);
        existing.bonusCost += Math.round(bonusCost);
        existing.bonusQty += Math.round(bonusQty);
        existing.totalCost += Math.round(totalCost);
        existing.tests += Math.round(tests);
      } else {
        byKey.set(key, {
          year: resolvedYear,
          month,
          team: tlevel3 || null,
          rep: tlevel6 || null,
          category,
          accountName: shipName,
          materialNo: product.code,
          productName: product.name,
          revenue: Math.round(revenue),
          revenueQty: Math.round(isRevenue ? soldQty : 0),
          soldQty: Math.round(soldQty),
          focCost: Math.round(focCost),
          focQty: Math.round(focQty),
          bonusCost: Math.round(bonusCost),
          bonusQty: Math.round(bonusQty),
          totalCost: Math.round(totalCost),
          tests: Math.round(tests),
        });
      }
    }
  }

  return {
    rows: [...byKey.values()],
    meta: { year, months: monthsInFile, periods, excludedTeam, excludedCategory, excludedProductLine },
  };
}
