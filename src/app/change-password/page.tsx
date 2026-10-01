import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

/** Outside the (app) group on purpose: an account on a temporary password is sent here and cannot reach the rest until it picks its own. */
export default async function ChangePasswordPage() {
  const user = await requireUser();
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true, mustChangePassword: true } });
  // SSO users have no password to change.
  if (!account?.passwordHash) redirect("/calculator");
  const forced = account.mustChangePassword;

  return (
    <AuthShell
      title={forced ? "Choose a new password" : "Change password"}
      subtitle={forced ? "You are signed in with a temporary password from an administrator. Enter it below, then pick your own." : undefined}
      footer={
        forced ? undefined : (
          <p>
            <Link href="/calculator" className="font-medium text-brand hover:underline">Back to the app</Link>
          </p>
        )
      }
    >
      <ChangePasswordForm />
    </AuthShell>
  );
}
