import { requireAdmin } from "@/lib/session";
import { AdminTabs } from "@/components/admin/AdminTabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div>
      <AdminTabs />
      <div className="mt-6">{children}</div>
    </div>
  );
}
