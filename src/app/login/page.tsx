import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { SignInButtons } from "@/components/SignInButtons";
import { getSessionUser } from "@/lib/session";
import { entraConfigured } from "@/auth";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/calculator");

  return (
    <AuthShell
      title="Sign in"
      subtitle="Access is restricted to authorized Roche accounts."
      footer={<p>Reagent &amp; free-of-charge shipment calculator for cobas x800 system</p>}
    >
      <SignInButtons devAuth={process.env.DEV_AUTH === "true"} entraConfigured={entraConfigured} />
    </AuthShell>
  );
}
