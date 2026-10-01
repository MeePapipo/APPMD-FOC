import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { timed } from "@/lib/perf";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await timed("layout: session", () => requireUser());
  const account = await timed("layout: user row", () => prisma.user.findUnique({ where: { id: user.id }, select: { mustChangePassword: true, passwordHash: true } }));
  // An admin-issued temporary password must be replaced before anything else is usable.
  if (account?.mustChangePassword) redirect("/change-password");
  return (
    <>
      <AppNav user={{ name: user.name, email: user.email, role: user.role, canChangePassword: !!account?.passwordHash }} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
