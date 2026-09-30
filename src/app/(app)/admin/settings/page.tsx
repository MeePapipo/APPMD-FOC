import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { DEFAULT_ALERT } from "@/lib/dashboard/entitlement";
import { AdminSettingsForm } from "@/components/admin/AdminSettingsForm";
import { loadAllowedProductLines } from "@/lib/dashboard/importSettings";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const [alert, tpb, productLines] = await Promise.all([
    prisma.alertSettings.findUnique({ where: { id: "singleton" } }),
    prisma.tpbSettings.findUnique({ where: { id: "singleton" } }),
    loadAllowedProductLines(),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-ink">Settings</h1>
      <p className="mb-6 text-sm text-muted">
        Rules that decide when a give-away counts as over quota and how an account&apos;s own
        tests-per-run (TPB) is used in place of the national figure. Changes apply to the next
        calculation and the next Dashboard load; saved orders keep the TPB they were calculated with.
      </p>
      <AdminSettingsForm
        initial={{
          overPct6800: alert?.overPct6800 ?? DEFAULT_ALERT.overPct6800,
          netOverPct: alert?.netOverPct ?? DEFAULT_ALERT.netOverPct,
          netMinExcess: alert?.netMinExcess ?? DEFAULT_ALERT.netMinExcess,
          focStandaloneMin: alert?.focStandaloneMin ?? DEFAULT_ALERT.focStandaloneMin,
          overPct5800: alert?.overPct5800 ?? DEFAULT_ALERT.overPct5800,
          minOverUnits: alert?.minOverUnits ?? DEFAULT_ALERT.minOverUnits,
          floorPct: Math.round((tpb?.accountFloorRatio ?? 0.5) * 100),
          minRuns: tpb?.accountMinRuns ?? 8,
          windowMonths: tpb?.accountWindowMonths ?? 4,
          productLines: productLines.join(", "),
        }}
      />
    </div>
  );
}
