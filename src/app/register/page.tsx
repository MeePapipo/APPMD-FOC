import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { RegisterForm } from "@/components/RegisterForm";
import { getSessionUser } from "@/lib/session";

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect("/calculator");

  return (
    <AuthShell
      title="Create your account"
      subtitle="For Roche sales reps using the FOC Calculator."
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
