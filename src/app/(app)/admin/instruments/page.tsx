import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AdminInstrumentsTable } from "@/components/admin/AdminInstrumentsTable";

export default async function AdminInstrumentsPage() {
  await requireAdmin();

  const [instruments, accounts] = await Promise.all([
    prisma.instrument.findMany({
      orderBy: [{ serial: "asc" }, { systemClass: "asc" }],
      select: {
        id: true,
        serial: true,
        systemClass: true,
        labName: true,
        account: { select: { id: true, accountNumber: true, accountName: true } },
        usage: { distinct: ["month"], select: { month: true } },
      },
    }),
    prisma.account.findMany({ orderBy: { accountName: "asc" }, select: { id: true, accountNumber: true, accountName: true } }),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-ink">Instruments</h1>
      <p className="mb-6 max-w-3xl text-sm text-muted">
        Which account each analyser belongs to. Usage from eLP is tied to the serial number and system class
        (the same serial can exist on two classes), and each account&apos;s own TPB is built from the instruments linked here.
        Re-link an instrument when it moves to another account; an unlinked one is left out of every account&apos;s TPB.
      </p>
      <AdminInstrumentsTable
        instruments={instruments.map((i) => ({ ...i, months: i.usage.map((u) => u.month).sort() }))}
        accounts={accounts}
      />
    </div>
  );
}
