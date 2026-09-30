import { describe, expect, it } from "vitest";
import type { AccountAlert } from "./accountAlerts";
import { overQuotaAccounts, standaloneFocAccounts } from "./alertLists";

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
