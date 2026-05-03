/**
 * Reauth helper — detect and surface the `reauth_required` 401 that compute
 * emits on protected actions (e.g. rotate-key, billing/portal).
 *
 * ## Background
 *
 * Compute gates sensitive actions behind a recent-auth window (factor-aware: 10 min single-factor, 30 min TOTP)
 * (see `parametric-memory-compute/src/middleware/recent-auth.ts`). When the
 * window has expired, the server returns:
 *
 *   HTTP 401
 *   {
 *     "error": "This action requires you to sign in again",
 *     "code": "reauth_required",
 *     "reauthAgeSeconds": <number>
 *   }
 *
 * The BFF (computeProxy) forwards both the status and the body verbatim,
 * so the website client sees the same shape on `/api/...`.
 *
 * Without this helper, every consumer's "non-ok" branch falls back to a
 * generic "HTTP 401" toast/alert — leaving the user with no explanation
 * and no path forward. The fix is to detect the structured code, switch
 * the UI to a meaningful "sign in again" surface, and offer a single-
 * click path to /login that returns to the same admin page after auth.
 *
 * ## Usage
 *
 * ```ts
 * const res = await fetch("/api/substrates/foo/rotate-key", { method: "POST" });
 * if (!res.ok) {
 *   const reauth = await readReauthFlag(res);
 *   if (reauth) {
 *     setState({ kind: "reauth_required" });
 *     return;
 *   }
 *   // …generic non-ok fallback
 * }
 * ```
 *
 * @see parametric-memory-compute/src/middleware/recent-auth.ts
 */

/**
 * If `res` is a 401 with a JSON body shaped like compute's
 * `reauth_required` payload, return `true`. Otherwise return `false`.
 *
 * Reads the body — caller MUST NOT also call `.json()` / `.text()` after.
 * Safe against malformed bodies, content-type drift, and empty payloads —
 * any deviation from the documented shape returns `false` so callers fall
 * through to their generic error path.
 */
export async function readReauthFlag(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  try {
    const body = (await res.clone().json()) as { code?: unknown };
    return body?.code === "reauth_required";
  } catch {
    // Non-JSON body (network HTML, empty, etc) — we have no claim to make.
    return false;
  }
}

/**
 * Build the `/login?redirect=<current-url>` URL the dashboard should send
 * a user to when reauth is required. The login page (`LoginClient.tsx`)
 * reads the `redirect` query param, validates it is a same-origin
 * relative path (the open-redirect guard), and after a successful magic-
 * link sign-in routes the user back to it. By that point compute has
 * stamped a fresh `last_reauth_at` so the original action will work.
 *
 * If `window` is unavailable (server render path) we return `/login`
 * without the redirect param — the helper is still safe to import server-
 * side; any caller that actually invokes it should be in a client-only
 * code path.
 */
export function buildReauthUrl(): string {
  if (typeof window === "undefined") return "/login";
  const here = window.location.pathname + window.location.search;
  // Match LoginClient's open-redirect guard: must start with `/` and must
  // not start with `//` (otherwise it's a protocol-relative external URL).
  const safe = here.startsWith("/") && !here.startsWith("//") ? here : "/admin";
  return `/login?redirect=${encodeURIComponent(safe)}`;
}

/**
 * Convenience: navigate the browser to the reauth URL. Equivalent to
 * `window.location.href = buildReauthUrl()` but documents the intent.
 * No-op on the server.
 */
export function redirectToReauth(): void {
  if (typeof window === "undefined") return;
  window.location.href = buildReauthUrl();
}

/**
 * Human-readable copy for the reauth-required surface. Centralised so the
 * exact wording is consistent across rotate-key, billing/portal, and any
 * future protected action.
 */
export const REAUTH_REQUIRED_TITLE = "Sign in again to continue";
// Compute's recent-auth window is factor-aware (migration 083): 10 minutes
// for magic-link / OAuth sessions, 30 minutes for sessions stamped via
// TOTP. We use the conservative "10 minutes" wording in the default copy
// because most users hit this prompt without TOTP enrolled — the longer
// 30-min window for TOTP-authenticated users is a passive UX win that
// they won't see this prompt as often, but if they do, "10 minutes" is
// still a fair lower-bound to communicate. The 401 response body carries
// `windowMs` and `factor`, so consumers that want fully accurate copy
// can read those and override the default text.
export const REAUTH_REQUIRED_BODY =
  "For your security, sensitive actions like rotating API keys or opening the billing portal require you to have signed in recently. Sign in again to continue.";
export const REAUTH_REQUIRED_CTA = "Sign in again";
