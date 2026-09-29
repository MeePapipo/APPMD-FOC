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

const DIM = { TLEVEL3: 0, TLEVEL6: 1, SHIPNUM: 3, SHIPNAME: 4, STATE: 5, PL6: 8, CATEGORY: 9, PRODUCT: 10 };
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
const THAI_MONTHS: Record<string, number> = {
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
const BE_OFFSET = 543;

const KEEP_CATEGORIES = new Set(["Auxillaries", "Consumables", "Controls", "Reagents, kits"]);
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

function decodeExport(buf: Buffer): string {
  // Tableau's crosstab export is UTF-16 LE with a BOM; older ones are UTF-8.
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString("utf16le").replace(/^﻿/, "");
  }
  const text = buf.toString("utf8").replace(/^﻿/, "");
  if (text.includes("ShipToAccountName")) return text;
  throw new Error("อ่านไฟล์ไม่ออก — ต้องเป็น crosstab export จาก Tableau (UTF-16, tab-delimited)");
}

function splitRows(text: string): string[][] {
  const delim = text.split("\n", 1)[0].includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
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

export type ParseResult = {
  rows: FocActualRow[];
  meta: { year: number | null; months: number[]; excludedTeam: number; excludedCategory: number };
};

export function parseFocActualsCsv(buf: Buffer): ParseResult {
  const rows = splitRows(decodeExport(buf));
  if (rows.length < 5) throw new Error("ไฟล์สั้นผิดปกติ — ไม่เหมือน crosstab export ของ Tableau");
  const measureRow = rows[1];
  const yearRow = rows[2];
  const labelRow = rows[3];

  const totalIdx: Record<string, number> = {};
  const monthIdx: Record<string, Record<number, number>> = {};
  for (const m of TOTAL_MEASURES) monthIdx[m] = {};
  let yearBE: number | null = null;
  for (let i = N_DIM; i < measureRow.length; i++) {
    const measure = measureRow[i];
    if (!TOTAL_MEASURES.includes(measure)) continue;
    if (yearRow[i] === "รวม") {
      if (!(measure in totalIdx)) totalIdx[measure] = i;
    } else if (labelRow[i] in THAI_MONTHS) {
      monthIdx[measure][THAI_MONTHS[labelRow[i]]] = i;
      yearBE = yearBE || parseInt(yearRow[i], 10);
    }
  }
  const missing = TOTAL_MEASURES.filter((m) => !(m in totalIdx));
  if (missing.length) throw new Error("CSV ขาดคอลัมน์รวมที่ต้องมี: " + missing.join(", "));
  const year = yearBE ? yearBE - BE_OFFSET : null;

  const monthsInFile = Object.keys(monthIdx["Revenue(Custom)"])
    .map(Number)
    .sort((a, b) => a - b);
  const dataRows = rows.slice(4, -1);
  const maxTotal = Math.max(...Object.values(totalIdx));

  const byKey = new Map<string, FocActualRow>();
  let excludedTeam = 0;
  let excludedCategory = 0;

  for (const r of dataRows) {
    if (r.length <= maxTotal) continue;
    const tlevel3 = r[DIM.TLEVEL3];
    const shipName = r[DIM.SHIPNAME] ? cleanName(r[DIM.SHIPNAME]) : "(ไม่ระบุ Ship-to)";
    let category = r[DIM.CATEGORY];
    if (!tlevel3 || /RED\s*CROSS/i.test(shipName) || EXCLUDED_TEAMS.has(tlevel3)) {
      excludedTeam++;
      continue;
    }
    if (!KEEP_CATEGORIES.has(category)) {
      if (category === "") category = classifyBlankCategory(r[DIM.PL6], r[DIM.PRODUCT]) ?? "";
      if (!KEEP_CATEGORIES.has(category)) {
        excludedCategory++;
        continue;
      }
    }
    const tlevel6 = r[DIM.TLEVEL6] || "(ไม่ระบุ Rep)";
    const product = splitProduct(r[DIM.PRODUCT]);
    const isRevenue = category === REVENUE_CATEGORY;

    for (const month of monthsInFile) {
      const soldQty = toNum(r[monthIdx["Selling Quantity"][month]]);
      const revenue = isRevenue ? toNum(r[monthIdx["Revenue(Custom)"][month]]) : 0;
      const focCost = toNum(r[monthIdx["FOC Cost"][month]]);
      const focQty = toNum(r[monthIdx["FOC Quantity"][month]]);
      const bonusCost = toNum(r[monthIdx["Bonus Cost"][month]]);
      const bonusQty = toNum(r[monthIdx["Bonus Quantity"][month]]);
      const tests = toNum(r[monthIdx["NumberOfTests(Custom)"][month]]);
      const totalCost = toNum(r[monthIdx["Total Cost"][month]]);
      if (!(revenue || soldQty || focCost || focQty || bonusCost || bonusQty || tests || totalCost)) continue;

      const resolvedYear = year ?? new Date().getFullYear();
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
    meta: { year, months: monthsInFile, excludedTeam, excludedCategory },
  };
}
