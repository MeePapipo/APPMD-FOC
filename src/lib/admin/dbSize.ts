import { prisma } from "@/lib/prisma";

/** The Neon free plan's storage allowance; the line in Admin -> Settings is measured against it. */
export const STORAGE_LIMIT_MB = 500;
export const STORAGE_WARN_PCT = 60;

export type DbSize = { databaseMb: number; focActualMb: number; focActualRows: number; pct: number; warn: boolean };

/** How full the database is, and how much of it the FOC actuals take. */
export async function loadDbSize(): Promise<DbSize> {
  const [row] = await prisma.$queryRaw<{ db: bigint; foc: bigint; rows: bigint }[]>`
    select pg_database_size(current_database()) as db,
           pg_total_relation_size('"FocActual"') as foc,
           (select count(*) from "FocActual") as rows`;
  const databaseMb = Number(row.db) / 1e6;
  const pct = (databaseMb / STORAGE_LIMIT_MB) * 100;
  return { databaseMb, focActualMb: Number(row.foc) / 1e6, focActualRows: Number(row.rows), pct, warn: pct >= STORAGE_WARN_PCT };
}
