/**
 * TwoFactorStatusCard — security-page card showing TOTP enrolment state.
 *
 * Mounted inside SecurityClient.tsx alongside the existing "Sign-in method"
 * card. Owns its own /status fetch and renders three states:
 *
 *   1. Loading — small skeleton placeholder.
 *   2. Not enrolled — single CTA button → /admin/security/two-factor.
 *   3. Enrolled — status fields (last used, codes remaining) + Manage button
 *      → /admin/security/two-factor (which then routes between disable /
 *      regenerate / view-status sub-screens).
 *
 * ## Why the card hits /status itself
 *
 * The page-level data flow has already loaded enough to render. This card
 * mounts client-side and fetches its own state. Rationale:
 *
 *   - Server-side reading would force the entire /admin/security route to
 *     have `dynamic = 'force-dynamic'` (it's currently static-friendly via
 *     getAccount alone), bumping every page render with a TOTP-status RPC
 *     even when the user isn't looking at this card.
 *   - The wizard navigation on its own page already needs /status, so the
 *     redundant fetch is bounded — only when the card is actually visible.
 *
 * ## State source of truth
 *
 * `useRecentAuth` is the source. The card displays the freshness state
 * inline (a small "Recent auth: 4 min remaining" subtitle) so the user
 * has predictive context before clicking the CTA: if recent-auth is stale,
 * the wizard pages will gate them at the door — better to surface that here
 * than to be surprised later.
 */

"use client";

import Link from "next/link";
import { useRecentAuth } from "@/hooks/useRecentAuth";
import { FormattedDate } from "./FormattedDate";

export interface TwoFactorStatusCardProps {
  /**
   * Optional initial status from the server component. If omitted, the card
   * shows a brief loading skeleton on first paint, then renders.
   */
  initialStatus?: Parameters<typeof useRecentAuth>[0];
}

export function TwoFactorStatusCard({ initialStatus }: TwoFactorStatusCardProps) {
  const { status, loading, error } = useRecentAuth(initialStatus);

  // Skeleton state — matches the height of the populated card so the page
  // doesn't reflow when status arrives.
  if (loading) {
    return (
      <div
        data-testid="two-factor-status-card-loading"
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
      >
        <h2 className="font-semibold text-white">Two-factor authentication</h2>
        <div className="mt-3 h-3 w-48 animate-pulse rounded bg-white/10" />
        <div className="mt-2 h-3 w-72 animate-pulse rounded bg-white/5" />
      </div>
    );
  }

  // Soft-fail on network error — show a button that'll reload the page.
  // The wizard itself (with its own RecentAuthGate) handles errors more
  // robustly; the card is just a top-level summary, so a soft fall-back is
  // fine here.
  if (error || !status) {
    return (
      <div
        data-testid="two-factor-status-card-error"
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
      >
        <h2 className="font-semibold text-white">Two-factor authentication</h2>
        <p className="mt-1 text-sm text-white/50">
          We couldn&apos;t check your two-factor settings just now.
        </p>
        <Link
          href="/admin/security/two-factor"
          data-testid="two-factor-status-card-cta-fallback"
          className="mt-3 inline-flex items-center rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/[0.08]"
        >
          Open settings
        </Link>
      </div>
    );
  }

  // Not enrolled — single CTA.
  if (!status.enrolled) {
    return (
      <div
        data-testid="two-factor-status-card-not-enrolled"
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-white">Two-factor authentication</h2>
            <p className="mt-0.5 text-sm text-white/50">
              Add an extra step at sign-in using an authenticator app like 1Password, Authy, or
              Google Authenticator.
            </p>
          </div>
          <span
            aria-label="Not enabled"
            className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] tracking-wider text-white/50 uppercase"
          >
            Off
          </span>
        </div>
        <Link
          href="/admin/security/two-factor"
          data-testid="two-factor-status-card-enable"
          className="mt-4 inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
        >
          Set up two-factor authentication
        </Link>
      </div>
    );
  }

  // Enrolled — status fields + Manage.
  return (
    <div
      data-testid="two-factor-status-card-enrolled"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-white">Two-factor authentication</h2>
          <p className="mt-0.5 text-sm text-white/50">
            Sign-in is protected by an authenticator app code.
          </p>
        </div>
        <span
          aria-label="Enabled"
          className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] tracking-wider text-emerald-300 uppercase"
        >
          On
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs tracking-wider text-white/40 uppercase">Last used</dt>
          <dd className="mt-0.5 text-white/80" data-testid="two-factor-status-card-last-used">
            {status.lastUsedAt ? <FormattedDate iso={status.lastUsedAt} /> : "Never"}
          </dd>
        </div>
        <div>
          <dt className="text-xs tracking-wider text-white/40 uppercase">Backup codes</dt>
          <dd className="mt-0.5 text-white/80" data-testid="two-factor-status-card-backup-count">
            {status.backupCodesRemaining} of 10 remaining
          </dd>
        </div>
      </dl>

      <Link
        href="/admin/security/two-factor"
        data-testid="two-factor-status-card-manage"
        className="mt-5 inline-flex items-center rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/[0.08]"
      >
        Manage
      </Link>
    </div>
  );
}
