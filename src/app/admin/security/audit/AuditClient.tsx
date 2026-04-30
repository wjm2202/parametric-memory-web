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
 */

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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

function AuditFeed() {
  const [events, setEvents] = useState<AuthEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<string>("");
  const [loadingFirst, setLoadingFirst] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch a page. When `cursor` is null we're loading the head of the
   * feed (or refreshing after a filter change) — the existing rows are
   * cleared. Otherwise we append.
   */
  const fetchPage = useCallback(async (opts: { cursor: string | null; kind: string }) => {
    const isFirst = opts.cursor === null;
    if (isFirst) {
      setLoadingFirst(true);
      setEvents([]);
      setNextCursor(null);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    const params = new URLSearchParams();
    params.set("limit", "50");
    if (opts.kind.length > 0) params.set("kind", opts.kind);
    if (opts.cursor !== null) params.set("cursor", opts.cursor);

    let res: Response;
    try {
      res = await fetch(`/api/auth/audit?${params.toString()}`, {
        credentials: "same-origin",
      });
    } catch {
      setError("Could not reach the server. Try again.");
      setLoadingFirst(false);
      setLoadingMore(false);
      return;
    }

    if (!res.ok) {
      // 401 reauth_required is handled by RecentAuthGate's own
      // visibility-change refresh; if it fires here something's
      // out of sync. Surface a generic error and a retry button.
      setError(
        res.status === 401
          ? "Your sign-in expired. Refresh the page to sign in again."
          : "Failed to load activity. Try again.",
      );
      setLoadingFirst(false);
      setLoadingMore(false);
      return;
    }

    let body: AuditFeedResponse;
    try {
      body = (await res.json()) as AuditFeedResponse;
    } catch {
      setError("The server returned an unexpected response. Try again.");
      setLoadingFirst(false);
      setLoadingMore(false);
      return;
    }

    setEvents((prev) => (isFirst ? body.events : [...prev, ...body.events]));
    setNextCursor(body.nextCursor);
    setLoadingFirst(false);
    setLoadingMore(false);
  }, []);

  // Initial load + reload when the filter changes.
  useEffect(() => {
    void fetchPage({ cursor: null, kind: kindFilter });
  }, [fetchPage, kindFilter]);

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

      {error !== null && (
        <div
          role="alert"
          data-testid="auth-audit-error"
          className="mb-4 rounded-lg border border-red-500/30 bg-red-500/[0.05] p-3 text-sm text-red-300"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void fetchPage({ cursor: null, kind: kindFilter })}
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

      {!loadingFirst && events.length === 0 && error === null && (
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
            onClick={() => void fetchPage({ cursor: nextCursor, kind: kindFilter })}
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
