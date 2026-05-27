/**
 * CancelSubstrateDialog — minimum-copy cancel modal for ACTIVE substrates.
 *
 * Sprint 2026-05-18 E1.
 *
 * D6 decision (locked): copy is the absolute minimum.
 *   "Your paid subscription will end on DD MMM YYYY."
 *   Two buttons. No warning prose. No export prompts. No button row beyond
 *   Cancel subscription / Keep subscription.
 *
 * Distinct from the existing CancelWarningModal in DashboardClient.tsx which
 * targets INACTIVE substrates (deprovisioned/destroyed/provision_failed)
 * with orphan Stripe subs — that one sends the user to the Stripe portal.
 * THIS dialog targets ACTIVE running substrates and POSTs directly to
 * /api/substrates/:slug/cancel, keeping the user on-site.
 *
 * Flow on confirm:
 *   1. POST /api/substrates/:slug/cancel → compute sets cancel_at_period_end
 *      with an idempotency key.
 *   2. On 200: call onSuccess(); parent (DashboardClient) refreshes its
 *      substrates list, which will surface cancel_at on the bound substrate
 *      and trigger the banner + badge UI (E2).
 *   3. On 401 with reauth_required: redirect via readReauthFlag.
 *   4. On any other error: show inline error notice; user can retry.
 */

"use client";

import { useEffect, useState } from "react";
import { readReauthFlag, redirectToReauth } from "@/lib/reauth";

interface Props {
  /** Slug of the substrate being cancelled. */
  slug: string;
  /**
   * Human-readable end-of-paid-period date. The parent computes this from
   * the substrate's `renewsAt` (next billing date) which is when access
   * actually ends under D1. Format: "DD MMM YYYY" (en-NZ locale).
   */
  endsOn: string;
  /** Fires after a successful 200 from compute. Parent should re-fetch. */
  onSuccess: () => void;
  /** Fires on backdrop click, Esc, or Keep button. */
  onClose: () => void;
}

export function CancelSubstrateDialog({ slug, endsOn, onSuccess, onClose }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc closes (unless we're mid-submit — closing during the request would
  // leave the user uncertain whether the cancel landed).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/substrates/${encodeURIComponent(slug)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      // Recent-auth window expired → bounce through /login.
      if (await readReauthFlag(res)) {
        redirectToReauth();
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        setError(body?.message ?? body?.error ?? `Cancel failed (HTTP ${res.status}).`);
        setSubmitting(false);
        return;
      }
      // Parent refreshes the substrate list; this dialog unmounts on
      // onSuccess (parent clears its `cancelTarget` state).
      onSuccess();
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-substrate-dialog-title"
      data-testid="cancel-substrate-dialog-backdrop"
      className="fixed top-[var(--site-nav-h)] right-0 bottom-0 left-0 z-40 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border border-white/10 bg-zinc-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="cancel-substrate-dialog"
      >
        <p id="cancel-substrate-dialog-title" className="font-semibold text-white">
          Cancel {slug}
        </p>
        <p className="mt-3 text-sm text-white/70">
          Your paid subscription will end on{" "}
          <span className="font-medium text-white">{endsOn}</span>.
        </p>

        {error && (
          <p
            data-testid="cancel-substrate-dialog-error"
            className="mt-4 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-200"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            data-testid="cancel-substrate-dialog-keep"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:border-white/20 hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Keep subscription
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            data-testid="cancel-substrate-dialog-confirm"
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Cancelling…" : "Cancel subscription"}
          </button>
        </div>
      </div>
    </div>
  );
}
