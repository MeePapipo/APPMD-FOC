/**
 * Shared types for the FOC calculation engine — a pure, dependency-free port
 * of ~/foc-excel's driver-based model (see verify.mjs's modelMixed()).
 */

export type SysCode = "6800" | "5800" | "4800";
export type BatchSysCode = "6800" | "5800"; // the two systems with a batch/TPB concept
export type CalcDriver = "BATCH" | "TEST";

export interface AssayLite {
  system: SysCode;
  code: string;
  description?: string;
  materialNo: string;
  dkshCode?: string | null;
  /** null for cobas 4800 (no batch concept). Assays sharing a batchRow merge into one run line (e.g. SARS192+SARS480). */
  batchRow: number | null;
  batchLabel?: string | null;
  packSize: number;
  price: number | null;
}

export interface ItemLite {
  system: SysCode;
  materialNo: string;
  /** Distributor's order code — display only, never used in the maths. */
  dkshCode?: string | null;
  description: string;
  category?: string | null;
  usageType?: string | null;
  unitText?: string | null;
  driver: CalcDriver;
  /** null = every assay code on this item's system (BATCH_ALL/TEST_ALL). [] = none (used with onDemand). */
  appliesTo: string[] | null;
  consumption: number;
  coverage: number;
  packSize: number;
  price: number | null;
  onDemand: boolean;
  optional: boolean;
  /** cobas 4800 only: per-assay-code rate, derived from the master file's own formula (see engine4800.ts). */
  weights?: Record<string, number> | null;
}

export type TestVector = Record<string, number>;
export type TestsBySystem = Partial<Record<SysCode, TestVector>>;

export interface ComputeOptions {
  /** materialNo -> ticked, for optional items. Missing/false = not ticked (excluded from value). */
  optionalTicked?: Record<string, boolean>;
}

export interface RowResult {
  /** Driver-computed quantity (0 for onDemand items — there is nothing to derive; see engine.ts). */
  qty: number;
  /** qty × price, or 0 if unpriced / optional-and-unticked / onDemand. */
  value: number;
  /**
   * Every system whose own row for this materialNo contributed units before
   * sku.ts combined them into this one. On the holder row of a shared SKU this
   * is the full set (e.g. ["6800", "5800"]); elsewhere it is just the item's
   * own system. Persisted to SubmissionLine.systems so the summary document can
   * say which instruments an order line covers.
   */
  systems: SysCode[];
}

export interface ComputeResult {
  /** Main reagent kits, combined across 6800/5800 before rounding. */
  reagents: ReagentResult[];
  /** Parallel to the `items` array passed into computeSubmission. */
  rows: RowResult[];
  /** batchRow -> run count, per batch-capable system (6800/5800 only). */
  runs: Record<BatchSysCode, Map<number, number>>;
  revenue: number;
  focValue: number;
  focPct: number;
}

export interface ReagentResult {
  code: string;
  description: string;
  /** Carried through from the assay so the summary document (and SubmissionReagent) can show it without a second lookup. */
  materialNo: string;
  dkshCode: string | null;
  systems: SysCode[];
  tests: number;
  packSize: number;
  qty: number;
  unitPrice: number | null;
  value: number;
}
