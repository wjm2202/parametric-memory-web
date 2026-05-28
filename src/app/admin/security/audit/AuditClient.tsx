/**
 * AuditClient — interactive client component for /admin/security/audit.
 *
 * Sprint 7. Renders the auth-events feed with cursor pagination, kind
 * filter, and a "load more" button. Wraps everything in RecentAuthGate so
 * a stale recent-auth window prompts for a magic-link round-trip before
 * the first row is ever fetched.
 *
 * ## State machine
 *
 *   initial:           gate-rendered. Once fresh, kicks off page 1 fetch.
 *   loading-first:     page 1 in flight. Skeleton.
 *   loading-more:      next page in flight. Existing rows visible.
 *   ready:             rows visible, "load more" button if nextCursor.
 *   empty:             no rows. Empty-state copy.
 *   error:             fetch failed. Inline error + retry button.
 *
 * ## Why we re-fetch on filter change instead of slicing locally
 *
 * The page size cap is 200 rows on the server. Filtering locally would
 * mean: load 200 most-recent rows, filter to the 3 the user picked, show
 * "no more" — but there could be hundreds of rows of the filtered kind
 * further back. Server-side filter is the only correct UX. Cursor resets
 * on filter change.
 *
 * ## Why "load more" instead of infinite scroll
 *
 * Infinite scroll on a security audit page is hostile UX. The user is
 * usually scanning for a specific event ("did I sign in from there?")
 * and an explicit "Load older events" button gives them control. Same
 * reason GitHub's audit log uses pagination, not infinite scroll.
 *
 * ## React-Compiler note (RC-05, 2026-05-27)
 *
 * The previous shape used a `fetchPage` useCallback that pushed into
 * `useState` from inside its own body, and an on-mount `useEffect` that
 * called `void fetchPage(...)`. That tripped the
 * `react-hooks/set-state-in-effect` rule because the effect's only job
 * was to drive state updates. SWR's `useSWRInfinite` owns the pagination
 * state machine (data array, isLoading/isValidating, mutate to retry),
 * so the call site no longer has any effect of ours.
 */

"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { RecentAuthGate } from "@/components/RecentAuthGate";
import { formatAuthEvent, formatActorIp, type AuthEvent } from "@/lib/format-auth-event";
import { parseUserAgent } from "@/lib/parse-user-agent";

interface AccountInfo {
  id: string;
  email: string;
}

interface AuditClientProps {
  account: AccountInfo;
}

interface AuditFeedResponse {
  events: AuthEvent[];
  nextCursor: string | null;
}

/**
 * The set of event kinds the filter dropdown offers. Subset of the full
 * 19-kind union from migration 080 — we expose the kinds users care about
 * and group internal/admin events under "All other events" via the
 * "everything" option (no kind filter).
 *
 * Adding a new kind here is a one-line edit. The server accepts any kind
 * string in `?kind=`, including unknown ones (returns empty), so the
 * filter dropdown is forward-compatible across deploys.
 */
const KIND_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All events" },
  {
    value: "magic_link_verified,magic_link_requested,magic_link_failed",
    label: "Sign-in via email",
  },
  {
    value: "oauth_signin,oauth_link,oauth_unlink,oauth_auto_link,oauth_rejected",
    label: "OAuth (Google / GitHub)",
  },
  {
    value:
      "factor_enrolled,factor_disabled,factor_verified,factor_failed,backup_code_used,backup_codes_regenerated",
    label: "Two-factor changes",
  },
  { value: "session_created,session_revoked,recent_auth_stamped", label: "Sessions & identity" },
  { value: "account_deleted", label: "Account deletion" },
];

export default function AuditClient({ account }: AuditClientProps) {
  return (
    <div className="min-h-screen bg-[#030712] text-white">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-[family-name:var(--font-syne)] text-2xl font-semibold text-white">
            Recent activity on your account
          </h1>
          <Link
            href="/admin/security"
            data-testid="auth-audit-back-to-security"
            className="text-sm text-white/60 underline transition-colors hover:text-white/90"
          >
            ← Back to security
          </Link>
        </div>

        <RecentAuthGate email={account.email} next="/admin/security/audit">
          <AuditFeed />
        </RecentAuthGate>
      </div>
    </div>
  );
}

/**
 * Categorised error wrapper — SWR's `error` exposes whatever the fetcher
 * throws, so embedding the user-facing copy on the error keeps the
 * render branch trivial (`error?.message`) without re-classifying.
 */
class AuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditError";
  }
}

/**
 * SWR fetcher. Tuple key `["audit", kind, cursor]` so we can disambiguate
 * cache entries when the filter changes or pagination advances. The
 * fetcher throws AuditError with the user-facing copy attached so the
 * render branch doesn't need its own switch on res.status.
 */
async function fetchAuditPage(
  key: readonly ["audit", string, string | null],
): Promise<AuditFeedResponse> {
  const [, kind, cursor] = key;
  const params = new URLSearchParams();
  params.set("limit", "50");
  if (kind.length > 0) params.set("kind", kind);
  if (cursor !== null) params.set("cursor", cursor);

  let res: Response;
  try {
    res = await fetch(`/api/auth/audit?${params.toString()}`, {
      credentials: "same-origin",
    });
  } catch {
    throw new AuditError("Could not reach the server. Try again.");
  }

  if (!res.ok) {
    if (res.status === 401) {
      // 401 reauth_required is handled by RecentAuthGate's own
      // visibility-change refresh; if it fires here something's
      // out of sync. Surface generic copy + retry as belt-and-braces.
      throw new AuditError("Your sign-in expired. Refresh the page to sign in again.");
    }
    throw new AuditError("Failed to load activity. Try again.");
  }

  try {
    return (await res.json()) as AuditFeedResponse;
  } catch {
    throw new AuditError("The server returned an unexpected response. Try again.");
  }
}

function AuditFeed() {
  const [kindFilter, setKindFilter] = useState<string>("");

  // `getKey` derives the SWR cache key from the page index + the previous
  // page's response. Returning `null` signals "no more pages" so
  // useSWRInfinite stops growing. Filter changes flow through the closure
  // and re-key every page (which causes a cache miss + refetch on page 1).
  const getKey = useCallback(
    (
      pageIndex: number,
      previousPageData: AuditFeedResponse | null,
    ): readonly ["audit", string, string | null] | null => {
      if (previousPageData && previousPageData.nextCursor === null) return null;
      if (pageIndex === 0) return ["audit", kindFilter, null] as const;
      return ["audit", kindFilter, previousPageData!.nextCursor] as const;
    },
    [kindFilter],
  );

  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite<
    AuditFeedResponse,
    AuditError
  >(getKey, fetchAuditPage, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // We never want the first page silently re-fetched when a later page
    // updates — that would clobber the currently-rendered list. The
    // "Load older events" flow strictly appends.
    revalidateFirstPage: false,
    shouldRetryOnError: false,
  });

  // Flatten the pages array into a single event list for the render. SWR's
  // `data` is undefined before the first fetch resolves; `events` is
  // always an array so downstream `.length` checks don't NPE.
  const events: AuthEvent[] = data ? data.flatMap((p) => p.events) : [];
  const lastPage = data && data.length > 0 ? data[data.length - 1] : null;
  const nextCursor = lastPage?.nextCursor ?? null;

  // Loading mappings:
  //   loadingFirst: cold-start fetch OR a filter change that's invalidated
  //     all pages → data is undefined while SWR re-fetches page 1.
  //   loadingMore: user asked for an additional page (size grew beyond
  //     data.length) and SWR is in flight resolving it.
  const loadingFirst = isLoading || (isValidating && !data);
  const loadingMore = isValidating && data !== undefined && data.length > 0 && size > data.length;

  const errorMessage = error?.message ?? null;

  const handleRetry = useCallback(() => {
    void mutate();
  }, [mutate]);

  const handleLoadMore = useCallback(() => {
    void setSize((s) => s + 1);
  }, [setSize]);

  return (
    <div
      data-testid="auth-audit-feed"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/60">
          Every sign-in, sign-out, and security setting change. Most recent first.
        </p>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          disabled={loadingFirst}
          data-testid="auth-audit-kind-filter"
          aria-label="Filter activity by kind"
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-white transition-colors outline-none focus:border-white/30 focus:bg-white/[0.06] disabled:opacity-50"
        >
          {KIND_FILTERS.map((opt) => (
            <option key={opt.label} value={opt.value} className="bg-[#030712] text-white">
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {errorMessage !== null && (
        <div
          role="alert"
          data-testid="auth-audit-error"
          className="mb-4 rounded-lg border border-red-500/30 bg-red-500/[0.05] p-3 text-sm text-red-300"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={handleRetry}
            data-testid="auth-audit-retry"
            className="ml-3 underline transition-opacity hover:opacity-80"
          >
            Retry
          </button>
        </div>
      )}

      {loadingFirst && events.length === 0 && (
        <p data-testid="auth-audit-loading" className="text-sm text-white/50">
          Loading recent activity…
        </p>
      )}

      {!loadingFirst && events.length === 0 && errorMessage === null && (
        <p data-testid="auth-audit-empty" className="text-sm text-white/50">
          No activity to show yet.
        </p>
      )}

      {events.length > 0 && (
        <ul data-testid="auth-audit-list" className="divide-y divide-white/10">
          {events.map((event) => (
            <li
              key={event.id}
              data-testid="auth-audit-item"
              data-event-kind={event.eventKind}
              className="py-3"
            >
              <p className="text-sm text-white">{formatAuthEvent(event)}</p>
              <p className="mt-1 text-xs text-white/50">
                <FormattedTime iso={event.occurredAt} />
                <SeparatorIfBoth left={event.actorUa !== null} right>
                  {parseUserAgent(event.actorUa)}
                </SeparatorIfBoth>
                <SeparatorIfBoth left right={event.actorIp !== null}>
                  {formatActorIp(event.actorIp) ?? "Unknown IP"}
                </SeparatorIfBoth>
              </p>
            </li>
          ))}
        </ul>
      )}

      {nextCursor !== null && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            data-testid="auth-audit-load-more"
            className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load older events"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Render a timestamp using the user's locale. Hydration-safe — server and
 * client both produce the same string because we pass the ISO directly to
 * `new Date()` and Intl.DateTimeFormat is deterministic given the same
 * locale / options.
 *
 * (toLocaleString defaults to the user's locale on both server and client,
 * which CAN diverge if the server's process LANG differs. We pin via
 * an explicit format that's stable across locales: short date + short time.)
 */
function FormattedTime({ iso }: { iso: string }) {
  const d = new Date(iso);
  // Stable across locales: short ISO-like rendering.
  const pad = (n: number) => String(n).padStart(2, "0");
  const text = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return <time dateTime={iso}>{text}</time>;
}

/**
 * Tiny inline " · " separator that only renders when there's something on
 * BOTH sides of it. Keeps the compact metadata line clean when one of
 * actorUa / actorIp is null.
 */
function SeparatorIfBoth({
  left,
  right,
  children,
}: {
  left: boolean;
  right: boolean;
  children: React.ReactNode;
}) {
  if (!left || !right) {
    if (right) return <>{children}</>;
    return null;
  }
  return (
    <>
      {" · "}
      {children}
    </>
  );
}
