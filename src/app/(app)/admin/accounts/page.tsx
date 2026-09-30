import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AdminAccountsTable } from "@/components/admin/AdminAccountsTable";

export default async function AdminAccountsPage() {
  await requireAdmin();

  const accounts = await prisma.account.findMany({
    orderBy: { accountName: "asc" },
    select: {
      id: true,
      accountNumber: true,
      accountName: true,
      active: true,
      _count: { select: { submissions: true, annualForecasts: true, quotas: true } },
    },
  });

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-ink">Accounts</h1>
      <p className="mb-6 text-sm text-muted">
        The ship-to accounts reps can pick in the Calculator. Add a new account, correct a name or
        number, or deactivate one to hide it from the picker. An account that already has orders,
        forecasts or quotas can be deactivated but not deleted, and past orders keep the name and
        number they were placed under.
      </p>
      <AdminAccountsTable
        initialAccounts={accounts.map(({ _count, ...a }) => ({
          ...a,
          uses: _count.submissions + _count.annualForecasts + _count.quotas,
        }))}
      />
    </div>
  );
}
