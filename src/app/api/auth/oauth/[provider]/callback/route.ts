/**
 * GET /api/auth/oauth/:provider/callback  (ADR-003 Phase 2 OAuth, S2T7b.3)
 *
 * Purpose
 * ───────
 * Provider-return endpoint for every OAuth sign-in / link flow. The user
 * bounced here from Google / GitHub with a `code` (or `error`), a `state`
 * query param we previously seeded, and the `mmpm_oauth_state` cookie
 * this server set on `/start`. Responsibilities:
 *
 *   • 404s when the flag is off OR the provider is unknown / unconfigured.
 *   • Redirects to `/login?error=…` on any failure branch (state mismatch,
 *     provider bounce, bridge rejection, adapter failure, bridge 5xx).
 *   • On signin success: rotates the `mmpm_session` cookie with the raw
 *     token compute minted inside the identity-creation transaction,
 *     clears `mmpm_oauth_state`, 302s to the validated `returnTo`.
 *   • On link success: clears `mmpm_oauth_state` (NO session rotation —
 *     the user is already signed in; linking does not mint a new session),
 *     302s to `returnTo`.
 *
 * This file is deliberately thin. EVERY decision branch, error class
 * mapping, bridge call, and cookie-attribute choice lives in
 * `src/lib/auth/oauth-callback.ts`. This handler's only responsibilities
 * are:
 *
 *   1. Extract raw values from Next.js's request / params / searchParams
 *      / cookies.
 *   2. Hand them to `handleOauthCallback(…)` as plain data.
 *   3. Translate the returned discriminated result into real HTTP:
 *      `cookieStore.delete(…)`, `rotateSessionCookie(…)`,
 *      `redirect(…)`, or `notFound()`.
 *
 * The split mirrors `/start` — 40+ unit tests cover the decision logic
 * in `oauth-callback.test.ts`; this wrapper only needs a few smoke
 * tests (see `route.test.ts` next door) to prove the bindings are
 * correctly wired.
 *
 * Next.js redirect() / notFound() semantics
 * ─────────────────────────────────────────
 * Both work by throwing sentinels (`NEXT_REDIRECT` / `NEXT_NOT_FOUND`)
 * that Next's renderer catches. Calling either inside a try/catch
 * swallows the sentinel and the response silently becomes a 500. The
 * magic-link callback documents this pitfall (see
 * `src/app/auth/callback/route.ts:19–24`). `handleOauthCallback` is
 * non-throwing by design, so we don't need a try/catch here at all —
 * but the rule still applies: keep `redirect()` / `notFound()` calls at
 * the top level of the handler, never inside a catch.
 *
 * Why GET, not POST
 * ─────────────────
 * The provider issues a 302 redirect to this URL — there is no UA-
 * initiated form POST in an OAuth authorization-code flow. CSRF is
 * mitigated by the state cookie + PKCE verifier, not by a POST + token.
 */
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { config } from "@/config";
import { bridgeClient } from "@/lib/compute-bridge-signed";
import { handleOauthCallback, STATE_COOKIE_NAME } from "@/lib/auth/oauth-callback";
import { oauthFlowStore } from "@/lib/auth/pkce-store";
import { registry } from "@/lib/auth/providers/registry";
import {
  clearSessionCookie,
  rotateSessionCookie,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session-rotation";

/**
 * Callback handler.
 *
 * @param request  — we read `hostname` (for the session cookie `secure`
 *   flag), `searchParams` (code, state, error, error_description), and
 *   nothing else from the request object. All other decision inputs
 *   come from cookies or the pending flow in the store.
 *
 * @param params   — Promise per Next.js 15 App Router convention.
 *   `provider` is a raw URL segment; `handleOauthCallback` validates
 *   it against the registry.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await params;

  // Raw query params — `.get(key)` returns `string | null`. We pass
  // both `null` and `""` through; `handleOauthCallback` treats both
  // as "missing" for its missing-code / missing-state branches, and
  // treats an empty `error` as "provider didn't set an error".
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const providerError = searchParams.get("error");
  const providerErrorDescription = searchParams.get("error_description");

  // Cookies. We await `cookies()` once and reuse the store for reading
  // the pending state cookie, reading the session cookie (link intent
  // only), deleting the state cookie on conclusion, and setting the
  // rotated session cookie on signin success.
  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(STATE_COOKIE_NAME)?.value ?? null;

  // Only forward a session cookie if one is present. Pass the FULL
  // `Cookie` header string (name=value) so compute's `requireSession`
  // middleware sees what a normal request would. If no session cookie
  // exists, pass `null` — the link branch short-circuits on that.
  const sessionCookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const sessionCookieHeader =
    sessionCookieValue !== null ? `${SESSION_COOKIE_NAME}=${sessionCookieValue}` : null;

  const result = await handleOauthCallback(
    {
      registry,
      store: oauthFlowStore,
      bridgeClient,
      config,
    },
    {
      providerId: provider,
      code,
      state,
      providerError,
      providerErrorDescription,
      stateCookie,
      sessionCookie: sessionCookieHeader,
      hostname: request.nextUrl.hostname,
    },
  );

  // ── 404 branch ──────────────────────────────────────────────────
  // Flag off, unknown provider, or unconfigured provider. All three
  // collapse to "route does not exist" so an outside caller can't
  // probe which providers we have wired up in this environment.
  // Do NOT clear the state cookie here — a deliberate divergence from
  // every other branch. See `oauth-callback.ts` module header for the
  // "no signal on 404" rationale.
  if (result.kind === "not-found") {
    notFound();
  }

  // ── Redirect branches ───────────────────────────────────────────
  // Every remaining result.kind is "redirect". The decision module
  // tells us:
  //   - whether to set a fresh session cookie (signin success only),
  //   - whether to clear the state cookie (always `true` at this
  //     point; coded as a field for future flexibility),
  //   - where to go.

  // Server-side audit log. `reason` is a stable machine-readable tag
  // independent of the user-facing error code — distinguishes e.g.
  // `missing_code` from `state_mismatch` even though both redirect to
  // `?error=oauth_state`. Do NOT log anything else — provider errors
  // or bridge bodies could contain PII or attacker-controlled text.
  console.info(
    `[oauth-callback] provider=${provider} reason=${result.reason} destination=${result.destination}`,
  );

  if (result.clearStateCookie) {
    cookieStore.delete(STATE_COOKIE_NAME);
  }

  if (result.sessionCookie !== null) {
    // Only non-null on signin success. `rotateSessionCookie` throws
    // on empty-string token; the decision module already defends via
    // `isSigninOutcome` rejecting `rawSessionToken.length === 0`, but
    // the belt-and-braces throw here is cheap insurance.
    //
    // Belt-and-braces session-fixation defense (security review H4).
    // Next.js's cookies().set collapses delete+set on the same
    // (name, path, domain) into a single Set-Cookie, so in the common
    // case this emits no extra bytes. What it DOES defend against is
    // an attacker-pre-planted cookie with a DIFFERENT path (e.g. via
    // a poorly-scoped subdomain widget): `.set(...)` alone would leave
    // that cookie in flight alongside the new one — the browser would
    // send BOTH on subsequent requests and the server's behaviour is
    // order-dependent. `.delete(name)` emits a pathless / Path=/
    // Max-Age=0 that tells the browser to forget any `mmpm_session`
    // it has, regardless of how it was originally scoped.
    clearSessionCookie(cookieStore);
    rotateSessionCookie(cookieStore, result.sessionCookie.value, {
      secure: result.sessionCookie.secure,
      maxAge: result.sessionCookie.maxAge,
      sameSite: result.sessionCookie.sameSite,
      path: result.sessionCookie.path,
    });
  }

  // ── Sprint 9.5 — pending-token cookie (OAuth + TOTP fork) ────────────
  //
  // Only non-null on the `pending_factor` branch in
  // `runSigninBranch`. Mutually exclusive with `sessionCookie` above —
  // the decision module enforces the invariant; the runtime check on
  // the next line is belt-and-braces.
  //
  // We delete-then-set (same pattern as the session cookie above) so a
  // stale pending cookie from a previous failed flow can't shadow the
  // new value at a different path scope. Cheap insurance: the common
  // case is "no prior cookie, single Set-Cookie line emitted".
  //
  // Why we don't have a dedicated `rotatePendingTokenCookie` helper:
  // this is the ONLY place the cookie is set. The magic-link callback
  // at /auth/callback uses a hand-rolled `cookieStore.set` for the
  // same reason. If a third caller appears, factor out then.
  if (result.pendingTokenCookie !== null) {
    cookieStore.delete(result.pendingTokenCookie.name);
    cookieStore.set(result.pendingTokenCookie.name, result.pendingTokenCookie.value, {
      httpOnly: result.pendingTokenCookie.httpOnly,
      secure: result.pendingTokenCookie.secure,
      sameSite: result.pendingTokenCookie.sameSite,
      path: result.pendingTokenCookie.path,
      maxAge: result.pendingTokenCookie.maxAge,
    });
  }

  // `redirect` throws NEXT_REDIRECT. This call MUST be at the top
  // level (never inside a try/catch) — see module header.
  redirect(result.destination);
}
