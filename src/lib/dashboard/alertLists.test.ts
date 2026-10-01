import { describe, expect, it } from "vitest";
import type { AccountAlert } from "./accountAlerts";
import { annualOverAccounts, overQuotaAccounts, standaloneFocAccounts } from "./alertLists";

const item = (materialNo: string, excessValue: number) => ({ materialNo, productName: materialNo, expected: 1, free: 2, over: 1, excessValue, ratio: 2 });
const alert = (over: boolean, excess: number, focFlagged: boolean, cost: number, items = [item("a", 1)]): AccountAlert => ({
  count: items.length, cost: 0, items, flagged: over || focFlagged,
  net: { entitledValue: 100, bonusValue: 100 + excess, excessValue: excess, overPct: excess, over, focStandaloneCost: cost, focFlagged },
});
const alerts = new Map<string, AccountAlert>([
  ["A", alert(true, 500, false, 0, [item("x", 1), item("y", 9), item("z", 5), item("w", 7)])],
  ["B", alert(true, 900, true, 40)],
  ["C", alert(false, 10, true, 90)],
  ["D", alert(false, 10, false, 0)],
]);
const rows = ["A", "B", "C", "D", "E"].map((accountName) => ({ accountName }));
const team = () => "TH - North";

describe("alert lists", () => {
  it("lists over-quota accounts by excess with the top three items", () => {
    const l = overQuotaAccounts(rows, alerts, team);
    expect(l.map((r) => r.accountName)).toEqual(["B", "A"]);
    expect(l[1].topItems.map((i) => i.materialNo)).toEqual(["y", "w", "z"]);
  });
  it("lists flagged stand-alone FOC by cost", () => {
    expect(standaloneFocAccounts(rows, alerts, team).map((r) => [r.accountName, r.cost])).toEqual([["C", 90], ["B", 40]]);
  });
});

describe("annualOverAccounts", () => {
  const item = (materialNo: string, diff: number, over = true) => ({ materialNo, productName: materialNo, quota: 10, given: 10 + diff, focQty: 0, bonusQty: 10 + diff, pct: 100, diff, over });
  it("lists accounts with items over, biggest excess first, three worst items", () => {
    const annual = new Map([
      ["A", { itemsWithQuota: 5, itemsOver: 4, excessUnits: 10, items: [item("a", 1), item("b", 5), item("c", 3), item("d", 2), item("z", 50, false)] }],
      ["B", { itemsWithQuota: 2, itemsOver: 0, excessUnits: 0, items: [] }],
      ["C", { itemsWithQuota: 2, itemsOver: 1, excessUnits: 30, items: [item("x", 30)] }],
    ]);
    const out = annualOverAccounts([{ accountName: "A" }, { accountName: "B" }, { accountName: "C" }], annual, () => "T");
    expect(out.map((r) => r.accountName)).toEqual(["C", "A"]);
    expect(out[1].topItems.map((i) => i.materialNo)).toEqual(["b", "c", "d"]);
  });
});
