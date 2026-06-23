/**
 * RecentAuthGate — pre-flight UX for actions that require fresh recent-auth.
 *
 * Wraps any TOTP-mutating UI (the enrolment wizard, the disable flow, the
 * regenerate flow). Reads `recentAuthFresh` from /status. If true, renders
 * children. If false, renders the "Re-verify your identity" prompt that
 * triggers a magic-link round-trip via `triggerRecentAuthFlow()`.
 *
 * ## Why this is a gate, not a redirect
 *
 * The user's explicit Q&A requirement during the TOTP design review (April
 * 2026): "never bounce a user with a generic 401 mid-form — always
 * pre-flight and explain." A redirect here would lose any unsaved state
 * (e.g. typing a 6-digit code that just barely failed recent-auth on
 * submit). A gate keeps the user's context: they see the same page, just
 * with the re-auth UI instead of the action UI, and after the round-trip
 * they land back on the same URL.
 *
 * ## States rendered
 *
 *   1. Loading — initial fetch in flight.       → small skeleton card.
 *   2. Error: session_expired                   → redirect to /login (in useEffect).
 *   3. Error: network                           → inline retry button + error message.
 *   4. Status fetched, recentAuthFresh = true   → children rendered as-is.
 *   5. Status fetched, recentAuthFresh = false  → re-verify card with email button.
 *   6. Email sent (request-link succeeded)      → "Check your email" card.
 *   7. Email send failed                        → re-verify card with inline error.
 *
 * ## Why we ALSO call refetch() on visibility change
 *
 * After the user clicks the magic link in their email, /auth/callback runs
 * in a different tab. When they come back to this tab, we want to re-check
 * the recent-auth state immediately so the gate flips open without a
 * manual refresh. Listening to `visibilitychange` covers the common
 * desktop case (Cmd-Tab, alt-tab). Mobile is more complex — Safari/Chrome
 * may not always fire visibilitychange when returning from email — so the
 * gate also offers an explicit "I clicked the link" button as a manual
 * fallback. Both work; one is faster.
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRecentAuth } from "@/hooks/useRecentAuth";
import { triggerRecentAuthFlow } from "@/lib/recent-auth-flow";
import {
  buildReauthUrl,
  REAUTH_REQUIRED_TITLE,
  REAUTH_REQUIRED_BODY,
  REAUTH_REQUIRED_CTA,
} from "@/lib/reauth";

export interface RecentAuthGateProps {
  /** The signed-in account's email. The page reads it from /api/auth/me. */
  email: string;
  /**
   * The path to come back to after the user clicks the magic link. Stored in
   * the mmpm_redirect cookie. Allow-list checked by recent-auth-flow.
   */
  next: string;
  /**
   * How to re-verify when the recent-auth window has lapsed.
   *
   *   "email"  (default) — send a magic-link email and wait for the
   *                        cross-tab clickthrough. Used by the TOTP gates.
   *   "reauth"          — mirror the rotate-key pattern: render a "Sign in
   *                        again" panel whose CTA bounces to /login
   *                        (`buildReauthUrl`), where the user re-affirms with
   *                        an identity provider (GitHub OAuth, which stamps a
   *                        fresh recent-auth window) and is returned here. No
   *                        magic-link email is sent. Used by the audit page.
   */
  staleVariant?: "email" | "reauth";
  /** What to render once recent-auth is fresh. */
  children: React.ReactNode;
}

export function RecentAuthGate({
  email,
  next,
  staleVariant = "email",
  children,
}: RecentAuthGateProps) {
  const router = useRouter();
  const { status, loading, error, refetch } = useRecentAuth();
  const [emailSent, setEmailSent] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Re-check recent-auth when the tab regains focus, so a magic-link round-
  // trip in another tab unblocks the gate without a manual refresh.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") {
        void refetch();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refetch]);

  // Session-expired surfaces from the hook as error='session_expired' — that's
  // a real auth failure, not a recent-auth failure. Send the user to /login.
  useEffect(() => {
    if (error === "session_expired") router.replace("/login?error=session_expired");
  }, [error, router]);

  async function handleSendEmail() {
    setSending(true);
    setSendError(null);
    const result = await triggerRecentAuthFlow({ email, next });
    setSending(false);
    if (result.ok) {
      setEmailSent(true);
    } else {
      setSendError(result.errorMessage ?? "Could not send the email. Try again.");
    }
  }

  // ─── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        data-testid="recent-auth-gate-loading"
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
      >
        <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
        <div className="mt-3 h-3 w-72 animate-pulse rounded bg-white/5" />
      </div>
    );
  }

  // ─── Error: network ────────────────────────────────────────────────────────
  if (error === "network") {
    return (
      <div
        data-testid="recent-auth-gate-error"
        role="alert"
        className="rounded-2xl border border-red-500/30 bg-red-500/[0.05] p-5 sm:p-6"
      >
        <h2 className="font-semibold text-white">Could not check your security state</h2>
        <p className="mt-1 text-sm text-white/60">
          We couldn&apos;t reach the server. Check your connection and try again.
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          data-testid="recent-auth-gate-retry"
          className="mt-3 inline-flex items-center rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/[0.08]"
        >
          Try again
        </button>
      </div>
    );
  }

  // ─── Status fetched and fresh — render children ────────────────────────────
  if (status?.recentAuthFresh) {
    return <>{children}</>;
  }

  // ─── Stale + reauth variant — rotate-key-style "sign in again" panel ────────
  // Mirrors AdminClient's rotate-key reauth panel: an identity-provider
  // re-verify (no magic-link email). The CTA bounces to /login with a redirect
  // back to this page; the user re-affirms with GitHub OAuth (which stamps a
  // fresh recent-auth window), lands back here, and the gate flips open.
  if (staleVariant === "reauth") {
    return (
      <div
        data-testid="recent-auth-gate-reauth"
        role="alert"
        className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] p-5 sm:p-6"
      >
        <h2 className="font-semibold text-amber-200">{REAUTH_REQUIRED_TITLE}</h2>
        <p className="mt-1 text-sm text-amber-100/80">{REAUTH_REQUIRED_BODY}</p>
        <a
          href={buildReauthUrl()}
          data-testid="recent-auth-gate-reauth-cta"
          className="mt-4 inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
        >
          {REAUTH_REQUIRED_CTA}
        </a>
      </div>
    );
  }

  // ─── Email already sent — "check your email" card ──────────────────────────
  if (emailSent) {
    return (
      <div
        data-testid="recent-auth-gate-email-sent"
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
      >
        <h2 className="font-semibold text-white">Check your email</h2>
        <p className="mt-1 text-sm break-all text-white/60">
          We sent a sign-in link to <span className="text-white/80">{email}</span>. Click it to
          re-verify your identity, then come back to this tab — your two-factor settings will unlock
          automatically.
        </p>
        <p className="mt-3 text-xs text-white/40">
          Didn&apos;t receive it after a minute? Check spam, or{" "}
          <button
            type="button"
            onClick={() => void handleSendEmail()}
            data-testid="recent-auth-gate-resend"
            disabled={sending}
            className="text-white/80 underline transition-colors hover:text-white disabled:opacity-50"
          >
            resend
          </button>
          .
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          data-testid="recent-auth-gate-recheck"
          className="mt-4 inline-flex items-center rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/[0.08]"
        >
          I clicked the link
        </button>
      </div>
    );
  }

  // ─── Default: stale recent-auth — offer to send the magic-link email ───────
  return (
    <div
      data-testid="recent-auth-gate-stale"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
    >
      <h2 className="font-semibold text-white">Re-verify your identity to continue</h2>
      <p className="mt-1 text-sm text-white/60">
        For your security, two-factor authentication settings can only be changed within 5 minutes
        of signing in. Send yourself a sign-in link to{" "}
        <span className="break-all text-white/80">{email}</span> to re-verify.
      </p>
      {sendError && (
        <p
          data-testid="recent-auth-gate-error-message"
          role="alert"
          className="mt-3 text-sm text-red-300"
        >
          {sendError}
        </p>
      )}
      <button
        type="button"
        onClick={() => void handleSendEmail()}
        disabled={sending}
        data-testid="recent-auth-gate-send-email"
        className="mt-4 inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </div>
  );
}
