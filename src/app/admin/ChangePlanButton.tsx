/**
 * ChangePlanButton — the button in the Billing card that opens the
 * tier-comparison sheet. Replaces the old "Upgrade" button that pushed the
 * user to `/pricing` and threw away the substrate context.
 *
 * Responsibilities:
 *   - Render a "Change plan" button inside the Billing card.
 *   - When clicked, open <ChangePlanSheet /> anchored to this substrate.
 *   - If a tier change is already in flight (useTierChangePoll reports
 *     anything other than state: "none"), swap the label to
 *     "Upgrade in progress…" and disable the button. The user cannot start
 *     a second upgrade while one is already running — the backend would
 *     reject it with 409 anyway, but disabling the button short-circuits
 *     that round-trip.
 *
 * Per the hook contract in useTierChangePoll.ts, `state !== "none"` is the
 * single predicate consumers use to decide "something is happening". That
 * includes terminal states (completed / failed / rolled_back) which stick
 * around briefly while the banner dismisses — during those seconds the
 * button stays disabled too, which is fine: the banner is communicating the
 * outcome, and the customer doesn't need a second upgrade entrypoint right
 * then.
 *
 * @see PLAN-ADMIN-UPGRADE-FLOW.md §4.1
 */

"use client";

import { useState } from "react";
import { CHANGE_PLAN_BUTTON_IN_FLIGHT_LABEL, CHANGE_PLAN_BUTTON_LABEL } from "./tier-change-copy";
import { ChangePlanSheet, type CurrentTierLimits } from "./ChangePlanSheet";
import type { TierChangePollResult } from "@/hooks/useTierChangePoll";

interface Props {
  /** Forwarded to the sheet + the upgrade-options fetch. */
  substrateSlug: string;
  /** Current tier ID. Forwarded to the sheet / dialog. */
  currentTier: string;
  /** Current tier's caps; used to render per-row deltas in the sheet. */
  currentLimits: CurrentTierLimits | null;
  /** Next billing date; forwarded to the dialog for the "…on May 17" copy. */
  nextBillingDate: Date | null;
  /**
   * Current poll result — AdminClient owns one useTierChangePoll() instance
   * and passes the result to both this button and the progress banner so
   * there's a single source of truth (and a single poll interval running).
   */
  pollResult: TierChangePollResult;
  /**
   * Optional extra classes for the button. Admin page positioning needs,
   * e.g. "rounded-lg bg-indigo-600 px-4 py-2 text-sm", lives in AdminClient —
   * we accept a className so the button can slot into the existing layout
   * without duplicating Tailwind fragments here.
   */
  className?: string;
}

/**
 * `state !== "none"` is the single predicate the hook's docstring asks
 * consumers to use. Centralised here (one call site) so a future refactor
 * changes it in one place.
 */
function isInFlight(result: TierChangePollResult): boolean {
  return result.state !== "none";
}

export function ChangePlanButton({
  substrateSlug,
  currentTier,
  currentLimits,
  nextBillingDate,
  pollResult,
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  const inFlight = isInFlight(pollResult);
  const label = inFlight ? CHANGE_PLAN_BUTTON_IN_FLIGHT_LABEL : CHANGE_PLAN_BUTTON_LABEL;

  // Default look matches the rest of the Billing-card action buttons in
  // AdminClient. Callers can override via className.
  const defaultClasses =
    "rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={inFlight}
        aria-disabled={inFlight}
        data-testid="change-plan-button"
        data-inflight={inFlight ? "true" : "false"}
        className={className ?? defaultClasses}
      >
        {label}
      </button>

      <ChangePlanSheet
        open={open}
        onClose={() => setOpen(false)}
        substrateSlug={substrateSlug}
        currentTier={currentTier}
        currentLimits={currentLimits}
        nextBillingDate={nextBillingDate}
      />
    </>
  );
}
