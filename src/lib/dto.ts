import type { Account, AdditionalFocItem, MasterAssay } from "@prisma/client";
import type { SysCode } from "@/lib/calc/types";
import { SYS_TO_CODE } from "@/lib/calc/service";

export interface AccountDTO {
  id: string;
  accountNumber: string;
  accountName: string;
}

export function toAccountDTO(a: Account): AccountDTO {
  return { id: a.id, accountNumber: a.accountNumber, accountName: a.accountName };
}

/** Assay list the calculator's picker needs — no pricing internals beyond what's shown. */
export interface AssayDTO {
  system: SysCode;
  code: string;
  description: string;
  materialNo: string;
  dkshCode: string | null;
  packSize: number;
  price: number | null;
}

/**
 * A give-away the rep may add at a quantity of their choosing. The price is
 * shown so the rep sees the FOC cost as they pick, but the server re-reads it
 * from the catalogue when the order is submitted.
 */
export interface AdditionalFocDTO {
  materialNo: string;
  dkshCode: string | null;
  description: string;
  packSize: number;
  unitText: string | null;
  price: number | null;
}

export function toAdditionalFocDTO(i: AdditionalFocItem): AdditionalFocDTO {
  return {
    materialNo: i.materialNo,
    dkshCode: i.dkshCode,
    description: i.description,
    packSize: i.packSize,
    unitText: i.unitText,
    price: i.price,
  };
}

export function toAssayDTO(a: MasterAssay): AssayDTO {
  return {
    system: SYS_TO_CODE[a.system],
    code: a.code,
    description: a.description,
    materialNo: a.materialNo,
    dkshCode: a.dkshCode,
    packSize: a.packSize,
    price: a.price,
  };
}
