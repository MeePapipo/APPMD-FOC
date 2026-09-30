import { describe, expect, it } from "vitest";
import { classifyRows, focKey } from "./focActualsDiff";
import type { FocActualRow } from "./focActualsImport";

const row = (over: Partial<FocActualRow> = {}): FocActualRow => ({
  year: 2026, month: 1, team: "TH - North", rep: "Rep A", category: "Consumables", accountName: "ACME (0052000001)", materialNo: "M1", productName: "Kit",
  revenue: 100, revenueQty: 1, soldQty: 1, focCost: 10, focQty: 1, bonusCost: 5, bonusQty: 1, totalCost: 15, tests: 0, ...over,
});

describe("classifyRows", () => {
  it("inserts only rows that are not stored yet", () => {
    const out = classifyRows([row(), row({ materialNo: "M2" })], [row()]);
    expect(out.fresh.map((r) => r.materialNo)).toEqual(["M2"]);
    expect(out.unchanged).toBe(1);
    expect(out.changed).toEqual([]);
  });

  it("uploading the same month twice adds nothing", () => {
    const stored = [row(), row({ materialNo: "M2", focQty: 4 })];
    const out = classifyRows(stored, stored);
    expect(out.fresh).toHaveLength(0);
    expect(out.unchanged).toBe(2);
  });

  it("reports a revised row instead of dropping it", () => {
    const out = classifyRows([row({ focQty: 3, focCost: 30 })], [row()]);
    expect(out.fresh).toHaveLength(0);
    expect(out.changed).toHaveLength(1);
    expect(out.changed[0].before.focQty).toBe(1);
    expect(out.changed[0].row.focQty).toBe(3);
  });

  it("a row that only changed team/rep is relabelled, not counted as a revision", () => {
    const out = classifyRows([row({ rep: "Rep B" })], [row()]);
    expect(out.relabelled).toHaveLength(1);
    expect(out.changed).toHaveLength(0);
    expect(out.unchanged).toBe(0);
  });

  it("an Item Group that was not stored before is refreshed as a relabel", () => {
    const out = classifyRows([row()], [row({ category: null })]);
    expect(out.relabelled).toHaveLength(1);
    expect(out.changed).toHaveLength(0);
  });

  it("a different month or year is a different row", () => {
    expect(classifyRows([row({ team: "TH - South", focQty: 9 })], [row()]).changed).toHaveLength(1);
    expect(classifyRows([row({ month: 2 })], [row()]).fresh).toHaveLength(1);
    expect(classifyRows([row({ year: 2025 })], [row()]).fresh).toHaveLength(1);
    expect(focKey(row({ year: 2025 }))).not.toBe(focKey(row()));
  });
});
