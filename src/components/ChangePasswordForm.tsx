"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { PASSWORD_HINT } from "@/lib/passwordPolicy";
import { PasswordInput } from "@/components/PasswordInput";

const inputClass = "w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand focus:outline-none";

export function ChangePasswordForm() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const detail = body.details?.[0]?.message as string | undefined;
        throw new Error(detail ?? body.error ?? "Could not change the password. Please try again.");
      }
      router.push("/calculator");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change the password. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <div>
        <label htmlFor="cp-current" className="mb-1 block text-xs font-medium text-muted">Current password</label>
        <PasswordInput id="cp-current" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor="cp-new" className="mb-1 block text-xs font-medium text-muted">New password</label>
        <PasswordInput
          id="cp-new"
          required
          minLength={8}
          pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,}"
          title={PASSWORD_HINT}
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-muted">{PASSWORD_HINT}</p>
      </div>
      <div>
        <label htmlFor="cp-confirm" className="mb-1 block text-xs font-medium text-muted">Confirm new password</label>
        <PasswordInput id="cp-confirm" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
      </div>
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      <Button type="submit" disabled={submitting} className="w-full">{submitting ? "Saving…" : "Change password"}</Button>
    </form>
  );
}
