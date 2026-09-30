import { prisma } from "@/lib/prisma";

export type DataThrough = {
  /** Latest month that has any FOC rows, or null before the first import. */
  latest: { year: number; month: number } | null;
  lastImport: { at: string; by: string } | null;
};

/** How fresh the FOC data is: the latest month loaded and when/who imported last. */
export async function loadDataThrough(): Promise<DataThrough> {
  const [latest, last] = await Promise.all([
    prisma.focActual.findFirst({ orderBy: [{ year: "desc" }, { month: "desc" }], select: { year: true, month: true } }),
    prisma.auditLog.findFirst({ where: { entity: "FocActualImport" }, orderBy: { createdAt: "desc" }, select: { createdAt: true, userEmail: true } }),
  ]);
  return {
    latest,
    lastImport: last ? { at: last.createdAt.toISOString(), by: last.userEmail } : null,
  };
}
