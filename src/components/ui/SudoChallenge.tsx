"use client";

import { useState, useRef, useEffect } from "react";

/**
 * SudoChallenge — reusable TOTP re-verification dialog.
 *
 * Used before any sudo-gated action (rotate_keys, cancel_subscription,
 * delete_account). Prompts for a 6-digit TOTP code, calls POST /api/auth/sudo,
 * and returns the sudoToken on success.
 *
 * Props:
 *   action    — "rotate_keys" | "cancel_subscription" | "delete_account"
 *   title     — dialog heading (e.g. "Confirm Key Rotation")
 *   onSuccess — called with { sudoToken, expiresAt } on successful verification
 *   onCancel  — called when user dismisses without verifying
 */

export type SudoAction =
  | "rotate_keys"
  | "cancel_subscription"
  | "delete_account"
  | "destroy_instance";

interface SudoChallengeProps {
  action: SudoAction;
  title: string;
  onSuccess: (result: { sudoToken: string; expiresAt: string }) => void;
  onCancel: () => void;
}

const ACTION_LABELS: Record<SudoAction, string> = {
  rotate_keys: "rotate your API key",
  cancel_subscription: "access billing",
  delete_account: "delete your account",
  destroy_instance: "destroy this instance",
};

export function SudoChallenge({ action, title, onSuccess, onCancel }: SudoChallengeProps) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/sudo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, totpCode: code }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "invalid_totp_code") {
          setError("Incorrect code. Check your authenticator and try again.");
        } else if (data.error === "totp_not_enrolled") {
          setError("2FA is not set up on this account. Enable it in your authenticator app first.");
        } else if (data.error === "too_many_sudo_tokens") {
          setError("Too many attempts. Wait a moment and try again.");
        } else {
          setError(data.message ?? "Verification failed. Please try again.");
        }
        setCode("");
        inputRef.current?.focus();
        return;
      }

      onSuccess({ sudoToken: data.sudoToken, expiresAt: data.expiresAt });
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-amber-700/40 bg-amber-950/30 p-4">
      <h3 className="text-sm font-medium text-amber-300">{title}</h3>
      <p className="text-xs leading-relaxed text-zinc-400">
        Enter your 6-digit authenticator code to {ACTION_LABELS[action]}.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="\d{6}"
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 font-mono text-lg tracking-[0.3em] text-zinc-200 placeholder:text-zinc-600 focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50 focus:outline-none"
          disabled={submitting}
        />

        {error && (
          <div className="rounded-md border border-red-800/40 bg-red-950/30 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={code.length !== 6 || submitting}
            className="rounded-md border border-amber-600/50 bg-amber-900/30 px-3 py-1.5 text-xs text-amber-300 transition hover:border-amber-500 hover:bg-amber-900/50 disabled:opacity-50"
          >
            {submitting ? "Verifying…" : "Verify"}
          </button>
        </div>
      </form>
    </div>
  );
}
