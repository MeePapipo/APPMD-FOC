import { describe, expect, it } from "vitest";
import { generateTempPassword } from "./generateTempPassword";
import { passwordSchema } from "./passwordPolicy";

describe("generateTempPassword", () => {
  it("always satisfies the app's own password policy", () => {
    for (let i = 0; i < 200; i++) {
      expect(passwordSchema.safeParse(generateTempPassword()).success).toBe(true);
    }
  });

  it("never includes ambiguous characters (0/O, 1/l/I)", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTempPassword()).not.toMatch(/[0O1lI]/);
    }
  });

  it("is 10 characters long and varies between calls", () => {
    const a = generateTempPassword();
    const b = generateTempPassword();
    expect(a).toHaveLength(10);
    expect(a).not.toBe(b);
  });
});
