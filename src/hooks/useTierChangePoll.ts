/**
 * useTierChangePoll — polls /api/billing/tier-change/:slug every 3 seconds
 * while a tier change is in flight.
 *
 * Behaviour:
 *   - Initial fetch immediately on mount (or on slug change).
 *   - Subsequent polls every 3 s until state hits a terminal value
 *     (completed | failed | rolled_back) or until state becomes "none".
 *   - 404 from the endpoint (no substrate_tier_changes row) is treated as
 *     { state: "none" } — a perfectly normal idle state.
 *   - Other fetch errors fall back to { state: "none", error } so callers
 *     can disable the button and show an unobtrusive error if they want.
 *   - The hook is safe to mount before `slug` is known (returns { state:
 *     "none" } and never polls while slug is null/undefined).
 *
 * ## startPolling() — restarting after an upgrade kicks off (2026-06-10 fix)
 *
 * The original hook stopped polling permanently the first time it saw
 * "none" (the idle page-load case) — and NOTHING restarted it when the user
 * confirmed an upgrade. Combined with the (also fixed) backend contract
 * mismatch, the progress banner never appeared.
 *
 * `startPolling()` re-arms the loop. Because the substrate_tier_changes row
 * is inserted by the Stripe webhook — typically a few seconds AFTER our
 * POST /api/billing/upgrade returns 202 — the re-armed loop must tolerate
 * "none" (row not there yet) and stale terminal states (the previous
 * change's completed/failed row) for a grace window instead of treating
 * them as stop conditions. The grace ends as soon as a live state
 * (payment_pending | queued | processing) is observed, after which the
 * normal stop rules apply; if nothing live appears within
 * KICK_GRACE_MS the loop gives up (webhook lost — the banner staying
 * hidden matches the old behaviour, and the user still has the toast).
 *
 * Consumers (TierChangeProgressBanner, ChangePlanButton) should treat any
 * `state !== "none"` value as "something is happening — disable changes
 * and show the banner".
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  TERMINAL_STATES,
  type TierChangePhase,
  type TierChangeState,
  type TierChangeTransitionKind,
} from "@/app/admin/tier-change-copy";

/** Migration progress fields surfaced by the backend. */
export interface TierChangeMigrationProgress {
  atomCountBefore: number | null;
  atomCountAfter: number | null;
  newDropletIp: string | null;
}

/**
 * Response shape from GET /api/v1/billing/tier-change/:slug.
 * Mirrors PLAN-ADMIN-UPGRADE-FLOW.md §5.1 exactly.
 */
export interface TierChangePollResult {
  state: TierChangeState;
  phase: TierChangePhase;
  targetTier: string | null;
  transitionKind: TierChangeTransitionKind | null;
  startedAt: string | null;
  estimatedCompletionAt: string | null;
  transferAttempts: number;
  migrationProgress: TierChangeMigrationProgress | null;
  error: string | null;
}

/** What the hook hands back: the latest poll result + the re-arm trigger. */
export interface TierChangePoll {
  result: TierChangePollResult;
  /**
   * Re-arm the polling loop after kicking off an upgrade. Call this from
   * the upgrade flow's onUpgradeStarted callback — i.e. right after
   * POST /api/billing/upgrade returns 202.
   */
  startPolling: () => void;
}

/** Default empty state when no row exists or we haven't fetched yet. */
export const IDLE_TIER_CHANGE: TierChangePollResult = {
  state: "none",
  phase: null,
  targetTier: null,
  transitionKind: null,
  startedAt: null,
  estimatedCompletionAt: null,
  transferAttempts: 0,
  migrationProgress: null,
  error: null,
};

const POLL_INTERVAL_MS = 3_000;

/**
 * How long a startPolling() kick keeps the loop alive through "none" /
 * stale-terminal responses while we wait for the Stripe webhook to insert
 * the substrate_tier_changes row. 90 s is generous — webhooks usually land
 * in single-digit seconds — but a kicked loop only costs one request per
 * interval and self-stops at the deadline.
 */
const KICK_GRACE_MS = 90_000;

/**
 * Poll the tier-change endpoint for `slug`. Pass `null` or an empty string to
 * disable polling entirely (the hook will stay idle).
 *
 * Pass `intervalMs` only in tests — production callers should accept the
 * default 3 s.
 */
export function useTierChangePoll(
  slug: string | null | undefined,
  intervalMs: number = POLL_INTERVAL_MS,
): TierChangePoll {
  const [result, setResult] = useState<TierChangePollResult>(IDLE_TIER_CHANGE);
  // Bumping this counter re-runs the polling effect — that's how
  // startPolling() re-arms a loop that has already stopped.
  const [kickCount, setKickCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether the component is still mounted so late responses after
  // unmount don't call setState and trigger a React warning.
  const mountedRef = useRef(true);
  // Timestamp of the most recent startPolling() kick. null = never kicked.
  const kickedAtRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    kickedAtRef.current = Date.now();
    setKickCount((n) => n + 1);
  }, []);

  const doFetch = useCallback(async (): Promise<TierChangePollResult> => {
    if (!slug) return IDLE_TIER_CHANGE;

    try {
      const res = await fetch(`/api/billing/tier-change/${encodeURIComponent(slug)}`, {
        cache: "no-store",
      });

      // 404 => no row exists => idle. Treat as explicit "none".
      if (res.status === 404) {
        return IDLE_TIER_CHANGE;
      }

      if (!res.ok) {
        // Fall back to idle on upstream errors so we don't jam the UI.
        return { ...IDLE_TIER_CHANGE, error: `http_${res.status}` };
      }

      const body = (await res.json()) as Partial<TierChangePollResult>;

      // Normalise missing fields. The backend should provide all of these,
      // but we defend against partial payloads so the UI never crashes.
      return {
        state: (body.state ?? "none") as TierChangeState,
        phase: (body.phase ?? null) as TierChangePhase,
        targetTier: body.targetTier ?? null,
        transitionKind: (body.transitionKind ?? null) as TierChangeTransitionKind | null,
        startedAt: body.startedAt ?? null,
        estimatedCompletionAt: body.estimatedCompletionAt ?? null,
        transferAttempts: body.transferAttempts ?? 0,
        migrationProgress: body.migrationProgress ?? null,
        error: body.error ?? null,
      };
    } catch {
      return { ...IDLE_TIER_CHANGE, error: "network_error" };
    }
  }, [slug]);

  useEffect(() => {
    mountedRef.current = true;
    clearTimer();

    // RC-16 (react-compiler-readiness, 2026-05-27): no `setResult(IDLE)` in
    // this branch. The previous shape called setState here to clear stale
    // poll data when `slug` flipped to null/empty, which tripped the
    // `react-hooks/set-state-in-effect` rule. The derived return at the
    // bottom of the hook (`slug ? result : IDLE_TIER_CHANGE`) covers the
    // same UX requirement — consumers see IDLE whenever they ask the
    // hook for a falsy slug — without any setState during render or in
    // an effect. The internal `result` state may retain its last polled
    // value across a slug→null→slug cycle, but consumers never observe
    // it because the gate at the return statement masks it.
    if (!slug) {
      return () => {
        mountedRef.current = false;
        clearTimer();
      };
    }

    // Within the kick grace window, "none" and stale terminal states are NOT
    // stop conditions — the webhook may not have inserted the new row yet.
    // The grace ends the moment a live (non-terminal, non-none) state shows
    // up; from then on the normal stop rules apply to THIS change.
    let kickSatisfied = false;

    const inKickGrace = (): boolean =>
      kickedAtRef.current !== null &&
      !kickSatisfied &&
      Date.now() - kickedAtRef.current < KICK_GRACE_MS;

    // Recursive self-scheduling poll. We use setTimeout chaining rather than
    // setInterval so slow responses don't stack up concurrent requests.
    let cancelled = false;
    const tick = async () => {
      const next = await doFetch();
      if (cancelled || !mountedRef.current) return;

      setResult(next);

      const isStopState = next.state === "none" || TERMINAL_STATES.has(next.state);

      if (!isStopState) {
        // Live state observed — any pending kick is satisfied; stale-state
        // tolerance is no longer needed for this change.
        kickSatisfied = true;
        kickedAtRef.current = null;
      } else if (!inKickGrace()) {
        // Stop polling once we hit a terminal state or go idle — unless a
        // recent startPolling() kick is still waiting on the webhook.
        return;
      }

      timerRef.current = setTimeout(tick, intervalMs);
    };

    tick();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      clearTimer();
    };
  }, [slug, intervalMs, doFetch, clearTimer, kickCount]);

  // RC-16: derive IDLE for the !slug case at the consumer boundary instead
  // of setting it via setState inside the effect.
  return { result: slug ? result : IDLE_TIER_CHANGE, startPolling };
}
