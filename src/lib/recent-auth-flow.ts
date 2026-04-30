/**
 * Recent-auth flow — kick off a magic-link re-verification round-trip.
 *
 * ## Purpose
 *
 * Before letting the user mutate TOTP state (enrol, disable, regenerate
 * backup codes), the security gate checks that `recentAuthFresh` is true.
 * If it isn't, the gate offers a "Re-verify your identity" button. This
 * helper backs that button.
 *
 * ## What it does
 *
 * 1. Sets `mmpm_redirect` to the page the user was on, so /auth/callback
 *    can send them back after the magic-link clickthrough. Same mechanism
 *    used by the login page (see src/app/login/LoginClient.tsx:156).
 *    15-minute max-age so a stale redirect-pointer can't outlive a
 *    legitimate magic-link round-trip.
 * 2. POSTs to /api/auth/request-link via the existing auth proxy. The
 *    proxy forwards to mmpm-compute, which sends the email and returns
 *    the standard `{ ok: true, message: '...' }` envelope (always 200 —
 *    compute deliberately never reveals whether the address exists).
 *
 * ## Why this is a lib helper, not a route handler
 *
 * Setting the cookie is a one-liner from the client (cookies without the
 * httpOnly flag are writable from JS). The auth proxy already exists and
 * already does CSRF + session forwarding for the request-link call. A
 * dedicated route handler would add a hop without doing anything the
 * client can't do directly. Mirrors LoginClient's existing approach.
 *
 * ## Allow-list for the `next` parameter
 *
 * Recent-auth pre-flight is only used inside /admin/security/**, so the
 * allow-list is intentionally narrow. Rejecting an unexpected `next`
 * fail-closes to /admin/security so the user still ends up somewhere
 * sensible after re-verifying. This is a defence-in-depth check on top
 * of /auth/callback's existing validation.
 */

const REDIRECT_COOKIE = "mmpm_redirect";
const REDIRECT_MAX_AGE_SEC = 15 * 60; // 15 minutes — magic links expire at 15 min so this matches.

/** Paths that recent-auth pre-flight may legitimately return to. */
const ALLOWED_NEXT_PATHS = [
  "/admin/security",
  "/admin/security/two-factor",
  "/admin/security/two-factor/disable",
  "/admin/security/two-factor/regenerate",
] as const;

/** Default destination if a caller passes a `next` value we don't recognise. */
const DEFAULT_NEXT = "/admin/security";

export interface TriggerRecentAuthFlowOpts {
  /** The email of the currently signed-in account. The page reads this from /api/auth/me. */
  email: string;
  /** Where to send the user after the magic-link clickthrough. Allow-list checked. */
  next: string;
}

export interface TriggerRecentAuthFlowResult {
  /** True iff the request-link API returned 2xx. */
  ok: boolean;
  /** Stable error code, or undefined on success. */
  errorCode?: "rate_limited" | "network" | "validation" | "unknown";
  /** Human-readable error string for inline display. Stable across retries. */
  errorMessage?: string;
}

/**
 * Validate `next` against the allow-list. Returns the canonical path or
 * the default if the input is unknown / hostile. Mirrors the spirit of
 * src/lib/auth/return-to.ts but smaller — recent-auth has a much
 * narrower allowed set.
 */
export function canonicaliseNext(next: string): string {
  // Exact match against the allow-list.
  if ((ALLOWED_NEXT_PATHS as readonly string[]).includes(next)) return next;
  return DEFAULT_NEXT;
}

/**
 * Fire the recent-auth re-verification flow. Returns once the request-link
 * email has been triggered (or failed). The caller renders a "check your
 * email" UI on `ok: true` and an inline error on failure.
 *
 * Test note: `fetch` is the only side effect besides setting the cookie;
 * tests stub global fetch and inspect document.cookie.
 */
export async function triggerRecentAuthFlow(
  opts: TriggerRecentAuthFlowOpts,
): Promise<TriggerRecentAuthFlowResult> {
  const safeNext = canonicaliseNext(opts.next);

  // Set the redirect-pointer cookie before firing the email so that even if
  // the user clicks the magic link before the response surfaces in the UI,
  // /auth/callback already knows where to send them.
  // Not httpOnly — set from JS — but it's a redirect pointer, not a secret.
  // 15-min max-age matches the magic-link TTL.
  if (typeof document !== "undefined") {
    document.cookie =
      `${REDIRECT_COOKIE}=${encodeURIComponent(safeNext)};` +
      `path=/;max-age=${REDIRECT_MAX_AGE_SEC};samesite=lax`;
  }

  let res: Response;
  try {
    res = await fetch("/api/auth/request-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: opts.email }),
      credentials: "same-origin",
    });
  } catch {
    return {
      ok: false,
      errorCode: "network",
      errorMessage: "Could not reach the server. Try again.",
    };
  }

  if (res.status === 429) {
    return {
      ok: false,
      errorCode: "rate_limited",
      errorMessage: "Too many requests. Try again in a few minutes.",
    };
  }

  if (res.status === 400) {
    return {
      ok: false,
      errorCode: "validation",
      errorMessage: "We couldn't accept that email address. Try signing out and back in.",
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      errorCode: "unknown",
      errorMessage: "Something went wrong. Try again or contact support.",
    };
  }

  return { ok: true };
}
