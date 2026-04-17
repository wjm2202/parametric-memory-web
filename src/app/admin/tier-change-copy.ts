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
// These mirror the backend's response shape from GET /api/v1/billing/tier-change/:slug.
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
 * Success headline for shared_to_dedicated. Reassures the customer that
 * their MCP endpoint and API key are unchanged.
 */
export function slowPathSuccessHeadline(targetTierName: string): string {
  return `Done! You're on ${targetTierName}, on a dedicated instance. Your API key and MCP endpoint are unchanged.`;
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
  "Your MCP endpoint and API key won't change.";

// ─── Sheet + dialog labels ───────────────────────────────────────────────────

export const SHEET_TITLE = "Change plan";
export const SHEET_SUBTITLE_LOADING = "Loading available plans…";
export const SHEET_SUBTITLE_EMPTY = "You're already on the highest available plan.";
export const SHEET_SUBTITLE_ERROR = "We couldn't load your upgrade options. Please try again.";

export const DIALOG_TITLE = "Confirm upgrade";
export const DIALOG_CANCEL_LABEL = "Cancel";
export const DIALOG_CONFIRM_LABEL = "Upgrade";
export const DIALOG_CONFIRM_LABEL_SUBMITTING = "Redirecting to checkout…";

// ─── Query-param toasts (shown on return from Stripe Checkout) ───────────────

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
  "We couldn't create a checkout session. Please try again or contact support.";

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
