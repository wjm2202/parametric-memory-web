/**
 * SubstrateStateBanner — per-substrate action banner for non-healthy states.
 *
 * Renders an attention banner when a substrate is in a state that requires
 * user action (or user awareness that something is wrong). Returns `null` for
 * healthy statuses (`running`, `provisioning`) so callers can render it
 * unconditionally inside a stack.
 *
 * Variants shipped:
 *   - `pending_payment`    (F-BILLING-3) — customer has an unpaid Stripe
 *                                          session; CTA → billing portal.
 *   - `provision_failed`   (F-PROV-1)    — substrate never reached 'running';
 *                                          CTA → email support.
 *   - `read_only`          (F-BILLING-2) — writes blocked (usually because the
 *                                          customer hit their monthly spend
 *                                          cap, cascaded from F-BILLING-5);
 *                                          CTA → Stripe billing portal.
 *
 * Intentional non-variants:
 *   - `suspended`          — already covered by the account-level
 *                            BillingWidget banner; we intentionally do NOT
 *                            double up here.
 *
 * Design notes:
 *   - Copy tone matches the existing BillingWidget banners (short, action-led,
 *     sentence case).
 *   - pending_payment is dismissible because the dashboard polls substrates
 *     every 10s and will remove the banner naturally once the webhook flips
 *     status → 'running'. Dismiss is a soft local override if the customer
 *     wants it out of the way.
 *   - provision_failed is NOT dismissible — that's a hard failure requiring
 *     human intervention, and the user should keep seeing it until support
 *     manually clears the substrate.
 *   - read_only is NOT dismissible — writes are actually blocked at the MCP
 *     middleware (F-MCP-5). If we let the customer dismiss this and then
 *     they tried to write from Claude Desktop, they'd hit a confusing 403
 *     with no dashboard context. Keep it visible until billing is resolved
 *     and the webhook flips status back to 'running'.
 *   - read_only does NOT yet surface the `read_only_reason` column — the
 *     list endpoint doesn't return it (see parametric-memory-compute
 *     src/api/substrates/routes.ts `SubstrateListItem`). Copy is deliberately
 *     generic so it works for all read_only_reason values (`spend_cap`,
 *     `payment_failed`, etc.). Reason-specific copy can be added later once
 *     the list endpoint exposes the column; the default CTA (billing portal)
 *     is the right action for every known reason today.
 */

"use client";

import React, { useState } from "react";

export interface SubstrateStateBannerProps {
  slug: string;
  status: string;
  /** Callback for opening the Stripe billing portal. Required for
   *  `pending_payment`; ignored for other variants. */
  onBillingPortal?: () => void;
  /** Support email — override the default if needed. */
  supportEmail?: string;
}

const DEFAULT_SUPPORT_EMAIL = "entityone22@gmail.com";

export default function SubstrateStateBanner({
  slug,
  status,
  onBillingPortal,
  supportEmail = DEFAULT_SUPPORT_EMAIL,
}: SubstrateStateBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  if (status === "pending_payment") {
    return (
      <div
        role="alert"
        data-testid={`substrate-banner-${slug}`}
        data-variant="pending_payment"
        className="flex items-start justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
            <span aria-hidden="true">⏳</span>
            <span>Payment pending for </span>
            <span className="font-mono break-all">{slug}</span>
          </p>
          <p className="mt-1 text-sm text-white/50">
            This substrate is waiting for your Stripe payment to complete. Finish checkout to
            activate it.
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <button
            type="button"
            onClick={onBillingPortal}
            className="rounded-md border border-amber-500/40 px-3 py-1.5 text-xs font-medium text-amber-300 transition hover:bg-amber-500/10"
          >
            Complete payment →
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
            className="text-amber-400/60 transition hover:text-amber-300"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  if (status === "provision_failed") {
    const mailto =
      `mailto:${supportEmail}?subject=` + encodeURIComponent(`Provisioning failed for ${slug}`);

    return (
      <div
        role="alert"
        data-testid={`substrate-banner-${slug}`}
        data-variant="provision_failed"
        className="flex items-start justify-between gap-4 rounded-xl border border-red-900/40 bg-red-950/20 px-5 py-4"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-400">
            <span aria-hidden="true">✕</span>
            <span>Provisioning failed for </span>
            <span className="font-mono break-all">{slug}</span>
          </p>
          <p className="mt-1 text-sm text-white/50">
            Your substrate didn&apos;t finish provisioning. You haven&apos;t been charged for usage.
            Contact support and we&apos;ll get you sorted.
          </p>
        </div>
        <a
          href={mailto}
          className="shrink-0 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500"
        >
          Contact support →
        </a>
      </div>
    );
  }

  if (status === "read_only") {
    return (
      <div
        role="alert"
        data-testid={`substrate-banner-${slug}`}
        data-variant="read_only"
        className="flex items-start justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
            <span aria-hidden="true">🔒</span>
            <span>Writes paused for </span>
            <span className="font-mono break-all">{slug}</span>
          </p>
          <p className="mt-1 text-sm text-white/50">
            Reads still work, but writes are blocked — usually because this substrate has hit its
            monthly spend cap or a recent payment failed. Open the billing portal to raise the cap
            or update your payment method.
          </p>
        </div>
        <button
          type="button"
          onClick={onBillingPortal}
          className="shrink-0 rounded-md border border-amber-500/40 px-3 py-1.5 text-xs font-medium text-amber-300 transition hover:bg-amber-500/10"
        >
          Manage billing →
        </button>
      </div>
    );
  }

  // All other statuses — no banner. Explicit return for readability.
  return null;
}
