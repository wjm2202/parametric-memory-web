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
 * HTTP cache layer.
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
 */

"use client";

import { useCallback, useEffect, useState } from "react";

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
  /** True while the initial fetch is in-flight. False once we have data or an error. */
  loading: boolean;
  /** Last error category, or null on success. */
  error: RecentAuthError;
  /**
   * Re-read /status. Call after any state-changing action (enrol/disable/
   * regenerate) so the UI reflects the new state without a page reload.
   */
  refetch: () => Promise<void>;
}

/**
 * Fetch the current TOTP enrolment + recent-auth state.
 *
 * `initialStatus` lets the parent server component pass a server-rendered
 * value so the first paint shows real data. The hook still fetches on mount
 * to catch the case where status changed between server render and client
 * hydration (e.g. the user enrolled on another tab).
 */
export function useRecentAuth(initialStatus?: TotpStatus | null): UseRecentAuthResult {
  const [status, setStatus] = useState<TotpStatus | null>(initialStatus ?? null);
  const [loading, setLoading] = useState<boolean>(initialStatus == null);
  const [error, setError] = useState<RecentAuthError>(null);

  const refetch = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/factors/totp/status", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.status === 401) {
        setError("session_expired");
        setStatus(null);
        return;
      }
      if (!res.ok) {
        setError("network");
        return;
      }
      const data = (await res.json()) as TotpStatus;
      setStatus(data);
    } catch {
      setError("network");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
    // refetch is stable (useCallback with no deps); the lint rule still
    // wants it in the dep array.
  }, [refetch]);

  return { status, loading, error, refetch };
}
