/**
 * useRecentAuth — read TOTP /status and surface the recent-auth window state.
 *
 * Returns the four fields the website needs to make the pre-flight decision:
 * whether the recent-auth window is fresh, when it expires, the current TOTP
 * enrolment state (so the wizard can render the right step), and a loading
 * flag the parent uses to render a skeleton.
 *
 * ## Why a hook and not a context provider
 *
 * The TOTP status is read in three places: the security card on
 * /admin/security, the wizard at /admin/security/two-factor, and the
 * disable/regenerate flows. Each consumer needs its own fetch (status can
 * change between page transitions, e.g. user enrols on another tab) so a
 * shared context cache would leak stale state. Each call site mounts the
 * hook independently; the in-flight overlap is irrelevant — /status is
 * cheap (single SELECT in compute) and the requests deduplicate at the
 * HTTP cache layer. SWR's own dedupe (default 2s) further short-circuits
 * the duplicate-fetch problem at the cost of a brief shared-cache window
 * between sibling mounts.
 *
 * ## Why we read /status server-side too
 *
 * The page's server component (`page.tsx`) calls /status once on the
 * initial render to avoid a flash of "loading" before the first paint.
 * The client hook is the source of truth thereafter — any state-changing
 * action (enrol, disable, regenerate) calls `refetch()` so the card
 * reflects the new state immediately.
 *
 * ## Error handling
 *
 * - 401 from /status indicates the session is dead, not stale recent-auth.
 *   The hook surfaces `error: 'session_expired'` and the gate redirects to
 *   /login. Recent-auth-stale is a 200 with `recentAuthFresh: false`,
 *   never a 401 — the route policy at compute/policy.ts is `{ session:
 *   'required' }` only for /status, so the recent-auth check is a body
 *   field, not a status code.
 * - Network errors surface as `error: 'network'` and the parent renders
 *   a retry button.
 *
 * ## React-Compiler note (RC-15, 2026-05-27)
 *
 * The previous implementation used a manual `useState` + `useEffect`
 * + `useCallback(refetch)` triad. The on-mount `void refetch()` inside
 * `useEffect` set state synchronously when the request resolved, which
 * tripped `react-hooks/set-state-in-effect`. SWR is the documented
 * remedy: it owns the effect / state machine internally and exposes the
 * snapshot through React's official `use-sync-external-store` shim, so
 * the call site has no effect to flag.
 */

"use client";

import { useCallback } from "react";
import useSWR from "swr";

export interface TotpStatus {
  /** True iff TOTP is fully enrolled (active row, not half-enrolled). */
  enrolled: boolean;
  /** ISO timestamp of the last successful TOTP verify, or null. */
  lastUsedAt: string | null;
  /** Count of unused backup codes. 0 if not enrolled. */
  backupCodesRemaining: number;
  /** True iff the calling session is currently within the recent-auth window. */
  recentAuthFresh: boolean;
  /** ISO timestamp of when the recent-auth window expires, or null if expired. */
  recentAuthExpiresAt: string | null;
}

export type RecentAuthError = "session_expired" | "network" | null;

export interface UseRecentAuthResult {
  /** The latest /status response, or null while loading or after error. */
  status: TotpStatus | null;
  /** True while a fetch is in-flight (initial or refresh). */
  loading: boolean;
  /** Last error category, or null on success. */
  error: RecentAuthError;
  /**
   * Re-read /status. Call after any state-changing action (enrol/disable/
   * regenerate) so the UI reflects the new state without a page reload.
   */
  refetch: () => Promise<void>;
}

/** Canonical /status URL — exported so tests and consumers share the constant. */
export const TOTP_STATUS_URL = "/api/auth/factors/totp/status";

/**
 * Categorised fetch error. SWR exposes the thrown value through `error`;
 * carrying the category as a field keeps the public surface unchanged.
 */
class TotpStatusError extends Error {
  readonly category: NonNullable<RecentAuthError>;
  constructor(category: NonNullable<RecentAuthError>) {
    super(category);
    this.name = "TotpStatusError";
    this.category = category;
  }
}

/** SWR fetcher for /status — throws categorised errors so the hook can map them. */
async function fetchTotpStatus(url: string): Promise<TotpStatus> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new TotpStatusError("network");
  }
  if (res.status === 401) throw new TotpStatusError("session_expired");
  if (!res.ok) throw new TotpStatusError("network");
  return (await res.json()) as TotpStatus;
}

/**
 * Fetch the current TOTP enrolment + recent-auth state.
 *
 * `initialStatus` lets the parent server component pass a server-rendered
 * value so the first paint shows real data. The hook still fetches on mount
 * to catch the case where status changed between server render and client
 * hydration (e.g. the user enrolled on another tab) — SWR's `fallbackData`
 * carries the SSR value and then revalidates immediately.
 */
export function useRecentAuth(initialStatus?: TotpStatus | null): UseRecentAuthResult {
  const { data, error, isLoading, isValidating, mutate } = useSWR<TotpStatus, TotpStatusError>(
    TOTP_STATUS_URL,
    fetchTotpStatus,
    {
      // Match the pre-SWR behaviour: only revalidate on explicit refetch
      // (caller's action) or reconnect; never on tab focus. The hook is
      // already mounted in multiple places, so focus-revalidate would
      // hammer compute for no UX gain.
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      // Surface errors to the UI immediately; the parent renders a retry
      // button rather than waiting for an exponential backoff. Preserves
      // the previous fetch-and-set behaviour exactly.
      shouldRetryOnError: false,
      // Server-rendered initial value, if the parent passed one.
      fallbackData: initialStatus ?? undefined,
    },
  );

  // Translate the SWR snapshot into the existing public surface.
  const errCategory: RecentAuthError = error?.category ?? null;
  // session_expired clears status (the session is dead — any cached body is
  // by definition stale). network errors leave the previous successful
  // payload in place so the UI can render a retry without losing context.
  const status: TotpStatus | null = errCategory === "session_expired" ? null : (data ?? null);
  // `loading` covers both the cold initial fetch (isLoading) and any
  // explicit refetch / reconnect revalidation (isValidating). The original
  // hook flipped loading=true → false on every refetch call, so this is the
  // closest behavioural match.
  const loading = isLoading || isValidating;

  // refetch is a stable callback. SWR's mutate() with no args revalidates;
  // we await the returned promise so the caller's await result.refetch()
  // resolves only after the new data has been written.
  const refetch = useCallback(async (): Promise<void> => {
    await mutate();
  }, [mutate]);

  return { status, loading, error: errCategory, refetch };
}
