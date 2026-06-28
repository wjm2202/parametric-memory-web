/**
 * ConfirmUpgradeDialog — final "are you sure?" step before we kick off an
 * in-place tier change.
 *
 * Rendered by ChangePlanSheet when the user clicks Select on an upgrade row.
 * Responsibilities:
 *   - Restate the transition clearly (from → to, pricing today, pricing next
 *     month, next-billing-date).
 *   - Surface the shared_to_dedicated warning panel inline so the customer
 *     sees it one more time before committing.
 *   - On Upgrade click, POST /api/billing/upgrade with
 *     `{ substrateSlug, targetTier, idempotencyKey }`. Compute applies the
 *     change in-place via Stripe `subscriptions.update` and inserts a
 *     `substrate_tier_changes` row; the dashboard's `useTierChangePoll`
 *     picks the row up on its next 3 s tick and renders the in-flight
 *     banner. Behavioural contract:
 *       - 2xx → toast "Processing your upgrade…", call `onUpgradeStarted`,
 *         do NOT reset `submitting` (parent will unmount the dialog).
 *       - non-2xx or thrown fetch → toast.error, re-enable buttons,
 *         leave the dialog open so the user can retry.
 *
 * Historical note: the previous implementation expected `{ checkoutUrl }`
 * in the response body and redirected the whole window to Stripe Checkout.
 * That flow was replaced with in-place subscription mutation; the dialog
 * was updated alongside the BFF path fix (A1, May 2026).
 *
 * Copy lives in tier-change-copy.ts — no inline strings.
 *
 * @see PLAN-ADMIN-UPGRADE-FLOW.md §4.3
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DEDICATED_MIGRATION_WARNING_BODY,
  DEDICATED_MIGRATION_WARNING_TITLE,
  DIALOG_CANCEL_LABEL,
  DIALOG_CONFIRM_LABEL,
  DIALOG_CONFIRM_LABEL_SUBMITTING,
  DIALOG_TITLE,
  PROVISIONING_FEE_CONSENT_CHECKBOX,
  PROVISIONING_FEE_CONSENT_TITLE,
  provisioningFeeConsentBody,
  PREVIEW_ERROR,
  PREVIEW_LOADING,
  PREVIEW_RETRY_LABEL,
  TOAST_PENDING_BODY,
  TOAST_PENDING_TITLE,
  TOAST_SUBMIT_ERROR_BODY,
  TOAST_SUBMIT_ERROR_TITLE,
  chargedTodayLabel,
  chargedTodaySubtext,
  formatUsdCents,
  fromDateSubtext,
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
   * Sprint 2026-05-18 D9: true when the substrate's subscription is in the
   * cancel-pending state (substrate.cancelAt is set). When true, the dialog
   * surfaces a notice that confirming the upgrade will ALSO reactivate the
   * subscription — both in a single Stripe operation. Compute's upgrade
   * handler always sets `cancel_at_period_end: false`; this flag only
   * controls the visible note so the user understands what they're agreeing
   * to.
   */
  isCancelPending?: boolean;
  /**
   * Called on Cancel button, backdrop click, or Esc key. Does NOT fire on a
   * successful Upgrade — that path uses {@link Props.onUpgradeStarted}.
   */
  onClose: () => void;
  /**
   * Fires when compute accepts the upgrade (2xx) and the in-flight
   * tier-change row has been written. The parent should:
   *   - unmount this dialog (so the Stripe spinner stops)
   *   - close the surrounding `ChangePlanSheet` so the underlying admin
   *     view re-shows
   *   - allow `useTierChangePoll` to detect the new row and render the
   *     `TierChangeProgressBanner`
   *
   * The dialog has already toasted "Processing your upgrade…" by the time
   * this fires, so callers do not need to surface their own confirmation.
   */
  onUpgradeStarted: () => void;
}

/**
 * Live proration preview fetched from GET /api/billing/upgrade/preview.
 * Mirrors compute's UpgradePreviewResponse (camelCase, cents, ISO dates).
 */
interface UpgradePreviewData {
  prorationCents: number;
  /**
   * Non-refundable provisioning fee charged today for a dedicated upgrade
   * (0 for shared). Server-authoritative — equals exactly what compute's R2
   * charge bills, so the displayed figure can't drift from the real charge.
   */
  provisioningFeeCents: number;
  /** True total charged today = prorationCents + provisioningFeeCents. */
  chargedTodayCents: number;
  newPriceCents: number;
  nextInvoiceDate: string | null;
  nextInvoiceTotalCents: number;
  currency: string;
}

type PreviewStatus = "loading" | "loaded" | "error";

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

/**
 * Map an upgrade-commit failure (HTTP status + compute error code) to a clear,
 * customer-facing message. The v2 atomic flow can refuse an upgrade in several
 * ways, each of which must tell the customer exactly what happened — most
 * importantly a declined card (402), where the subscription was left untouched
 * and they just need a working card.
 */
function upgradeErrorMessage(status: number, code?: string): string {
  if (status === 402 || code === "payment_failed") {
    return "Payment failed — your card was declined. Update your payment method and try again.";
  }
  if (code === "already_on_target_tier" || code === "same_tier") {
    return "You're already on this plan.";
  }
  if (code === "downgrade_not_supported") {
    return "Downgrades aren't supported here. Contact support to move to a lower plan.";
  }
  if (code === "upgrade_in_progress" || code === "substrate_not_running") {
    return "A plan change is already in progress for this substrate. Please wait for it to finish, then try again.";
  }
  if (status === 429) {
    return "Too many plan changes right now. Please try again in a little while.";
  }
  return TOAST_SUBMIT_ERROR_BODY;
}

export function ConfirmUpgradeDialog({
  substrateSlug,
  currentTier,
  option,
  onClose,
  onUpgradeStarted,
  isCancelPending = false,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  // Inline failure notice shown when the upgrade is refused (declined card, etc.)
  // — the dialog stays open so the customer can fix their card and retry.
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("loading");
  const [previewData, setPreviewData] = useState<UpgradePreviewData | null>(null);
  // R10/D7 — explicit consent to the non-refundable provisioning fee, required
  // before a dedicated upgrade can be confirmed.
  const [feeAcknowledged, setFeeAcknowledged] = useState(false);

  const fromLabel = getTierLabel(currentTier);
  const toLabel = option.name;
  const isDedicatedMigration = option.transitionKind === "shared_to_dedicated";

  // The provisioning fee comes straight from the preview (server-authoritative,
  // equals what R2 actually bills) — no longer re-derived client-side, so the
  // displayed fee can't drift from the charge. 0 for shared upgrades.
  const feeCents = previewData ? previewData.provisioningFeeCents : 0;
  // Dedicated upgrades require fee consent; shared upgrades never do.
  const consentRequired = isDedicatedMigration;
  const consentSatisfied = !consentRequired || feeAcknowledged;

  /**
   * Fetch the live Stripe proration preview. Called on dialog open and on
   * retry. `substrateSlug` and `option.tier` are stable for the dialog's
   * lifetime so the useEffect below runs once (on mount = dialog open).
   */
  // Caller sets previewStatus to "loading" (initial state is already "loading"
  // on mount; the retry handler sets it explicitly). Keeping setState out of the
  // synchronous path lets this run inside the mount effect without tripping
  // react-hooks/set-state-in-effect — every setState below happens after await.
  const fetchPreview = useCallback(async () => {
    try {
      const params = new URLSearchParams({ substrateSlug, tier: option.tier });
      const res = await fetch(`/api/billing/upgrade/preview?${params.toString()}`);
      if (!res.ok) {
        setPreviewStatus("error");
        return;
      }
      const data = (await res.json()) as UpgradePreviewData;
      setPreviewData(data);
      setPreviewStatus("loaded");
    } catch {
      setPreviewStatus("error");
    }
  }, [substrateSlug, option.tier]);

  // Fetch preview once on dialog open. fetchPreview is stable (useCallback over
  // the stable substrateSlug + option.tier), so this runs once on mount.
  useEffect(() => {
    // Legitimate on-mount data fetch: every setState inside fetchPreview runs
    // AFTER the awaited fetch (a later microtask), so there is no synchronous
    // cascading render — the rule can't see past the await, so scope-disable it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPreview();
  }, [fetchPreview]);

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
    // Block until the preview loaded AND (for dedicated) the fee is acknowledged.
    if (submitting || previewStatus !== "loaded" || !consentSatisfied) return;
    setSubmitting(true);
    setSubmitError(null); // clear any prior failure on retry

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
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const message = upgradeErrorMessage(res.status, body.error);
        // Inline notice (stays visible so the customer can fix their card and
        // retry) + a toast for immediate feedback. The dialog stays open.
        setSubmitError(message);
        toast.error(TOAST_SUBMIT_ERROR_TITLE, { description: message });
        setSubmitting(false);
        return;
      }

      // 2xx — compute accepted the change and wrote the substrate_tier_changes
      // row. We no longer parse the body: the response shape is
      // `{ accepted, currentTier, targetTier, transitionType, ... }` and we
      // don't need any of it client-side. The poller will pick up the row
      // and the banner will render.
      //
      // Surface a transient "Processing your upgrade…" toast so the user
      // sees something change immediately — `useTierChangePoll` runs on a
      // 3 s interval, which is too slow for a button click without
      // confirmation feedback.
      toast.info(TOAST_PENDING_TITLE, { description: TOAST_PENDING_BODY });

      // Hand control back to the parent. Deliberately do NOT reset
      // `submitting`: the parent unmounts this dialog as part of its own
      // cleanup, and a brief disabled-spinner state during that frame is
      // preferable to flickering back to "Upgrade" before unmount.
      onUpgradeStarted();
    } catch {
      setSubmitError(TOAST_SUBMIT_ERROR_BODY);
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
      className="fixed top-[var(--site-nav-h)] right-0 bottom-0 left-0 z-40 flex items-center justify-center px-4 py-6"
    >
      <div
        // Backdrop click closes the dialog. Disabled during submit so a stray
        // click during the in-flight POST doesn't strand the user with a
        // spinner that has no parent to dismiss it.
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => {
          if (!submitting) onClose();
        }}
        data-testid="confirm-upgrade-backdrop"
      />

      <div className="relative flex max-h-[calc(100dvh-var(--site-nav-h)-3rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-indigo-500/30 bg-[#0d0d14] shadow-2xl">
        {/* × close button — top-right of the panel. Same handler as Cancel
            (parent's onClose), disabled mid-submit so a stray click during
            the in-flight POST doesn't strand the user with a spinner that
            has no parent to dismiss it. The button sits absolute over the
            panel's padding so it doesn't reflow the header content. */}
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          aria-label="Close"
          data-testid="confirm-upgrade-close-icon"
          className="absolute top-3 right-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/5 hover:text-white/80 disabled:opacity-30"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M5.22 5.22a.75.75 0 0 1 1.06 0L10 8.94l3.72-3.72a.75.75 0 1 1 1.06 1.06L11.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06L10 11.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06L8.94 10 5.22 6.28a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>

        {/* Scrollable body — everything except the action buttons lives here so
            that on short viewports the content scrolls while the footer (and its
            Upgrade button) stays pinned and reachable. Prevents the off-screen
            button bug on small/zoomed screens. */}
        <div data-testid="confirm-upgrade-scroll" className="flex-1 overflow-y-auto px-6 pt-6 pb-4">
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

          {/* Pricing block — shows live Stripe proration preview */}
          <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.02] p-4">
            {previewStatus === "loading" && (
              <div data-testid="proration-loading" aria-label={PREVIEW_LOADING}>
                <div className="h-2.5 w-20 animate-pulse rounded bg-white/10" />
                <div className="mt-2 h-6 w-28 animate-pulse rounded bg-white/10" />
                <div className="mt-1.5 h-2 w-48 animate-pulse rounded bg-white/10" />
                <div className="mt-3 border-t border-white/5 pt-3">
                  <div className="h-2.5 w-24 animate-pulse rounded bg-white/10" />
                  <div className="mt-2 h-4 w-20 animate-pulse rounded bg-white/10" />
                  <div className="mt-1.5 h-2 w-40 animate-pulse rounded bg-white/10" />
                </div>
              </div>
            )}

            {previewStatus === "error" && (
              <div
                data-testid="proration-error"
                className="flex items-center justify-between gap-3"
              >
                <p className="text-sm text-white/50">{PREVIEW_ERROR}</p>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewStatus("loading");
                    void fetchPreview();
                  }}
                  className="shrink-0 rounded-md px-3 py-1 text-xs font-medium text-indigo-400 ring-1 ring-indigo-500/40 transition-colors hover:bg-indigo-500/10"
                >
                  {PREVIEW_RETRY_LABEL}
                </button>
              </div>
            )}

            {previewStatus === "loaded" && previewData && (
              <>
                <p className="text-xs tracking-wider text-white/40 uppercase">Charged today</p>
                <p className="mt-1 text-lg font-semibold text-white" data-testid="proration-charge">
                  {chargedTodayLabel(previewData.chargedTodayCents)}
                </p>
                <p className="mt-1 text-xs text-white/50" data-testid="proration-charge-subtext">
                  {chargedTodaySubtext({
                    prorationCents: previewData.prorationCents,
                    provisioningFeeCents: previewData.provisioningFeeCents,
                  })}
                </p>

                <div className="mt-3 border-t border-white/5 pt-3">
                  <p className="text-xs tracking-wider text-white/40 uppercase">
                    From next renewal
                  </p>
                  <p className="mt-1 text-sm text-white/80" data-testid="proration-monthly">
                    {formatUsdCents(previewData.newPriceCents)}/mo
                  </p>
                  <p className="mt-1 text-xs text-white/40" data-testid="proration-from-date">
                    {fromDateSubtext(previewData.nextInvoiceDate)}
                  </p>
                </div>

                <p className="mt-3 text-xs text-white/40" data-testid="upgrade-currency-note">
                  All amounts are in US dollars (USD).
                </p>
              </>
            )}
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
                <li>• Cut over — your API key stays the same; your endpoint URL changes</li>
              </ol>
            </div>
          )}

          {/* D9 (sprint 2026-05-18): cancel-pending → upgrade auto-reactivates.
            Surfaced as a friendly inline note rather than a separate dialog
            step. Compute's upgrade handler unconditionally clears
            cancel_at_period_end in the same .update() call, so the user
            doesn't need a separate Reactivate confirmation. */}
          {isCancelPending && (
            <div
              data-testid="confirm-upgrade-reactivate-note"
              className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200"
            >
              Upgrading will reactivate your subscription. The pending cancellation will be cleared.
            </div>
          )}
        </div>

        {/* Pinned footer — never scrolls, so the consent gate AND the Upgrade
            button are always visible regardless of viewport height. The
            provisioning-fee consent (R10/D7) lives here, directly ABOVE the
            buttons, so the customer can never reach a disabled Upgrade button
            without seeing the checkbox that unlocks it. */}
        <div
          data-testid="confirm-upgrade-footer"
          className="flex shrink-0 flex-col gap-3 border-t border-white/10 px-6 py-4"
        >
          {/* Provisioning-fee consent. Dedicated upgrades carry a one-time
              NON-REFUNDABLE fee; the customer must see it AND tick the box
              before Upgrade enables. Rendered once the preview supplies the new
              price (so the fee figure is real). */}
          {consentRequired && previewStatus === "loaded" && previewData && (
            <div
              className="rounded-lg border border-white/10 bg-white/[0.02] p-4"
              data-testid="provisioning-fee-consent"
            >
              <p className="text-sm font-semibold text-white">{PROVISIONING_FEE_CONSENT_TITLE}</p>
              <p className="mt-1 text-xs text-white/60" data-testid="provisioning-fee-body">
                {provisioningFeeConsentBody(feeCents)}
              </p>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-white/80">
                <input
                  type="checkbox"
                  checked={feeAcknowledged}
                  onChange={(e) => setFeeAcknowledged(e.target.checked)}
                  disabled={submitting}
                  data-testid="provisioning-fee-consent-checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-transparent accent-indigo-500"
                />
                <span>{PROVISIONING_FEE_CONSENT_CHECKBOX}</span>
              </label>
            </div>
          )}

          {/* Failure notice — shown when the upgrade is refused (declined card,
              etc.). The dialog stays open so the customer can update their card
              and retry. role="alert" so screen readers announce it. */}
          {submitError && (
            <div
              role="alert"
              data-testid="confirm-upgrade-error"
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            >
              {submitError}
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
              disabled={submitting || previewStatus !== "loaded" || !consentSatisfied}
              data-testid="confirm-upgrade-confirm"
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? DIALOG_CONFIRM_LABEL_SUBMITTING : DIALOG_CONFIRM_LABEL}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
