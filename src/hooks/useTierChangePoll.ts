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
 * Poll the tier-change endpoint for `slug`. Pass `null` or an empty string to
 * disable polling entirely (the hook will stay idle).
 *
 * Pass `intervalMs` only in tests — production callers should accept the
 * default 3 s.
 */
export function useTierChangePoll(
  slug: string | null | undefined,
  intervalMs: number = POLL_INTERVAL_MS,
): TierChangePollResult {
  const [result, setResult] = useState<TierChangePollResult>(IDLE_TIER_CHANGE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether the component is still mounted so late responses after
  // unmount don't call setState and trigger a React warning.
  const mountedRef = useRef(true);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
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

    if (!slug) {
      setResult(IDLE_TIER_CHANGE);
      return () => {
        mountedRef.current = false;
        clearTimer();
      };
    }

    // Recursive self-scheduling poll. We use setTimeout chaining rather than
    // setInterval so slow responses don't stack up concurrent requests.
    let cancelled = false;
    const tick = async () => {
      const next = await doFetch();
      if (cancelled || !mountedRef.current) return;

      setResult(next);

      // Stop polling once we hit a terminal state or we go idle.
      if (next.state === "none" || TERMINAL_STATES.has(next.state)) {
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
  }, [slug, intervalMs, doFetch, clearTimer]);

  return result;
}
