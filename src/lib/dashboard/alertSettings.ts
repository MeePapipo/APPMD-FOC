import { prisma } from "@/lib/prisma";
import { DEFAULT_ALERT, type AlertThresholds } from "./entitlement";

/** The admin-set alert thresholds, or the defaults before anyone has saved them. */
export async function loadAlertThresholds(): Promise<AlertThresholds> {
  const row = await prisma.alertSettings.findUnique({ where: { id: "singleton" } });
  return row
    ? {
        overPct6800: row.overPct6800, overPct5800: row.overPct5800, minOverUnits: row.minOverUnits,
        netOverPct: row.netOverPct, netMinExcess: row.netMinExcess, focStandaloneMin: row.focStandaloneMin,
      }
    : DEFAULT_ALERT;
}
