import type { BatchSysCode } from "./types";

export interface TpbValueInput {
  system: BatchSysCode;
  code: string;
  tpb: number;
}

export interface TpbTableInput {
  floors: Record<BatchSysCode, number>;
  values: TpbValueInput[];
}

export interface TpbTable {
  floors: Record<BatchSysCode, number>;
  get(system: BatchSysCode, code: string): number | undefined;
}

export function buildTpbTable(input: TpbTableInput): TpbTable {
  const map = new Map<string, number>();
  for (const v of input.values) map.set(`${v.system}|${v.code}`, v.tpb);
  return {
    floors: input.floors,
    get(system, code) {
      return map.get(`${system}|${code}`);
    },
  };
}

/** Real observed TPB for (system, code), falling back to the system's floor when there's no usage data. */
export function tpbOf(table: TpbTable, system: BatchSysCode, code: string): number {
  return table.get(system, code) ?? table.floors[system];
}
