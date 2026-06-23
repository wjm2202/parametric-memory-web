/**
 * Copy constants for the tier-change / upgrade flow.
 *
 * Every user-visible string the upgrade flow emits lives here so QA can audit
 * tone, terminology, and phase wording in one place. Any component that renders
 * text about tier changes, upgrades, or the in-flight progress banner MUST
 * import from this file — do not inline copy inside a component.
 *
 * Related plan doc: PLAN-ADMIN-UPGRADE-FLOW.md §7 (Frontend changes).
 */

// ─── Tier-change state phases ────────────────────────────────────────────────
//
// These mirror the backend's response shape from GET /api/v1/substrates/:slug/upgrade/status.
// `state` + `phase` together determine which copy the banner renders.

/**
 * Top-level lifecycle state for an in-flight tier change.
 * `none` means "no row exists — nothing happening".
 */
export type TierChangeState =
  | "none"
  | "payment_pending"
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "rolled_back";

/**
 * Fine-grained phase (only meaningful when transitionKind is shared_to_dedicated).
 * null when the change is fast-path or hasn't started a phase yet.
 */
export type TierChangePhase =
  | "confirming_payment"
  | "provisioning"
  | "source_read_only"
  | "backing_up"
  | "awaiting_disk_space"
  | "transferring"
  | "restoring"
  | "verifying"
  | "cutting_over"
  | null;

/**
 * Kind of transition — drives which phase list the banner renders.
 */
export type TierChangeTransitionKind =
  | "shared_to_shared"
  | "shared_to_dedicated"
  | "dedicated_to_dedicated"
  | "dedicated_to_shared";

/**
 * Terminal states — polling stops once the state hits one of these.
 */
export const TERMINAL_STATES: ReadonlySet<TierChangeState> = new Set([
  "completed",
  "failed",
  "rolled_back",
]);

// ─── Banner copy — shared_to_shared (fast path) ──────────────────────────────
//
// Two visible steps: payment confirm, limits apply. Auto-dismisses ~5s after
// "completed".

export const FAST_PATH_STEPS: { readonly state: TierChangeState; readonly label: string }[] = [
  { state: "payment_pending", label: "Confirming your payment…" },
  { state: "queued", label: "Confirming your payment…" }, // same UX bucket
  { state: "processing", label: "Applying your new limits…" },
];

/**
 * Success headline for shared_to_shared.
 * Interpolates the target tier display name (e.g. "Pro").
 */
export function fastPathSuccessHeadline(targetTierName: string): string {
  return `Done! You're on ${targetTierName}. New limits are active.`;
}

// ─── Banner copy — shared_to_dedicated (slow path) ───────────────────────────
//
// Seven visible phases. Banner shows the full list with a moving active marker.
// Phase strings are ordered exactly as the backend state machine advances them.

export const SLOW_PATH_PHASES: { readonly phase: TierChangePhase; readonly label: string }[] = [
  { phase: "confirming_payment", label: "Confirming your payment…" },
  { phase: "provisioning", label: "Provisioning your dedicated droplet…" },
  { phase: "source_read_only", label: "Preparing data for transfer…" },
  { phase: "backing_up", label: "Preparing data for transfer…" }, // same UX bucket
  { phase: "awaiting_disk_space", label: "Preparing data for transfer…" },
  { phase: "transferring", label: "Transferring your data…" },
  { phase: "restoring", label: "Transferring your data…" }, // same UX bucket
  { phase: "verifying", label: "Verifying your new host…" },
  { phase: "cutting_over", label: "Cutting over…" },
];

/**
 * The user-visible label for the final "cutting over" step (must match the
 * `cutting_over` entry in SLOW_PATH_PHASES). The banner renders CUTOVER_SUBSTEPS
 * beneath this step; kept as a constant so the banner matches it without
 * hardcoding the string.
 */
export const CUTOVER_STEP_LABEL = "Cutting over…";

/**
 * Illustrative sub-steps shown beneath the "Cutting over…" step so the customer
 * can see what the handover does. The backend reports a single `cutting_over`
 * phase, so these are NOT individually tracked — they're a breakdown of what's
 * happening (new address, SSL/TLS, connection switch).
 */
export const CUTOVER_SUBSTEPS: readonly string[] = [
  "Registering your new address",
  "Setting up your SSL certificate",
  "Switching your connection over",
];

/**
 * Note shown beneath the slow-path step list while a dedicated migration is in
 * progress, asking the customer not to navigate away mid-migration.
 */
export const MIGRATION_STAY_ON_PAGE_NOTE =
  "Please keep this page open while your upgrade completes — it usually takes a few minutes.";

/**
 * Success headline for shared_to_dedicated. Confirms the API key is unchanged,
 * but tells the customer their MCP endpoint URL has changed (the dedicated dest
 * gets a new slug), so they know to update their client.
 */
export function slowPathSuccessHeadline(targetTierName: string): string {
  return `Done! You're on ${targetTierName}, on a dedicated instance. Your API key is unchanged, but your MCP endpoint URL has changed — update your client to the new address.`;
}

/**
 * Retry counter string shown when transferAttempts > 0. Backend reports a
 * 1-indexed attempt count; we display it as "Attempt N of 5".
 */
export function retryCounter(attemptsUsed: number, maxAttempts: number): string {
  return `Attempt ${attemptsUsed} of ${maxAttempts}`;
}

// ─── Banner copy — failure / rollback ────────────────────────────────────────

export const FAILURE_HEADLINE = "We couldn't complete your upgrade.";

/**
 * Failure body, reassuring the customer that their old plan is intact and
 * that no charge will land. Interpolates the tier they're still on.
 */
export function failureBody(currentTierName: string): string {
  return `You're still on ${currentTierName}, and no charge will land on your card. Our team has been notified.`;
}

export const FAILURE_SUPPORT_LINE = "Support: support@parametric-memory.dev";

// ─── Warnings surfaced in the comparison sheet ───────────────────────────────

/**
 * The one warning code we currently raise on an upgrade option. Rendered as an
 * info panel attached to the shared_to_dedicated row in the tier-comparison
 * sheet.
 */
export const DEDICATED_MIGRATION_WARNING_TITLE = "This tier runs on dedicated hosting.";
export const DEDICATED_MIGRATION_WARNING_BODY =
  "We'll provision a private droplet for you and migrate your data. " +
  "Your substrate will be read-only for about 5 minutes during migration. " +
  "Your API key stays the same, but your MCP endpoint URL will change — " +
  "you'll need to point your client at the new address afterwards.";

// ─── Sheet + dialog labels ───────────────────────────────────────────────────

export const SHEET_TITLE = "Change plan";
export const SHEET_SUBTITLE_LOADING = "Loading available plans…";
export const SHEET_SUBTITLE_EMPTY = "You're already on the highest available plan.";
export const SHEET_SUBTITLE_ERROR = "We couldn't load your upgrade options. Please try again.";

export const DIALOG_TITLE = "Confirm upgrade";
export const DIALOG_CANCEL_LABEL = "Cancel";
export const DIALOG_CONFIRM_LABEL = "Upgrade";
export const DIALOG_CONFIRM_LABEL_SUBMITTING = "Starting upgrade…";

// ─── Provisioning-fee consent (R10 / D7) ─────────────────────────────────────
//
// Dedicated upgrades carry a one-time, NON-REFUNDABLE provisioning fee = one
// third of the first dedicated billing period. D7 requires the customer be told
// this BEFORE they confirm payment. The fraction mirrors compute's
// billing-advisor PROVISIONING_FEE_FRACTION; the authoritative charge is always
// computed server-side (R2) — this is display + consent only.

export const PROVISIONING_FEE_FRACTION = 1 / 3;

/**
 * Display value of the non-refundable provisioning fee, in cents, given the
 * first dedicated period's total (the new tier's monthly price). Rounds like
 * compute (never in the customer's favour) and is capped at the period total.
 */
export function provisioningFeeCents(firstPeriodCents: number): number {
  if (firstPeriodCents <= 0) return 0;
  return Math.min(firstPeriodCents, Math.round(firstPeriodCents * PROVISIONING_FEE_FRACTION));
}

export const PROVISIONING_FEE_CONSENT_TITLE = "One-time provisioning fee";

/** Body explaining the fee. Interpolates the formatted fee amount. */
export function provisioningFeeConsentBody(feeCents: number): string {
  return (
    `A one-time provisioning fee of ${formatUsdCents(feeCents)} is included in today's charge to set up ` +
    `your dedicated instance. This fee is non-refundable. The rest of your payment is refundable ` +
    `pro-rata if you cancel before your period ends.`
  );
}

/** The explicit consent the customer must check before a dedicated upgrade. */
export const PROVISIONING_FEE_CONSENT_CHECKBOX =
  "I understand the provisioning fee is non-refundable.";

// ─── Upgrade lifecycle toasts ────────────────────────────────────────────────
//
// Used by ConfirmUpgradeDialog (info toast on a successful in-place upgrade —
// "we accepted the request, the banner will pick it up") and historically by
// the Stripe Checkout return path (cancelled / pending). The Checkout flow is
// retired but the cancelled copy still applies if a future flow needs it.

export const TOAST_PENDING_TITLE = "Processing your upgrade…";
export const TOAST_PENDING_BODY =
  "We're confirming your payment. This page will update automatically.";

export const TOAST_CANCELLED_TITLE = "Upgrade cancelled";
export const TOAST_CANCELLED_BODY = "No charge was made. You can try again whenever you're ready.";

/**
 * Generic error toast for a client-side failure during upgrade submission
 * (e.g. the POST /api/billing/upgrade request itself fails).
 */
export const TOAST_SUBMIT_ERROR_TITLE = "Upgrade couldn't start";
export const TOAST_SUBMIT_ERROR_BODY =
  "We couldn't start your upgrade. Please try again or contact support.";

// ─── Button labels ───────────────────────────────────────────────────────────

export const CHANGE_PLAN_BUTTON_LABEL = "Change plan";
export const CHANGE_PLAN_BUTTON_IN_FLIGHT_LABEL = "Upgrade in progress…";

// ─── Shared helpers for price / proration formatting ─────────────────────────

/**
 * Format a USD amount in cents as "$12.34".
 * Keeps copy colocated with its formatter so QA sees exactly what renders.
 */
export function formatUsdCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

/**
 * Proration preview line. Example:
 *   "$6.33 charged today, then $29.00/mo on May 17"
 */
export function prorationPreview(
  prorationCents: number,
  monthlyCents: number,
  nextBillingDate: Date,
): string {
  const monthFmt = nextBillingDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
  return `${formatUsdCents(prorationCents)} charged today, then ${formatUsdCents(monthlyCents)}/mo on ${monthFmt}`;
}

// ─── Upgrade preview — pricing block copy ────────────────────────────────────
//
// Used by ConfirmUpgradeDialog while it fetches and displays the live Stripe
// proration preview. The dialog blocks the Upgrade button until preview loads
// so the user always sees real figures before confirming a charge.

export const PREVIEW_LOADING = "Loading pricing details…";
export const PREVIEW_ERROR = "Couldn't load pricing details.";
export const PREVIEW_RETRY_LABEL = "Retry";

/**
 * Primary "Charged today" label.
 *
 * Takes the TRUE amount charged today (`chargedTodayCents` from the preview =
 * proration + any non-refundable provisioning fee), NOT the proration alone.
 * For a dedicated upgrade the fee is taken today even when proration is $0, so
 * this must not read "No charge today" while a fee is in fact charged.
 * Returns "No charge today" only when the real total is zero.
 */
export function chargedTodayLabel(chargedTodayCents: number): string {
  return chargedTodayCents === 0 ? "No charge today" : formatUsdCents(chargedTodayCents);
}

/**
 * Subtext beneath the "Charged today" label.
 *
 * Three cases, in priority order:
 *   1. A provisioning fee is present (dedicated upgrade) → say so plainly,
 *      because the customer IS charged today (fee, plus proration if any).
 *   2. No fee and zero proration → nothing is taken now; full price at renewal.
 *   3. No fee, positive proration → the usual prorated-remainder line.
 */
export function chargedTodaySubtext(opts: {
  prorationCents: number;
  provisioningFeeCents: number;
}): string {
  const { prorationCents, provisioningFeeCents } = opts;
  if (provisioningFeeCents > 0) {
    return prorationCents > 0
      ? "Includes a one-time non-refundable provisioning fee, plus your plan prorated for the rest of this period."
      : "A one-time non-refundable provisioning fee to set up your dedicated instance.";
  }
  if (prorationCents === 0) {
    return "Your plan upgrades immediately. Full payment starts at your next renewal.";
  }
  return "Prorated for the remainder of your current billing period.";
}

/**
 * Subtext beneath the monthly rate on the "next renewal" row.
 * Example: "Your new monthly rate from May 17."
 */
export function fromDateSubtext(nextInvoiceDate: string | null): string {
  if (!nextInvoiceDate) return "Your new monthly rate from next renewal.";
  const d = new Date(nextInvoiceDate);
  const formatted = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  return `Your new monthly rate from ${formatted}.`;
}

// ─── Limits delta formatters (used by ChangePlanSheet rows) ──────────────────
//
// Each delta formatter compares an upgrade option's cap against the customer's
// current cap and returns a short human string like "+450k atoms". Returns
// `null` when the delta is zero or negative so the row can skip rendering that
// line — no "+0 atoms" artefacts.
//
// Convention: -1 means "unlimited" (matches compute's SUBSTRATE_TIERS limits).
// When the target is unlimited and the current isn't, we render the absolute
// "Unlimited <x>" phrase rather than a delta, because "+∞" is noise.

/**
 * Format an atoms delta. Rounds to a short SI-ish suffix for readability:
 *   <1,000          → "+N atoms"
 *   1,000–999,999   → "+Nk atoms"
 *   ≥1,000,000      → "+N.NM atoms" (trailing .0 trimmed)
 */
export function formatAtomsDelta(currentMax: number, targetMax: number): string | null {
  if (targetMax === -1 && currentMax === -1) return null;
  if (targetMax === -1) return "Unlimited atoms";
  const delta = targetMax - currentMax;
  if (delta <= 0) return null;
  if (delta >= 1_000_000) {
    return `+${(delta / 1_000_000).toFixed(1).replace(/\.0$/, "")}M atoms`;
  }
  if (delta >= 1_000) return `+${Math.round(delta / 1_000)}k atoms`;
  return `+${delta} atoms`;
}

/**
 * Format a bootstraps-per-month delta. Copy reads as "+N bootstraps/mo".
 * Returns "Unlimited bootstraps/mo" when the target removes the cap.
 */
export function formatBootstrapsDelta(currentMax: number, targetMax: number): string | null {
  if (targetMax === -1 && currentMax === -1) return null;
  if (targetMax === -1) return "Unlimited bootstraps/mo";
  const delta = targetMax - currentMax;
  if (delta <= 0) return null;
  if (delta >= 1_000) return `+${Math.round(delta / 1_000)}k bootstraps/mo`;
  return `+${delta} bootstraps/mo`;
}

/**
 * Format a storage delta (both inputs in MB). Switches to GB once the delta
 * crosses 1 GB so "+1 GB" reads better than "+1024 MB".
 */
export function formatStorageDelta(currentMaxMb: number, targetMaxMb: number): string | null {
  if (targetMaxMb === -1 && currentMaxMb === -1) return null;
  if (targetMaxMb === -1) return "Unlimited storage";
  const delta = targetMaxMb - currentMaxMb;
  if (delta <= 0) return null;
  if (delta >= 1024) {
    return `+${(delta / 1024).toFixed(1).replace(/\.0$/, "")} GB storage`;
  }
  return `+${delta} MB storage`;
}
