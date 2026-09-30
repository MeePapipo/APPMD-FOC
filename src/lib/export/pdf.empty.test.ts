import { describe, expect, it } from "vitest";
import { buildSubmissionPdf, findThaiFont } from "./pdf";
import type { SubmissionDoc } from "./submission-doc";

// The Thai font has no italic face; an italic "nothing here" line used to make the whole PDF fail.
describe.skipIf(!findThaiFont())("PDF with empty sections", () => {
  it("renders a submission with no reagents and no FOC items", async () => {
    const doc: SubmissionDoc = {
      id: "s", accountNumber: "1", accountName: "X", repEmail: "a@b.c", createdAt: new Date(), status: "SUBMITTED", systemsLabel: "cobas 6800/8800",
      assayInputs: [], reagents: [], reagentTotal: 0, focItems: [], calculatedFocTotal: 0, additionalFocItems: [], additionalFocTotal: 0, focTotal: 0,
      overGive: { lineCount: 0, packs: 0, value: 0 }, revenue: 0, focPct: 0, fileStem: "x",
    };
    const buf = await buildSubmissionPdf(doc);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30000);
});
