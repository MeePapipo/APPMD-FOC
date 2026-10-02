import { describe, expect, it } from "vitest";
import { teamChips } from "./ActualsFilters";

describe("teamChips", () => {
  it("lists every team in the data: the usual four first, then the rest A-Z with short names", () => {
    const chips = teamChips(["TH - TD", "TH - BP", "TH - ThaiRedCross", "TH - North", "TH - NPC", "TH - Private - BKK", "TH - South"]);
    expect(chips.map((c) => c.label)).toEqual(["North", "South", "Private-BKK", "BP", "NPC", "TD", "Thai Red Cross"]);
    expect(chips.find((c) => c.label === "Thai Red Cross")?.value).toBe("TH - ThaiRedCross");
  });
});
