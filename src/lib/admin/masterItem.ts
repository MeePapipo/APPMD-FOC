import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SYSTEM_LABELS, parseSystemLabel, type MasterSystem } from "./systemLabels";

export const masterItemRowSchema = z
  .object({
    system: z.enum(["S6800", "S5800", "S4800"]),
    materialNo: z.string().trim().min(1).max(64),
    description: z.string().trim().min(1).max(300),
    dkshCode: z.string().trim().max(64).nullable(),
    group: z.string().trim().min(1).max(60),
    category: z.string().trim().max(120).nullable(),
    usageType: z.string().trim().max(120).nullable(),
    usageGroup: z.string().trim().max(120).nullable(),
    packText: z.string().trim().max(120).nullable(),
    unitText: z.string().trim().max(120).nullable(),
    priceText: z.string().trim().max(120).nullable(),
    optional: z.boolean(),
    onDemand: z.boolean(),
    packSize: z.number().int().positive(),
    consumption: z.number(),
    coverage: z.number().positive(),
    price: z.number().nonnegative().nullable(),
    driver: z.enum(["BATCH", "TEST"]),
    appliesToAll: z.boolean(),
    appliesTo: z.array(z.string().trim().min(1)),
    weights: z.record(z.string(), z.number()).nullable(),
    active: z.boolean(),
  })
  .refine((v) => !v.appliesToAll || v.appliesTo.length === 0, {
    message: "appliesToAll and a non-empty appliesTo list are mutually exclusive",
    path: ["appliesTo"],
  })
  .refine((v) => v.system !== "S4800" || v.onDemand || (v.weights && Object.keys(v.weights).length > 0), {
    message: "cobas 4800 items need at least one assay weight unless marked on-demand",
    path: ["weights"],
  });
export type MasterItemRowInput = z.infer<typeof masterItemRowSchema>;

export const MASTER_ITEM_CSV_COLUMNS = [
  "system",
  "materialNo",
  "description",
  "dkshCode",
  "group",
  "category",
  "usageType",
  "usageGroup",
  "packText",
  "unitText",
  "priceText",
  "optional",
  "onDemand",
  "packSize",
  "consumption",
  "coverage",
  "price",
  "driver",
  "appliesToAll",
  "appliesTo",
  "weights",
  "active",
] as const;

/** `appliesTo` is a semicolon-joined code list; `weights` is a semicolon-
 * joined `code:rate` list — both plain-text-editable in Excel without
 * needing to understand JSON. */
export function masterItemToCsvRow(i: {
  system: MasterSystem;
  materialNo: string;
  description: string;
  dkshCode: string | null;
  group: string;
  category: string | null;
  usageType: string | null;
  usageGroup: string | null;
  packText: string | null;
  unitText: string | null;
  priceText: string | null;
  optional: boolean;
  onDemand: boolean;
  packSize: number;
  consumption: number;
  coverage: number;
  price: number | null;
  driver: "BATCH" | "TEST";
  appliesToAll: boolean;
  appliesTo: string[];
  weights: Record<string, number> | null;
  active: boolean;
}): string[] {
  return [
    SYSTEM_LABELS[i.system],
    i.materialNo,
    i.description,
    i.dkshCode ?? "",
    i.group,
    i.category ?? "",
    i.usageType ?? "",
    i.usageGroup ?? "",
    i.packText ?? "",
    i.unitText ?? "",
    i.priceText ?? "",
    i.optional ? "true" : "false",
    i.onDemand ? "true" : "false",
    i.packSize.toString(),
    i.consumption.toString(),
    i.coverage.toString(),
    i.price?.toString() ?? "",
    i.driver,
    i.appliesToAll ? "true" : "false",
    i.appliesTo.join(";"),
    i.weights ? Object.entries(i.weights).map(([k, v]) => `${k}:${v}`).join(";") : "",
    i.active ? "true" : "false",
  ];
}

const strOrNull = (s: string | undefined) => (s === undefined || s.trim() === "" ? null : s.trim());
const boolOf = (s: string | undefined) => /^(true|1|yes)$/i.test((s ?? "").trim());

export function csvRecordToMasterItemInput(record: Record<string, string>): unknown {
  const system = record.system ? parseSystemLabel(record.system) : null;
  const appliesTo = (record.appliesTo ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const weightsText = (record.weights ?? "").trim();
  const weights = weightsText
    ? Object.fromEntries(
        weightsText
          .split(";")
          .map((pair) => pair.split(":").map((s) => s.trim()))
          .filter(([code, rate]) => code && rate !== undefined && rate !== "")
          .map(([code, rate]) => [code, Number(rate)]),
      )
    : null;

  return {
    system,
    materialNo: record.materialNo?.trim(),
    description: record.description?.trim(),
    dkshCode: strOrNull(record.dkshCode),
    group: record.group?.trim(),
    category: strOrNull(record.category),
    usageType: strOrNull(record.usageType),
    usageGroup: strOrNull(record.usageGroup),
    packText: strOrNull(record.packText),
    unitText: strOrNull(record.unitText),
    priceText: strOrNull(record.priceText),
    optional: boolOf(record.optional),
    onDemand: boolOf(record.onDemand),
    packSize: Number(record.packSize),
    consumption: Number(record.consumption),
    coverage: Number(record.coverage),
    price: record.price && record.price.trim() !== "" ? Number(record.price) : null,
    driver: record.driver?.trim().toUpperCase(),
    appliesToAll: boolOf(record.appliesToAll),
    appliesTo,
    weights,
    active: !/^(false|0|no)$/i.test((record.active ?? "true").trim()),
  };
}

export async function upsertMasterItemRow(data: MasterItemRowInput, actorEmail: string) {
  const before = await prisma.masterItem.findUnique({
    where: { system_materialNo: { system: data.system, materialNo: data.materialNo } },
  });
  const { weights, ...rest } = data;
  const writeData = { ...rest, weights: weights ?? Prisma.JsonNull };
  const after = before
    ? await prisma.masterItem.update({ where: { id: before.id }, data: writeData })
    : await prisma.masterItem.create({ data: writeData });

  await prisma.auditLog.create({
    data: {
      userEmail: actorEmail,
      action: before ? "update" : "create",
      entity: "MasterItem",
      entityId: after.id,
      before: before ? JSON.parse(JSON.stringify(before)) : null,
      after: JSON.parse(JSON.stringify(after)),
    },
  });

  return { status: before ? ("updated" as const) : ("created" as const), row: after };
}
