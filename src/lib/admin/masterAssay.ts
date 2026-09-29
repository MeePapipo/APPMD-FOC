import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { SYSTEM_LABELS, parseSystemLabel, type MasterSystem } from "./systemLabels";

export const masterAssayRowSchema = z.object({
  system: z.enum(["S6800", "S5800", "S4800"]),
  code: z.string().trim().min(1).max(64),
  materialNo: z.string().trim().min(1).max(64),
  description: z.string().trim().min(1).max(300),
  dkshCode: z.string().trim().max(64).nullable(),
  batchRow: z.number().int().nullable(),
  batchLabel: z.string().trim().max(120).nullable(),
  packSize: z.number().int().positive(),
  price: z.number().nonnegative().nullable(),
  category: z.string().trim().max(120).nullable(),
  usageType: z.string().trim().max(120).nullable(),
  usageGroup: z.string().trim().max(120).nullable(),
  packText: z.string().trim().max(120).nullable(),
  unitText: z.string().trim().max(120).nullable(),
  active: z.boolean(),
});
export type MasterAssayRowInput = z.infer<typeof masterAssayRowSchema>;

export const MASTER_ASSAY_CSV_COLUMNS = [
  "system",
  "code",
  "materialNo",
  "description",
  "dkshCode",
  "batchRow",
  "batchLabel",
  "packSize",
  "price",
  "category",
  "usageType",
  "usageGroup",
  "packText",
  "unitText",
  "active",
] as const;

export function masterAssayToCsvRow(a: {
  system: MasterSystem;
  code: string;
  materialNo: string;
  description: string;
  dkshCode: string | null;
  batchRow: number | null;
  batchLabel: string | null;
  packSize: number;
  price: number | null;
  category: string | null;
  usageType: string | null;
  usageGroup: string | null;
  packText: string | null;
  unitText: string | null;
  active: boolean;
}): string[] {
  return [
    SYSTEM_LABELS[a.system],
    a.code,
    a.materialNo,
    a.description,
    a.dkshCode ?? "",
    a.batchRow?.toString() ?? "",
    a.batchLabel ?? "",
    a.packSize.toString(),
    a.price?.toString() ?? "",
    a.category ?? "",
    a.usageType ?? "",
    a.usageGroup ?? "",
    a.packText ?? "",
    a.unitText ?? "",
    a.active ? "true" : "false",
  ];
}

const numOrNull = (s: string | undefined) => (s === undefined || s.trim() === "" ? null : Number(s));
const strOrNull = (s: string | undefined) => (s === undefined || s.trim() === "" ? null : s.trim());

/** Converts a raw CSV record (all-string values) into the shape
 * `masterAssayRowSchema` expects — numbers/booleans/nulls, not strings. */
export function csvRecordToMasterAssayInput(record: Record<string, string>): unknown {
  const system = record.system ? parseSystemLabel(record.system) : null;
  return {
    system,
    code: record.code?.trim(),
    materialNo: record.materialNo?.trim(),
    description: record.description?.trim(),
    dkshCode: strOrNull(record.dkshCode),
    batchRow: numOrNull(record.batchRow),
    batchLabel: strOrNull(record.batchLabel),
    packSize: Number(record.packSize),
    price: numOrNull(record.price),
    category: strOrNull(record.category),
    usageType: strOrNull(record.usageType),
    usageGroup: strOrNull(record.usageGroup),
    packText: strOrNull(record.packText),
    unitText: strOrNull(record.unitText),
    active: !/^(false|0|no)$/i.test((record.active ?? "true").trim()),
  };
}

export async function upsertMasterAssayRow(data: MasterAssayRowInput, actorEmail: string) {
  const before = await prisma.masterAssay.findUnique({
    where: { system_code: { system: data.system, code: data.code } },
  });
  const after = before
    ? await prisma.masterAssay.update({ where: { id: before.id }, data })
    : await prisma.masterAssay.create({ data: { ...data, srcRow: 0 } });

  await prisma.auditLog.create({
    data: {
      userEmail: actorEmail,
      action: before ? "update" : "create",
      entity: "MasterAssay",
      entityId: after.id,
      before: before ? JSON.parse(JSON.stringify(before)) : null,
      after: JSON.parse(JSON.stringify(after)),
    },
  });

  return { status: before ? ("updated" as const) : ("created" as const), row: after };
}
