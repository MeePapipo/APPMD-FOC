import { describe, expect, it } from "vitest";
import { parseFocActualsCsv } from "./focActualsImport";

const MEASURES = [
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
const DIM_HEADERS = [
  "TLevel3", "TLevel6", "DKSH Code", "ShipToAccountNumber", "ShipToAccountName", "State",
  "PL3", "PL4", "PL6 # - Name", "Product Category Text", "Product # - Name",
];

/** Values for one measure, keyed by measure name, for one data row: the
 * month value (for มกราคม) — the total ("รวม") column is always the same
 * value in these fixtures since there's only one month present. */
type MeasureValues = Partial<Record<(typeof MEASURES)[number], number>>;

function buildRow(dims: string[], measures: MeasureValues): string[] {
  const cells: string[] = [...dims];
  for (const m of MEASURES) {
    const v = measures[m] ?? 0;
    cells.push(String(v), String(v)); // month column, then "รวม" column
  }
  return cells;
}

function buildCsv(dataRows: string[][]): Buffer {
  const dimBlank = DIM_HEADERS.map(() => "");
  const row0 = [...dimBlank];
  const row1 = [...dimBlank];
  const row2 = [...dimBlank];
  const row3 = [...DIM_HEADERS];
  for (const m of MEASURES) {
    row0.push("Date", "Date");
    row1.push(m, m);
    row2.push("2569", "รวม");
    row3.push("มกราคม", "รวม");
  }
  const grandTotal = dimBlank.map(() => "");
  for (let i = 0; i < MEASURES.length; i++) grandTotal.push("0", "0");

  const text = [row0, row1, row2, row3, ...dataRows, grandTotal].map((r) => r.join("\t")).join("\n") + "\n";
  const body = Buffer.from(text, "utf16le");
  return Buffer.concat([Buffer.from([0xff, 0xfe]), body]);
}

describe("parseFocActualsCsv", () => {
  it("parses a valid Reagents, kits row, converting the Buddhist year and splitting the product code", () => {
    const row = buildRow(
      ["TH - North", "Rep A", "", "123", "ABC HOSP.", "Bangkok", "", "", "PL6X", "Reagents, kits", "MAT001 - Test Kit"],
      { "Revenue(Custom)": 5000, "Selling Quantity": 10, "FOC Cost": 200, "FOC Quantity": 2, "Total Cost": 5300 },
    );
    const { rows, meta } = parseFocActualsCsv(buildCsv([row]));

    expect(meta.year).toBe(2026); // 2569 - 543
    expect(meta.months).toEqual([1]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      year: 2026,
      month: 1,
      team: "TH - North",
      rep: "Rep A",
      accountName: "ABC HOSPITAL", // HOSP. -> HOSPITAL
      materialNo: "MAT001",
      productName: "Test Kit",
      revenue: 5000,
      revenueQty: 10,
      soldQty: 10,
      focCost: 200,
      focQty: 2,
      totalCost: 5300,
    });
  });

  it("excludes rows for excluded teams (RCSC, FMI)", () => {
    const row = buildRow(
      ["TH - RCSC", "Rep A", "", "1", "Some Center", "Bangkok", "", "", "", "Reagents, kits", "MAT001 - X"],
      { "Revenue(Custom)": 1000 },
    );
    const { rows, meta } = parseFocActualsCsv(buildCsv([row]));
    expect(rows).toHaveLength(0);
    expect(meta.excludedTeam).toBe(1);
  });

  it("keeps Thai Red Cross rows, and Tissue Diagnostics (TD) rows outside Molecular", () => {
    const red = buildRow(
      ["TH - ThaiRedCross", "Rep A", "", "1", "THAI RED CROSS (PHUKET)", "Phuket", "MOLECULAR LAB", "", "", "Reagents, kits", "MAT001 - X"],
      { "Revenue(Custom)": 1000 },
    );
    const tdPathology = buildRow(
      ["TH - TD", "Rep B", "", "2", "Chulalongkorn Hospital Thai Red Cross", "Bangkok", "PATHOLOGY LAB", "ADVANCED STAINING", "", "Reagents, kits", "MAT002 - Y"],
      { "Revenue(Custom)": 500 },
    );
    const tdMolecular = buildRow(
      ["TH - TD", "Rep B", "", "3", "Faculty of Medicine", "Bangkok", "MOLECULAR LAB", "MOLECULAR WORK AREA", "", "Reagents, kits", "MAT003 - Z"],
      { "Revenue(Custom)": 700 },
    );
    const { rows, meta } = parseFocActualsCsv(buildCsv([red, tdPathology, tdMolecular]));
    expect(rows.map((r) => `${r.product}:${r.team}`).sort()).toEqual(["MOLECULAR LAB:TH - ThaiRedCross", "PATHOLOGY LAB:TH - TD"]);
    expect(meta.excludedTeam).toBe(1); // TD's Molecular sales
  });

  it("excludes a row with no TLevel3 team at all", () => {
    const row = buildRow(
      ["", "Rep A", "", "1", "Some Hospital", "Bangkok", "", "", "", "Reagents, kits", "MAT001 - X"],
      { "Revenue(Custom)": 1000 },
    );
    const { meta } = parseFocActualsCsv(buildCsv([row]));
    expect(meta.excludedTeam).toBe(1);
  });

  it("reclassifies a blank category by SKU keyword and zeroes revenue for non-revenue categories", () => {
    const row = buildRow(
      ["TH - North", "Rep A", "", "1", "Some Hospital", "Bangkok", "", "", "PL6X", "", "MAT002 - WASH BUFFER"],
      { "Revenue(Custom)": 999, "FOC Cost": 50, "FOC Quantity": 1 },
    );
    const { rows } = parseFocActualsCsv(buildCsv([row]));
    expect(rows).toHaveLength(1);
    // Reclassified to "Auxillaries" (WASH keyword), which is kept but isn't
    // the revenue category — revenue must be zeroed even though the source
    // column had a value, matching the reference tool exactly.
    expect(rows[0].revenue).toBe(0);
    expect(rows[0].focCost).toBe(50);
  });

  it("drops a row whose category can't be reclassified into any kept category", () => {
    const row = buildRow(
      ["TH - North", "Rep A", "", "1", "Some Hospital", "Bangkok", "", "", "", "", "MAT003 - RANDOM THING"],
      { "Revenue(Custom)": 1000 },
    );
    const { rows, meta } = parseFocActualsCsv(buildCsv([row]));
    expect(rows).toHaveLength(0);
    expect(meta.excludedCategory).toBe(1);
  });

  it("skips a month with every measure at zero rather than storing an empty fact", () => {
    const row = buildRow(
      ["TH - North", "Rep A", "", "1", "Some Hospital", "Bangkok", "", "", "", "Reagents, kits", "MAT001 - X"],
      {},
    );
    const { rows } = parseFocActualsCsv(buildCsv([row]));
    expect(rows).toHaveLength(0);
  });

  it("sums rows that collide on the same (year, month, account, product) key", () => {
    const row1 = buildRow(
      ["TH - North", "Rep A", "", "1", "Same Hospital", "Bangkok", "", "", "", "Reagents, kits", "MAT001 - X"],
      { "Revenue(Custom)": 1000, "Selling Quantity": 5 },
    );
    const row2 = buildRow(
      ["TH - North", "Rep B", "", "1", "Same Hospital", "Bangkok", "", "", "", "Reagents, kits", "MAT001 - X"],
      { "Revenue(Custom)": 500, "Selling Quantity": 2 },
    );
    const { rows } = parseFocActualsCsv(buildCsv([row1, row2]));
    expect(rows).toHaveLength(1);
    expect(rows[0].revenue).toBe(1500);
    expect(rows[0].soldQty).toBe(7);
  });

  it("throws a clear error on a file missing a required total column", () => {
    const text = "a\tb\nc\td\ne\tf\ng\th\n";
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
    expect(() => parseFocActualsCsv(buf)).toThrow();
  });
});

// A real pull is one month for two years side by side, all product lines.
type Period = { be: string; thai: string };
function buildMultiCsv(periods: Period[], rows: { dims: string[]; values: MeasureValues[] }[]): Buffer {
  const dimBlank = DIM_HEADERS.map(() => "");
  const row0 = [...dimBlank], row1 = [...dimBlank], row2 = [...dimBlank], row3 = [...DIM_HEADERS];
  for (const m of MEASURES) {
    for (const p of periods) {
      row0.push("Date"); row1.push(m); row2.push(p.be); row3.push(p.thai);
    }
    row0.push("Date"); row1.push(m); row2.push("รวม"); row3.push("รวม");
  }
  const body = rows.map(({ dims, values }) => {
    const cells = [...dims];
    for (const m of MEASURES) {
      let total = 0;
      values.forEach((v) => { const n = v[m] ?? 0; total += n; cells.push(String(n)); });
      cells.push(String(total));
    }
    return cells;
  });
  const grand = [...dimBlank];
  for (let i = 0; i < MEASURES.length * (periods.length + 1); i++) grand.push("0");
  const text = [row0, row1, row2, row3, ...body, grand].map((r) => r.join("\t")).join("\n") + "\n";
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
}

const dims = (pl3: string, account: string, product: string) =>
  ["TH - North", "Rep A", "", "1", account, "Bangkok", pl3, "", "PL6X", "Reagents, kits", product];

describe("parseFocActualsCsv - several periods in one file", () => {
  const periods: Period[] = [{ be: "2568", thai: "มกราคม" }, { be: "2569", thai: "มกราคม" }];
  const csv = buildMultiCsv(periods, [
    { dims: dims("MOLECULAR LAB", "ACME", "MAT1 - Kit"), values: [{ "Selling Quantity": 10, "Revenue(Custom)": 1000 }, { "Selling Quantity": 7, "Revenue(Custom)": 700, "FOC Quantity": 2, "FOC Cost": 50 }] },
    { dims: dims("CORE LAB", "ACME", "MAT2 - Core"), values: [{ "Selling Quantity": 99, "Revenue(Custom)": 9900 }, { "Selling Quantity": 98, "Revenue(Custom)": 9800 }] },
  ]);

  it("keeps each year's figures under its own year instead of letting the later column win", () => {
    const { rows, meta } = parseFocActualsCsv(csv);
    expect(meta.periods).toEqual([{ year: 2025, month: 1 }, { year: 2026, month: 1 }]);
    const mat1 = rows.filter((r) => r.materialNo === "MAT1");
    expect(mat1.find((r) => r.year === 2025)).toMatchObject({ soldQty: 10, revenue: 1000, focQty: 0 });
    expect(mat1.find((r) => r.year === 2026)).toMatchObject({ soldQty: 7, revenue: 700, focQty: 2, focCost: 50 });
  });

  it("does not depend on which year comes first", () => {
    const flipped = buildMultiCsv([...periods].reverse(), [
      { dims: dims("MOLECULAR LAB", "ACME", "MAT1 - Kit"), values: [{ "Selling Quantity": 7 }, { "Selling Quantity": 10 }] },
    ]);
    const { rows } = parseFocActualsCsv(flipped);
    expect(rows.find((r) => r.year === 2026)?.soldQty).toBe(7);
    expect(rows.find((r) => r.year === 2025)?.soldQty).toBe(10);
  });

  it("keeps every product line unless a filter is given", () => {
    expect(parseFocActualsCsv(csv).rows.map((r) => r.materialNo).sort()).toEqual(["MAT1", "MAT1", "MAT2", "MAT2"]);
  });

  it("keeps only the allowed product lines and counts what it dropped", () => {
    const { rows, meta } = parseFocActualsCsv(csv, { allowedProductLines: ["molecular lab"] });
    expect(rows.every((r) => r.materialNo === "MAT1")).toBe(true);
    expect(rows).toHaveLength(2);
    expect(meta.excludedProductLine).toBe(1); // one CORE LAB row (it fills both years)
  });

  it("reads several months of several years", () => {
    const multi = buildMultiCsv(
      [{ be: "2568", thai: "มกราคม" }, { be: "2568", thai: "กุมภาพันธ์" }, { be: "2569", thai: "มกราคม" }, { be: "2569", thai: "กุมภาพันธ์" }],
      [{ dims: dims("MOLECULAR LAB", "ACME", "MAT1 - Kit"), values: [{ "FOC Quantity": 1 }, { "FOC Quantity": 2 }, { "FOC Quantity": 3 }, { "FOC Quantity": 4 }] }],
    );
    const { rows, meta } = parseFocActualsCsv(multi);
    expect(meta.months).toEqual([1, 2]);
    expect(rows.map((r) => `${r.year}-${r.month}:${r.focQty}`).sort()).toEqual(["2025-1:1", "2025-2:2", "2026-1:3", "2026-2:4"]);
  });
});

describe("parseFocActualsCsv - Product and annual quota", () => {
  const periods: Period[] = [{ be: "2569", thai: "มกราคม" }, { be: "2569", thai: "กุมภาพันธ์" }];
  const csv = buildMultiCsv(periods, [
    {
      dims: dims("CORE LAB", "LAB A", "MAT1 - Control"),
      // the annual quota is repeated on each month that has activity
      values: [{ "FOC Quantity": 1, "Quota(Year)": 18 }, { "FOC Quantity": 2, "Quota(Year)": 18 }],
    },
    { dims: dims("PATHOLOGY LAB", "LAB B", "MAT2 - Slide"), values: [{ "FOC Quantity": 4 }, { "Selling Quantity": 3 }] },
  ]);

  it("keeps the Product (PL3) on every row", () => {
    const { rows } = parseFocActualsCsv(csv);
    expect(rows.filter((r) => r.materialNo === "MAT1").every((r) => r.product === "CORE LAB")).toBe(true);
    expect(rows.find((r) => r.materialNo === "MAT2")?.product).toBe("PATHOLOGY LAB");
  });

  it("reads Quota(Year) as the annual figure, not the sum of its repeats", () => {
    const { rows } = parseFocActualsCsv(csv);
    const mat1 = rows.filter((r) => r.materialNo === "MAT1");
    expect(mat1).toHaveLength(2);
    expect(mat1.map((r) => r.annualQuota)).toEqual([18, 18]);
  });

  it("is null where no quota is set (a Product without quotas, such as Pathology here)", () => {
    const { rows } = parseFocActualsCsv(csv);
    expect(rows.find((r) => r.materialNo === "MAT2")?.annualQuota).toBeNull();
  });
});

describe("parseFocActualsCsv - Pathology and the HPV pre-analytics items", () => {
  const periods: Period[] = [{ be: "2569", thai: "มกราคม" }];
  const row = (pl3: string, pl4: string, category: string, product: string, team = "TH - North") =>
    ({ dims: [team, "Rep A", "", "1", "LAB A", "Bangkok", pl3, pl4, "PL6X", category, product], values: [{ "FOC Quantity": 2, "FOC Cost": 100, "Selling Quantity": 1 }] });
  const csv = buildMultiCsv(periods, [
    row("PATHOLOGY LAB", "PRE-ANALYTICS", "Reagents, kits", "08779040190 - KIT CERVICAL COLLECTION BRUSH"),
    row("PATHOLOGY LAB", "PRE-ANALYTICS", "", "09178163001 - ThinPrep Collection media vial (20mL)"),
    row("PATHOLOGY LAB", "ADVANCED STAINING", "Reagents, kits", "06523897001 - p57 Antibody", "TH - TD"),
    row("PATHOLOGY LAB", "PRIMARY STAINING", "Instruments", "MATI - H&E instrument", "TH - TD"),
    row("PATHOLOGY LAB", "ADVANCED STAINING", "", "05291208001 - 458552 WORKFLOW SYSTEMS SETLMT"),
    row("CORE LAB", "SERUM WORK AREA", "Reagents, kits", "MATC - Core kit"),
  ]);
  const { rows, meta } = parseFocActualsCsv(csv, { allowedProductLines: ["MOLECULAR LAB", "PATHOLOGY LAB"] });
  const byMat = (m: string) => rows.find((r) => r.materialNo === m);

  it("stores Pathology's PRE-ANALYTICS rows as Molecular Lab, with no annual quota", () => {
    expect(byMat("08779040190")?.product).toBe("MOLECULAR LAB");
    expect(byMat("08779040190")?.annualQuota).toBeNull();
  });

  it("keeps an uncategorised pre-analytics item (it is no longer in the master) as a consumable", () => {
    expect(byMat("09178163001")).toMatchObject({ product: "MOLECULAR LAB", category: "Consumables" });
  });

  it("keeps all Pathology staining rows, whatever the Item Group", () => {
    expect(byMat("06523897001")).toMatchObject({ product: "PATHOLOGY LAB", team: "TH - TD", category: "Reagents, kits" });
    expect(byMat("MATI")?.category).toBe("Instruments");
    expect(byMat("05291208001")).toMatchObject({ product: "PATHOLOGY LAB", category: "Uncategorised" });
  });

  it("drops Core Lab when it is not an allowed Product", () => {
    expect(byMat("MATC")).toBeUndefined();
    expect(meta.excludedProductLine).toBe(1);
  });
});
