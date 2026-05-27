/**
 * CancelPendingBanner — amber notice that appears on substrate cards whose
 * subscription is cancelling at period end.
 *
 * Sprint 2026-05-18 E2 (D7 + D8 locked decisions):
 *   - Banner shows on first dashboard load each day per substrate.
 *   - Dismissable via × icon; dismissal is persisted in localStorage with
 *     a date-bucketed key so the next calendar day shows it again.
 *   - Reactivate button is in the banner AND on the substrate detail page
 *     (this component owns the banner instance; detail-page is separate).
 *
 * Persistent badge is a sibling component (CancelPendingBadge); both
 * render concurrently when `cancelAt` is set. The dismissal here only
 * hides the banner — the badge stays visible while cancel-pending.
 */

"use client";

import { useEffect, useState } from "react";

interface Props {
  /** Substrate id — used to key the localStorage dismissal flag. */
  substrateId: string;
  /** Human-readable cancel date, e.g. "14 Jun 2026". */
  endsOn: string;
  /** Slug of the substrate being reactivated. */
  slug: string;
  /** Fires after a successful POST /api/substrates/:slug/reactivate. */
  onReactivated: () => void;
}

function todayBucket(): string {
  const d = new Date();
  // YYYY-MM-DD in the user's local tz — same key the dialog's idempotency
  // approach uses for the day bucket. Different calendar day → new banner.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function dismissKey(substrateId: string): string {
  return `mmpm-cancel-banner-dismissed:${substrateId}:${todayBucket()}`;
}

export function CancelPendingBanner({ substrateId, endsOn, slug, onReactivated }: Props) {
  // Default to hidden during SSR so the markup matches before localStorage
  // is read. The effect below flips it on if not dismissed today.
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(dismissKey(substrateId));
      if (!dismissed) setVisible(true);
    } catch {
      // localStorage unavailable (private browsing). Show by default —
      // the banner is non-blocking and the user can still click ×.
      setVisible(true);
    }
  }, [substrateId]);

  function dismiss() {
    try {
      window.localStorage.setItem(dismissKey(substrateId), "1");
    } catch {
      // ignore — see effect above
    }
    setVisible(false);
  }

  async function handleReactivate() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/substrates/${encodeURIComponent(slug)}/reactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        setError(body?.message ?? body?.error ?? `Reactivate failed (HTTP ${res.status}).`);
        setSubmitting(false);
        return;
      }
      // Banner unmounts when parent refreshes substrates and cancelAt
      // becomes null — no need to setVisible(false) here.
      onReactivated();
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  if (!visible) return null;

  return (
    <div
      data-testid={`cancel-pending-banner-${substrateId}`}
      role="status"
      className="border-t border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-200"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="leading-snug">
          Cancels on <span className="font-medium">{endsOn}</span>.
        </span>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleReactivate();
            }}
            disabled={submitting}
            data-testid={`cancel-pending-banner-reactivate-${substrateId}`}
            className="rounded-md border border-amber-400/30 px-2.5 py-1 text-xs font-medium text-amber-100 transition hover:border-amber-400/60 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "…" : "Reactivate"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              dismiss();
            }}
            aria-label="Dismiss cancellation notice"
            data-testid={`cancel-pending-banner-dismiss-${substrateId}`}
            className="rounded p-1 text-amber-200/60 transition hover:bg-amber-500/10 hover:text-amber-100"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      {error && (
        <p
          data-testid={`cancel-pending-banner-error-${substrateId}`}
          className="mt-2 text-amber-100"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Small persistent "Cancelling" pill rendered next to the substrate slug
 * whenever cancelAt is set. Distinct from the banner: badge is always
 * visible while cancel-pending; banner can be dismissed for the day.
 */
export function CancelPendingBadge({ endsOn }: { endsOn: string }) {
  return (
    <span
      data-testid="cancel-pending-badge"
      title={`Cancels on ${endsOn}`}
      className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-200 ring-1 ring-amber-400/20"
    >
      <span className="h-1 w-1 rounded-full bg-amber-400" />
      Cancelling
    </span>
  );
}
