/**
 * Adds the cobas 4800 molecular-oncology kits and their give-aways to the master data, from the
 * "cobas 4800_Oncology" tab of "FOC Master Data .xlsx". Idempotent: rows are upserted by their natural
 * key (assay: system+code, item: system+materialNo), so it can be rerun and run against Neon too.
 *
 * The rule (praditww, 2026-10-02): one main-reagent box runs 24 tests and 8 AD-plate runs.
 *   - AD-plate 0.3ml (50 PC/pack): 8 PC per box  -> weight 8/24 per test on every oncology code
 *   - KIT COBAS CFDNA SAMP PREP 24T: 1 box per box of a Plasma kit
 *   - KIT DNA ISOLATION 24T:        1 box per box of a Tissue kit (PIK3CA and KRAS 4800 are tissue only)
 * Plasma and Tissue are separate assay codes on the same material number, like HPV and its SurePath twin.
 *
 * NOT written to ~/foc-excel/data/*.json: the golden tests compare that fixture with ~/foc-excel/out/cases.json,
 * which only the foc-excel pipeline can regenerate. So re-running import-foc-excel resets AD-plate's weights
 * to the pre-oncology ones; run this script again afterwards.
 *
 * Run: DATABASE_URL=<url> npx tsx scripts/add-oncology.ts ["path/to/FOC Master Data .xlsx"]
 * A Neon URL is reached over WebSocket (port 443), like scripts/apply-migrations-neon.ts.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import pg from "pg";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL.");
const xlsxPath = process.argv[2] ?? "/mnt/c/Users/praditww/Desktop/Claude Project/foc-calculator/FOC Master Data .xlsx";
const TAB = "cobas 4800_Oncology";

const BASE_CODE: Record<string, string> = {
  "07659962001": "BRAFNRAS",
  "07248563190": "EGFR",
  "07989270001": "KRASV2",
  "07003986190": "PIK3CA4800",
  "05852170190": "KRAS4800",
};
const AD_PLATE = "05232724001";
const CFDNA_PREP = "07247737190"; // plasma
const DNA_ISOLATION = "05985536190"; // tissue
const CATEGORY = "Generic Reagent \n& Consumables";

type Assay = {
  system: "4800"; code: string; srcRow: number; batchRow: null; category: string; materialNo: string; dkshCode: string | null;
  description: string; usageType: string; usageGroup: string; packText: string; packSize: number; unitText: string;
  price: number; pricePerTest: number; testsPerBatchDefault: null; batchLabel: null; neg: null;
};

const text = (v: ExcelJS.CellValue): string => (v === null || v === undefined ? "" : typeof v === "object" ? String((v as { result?: unknown }).result ?? "") : String(v)).trim();
const num = (v: ExcelJS.CellValue): number => Number(typeof v === "object" && v !== null ? (v as { result?: unknown }).result : v);

async function readTab() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const sheet = wb.getWorksheet(TAB);
  if (!sheet) throw new Error(`Tab "${TAB}" not found in ${xlsxPath}`);

  const assays: Assay[] = [];
  const consumables = new Map<string, { row: number; dksh: string; description: string; usageType: string; usageGroup: string; packText: string; packSize: number; unitText: string; price: number }>();
  sheet.eachRow((row, rowNumber) => {
    const cat = text(row.getCell(1).value);
    const material = text(row.getCell(2).value);
    if (!material || material === "Material Number") return;
    const description = text(row.getCell(4).value);
    if (cat === "Main Reagent") {
      const base = BASE_CODE[material];
      if (!base) throw new Error(`Row ${rowNumber}: no assay code known for material ${material}`);
      const sample = /-\s*plasma$/i.test(description) ? "PLASMA" : /-\s*tissue$/i.test(description) ? "TISSUE" : null;
      const price = num(row.getCell(10).value);
      const packSize = num(row.getCell(7).value);
      assays.push({
        system: "4800", code: sample ? `${base}_${sample}` : base, srcRow: rowNumber, batchRow: null, category: "Main Reagent", materialNo: material,
        dkshCode: text(row.getCell(3).value) || null, description, usageType: "Main Reagent", usageGroup: text(row.getCell(6).value),
        packText: String(packSize), packSize, unitText: text(row.getCell(9).value), price, pricePerTest: price / packSize, testsPerBatchDefault: null, batchLabel: null, neg: null,
      });
    } else if ([AD_PLATE, CFDNA_PREP, DNA_ISOLATION].includes(material)) {
      const packText = text(row.getCell(7).value);
      consumables.set(material, {
        row: rowNumber, dksh: text(row.getCell(3).value), description, usageType: text(row.getCell(5).value), usageGroup: text(row.getCell(6).value),
        packText, packSize: Number(packText.match(/\d+/)?.[0] ?? 1), unitText: text(row.getCell(9).value), price: num(row.getCell(10).value),
      });
    }
  });
  if (assays.length !== 8) throw new Error(`Expected 8 oncology main reagents, found ${assays.length}`);
  for (const m of [AD_PLATE, CFDNA_PREP, DNA_ISOLATION]) if (!consumables.has(m)) throw new Error(`Consumable ${m} not found in the tab`);
  return { assays, consumables };
}

const plasmaCodes = (assays: Assay[]) => assays.filter((a) => a.code.endsWith("_PLASMA")).map((a) => a.code);
const tissueCodes = (assays: Assay[]) => assays.filter((a) => !a.code.endsWith("_PLASMA")).map((a) => a.code); // _TISSUE plus the tissue-only kits

/** The weights the three consumables take on the oncology codes (per test; the packSize does the dividing). */
function weightsFor(assays: Assay[]) {
  const per = (codes: string[], w: number) => Object.fromEntries(codes.map((c) => [c, w]));
  return {
    adPlate: per(assays.map((a) => a.code), 8 / 24), // 8 runs (PC) per 24-test box
    cfdna: per(plasmaCodes(assays), 1),
    dna: per(tissueCodes(assays), 1),
  };
}

type Db = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; end: () => Promise<void> };

function connect(): Db {
  if (/neon\.tech/.test(url!)) {
    neonConfig.webSocketConstructor = ws;
    return new NeonPool({ connectionString: url }) as unknown as Db;
  }
  return new pg.Pool({ connectionString: url }) as unknown as Db;
}

async function writeDb(assays: Assay[], consumables: Awaited<ReturnType<typeof readTab>>["consumables"]) {
  const db = connect();
  const w = weightsFor(assays);
  try {
    const maxSort = Number((await db.query(`select coalesce(max("sortOrder"),0) m from "MasterAssay" where system = 'S4800'`)).rows[0].m);
    for (const [i, a] of assays.entries()) {
      await db.query(
        `insert into "MasterAssay" (id, system, code, "srcRow", "batchRow", "batchLabel", category, "materialNo", "dkshCode", description, "usageType", "usageGroup", "packText", "packSize", "unitText", price, "pricePerTest", "testsPerBatchDefault", "negCode", active, "sortOrder", "updatedAt")
         values ($1, 'S4800', $2, $3, null, null, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, null, null, true, $15, now())
         on conflict (system, code) do update set "srcRow"=excluded."srcRow", category=excluded.category, "materialNo"=excluded."materialNo", "dkshCode"=excluded."dkshCode", description=excluded.description,
           "usageType"=excluded."usageType", "usageGroup"=excluded."usageGroup", "packText"=excluded."packText", "packSize"=excluded."packSize", "unitText"=excluded."unitText",
           price=excluded.price, "pricePerTest"=excluded."pricePerTest", active=true, "updatedAt"=now()`,
        [randomUUID(), a.code, a.srcRow, a.category, a.materialNo, a.dkshCode, a.description, a.usageType, a.usageGroup, a.packText, a.packSize, a.unitText, a.price, a.pricePerTest, maxSort + 1 + i],
      );
    }

    const newItem = async (material: string, weights: Record<string, number>, group: string, srcFormula: string) => {
      const c = consumables.get(material)!;
      await db.query(
        `insert into "MasterItem" (id, system, "srcRow", "group", category, "materialNo", "dkshCode", description, "usageType", "usageGroup", optional, "onDemand", "packText", "packSize", consumption, coverage, "unitText", price, "priceText", driver, "appliesTo", "appliesToAll", weights, "srcFormula", "fixNote", active, "sortOrder", "updatedAt")
         values ($1, 'S4800', $2, $3, $4, $5, $6, $7, $8, $9, false, false, $10, $11, 1, 1, $12, $13, null, 'TEST', $14, false, $15::jsonb, $16, null, true, $17, now())
         on conflict (system, "materialNo") do update set "srcRow"=excluded."srcRow", "group"=excluded."group", category=excluded.category, "dkshCode"=excluded."dkshCode", description=excluded.description,
           "usageType"=excluded."usageType", "usageGroup"=excluded."usageGroup", "packText"=excluded."packText", "packSize"=excluded."packSize", "unitText"=excluded."unitText", price=excluded.price,
           "appliesTo"=excluded."appliesTo", weights=excluded.weights, "srcFormula"=excluded."srcFormula", active=true, "updatedAt"=now()`,
        [randomUUID(), c.row, group, CATEGORY, material, c.dksh || null, c.description, c.usageType, c.usageGroup, c.packText, c.packSize, c.unitText, c.price, Object.keys(weights), JSON.stringify(weights), srcFormula, 1000 + c.row],
      );
    };
    await newItem(CFDNA_PREP, w.cfdna, "Conditional", "1 box per box of a Plasma kit (cobas 4800_Oncology)");
    await newItem(DNA_ISOLATION, w.dna, "Conditional", "1 box per box of a Tissue kit, PIK3CA and KRAS 4800 (cobas 4800_Oncology)");

    // AD-plate already exists (HPV, CT/NG, CMV, HBV, HCV): add the oncology codes to its weights, keep the rest.
    const ad = (await db.query(`select weights, "appliesTo" from "MasterItem" where system = 'S4800' and "materialNo" = $1`, [AD_PLATE])).rows[0];
    if (!ad) throw new Error("AD-plate 0.3ml is not in MasterItem for 4800; run the master import first.");
    const weights = { ...(ad.weights as Record<string, number>), ...w.adPlate };
    await db.query(`update "MasterItem" set weights = $2::jsonb, "appliesTo" = $3, "updatedAt" = now() where system = 'S4800' and "materialNo" = $1`, [AD_PLATE, JSON.stringify(weights), Object.keys(weights)]);
    console.log(`DB: ${assays.length} assays, 2 new items, AD-plate now weighted on ${Object.keys(weights).length} codes.`);
  } finally {
    await db.end();
  }
}

async function main() {
  const { assays, consumables } = await readTab();
  await writeDb(assays, consumables);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
