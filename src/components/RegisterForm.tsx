"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui";
import { PASSWORD_HINT } from "@/lib/passwordPolicy";
import { PasswordInput } from "@/components/PasswordInput";

const TEAM_OPTIONS = [
  { value: "NORTH", label: "North Team" },
  { value: "SOUTH", label: "South Team" },
  { value: "PRIVATE", label: "Private Team" },
  { value: "BUSINESS_PARTNER", label: "Business Partner Team" },
] as const;

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [team, setTeam] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, team, password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        // Zod's per-field issues are more useful than the generic "Invalid
        // request" wrapper message — surface the first one when present
        // (e.g. "Password must include an uppercase letter.").
        const detail = body.details?.[0]?.message as string | undefined;
        throw new Error(detail ?? body.error ?? "Registration failed. Please try again.");
      }

      // Usable immediately — sign the new rep straight in, no approval gate.
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/calculator",
      });
      if (result?.error) {
        throw new Error("Account created, but sign-in failed. Please sign in manually.");
      }
      router.push("/calculator");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Registration failed. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <div>
        <label htmlFor="register-name" className="mb-1 block text-xs font-medium text-muted">
          Name
        </label>
        <input
          id="register-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="register-email" className="mb-1 block text-xs font-medium text-muted">
          Email
        </label>
        <input
          id="register-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@roche.com"
          className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="register-team" className="mb-1 block text-xs font-medium text-muted">
          Team
        </label>
        <select
          id="register-team"
          required
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus:outline-brand"
        >
          <option value="" disabled>
            Select team...
          </option>
          {TEAM_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="register-password" className="mb-1 block text-xs font-medium text-muted">
          Password
        </label>
        <PasswordInput
          id="register-password"
          required
          minLength={8}
          pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,}"
          title={PASSWORD_HINT}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <p className="mt-1 text-xs text-muted">{PASSWORD_HINT}</p>
      </div>

      <div>
        <label htmlFor="register-confirm" className="mb-1 block text-xs font-medium text-muted">
          Confirm password
        </label>
        <PasswordInput
          id="register-confirm"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
