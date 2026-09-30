import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import { buildAccountMatrix } from "./focAccountMatrix";
import { CSV_BOM, MATRIX_HEADERS, LONG_HEADERS, accountMatrixCsv, longFactsCsv, matrixTable, quotaPct, quotaStatus } from "./focExports";

const matrix = buildAccountMatrix([
  { year: 2026, month: 1, materialNo: "A1", productName: "HBV, 192T", category: "Controls", focQty: 2, bonusQty: 1, focCost: 200, bonusCost: 100 },
  { year: 2026, month: 2, materialNo: "A1", productName: "HBV, 192T", focQty: 1, bonusQty: 0, focCost: 100, bonusCost: 0 },
  { year: 2025, month: 6, materialNo: "A1", productName: "HBV, 192T", focQty: 5, bonusQty: 0, focCost: 500, bonusCost: 0 },
  { year: 2026, month: 1, materialNo: "B2", productName: "ท่อ", focQty: 4, bonusQty: 0, focCost: 40, bonusCost: 0 },
], 2026);
const ent = [{ materialNo: "A1", expected: 2, free: 4, significant: true }];

describe("quota helpers", () => {
  it("classifies a row", () => {
    expect(quotaStatus(undefined)).toBe("");
    expect(quotaStatus({ materialNo: "x", expected: 2, free: 4, significant: true })).toBe("Over Quota");
    expect(quotaStatus({ materialNo: "x", expected: 10, free: 11, significant: false })).toBe("Over");
    expect(quotaStatus({ materialNo: "x", expected: 10, free: 3, significant: false })).toBe("Within");
  });
  it("has no percentage without an entitlement", () => {
    expect(quotaPct({ materialNo: "x", expected: 0, free: 3, significant: true })).toBeNull();
    expect(quotaPct({ materialNo: "x", expected: 4, free: 2, significant: false })).toBe(50);
  });
});

describe("accountMatrixCsv", () => {
  const csv = accountMatrixCsv({ name: "PICHIT HOSPITAL  (0052027798)", number: "0052027798", team: "TH - North", rep: null }, matrix, ent, "qty");
  const rows = parseCsv(csv.replace(CSV_BOM, ""));

  it("starts with a BOM so Excel reads Thai", () => {
    expect(csv.startsWith(CSV_BOM)).toBe(true);
  });
  it("lays out header, product rows and a total", () => {
    const head = rows.findIndex((r) => r[0] === MATRIX_HEADERS[0]);
    expect(rows[head]).toEqual([...MATRIX_HEADERS, "item_group"]);
    expect(rows[head + 1].at(-1)).toBe("Controls");
    expect(rows[head + 2].at(-1)).toBe("");
    const a1 = rows[head + 1];
    expect(a1.slice(0, 6)).toEqual(["A1", "HBV, 192T", "2", "200", "Over Quota", "5"]); // 4 given of 2 entitled
    expect(a1[6]).toBe("3"); // Jan: 2 + 1
    expect(a1[7]).toBe("1"); // Feb
    expect(a1.at(-2)).toBe("4"); // YTD
    const total = rows.at(-1)!;
    expect(total[1]).toBe("Total");
    expect(total.at(-2)).toBe("8");
  });
  it("switches to cost and keeps products without a quota row blank", () => {
    const table = matrixTable(matrix, ent, "cost");
    expect(table[0][6]).toBe(300);
    const b2 = table.find((r) => r[0] === "B2")!;
    expect(b2.slice(2, 5)).toEqual(["", "", ""]);
  });
});

describe("longFactsCsv", () => {
  const csv = longFactsCsv([
    { accountName: "B HOSP  (0000000002)", team: null, rep: "Rep", materialNo: "M", productName: "P", year: 2026, month: 2, focQty: 1, bonusQty: 0, focCost: 10, bonusCost: 0 },
    { accountName: "A HOSP  (0000000001)", team: "TH - BP", rep: "Rep", materialNo: "M", productName: "P", category: "Consumables", year: 2026, month: 1, focQty: 0, bonusQty: 2, focCost: 0, bonusCost: 20 },
    { accountName: "A HOSP  (0000000001)", team: "TH - BP", rep: "Rep", materialNo: "Z", productName: "Zero", year: 2026, month: 1, focQty: 0, bonusQty: 0, focCost: 0, bonusCost: 0 },
  ]);
  const rows = parseCsv(csv.replace(CSV_BOM, ""));
  it("has the agreed columns, sorted by account, skipping all-zero lines", () => {
    expect(rows[0]).toEqual(LONG_HEADERS);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(["A HOSP", "0000000001", "TH - BP", "Rep", "M", "P", "2026", "1", "0", "2", "0", "20", "Consumables"]);
    expect(rows[2].at(-1)).toBe("");
    expect(rows[2][0]).toBe("B HOSP");
    expect(rows[2][2]).toBe("");
  });
});
