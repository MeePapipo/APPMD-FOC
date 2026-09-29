import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvRecords, toCsv } from "./csv";

describe("parseCsv", () => {
  it("splits plain rows on commas and newlines", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields containing commas, quotes, and newlines", () => {
    expect(parseCsv('a,"b, with comma",c\n"has ""quotes""","multi\nline",z\n')).toEqual([
      ["a", "b, with comma", "c"],
      ["has \"quotes\"", "multi\nline", "z"],
    ]);
  });

  it("tolerates a trailing row with no final newline", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("ignores a stray blank line", () => {
    expect(parseCsv("a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("toCsv", () => {
  it("quotes fields that need it and round-trips through parseCsv", () => {
    const rows = [
      ["code", "description"],
      ["HIVQ", "KIT, 192T \"IVD\""],
    ];
    const text = toCsv(rows);
    expect(parseCsv(text)).toEqual(rows);
  });
});

describe("parseCsvRecords", () => {
  it("maps the header row onto each subsequent row", () => {
    expect(parseCsvRecords("code,price\nHIVQ,1000\nCMV,2000\n")).toEqual([
      { code: "HIVQ", price: "1000" },
      { code: "CMV", price: "2000" },
    ]);
  });

  it("returns an empty array for an empty file", () => {
    expect(parseCsvRecords("")).toEqual([]);
  });
});
