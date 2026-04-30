/**
 * TwoFactorChallengeClient — login-time 2FA prompt.
 *
 * Lives inside the magic-link login flow:
 *
 *   1. User clicks magic link → /auth/callback
 *   2. Compute returns { requiresFactor: 'totp', pendingToken } (Sprint 5 fork)
 *   3. /auth/callback sets the mmpm_pending_token httpOnly cookie + redirects here
 *   4. This page POSTs the user's 6-digit (or backup) code to
 *      /api/auth/factors/totp/login-verify
 *   5. That route reads the pending-token cookie server-side, forwards to
 *      compute, and on success sets mmpm_session + clears mmpm_pending_token
 *   6. We redirect to mmpm_redirect (or /admin)
 *
 * ## Why we don't reuse RecentAuthGate or the wizard's TwoFactorClient
 *
 * Both of those are session-required components — they live behind
 * `requireSession` in production usage. This page is the one place in
 * the app where the user is mid-login and HAS NO SESSION. The pending
 * token is the only auth. Reusing the wizard would require teaching it
 * about the no-session case; reusing the gate would require teaching it
 * to NOT redirect to /login when there's no session, which is exactly
 * the opposite of what the gate exists to do. Cleaner to have a
 * dedicated component for this surface.
 *
 * ## Two input modes
 *
 * - 6-digit TOTP — default. SixDigitInput handles the UX.
 * - Backup code — toggle. Plain text input accepting xxxx-xxxx.
 *
 * Both POST to the same endpoint; compute disambiguates at the wire.
 *
 * ## Error surfaces
 *
 * - 400 totp_invalid_input → inline error, retry from same step.
 * - 401 totp_invalid → inline error with "X attempts remaining" — defends
 *   against the user not realising their code already advanced.
 * - 429 totp_locked → big card with the countdown + "request a new sign-in
 *   link" CTA. The pending row is locked for 15 min and the only way out
 *   is a fresh magic link.
 * - 401 pending_token_invalid_or_expired → redirect to /login with a
 *   stable error code. The cookie is cleared by the server-side route.
 */

"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { SixDigitInput } from "@/components/SixDigitInput";

interface ApiError {
  code: string;
  message?: string;
  attemptsRemaining?: number;
  lockedUntil?: string;
}

type Mode = "totp" | "backup";

/** Read mmpm_redirect cookie from document.cookie (it's not httpOnly). */
function readRedirectCookie(): string {
  if (typeof document === "undefined") return "/admin";
  const match = document.cookie.match(/(?:^|;\s*)mmpm_redirect=([^;]+)/);
  if (!match) return "/admin";
  try {
    const decoded = decodeURIComponent(match[1]);
    // Only honour relative paths starting with single `/` to prevent
    // open-redirect via `//evil.com`. Same logic /auth/callback applies.
    if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
  } catch {
    /* fall through */
  }
  return "/admin";
}

export default function TwoFactorChallengeClient() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("totp");
  const [totpCode, setTotpCode] = useState<string>("");
  const [backupCode, setBackupCode] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<ApiError | null>(null);

  const submitCode = useCallback(
    async (code: string) => {
      if (submitting) return;
      setSubmitting(true);
      setError(null);
      let res: Response;
      try {
        res = await fetch("/api/auth/factors/totp/login-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: code.trim() }),
          credentials: "same-origin",
        });
      } catch {
        setSubmitting(false);
        setError({ code: "network", message: "Could not reach the server. Try again." });
        return;
      }

      if (res.ok) {
        // Session cookie is now set. Redirect to wherever the user was heading.
        const next = readRedirectCookie();
        // Hard navigation rather than router.push so the new request carries
        // the freshly-set httpOnly cookie. (Client-side routing would still
        // include it, but a server-rendered destination like /admin reads
        // the cookie at SSR time, which a router.push won't trigger.)
        window.location.assign(next);
        return;
      }

      // Failure path — parse error envelope.
      let body: { error?: ApiError } = {};
      try {
        body = (await res.json()) as { error?: ApiError };
      } catch {
        /* ignore */
      }
      setSubmitting(false);

      const err: ApiError = body.error ?? { code: "unknown", message: "Something went wrong." };

      if (err.code === "pending_token_invalid_or_expired") {
        // Cookie is gone (cleared server-side). Send the user back to /login.
        router.replace("/login?error=pending_expired");
        return;
      }

      // Clear the input so the user can retry without backspacing.
      if (mode === "totp") setTotpCode("");
      else setBackupCode("");
      setError(err);
    },
    [mode, router, submitting],
  );

  // ─── Lockout state — separate render to make the countdown obvious ──────
  if (error?.code === "totp_locked") {
    return (
      <ChallengeShell>
        <div
          data-testid="two-factor-challenge-locked"
          role="alert"
          className="rounded-2xl border border-red-500/30 bg-red-500/[0.05] p-5 sm:p-6"
        >
          <h2 className="font-semibold text-white">Too many incorrect codes</h2>
          <p className="mt-1 text-sm text-white/70">
            For your security, this sign-in attempt is locked
            {error.lockedUntil ? (
              <>
                {" until "}
                <span className="text-white">
                  {new Date(error.lockedUntil).toLocaleTimeString()}
                </span>
                .
              </>
            ) : (
              "."
            )}{" "}
            Request a fresh sign-in link to start over.
          </p>
          <Link
            href="/login"
            data-testid="two-factor-challenge-back-to-login"
            className="mt-4 inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
          >
            Request a new sign-in link
          </Link>
        </div>
      </ChallengeShell>
    );
  }

  return (
    <ChallengeShell>
      <div
        data-testid="two-factor-challenge"
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
      >
        <h2 className="font-semibold text-white">Two-factor authentication</h2>
        <p className="mt-1 text-sm text-white/60">
          {mode === "totp"
            ? "Enter the 6-digit code from your authenticator app to finish signing in."
            : "Enter one of your backup codes (xxxx-xxxx). Each works once."}
        </p>

        <div className="mt-5">
          {mode === "totp" ? (
            <SixDigitInput
              value={totpCode}
              onChange={setTotpCode}
              onComplete={(full) => void submitCode(full)}
              disabled={submitting}
              describedBy={error ? "two-factor-challenge-error" : undefined}
            />
          ) : (
            <input
              type="text"
              value={backupCode}
              onChange={(e) => setBackupCode(e.target.value)}
              placeholder="xxxx-xxxx"
              disabled={submitting}
              autoComplete="one-time-code"
              data-testid="two-factor-challenge-backup-input"
              aria-describedby={error ? "two-factor-challenge-error" : undefined}
              className="w-full max-w-xs rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-base text-white transition-colors outline-none focus:border-white/30 focus:bg-white/[0.06] disabled:opacity-50"
            />
          )}
        </div>

        {error && error.code !== "totp_locked" && (
          <p
            id="two-factor-challenge-error"
            data-testid="two-factor-challenge-error"
            role="alert"
            className="mt-3 text-sm text-red-300"
          >
            {friendlyError(error)}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {mode === "backup" && (
            <button
              type="button"
              onClick={() => void submitCode(backupCode)}
              disabled={submitting || backupCode.trim().length === 0}
              data-testid="two-factor-challenge-submit"
              className="inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Verifying…" : "Sign in"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "totp" ? "backup" : "totp"));
              setError(null);
              setTotpCode("");
              setBackupCode("");
            }}
            disabled={submitting}
            data-testid="two-factor-challenge-toggle-mode"
            className="text-sm text-white/60 underline transition-colors hover:text-white/90 disabled:opacity-50"
          >
            {mode === "totp" ? "Use a backup code instead" : "Use my authenticator app instead"}
          </button>
        </div>
      </div>
    </ChallengeShell>
  );
}

/** Convert an API error code into a user-facing message. */
function friendlyError(err: ApiError): string {
  switch (err.code) {
    case "totp_invalid":
      return err.attemptsRemaining !== undefined
        ? `That code didn't match. ${err.attemptsRemaining} attempt${
            err.attemptsRemaining === 1 ? "" : "s"
          } remaining.`
        : "That code didn't match. Try the next one your authenticator shows.";
    case "totp_invalid_input":
      return "Enter the full code from your authenticator app or a backup code.";
    case "network":
    case "network_error":
      return err.message ?? "Could not reach the server. Try again.";
    case "upstream_invalid_response":
      return "The server returned an unexpected response. Try again or request a new sign-in link.";
    default:
      return err.message ?? "Something went wrong. Try again.";
  }
}

/** Shared layout shell — keeps the visual chrome consistent across states. */
function ChallengeShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#030712] text-white">
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6 sm:py-20">
        <h1 className="mb-6 text-center font-[family-name:var(--font-syne)] text-2xl font-semibold text-white">
          Parametric Memory
        </h1>
        {children}
      </div>
    </div>
  );
}
