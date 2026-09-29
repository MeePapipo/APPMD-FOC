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

  it("excludes rows for excluded teams (e.g. Thai Red Cross)", () => {
    const row = buildRow(
      ["TH - ThaiRedCross", "Rep A", "", "1", "Red Cross Center", "Bangkok", "", "", "", "Reagents, kits", "MAT001 - X"],
      { "Revenue(Custom)": 1000 },
    );
    const { rows, meta } = parseFocActualsCsv(buildCsv([row]));
    expect(rows).toHaveLength(0);
    expect(meta.excludedTeam).toBe(1);
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
