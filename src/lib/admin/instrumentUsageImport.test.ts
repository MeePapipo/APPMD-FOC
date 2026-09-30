import { describe, expect, it } from "vitest";
import { monthOfThaiDate, parseLabTable, parseSamplesPerRun } from "./instrumentUsageImport";

const utf16 = (text: string) => new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]));
const HEAD = ["System Class", "System Serial No", "Run Start Date", "Run Start Time", "Test Name", "Test Version", "Reagent Kit Lot Number"];

/** dims + one cell per run column (3 runs: r1, r2, r3). */
function usageFile(rows: { dims: [string, string, string, string]; cells: [string, string, string] }[]) {
  const top = ["", "", "", "", "", "", "", "Run ID", "Run ID", "Run ID"].join("\t");
  const labels = [...HEAD, "r1", "r2", "r3"].join("\t");
  const body = rows.map((r) => [r.dims[0], r.dims[1], r.dims[2], "01:00:00", r.dims[3], "1.0", "LOT", ...r.cells].join("\t"));
  return utf16([top, labels, ...body].join("\n") + "\n");
}

describe("monthOfThaiDate", () => {
  it("reads the Buddhist-era Thai date", () => {
    expect(monthOfThaiDate("วันอังคาร, 01 กันยายน 2569")).toBe("2026-09");
    expect(monthOfThaiDate("วันจันทร์, 31 สิงหาคม 2569")).toBe("2026-08");
  });
  it("is null for anything else", () => {
    expect(monthOfThaiDate("")).toBeNull();
    expect(monthOfThaiDate("2026-09-01")).toBeNull();
  });
});

describe("parseSamplesPerRun", () => {
  it("counts (run, test) pairs as runs and sums their samples, per instrument, month and assay", () => {
    const { rows, months, instruments } = parseSamplesPerRun(
      usageFile([
        { dims: ["c6800", "2124", "วันอังคาร, 01 กันยายน 2569", "HPV-GT"], cells: ["96", "", "40"] },
        { dims: ["c6800", "2124", "วันพุธ, 02 กันยายน 2569", "HPV-GT"], cells: ["", "50", ""] },
        { dims: ["c5800", "1295", "วันพุธ, 02 กันยายน 2569", "HCV"], cells: ["", "", "10"] },
      ]),
    );
    expect(months).toEqual(["2026-09"]);
    expect(instruments).toBe(2);
    expect(rows.find((r) => r.serial === "2124")).toMatchObject({ assay: "HPV", runs: 3, samples: 186 });
    expect(rows.find((r) => r.serial === "1295")).toMatchObject({ systemClass: "c5800", assay: "HCV", runs: 1, samples: 10 });
  });

  it("merges two kit-lot rows of the same run and test into one run", () => {
    const { rows } = parseSamplesPerRun(
      usageFile([
        { dims: ["c6800", "1", "วันอังคาร, 01 กันยายน 2569", "HBV"], cells: ["20", "", ""] },
        { dims: ["c6800", "1", "วันอังคาร, 01 กันยายน 2569", "HBV"], cells: ["30", "", ""] },
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ runs: 1, samples: 50 });
  });

  it("keeps the same serial on two system classes apart, and maps HIV-1 to HIVQ", () => {
    const { rows } = parseSamplesPerRun(
      usageFile([
        { dims: ["c6800", "1700", "วันอังคาร, 01 กันยายน 2569", "HIV-1"], cells: ["40", "", ""] },
        { dims: ["c5800", "1700", "วันอังคาร, 01 กันยายน 2569", "HIV-1"], cells: ["", "12", ""] },
      ]),
    );
    expect(rows.map((r) => `${r.systemClass}:${r.assay}:${r.samples}`).sort()).toEqual(["c5800:HIVQ:12", "c6800:HIVQ:40"]);
  });

  it("splits months and reports tests it cannot map instead of guessing", () => {
    const { rows, months, unknownTests } = parseSamplesPerRun(
      usageFile([
        { dims: ["c6800", "1", "วันจันทร์, 31 สิงหาคม 2569", "MPX"], cells: ["96", "", ""] },
        { dims: ["c6800", "1", "วันอังคาร, 01 กันยายน 2569", "MPX"], cells: ["", "90", ""] },
        { dims: ["c6800", "1", "วันอังคาร, 01 กันยายน 2569", "NEWTEST"], cells: ["", "", "5"] },
      ]),
    );
    expect(months).toEqual(["2026-08", "2026-09"]);
    expect(rows).toHaveLength(2);
    expect(unknownTests).toEqual({ NEWTEST: 1 });
  });

  it("rejects a file that is not the usage export", () => {
    expect(() => parseSamplesPerRun(utf16("a\tb\nc\td\n"))).toThrow(/SamplesPerRunTable/);
  });
});

describe("parseLabTable", () => {
  it("maps serial + class to the English lab name", () => {
    const text = ["City\tCountry\tLaboratory\tSystem Class\tSystem Key\tSystem Serial No", "Phichit\tThailand\tPICHIT HOSPITAL  รพ.พิจิตร\tc5800\t1700.c5800.th\t1700"].join("\n");
    expect(parseLabTable(utf16(text))).toEqual({ "1700|c5800": "PICHIT HOSPITAL" });
  });
});
