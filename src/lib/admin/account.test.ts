import { describe, expect, it } from "vitest";
import { accountCreateSchema, accountPatchSchema, usageMessage } from "./account";

describe("account schemas", () => {
  it("trims and accepts a normal account", () => {
    expect(accountCreateSchema.parse({ accountNumber: " 52027876 ", accountName: " PIYAVATE HOSPITAL " })).toEqual({
      accountNumber: "52027876",
      accountName: "PIYAVATE HOSPITAL",
    });
  });
  it("rejects blanks and numbers with spaces or symbols", () => {
    expect(accountCreateSchema.safeParse({ accountNumber: "", accountName: "X" }).success).toBe(false);
    expect(accountCreateSchema.safeParse({ accountNumber: "5202 6554", accountName: "X" }).success).toBe(false);
    expect(accountCreateSchema.safeParse({ accountNumber: "5202/6554", accountName: "X" }).success).toBe(false);
    expect(accountCreateSchema.safeParse({ accountNumber: "1", accountName: "  " }).success).toBe(false);
  });
  it("patch needs at least one field", () => {
    expect(accountPatchSchema.safeParse({}).success).toBe(false);
    expect(accountPatchSchema.safeParse({ active: false }).success).toBe(true);
  });
});

describe("usageMessage", () => {
  it("is null when nothing points at the account", () => {
    expect(usageMessage({ submissions: 0, annualForecasts: 0, quotas: 0 })).toBeNull();
  });
  it("names what is using it, with plurals", () => {
    const m = usageMessage({ submissions: 1, annualForecasts: 2, quotas: 0 });
    expect(m).toContain("1 order,");
    expect(m).toContain("2 forecasts");
    expect(m).not.toContain("quota");
  });
});
