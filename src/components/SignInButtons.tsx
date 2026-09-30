"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { PasswordInput } from "@/components/PasswordInput";

export function SignInButtons({
  devAuth,
  entraConfigured,
}: {
  devAuth: boolean;
  entraConfigured: boolean;
}) {
  const router = useRouter();
  const [devEmail, setDevEmail] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading("credentials");
    setError(null);
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/calculator",
    });
    setLoading(null);
    if (result?.error) {
      setError("Incorrect email or password.");
      return;
    }
    router.push("/calculator");
  }

  return (
    <div className="flex flex-col gap-4">
      {entraConfigured && (
        <Button
          onClick={() => {
            setLoading("entra");
            void signIn("microsoft-entra-id", { callbackUrl: "/calculator" });
          }}
          disabled={loading !== null}
          className="w-full"
        >
          {loading === "entra" ? "Redirecting…" : "Sign in with Roche account"}
        </Button>
      )}

      <form
        className={cn("flex flex-col gap-2", entraConfigured && "border-t border-line pt-4")}
        onSubmit={submitCredentials}
      >
        <label htmlFor="signin-email" className="text-xs font-medium text-muted">
          Email and password
        </label>
        <input
          id="signin-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@roche.com"
          className="rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <PasswordInput
          id="signin-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}
        <Button
          variant={entraConfigured ? "secondary" : "primary"}
          type="submit"
          disabled={loading !== null}
          className="w-full"
        >
          {loading === "credentials" ? "Signing in…" : "Sign in"}
        </Button>
        <Link href="/register" className="text-center text-xs font-medium text-brand hover:underline">
          New rep? Register here
        </Link>
      </form>

      {devAuth && (
        <form
          className="flex flex-col gap-2 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            setLoading("dev");
            void signIn("dev", { email: devEmail, callbackUrl: "/calculator" });
          }}
        >
          <label className="text-xs font-medium text-muted">Dev login (email only, local testing)</label>
          <input
            type="email"
            required
            value={devEmail}
            onChange={(e) => setDevEmail(e.target.value)}
            placeholder="you@roche.com"
            className="rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
          <Button variant="secondary" type="submit" disabled={loading !== null} className="w-full">
            Continue
          </Button>
        </form>
      )}
    </div>
  );
}
