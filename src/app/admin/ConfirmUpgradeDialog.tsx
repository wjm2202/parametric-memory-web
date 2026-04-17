/**
 * ConfirmUpgradeDialog — final "are you sure?" step before we bounce the
 * customer to Stripe Checkout.
 *
 * Rendered by ChangePlanSheet when the user clicks Select on an upgrade row.
 * Responsibilities:
 *   - Restate the transition clearly (from → to, pricing today, pricing next
 *     month, next-billing-date).
 *   - Surface the shared_to_dedicated warning panel inline so the customer
 *     sees it one more time before committing.
 *   - On Upgrade click, POST /api/billing/upgrade { substrateSlug, targetTier,
 *     idempotencyKey } and redirect to the returned checkoutUrl.
 *   - On error: toast via sonner; keep the dialog open so the user can retry
 *     or cancel.
 *
 * Copy lives in tier-change-copy.ts — no inline strings.
 *
 * @see PLAN-ADMIN-UPGRADE-FLOW.md §4.3
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DEDICATED_MIGRATION_WARNING_BODY,
  DEDICATED_MIGRATION_WARNING_TITLE,
  DIALOG_CANCEL_LABEL,
  DIALOG_CONFIRM_LABEL,
  DIALOG_CONFIRM_LABEL_SUBMITTING,
  DIALOG_TITLE,
  TOAST_SUBMIT_ERROR_BODY,
  TOAST_SUBMIT_ERROR_TITLE,
  formatUsdCents,
  prorationPreview,
  type TierChangeTransitionKind,
} from "./tier-change-copy";
import { getTierLabel } from "@/config/tiers";

/**
 * Warning attached to an upgrade option. Only `dedicated_migration` is emitted
 * today but the shape is defensive in case backend adds more codes.
 */
export interface UpgradeOptionWarning {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
}

/**
 * Shape of one row in the `options` array returned by
 * GET /api/billing/upgrade-options. Colocated here because ConfirmUpgradeDialog
 * is the primary consumer; ChangePlanSheet imports the same type.
 */
export interface UpgradeOption {
  tier: string;
  name: string;
  amountCents: number;
  hostingModel: "shared" | "dedicated";
  transitionKind: TierChangeTransitionKind;
  estimatedProrationCents: number;
  limits: {
    maxAtoms: number;
    maxBootstrapsMonth: number;
    maxStorageMb: number;
  };
  stripePriceId?: string;
  warnings?: UpgradeOptionWarning[];
}

interface Props {
  /** Slug to pass through to POST /api/billing/upgrade. */
  substrateSlug: string;
  /** Current tier ID — used for the "from" side of the restatement. */
  currentTier: string;
  /** The option the user clicked Select on. */
  option: UpgradeOption;
  /**
   * Next billing date (ISO string, from billingStatus.renewalDate). Used to
   * anchor the "then $X on May 17" line. Pass null if unknown — the proration
   * line falls back to "$X charged today, then $Y/mo".
   */
  nextBillingDate: Date | null;
  /**
   * Called on Cancel button, backdrop click, or Esc key. Does NOT fire on
   * successful Upgrade — the success path navigates the whole page via
   * window.location.href.
   */
  onClose: () => void;
}

/**
 * Generate a browser-side idempotency key so the backend can de-duplicate a
 * double-click on Upgrade. `crypto.randomUUID` is available in all modern
 * browsers + jsdom; defensive fallback for ancient environments.
 */
function makeIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Math.random fallback. Only hit in ancient browsers that nobody uses.
  return `upg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function ConfirmUpgradeDialog({
  substrateSlug,
  currentTier,
  option,
  nextBillingDate,
  onClose,
}: Props) {
  const [submitting, setSubmitting] = useState(false);

  const fromLabel = getTierLabel(currentTier);
  const toLabel = option.name;
  const isDedicatedMigration = option.transitionKind === "shared_to_dedicated";

  /**
   * Proration sentence. When we know the next billing date we use the full
   * "…then $X/mo on May 17" copy; otherwise we fall back to a shorter form
   * so the dialog never renders a broken date.
   */
  const prorationLine = useMemo(() => {
    if (nextBillingDate) {
      return prorationPreview(option.estimatedProrationCents, option.amountCents, nextBillingDate);
    }
    return `${formatUsdCents(option.estimatedProrationCents)} charged today, then ${formatUsdCents(
      option.amountCents,
    )}/mo`;
  }, [nextBillingDate, option.estimatedProrationCents, option.amountCents]);

  // Esc closes the dialog (unless we're mid-submit — avoids closing while a
  // network round-trip is in flight and stranding the customer in limbo).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  async function handleUpgrade() {
    if (submitting) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          substrateSlug,
          targetTier: option.tier,
          idempotencyKey: makeIdempotencyKey(),
        }),
      });

      if (!res.ok) {
        toast.error(TOAST_SUBMIT_ERROR_TITLE, { description: TOAST_SUBMIT_ERROR_BODY });
        setSubmitting(false);
        return;
      }

      const body = (await res.json()) as { checkoutUrl?: string };
      if (!body.checkoutUrl) {
        toast.error(TOAST_SUBMIT_ERROR_TITLE, { description: TOAST_SUBMIT_ERROR_BODY });
        setSubmitting(false);
        return;
      }

      // Hand off to Stripe. Deliberately don't reset `submitting` — leaving
      // the button in "Redirecting…" state while the navigation lands keeps
      // the customer from clicking again during the tab flicker.
      window.location.href = body.checkoutUrl;
    } catch {
      toast.error(TOAST_SUBMIT_ERROR_TITLE, { description: TOAST_SUBMIT_ERROR_BODY });
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-upgrade-title"
      data-testid="confirm-upgrade-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      <div
        // Backdrop click closes the dialog. Disabled during submit so a stray
        // click during the Stripe redirect doesn't pop a blank admin page.
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => {
          if (!submitting) onClose();
        }}
        data-testid="confirm-upgrade-backdrop"
      />

      <div className="relative w-full max-w-md rounded-2xl border border-indigo-500/30 bg-[#0d0d14] p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5">
          <h2
            id="confirm-upgrade-title"
            className="font-[family-name:var(--font-syne)] text-base font-semibold text-white"
          >
            {DIALOG_TITLE}
          </h2>
          <p className="mt-1 text-sm text-white/50">
            Upgrading from <span className="font-medium text-white/80">{fromLabel}</span> to{" "}
            <span className="font-medium text-indigo-300">{toLabel}</span>.
          </p>
        </div>

        {/* Pricing block */}
        <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.02] p-4">
          <p className="text-xs tracking-wider text-white/40 uppercase">Today</p>
          <p className="mt-1 text-lg font-semibold text-white" data-testid="proration-charge">
            {formatUsdCents(option.estimatedProrationCents)}
          </p>
          <p className="mt-1 text-xs text-white/50">prorated for the remainder of this period</p>

          <div className="mt-3 border-t border-white/5 pt-3">
            <p className="text-xs tracking-wider text-white/40 uppercase">Then, on next renewal</p>
            <p className="mt-1 text-sm text-white/80" data-testid="proration-monthly">
              {formatUsdCents(option.amountCents)}/mo
            </p>
            <p className="mt-1 text-xs text-white/40" data-testid="proration-full-line">
              {prorationLine}
            </p>
          </div>
        </div>

        {/* Dedicated-migration warning block */}
        {isDedicatedMigration && (
          <div
            className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4"
            data-testid="dedicated-migration-warning"
          >
            <p className="text-sm font-semibold text-amber-300">
              {DEDICATED_MIGRATION_WARNING_TITLE}
            </p>
            <p className="mt-1 text-xs text-white/60">{DEDICATED_MIGRATION_WARNING_BODY}</p>
            <ol className="mt-3 space-y-1 text-xs text-white/50">
              <li>• Confirm payment</li>
              <li>• Provision a dedicated droplet for you</li>
              <li>• Transfer your data (substrate briefly read-only)</li>
              <li>• Cut over — your endpoint and API key stay the same</li>
            </ol>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            data-testid="confirm-upgrade-cancel"
            className="flex-1 rounded-lg border border-white/10 py-2 text-sm text-white/50 transition-colors hover:border-white/20 hover:text-white/80 disabled:opacity-40"
          >
            {DIALOG_CANCEL_LABEL}
          </button>
          <button
            onClick={handleUpgrade}
            disabled={submitting}
            data-testid="confirm-upgrade-confirm"
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? DIALOG_CONFIRM_LABEL_SUBMITTING : DIALOG_CONFIRM_LABEL}
          </button>
        </div>
      </div>
    </div>
  );
}
