/**
 * Loads engine test fixtures directly from ~/foc-excel — the sibling repo that
 * builds the reference Excel workbook. Not vendored into this repo: whenever
 * ~/foc-excel/data/*.json changes, re-run `node verify.mjs --cases` there
 * (see foc-excel-build-gotchas) to regenerate out/cases.json, then re-run
 * these tests. This keeps one source of truth instead of a copy that can go
 * stale (exactly the staleness bug found and fixed 2026-09-08, when
 * out/cases.json still had 85-item arrays after items.json grew to 128).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AssayLite, ItemLite } from "./types";
import type { TpbTableInput } from "./tpb";

const FOC_EXCEL_DIR = join(process.env.HOME ?? "/home/praditww", "foc-excel");

interface RawAssay {
  system: "6800" | "5800" | "4800";
  code: string;
  description: string;
  materialNo: string;
  dkshCode: string | null;
  batchRow: number | null;
  batchLabel: string | null;
  packSize: number;
  price: number | null;
}
interface RawItem {
  system: "6800" | "5800" | "4800";
  materialNo: string;
  description: string;
  category: string | null;
  unitText: string | null;
  driver: "BATCH" | "TEST";
  appliesTo: string[] | null;
  consumption: number;
  coverage: number;
  packSize: number;
  price: number | null;
  priceText: string | null;
  onDemand: boolean;
  optional: boolean;
  weights?: Record<string, number> | null;
}
interface RawTpb {
  floors: Record<"6800" | "5800", number>;
  values: { system: "6800" | "5800"; code: string; tpb: number }[];
}

function readJson<T>(relPath: string): T {
  return JSON.parse(readFileSync(join(FOC_EXCEL_DIR, relPath), "utf8")) as T;
}

export function loadAssays(): AssayLite[] {
  return readJson<RawAssay[]>("data/assays.json").map((a) => ({
    system: a.system,
    code: a.code,
    description: a.description,
    materialNo: a.materialNo,
    dkshCode: a.dkshCode,
    batchRow: a.batchRow,
    batchLabel: a.batchLabel,
    packSize: a.packSize,
    price: a.price,
  }));
}

export function loadItems(): ItemLite[] {
  return readJson<RawItem[]>("data/items.json").map((i) => ({
    system: i.system,
    materialNo: i.materialNo,
    description: i.description,
    category: i.category,
    unitText: i.unitText,
    driver: i.driver,
    appliesTo: i.appliesTo,
    consumption: i.consumption,
    coverage: i.coverage,
    packSize: i.packSize,
    price: i.price,
    onDemand: i.onDemand,
    optional: i.optional,
    weights: i.weights ?? null,
  }));
}

export function loadTpbInput(): TpbTableInput {
  const raw = readJson<RawTpb>("data/tpb.json");
  return { floors: raw.floors, values: raw.values };
}

export interface GoldenCase {
  name: string;
  sys: "cobas 6800/8800" | "cobas 5800";
  tests: Record<string, number>;
  bySys?: { "6800"?: Record<string, number>; "5800"?: Record<string, number> };
  revenue: number;
  foc: number;
  focPct: number;
  qty: number[];
}

export function loadGoldenCases(): GoldenCase[] {
  return readJson<GoldenCase[]>("out/cases.json");
}
