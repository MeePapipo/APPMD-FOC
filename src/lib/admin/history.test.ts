import { describe, expect, it } from "vitest";
import { historyScopeSchema, historyWhere } from "./history";

describe("historyWhere", () => {
  it("clear touches only SUBMITTED rows, restore only VOID rows", () => {
    expect(historyWhere({ kind: "all" }, "clear")).toEqual({ status: "SUBMITTED" });
    expect(historyWhere({ kind: "all" }, "restore")).toEqual({ status: "VOID" });
  });
  it("narrows by user and account", () => {
    expect(historyWhere({ kind: "user", email: "a@roche.com" }, "clear")).toEqual({ status: "SUBMITTED", createdByEmail: "a@roche.com" });
    expect(historyWhere({ kind: "account", accountNumber: "52025356" }, "restore")).toEqual({ status: "VOID", accountNumber: "52025356" });
  });
  it("'before' is exclusive and starts at midnight Thailand time", () => {
    const w = historyWhere({ kind: "before", date: "2026-01-01" }, "clear") as { createdAt: { lt: Date } };
    expect(w.createdAt.lt.toISOString()).toBe("2025-12-31T17:00:00.000Z");
  });
});

describe("historyScopeSchema", () => {
  it("lowercases the email and rejects a malformed date", () => {
    expect(historyScopeSchema.parse({ kind: "user", email: " A@Roche.com " })).toEqual({ kind: "user", email: "a@roche.com" });
    expect(historyScopeSchema.safeParse({ kind: "before", date: "01/01/2026" }).success).toBe(false);
    expect(historyScopeSchema.safeParse({ kind: "nope" }).success).toBe(false);
  });
});
