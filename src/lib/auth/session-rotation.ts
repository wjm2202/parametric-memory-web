/**
 * Session cookie rotation helper (ADR-003 Phase 2 OAuth, T5).
 *
 * Purpose
 * ───────
 * After any auth event that changes *who* the browser is authenticated as —
 * completing OAuth sign-in, linking a new provider, stepping up a session
 * — the session cookie MUST be rotated. Two classes of bug this prevents:
 *
 *   1. Session fixation. An attacker pre-sets `mmpm_session=victimKnown`
 *      on the victim's browser (e.g. via a subdomain XSS or a poorly-
 *      scoped `Set-Cookie` from a compromised third-party widget). The
 *      victim then signs in. Without rotation, the attacker's chosen
 *      cookie value is now mapped to a real server-side session and the
 *      attacker can impersonate. Rotation renders the pre-set value dead.
 *
 *   2. Drift between the OAuth path and the magic-link path. Magic-link
 *      already sets the cookie at `src/app/auth/callback/route.ts` with a
 *      specific attribute set (httpOnly, secure=!localhost, SameSite=Lax,
 *      Path=/, Max-Age=30d). If the OAuth callback invented its own
 *      attribute set we would end up with two cookies in flight on the
 *      same browser session, or one cookie that shadows the other on
 *      next deploy. This module is the one place both paths should
 *      eventually consume — T5 writes the helper; later cleanup can
 *      migrate magic-link onto it.
 *
 * API shape
 * ─────────
 * The helper takes a `SessionCookieStore` (a structural subset of
 * Next.js's `cookies()` return value) and writes to it. It does NOT call
 * `cookies()` itself — that would couple the helper to the Next.js
 * server runtime and make tests require a Next.js request context.
 * Callers pass `await cookies()` at the call site:
 *
 *     const cookieStore = await cookies();
 *     const secure = isSecureHost(request.nextUrl.hostname);
 *     rotateSessionCookie(cookieStore, sessionToken, { secure });
 *
 * `secure` is required, not defaulted. A silent default here is a
 * footgun: set `secure: true` on a localhost HTTP request and the
 * browser drops the cookie without any error message — the user appears
 * logged out immediately after signing in. Forcing the call site to
 * choose means the decision is visible in code review.
 *
 * Rotation semantics
 * ──────────────────
 * Next.js's `cookies().set(name, value, opts)` is idempotent on the
 * cookie name — calling it twice emits a single Set-Cookie header for
 * the latest value, not two. "Rotation" therefore means "call set with
 * the new token value"; no explicit delete-then-set is needed. See the
 * "replaces, not appends" test for the behavioural contract.
 *
 * Clear semantics
 * ───────────────
 * `clearSessionCookie` calls `.delete(name)` which emits a Set-Cookie
 * with Max-Age=0 and an empty value — the canonical browser-instruction
 * to forget the cookie. Prefer this over `rotateSessionCookie(…, '', …)`
 * — setting an empty value would leave a zero-length cookie in flight
 * until Max-Age elapsed, which is both wasteful and a minor leak.
 */

/**
 * The single source of truth for the session cookie name on the
 * website. Must match whatever compute/auth emits in the `Set-Cookie`
 * it would send directly (today compute returns the token in a JSON
 * body and the website sets the cookie — same name, same attributes).
 */
export const SESSION_COOKIE_NAME = "mmpm_session";

/**
 * Default Max-Age for the session cookie, in seconds. 30 days matches
 * the existing magic-link callback. If this changes, update both places
 * in the same commit — mismatched lifetimes create confused "am I still
 * logged in?" UX when one path renews and the other expires.
 */
export const DEFAULT_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Structural subset of Next.js's `cookies()` return type that we
 * actually use. Declaring this here (instead of importing the Next
 * internal type) keeps the helper import-graph-free of `next/headers`
 * in tests — any minimal fake with the right method shape will do.
 *
 * The real Next.js `ReadonlyRequestCookies.set` accepts either the
 * three-argument `(name, value, options)` form or a single `{ name,
 * value, ...options }` object. We standardise on the three-argument
 * form because it is the form the existing magic-link callback uses
 * and the form every test fake in this repo already implements.
 */
export interface SessionCookieStore {
  set(
    name: string,
    value: string,
    options: {
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: "lax" | "strict" | "none" | boolean;
      path?: string;
      maxAge?: number;
      domain?: string;
      expires?: Date;
    },
  ): unknown;
  delete(name: string): unknown;
}

/**
 * Per-call options. Only `secure` is required — see module header for
 * why we refuse to default it.
 */
export interface SessionCookieOptions {
  /**
   * Whether to set the `Secure` flag on the cookie. MUST be `false` on
   * localhost HTTP (the browser drops `Secure` cookies over plain
   * HTTP) and `true` everywhere else. Compose with `isSecureHost()`
   * for the standard derivation from a request hostname.
   */
  secure: boolean;
  /** Max-Age in seconds. Default: `DEFAULT_SESSION_MAX_AGE_SECONDS`. */
  maxAge?: number;
  /** Cookie path. Default: `"/"`. */
  path?: string;
  /**
   * `SameSite` attribute. Default: `"lax"`. `"lax"` is the right choice
   * for a session cookie that needs to work with top-level OAuth
   * redirects coming back from Google/GitHub (a POST redirect under
   * "strict" would drop the cookie on the callback request).
   */
  sameSite?: "lax" | "strict" | "none";
  /**
   * Explicit cookie domain. Default: omitted, so the browser scopes
   * the cookie to the exact origin that served it. Only set this when
   * you deliberately want subdomain sharing (e.g. `.parametric-memory.
   * dev` to cover `api.` and `app.` together).
   */
  domain?: string;
}

/**
 * Compute `secure` from a request hostname. `localhost` and
 * `127.0.0.1` are development only — Chrome treats them as secure
 * contexts for most APIs but enforces the HTTP rule that `Secure`
 * cookies are only set on HTTPS connections. Setting `secure: true`
 * here on dev would make every login silently fail.
 *
 * Production hostnames always return `true`; the website is not
 * expected to be reachable over plain HTTP in any environment other
 * than dev.
 */
export function isSecureHost(hostname: string): boolean {
  return hostname !== "localhost" && hostname !== "127.0.0.1";
}

/**
 * Set (or replace) the session cookie. Called after any successful
 * auth event: magic-link verify, OAuth signin, OAuth link.
 *
 * Throws on empty `sessionToken`. A zero-length session token is never
 * a legitimate value — the caller either has one or does not. Setting
 * an empty cookie would be indistinguishable on the wire from "no
 * session" and would silently corrupt the signed-in state.
 */
export function rotateSessionCookie(
  cookieStore: SessionCookieStore,
  sessionToken: string,
  options: SessionCookieOptions,
): void {
  if (typeof sessionToken !== "string" || sessionToken.length === 0) {
    throw new Error(
      "rotateSessionCookie: sessionToken must be a non-empty string. " +
        "An empty value would produce a zero-length session cookie " +
        "that the server treats as unauthenticated — refusing to set.",
    );
  }

  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true, // always — never readable from client JS
    secure: options.secure,
    sameSite: options.sameSite ?? "lax",
    path: options.path ?? "/",
    maxAge: options.maxAge ?? DEFAULT_SESSION_MAX_AGE_SECONDS,
    ...(options.domain ? { domain: options.domain } : {}),
  });
}

/**
 * Delete the session cookie. Used on logout and on any error branch
 * of the OAuth callback that decides the browser should be logged out
 * (e.g. a `rejected` outcome from the bridge when there's a pre-
 * existing stale session).
 *
 * This is the canonical `.delete(name)` path, which emits a Set-Cookie
 * with `Max-Age=0` and an empty value. Do not try to clear by calling
 * `rotateSessionCookie(..., '', ...)` — that emits a real (if empty)
 * cookie and defeats the purpose.
 */
export function clearSessionCookie(cookieStore: SessionCookieStore): void {
  cookieStore.delete(SESSION_COOKIE_NAME);
}
