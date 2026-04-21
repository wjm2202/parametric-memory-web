/**
 * OAuth callback decision logic (ADR-003 Phase 2 OAuth, S2T7b).
 *
 * Purpose
 * ───────
 * Pure-ish function that takes everything
 * `/api/auth/oauth/[provider]/callback` needs to decide and returns a
 * result object describing what the Next.js route handler should do.
 * All the cookie-setting and redirecting happens in the route file —
 * this module has zero Next.js runtime dependency so every branch is
 * unit-testable without a request context.
 *
 * Same pattern as `oauth-start.ts` (S2T6): structural deps injected,
 * result types narrow exhaustively, the caller owns the effectful work.
 * The one wrinkle: unlike `startOauthFlow`, this function IS async —
 * it has to await the provider's token exchange and compute's bridge
 * call. Neither is "side effect in decision logic"; they're injected
 * collaborators that tests replace with fakes.
 *
 * Decision order
 * ──────────────
 *   1. Feature flag off                                  → `not-found`
 *   2. Provider unknown OR unconfigured                  → `not-found`
 *      (Collapsed intentionally, same rationale as start.)
 *   3. Provider bounced the user (`?error=access_denied` etc.)
 *                                                        → redirect
 *                                                          `/login?error=oauth_denied`
 *   4. `code` or `state` query param missing             → redirect
 *                                                          `/login?error=oauth_state`
 *   5. `state` cookie missing OR state mismatch          → redirect
 *                                                          `/login?error=oauth_state`
 *   6. Flow not in store (expired OR already consumed)   → redirect
 *                                                          `/login?error=oauth_expired`
 *   7. Flow's provider ≠ URL segment provider            → redirect
 *                                                          `/login?error=oauth_state`
 *      (Belt-and-braces. Callback URL is tied to one provider; a flow
 *      created for a DIFFERENT provider arriving here means either a
 *      bug or URL tampering.)
 *   8. `exchangeCode` threw                              → map by class:
 *        • ProviderEmailUnverifiedError →
 *            `/login?error=unverified_email`
 *        • ProviderNonceMismatchError   →
 *            `/login?error=oauth_state`
 *        • ProviderTokenExchangeError   →
 *        • ProviderClaimsInvalidError   →
 *        • ProviderNetworkError         →
 *        • any other OauthError         →
 *            `/login?error=oauth_server_error`
 *   9. Intent = "signin" — bridge `/bridge/signin`
 *        • non-rejected outcome → redirect to `flow.returnTo`, rotate
 *          session cookie with the `rawSessionToken` compute minted.
 *        • `rejected` → redirect to `/login?error=oauth_rejected&reason=…`
 *        • bridge 5xx / network error → `/login?error=oauth_server_error`
 *  10. Intent = "link" — bridge `/bridge/link`
 *        • caller must have provided a session cookie; if absent
 *          (user's session expired during the provider roundtrip) →
 *          `/login?error=oauth_state` + preserved returnTo. The link
 *          flow cannot proceed without an authenticated user.
 *        • `linked` → redirect to `flow.returnTo` (typically
 *          `/admin/security`); session cookie UNCHANGED (the user is
 *          already signed in; `/bridge/link` does not mint a session).
 *        • `rejected` → `/login?error=oauth_rejected&reason=…`
 *        • bridge 401 `reauth_required` → redirect to `/login` with
 *          `returnTo` preserving the link destination, so the user
 *          signs in fresh and can retry the link.
 *        • bridge 5xx / network error → `/login?error=oauth_server_error`
 *
 * State cookie lifecycle
 * ──────────────────────
 * EVERY return branch that is NOT `not-found` instructs the route to
 * clear the `mmpm_oauth_state` cookie. The flow in the store has
 * already been consumed (single-use), and a cookie that outlives its
 * flow is dead weight at best and injection surface at worst. The
 * `not-found` branch does not clear the cookie because it collapses
 * error cases with "route doesn't exist" — acting on an unsafe cookie
 * value would give an external caller signal that the flag is off.
 *
 * What this module does NOT do
 * ────────────────────────────
 *   - No `Set-Cookie` header assembly. The route translates
 *     `sessionCookie` and `clearStateCookie` into concrete cookie-store
 *     calls (`rotateSessionCookie`, `cookieStore.delete`) itself.
 *   - No `redirect()` throwing. The route calls `redirect(destination)`
 *     at the top level of the handler.
 *   - No session cookie READING for the signin path. Session creation
 *     is fresh per signin — we never compose old + new. For the link
 *     path, the caller is responsible for passing the session cookie
 *     through so compute can authenticate the user.
 *   - No PII logging. Emails, sub claims, and bridge response bodies
 *     are never put on `console.log`. The route owns log calls.
 */
import type { Config } from "@/config";

import type { BridgeResponse } from "../compute-bridge-signed";
import {
  isSecureHost,
  SESSION_COOKIE_NAME,
  DEFAULT_SESSION_MAX_AGE_SECONDS,
} from "./session-rotation";
import { STATE_COOKIE_NAME } from "./oauth-start";
import type { OauthFlow, OauthFlowStore } from "./pkce-store";
import { redirectUriFor, type ProviderRegistry } from "./providers/registry";
import {
  isLinkOutcome,
  isSigninOutcome,
  ProviderClaimsInvalidError,
  ProviderEmailUnverifiedError,
  ProviderNetworkError,
  ProviderNonceMismatchError,
  ProviderTokenExchangeError,
  OauthError,
  type LinkOutcome,
  type NormalizedClaims,
  type ProviderId,
  type SigninOutcome,
} from "./providers/types";

/**
 * Default post-error destination. Matches the magic-link callback's
 * failure target (`/login?error=…`) so the two auth paths land users
 * in the same place. The query param communicates which error copy the
 * login page should surface.
 */
const LOGIN_PATH = "/login";

/**
 * Error codes we emit on `?error=`. The login page owns the copy —
 * keep the codes stable, the copy can change without touching this
 * file.
 */
export const CALLBACK_ERROR_CODES = {
  /** Provider returned `?error=access_denied` (user declined). */
  denied: "oauth_denied",
  /**
   * State/cookie/flow mismatch or missing required query param.
   * Covers CSRF-shaped things AND "user hit refresh and replayed". The
   * login page copy reads "Your sign-in link was invalid or replayed".
   */
  state: "oauth_state",
  /** Flow not found — 5-min TTL exceeded or already consumed. */
  expired: "oauth_expired",
  /** Provider email wasn't verified. */
  unverifiedEmail: "unverified_email",
  /**
   * Anything we can't classify — bridge 5xx, provider token-exchange
   * fail, adapter threw `ProviderClaimsInvalidError`, etc. Generic
   * on purpose; the full detail is in the server log.
   */
  server: "oauth_server_error",
  /** Bridge returned `{outcome: 'rejected', reason: …}`. */
  rejected: "oauth_rejected",
} as const;

export type CallbackErrorCode = (typeof CALLBACK_ERROR_CODES)[keyof typeof CALLBACK_ERROR_CODES];

/**
 * The structural bridge client — only `call<T>` is needed here. Defining
 * this locally rather than importing the concrete type keeps tests
 * free from having to construct a real `createBridgeClient()` instance.
 */
export interface CallbackBridgeClient {
  call<T = unknown>(opts: {
    method: "GET" | "POST";
    path: string;
    body?: unknown;
    sessionCookie?: string;
  }): Promise<BridgeResponse<T>>;
}

/** Injectable deps. Tests stub every field; prod imports real ones in the route. */
export interface CallbackFlowDeps {
  /** Registry for looking up a provider adapter by URL slug. */
  registry: ProviderRegistry;
  /** Single-use pending-flow store (same singleton as `/start`). */
  store: OauthFlowStore;
  /** HMAC-signed bridge client (prod: `bridgeClient` from `compute-bridge-signed.ts`). */
  bridgeClient: CallbackBridgeClient;
  /** Narrow slice of Config — only fields this module actually reads. */
  config: Pick<Config, "authOauthEnabled" | "publicSiteUrl">;
}

/**
 * Untrusted inputs from the request. The caller has NOT validated any
 * of these — this module owns every rejection branch.
 */
export interface CallbackFlowArgs {
  /** Raw URL segment (`[provider]`). Trusted only after registry lookup succeeds. */
  providerId: string;
  /** Authorization `code` query param. `null` on provider-bounce or tampered URL. */
  code: string | null;
  /** `state` query param. Must match the `mmpm_oauth_state` cookie. */
  state: string | null;
  /**
   * Provider `?error=` query param (e.g. `access_denied`,
   * `consent_required`). Presence means the user declined OR the
   * provider refused to issue a code; we never see `code` and `error`
   * together per OAuth 2.0 §4.1.2.1.
   */
  providerError: string | null;
  /**
   * Provider `?error_description=`. Logged server-side only — we do
   * NOT forward this to the user-facing redirect (it can contain
   * attacker-controlled text).
   */
  providerErrorDescription: string | null;
  /** Value of the `mmpm_oauth_state` cookie. `null` if absent. */
  stateCookie: string | null;
  /**
   * Value of the `mmpm_session` cookie, or `null` if absent. Used
   * ONLY for `intent=link` — forwarded verbatim to compute so its
   * `requireSession` middleware can authenticate the caller.
   */
  sessionCookie: string | null;
  /**
   * Post-proxy request hostname. Feeds the session cookie `secure`
   * flag via `isSecureHost`. In prod this is whatever the reverse
   * proxy populated from `X-Forwarded-Host`.
   */
  hostname: string;
}

/**
 * Session cookie descriptor. Identical shape to
 * `StateCookieDescriptor` in `oauth-start.ts` — same reason for the
 * narrow type (the 5 attributes are the whole contract; no `expires`,
 * no `domain`). The route passes this to `rotateSessionCookie` via the
 * `SessionCookieStore.set(…)` 3-arg form.
 */
export interface SessionCookieDescriptor {
  name: typeof SESSION_COOKIE_NAME;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  /** Seconds. Defaults to `DEFAULT_SESSION_MAX_AGE_SECONDS`. */
  maxAge: number;
}

/**
 * Discriminated result — the route handler switches on `kind`.
 *
 *   • `not-found`: the request looks indistinguishable from a request
 *     to a non-existent route (feature flag off, unknown provider,
 *     unconfigured provider). Route calls `notFound()`.
 *   • `redirect`: everything else. Route clears the state cookie if
 *     instructed, optionally sets a fresh session cookie, and 302s to
 *     `destination`.
 *
 * Why one "redirect" branch for both success and error: the route's
 * effectful action is identical (conditionally set session, clear
 * state, redirect). Splitting into `redirect-ok` and `redirect-error`
 * would duplicate the route's switch without adding clarity at this
 * layer. The `sessionCookie` field's presence IS the success
 * discriminator.
 */
export type CallbackResult =
  | { kind: "not-found" }
  | {
      kind: "redirect";
      destination: string;
      /**
       * `null` on any error branch and on the link-success branch (the
       * user is already signed in; linking does not rotate). Non-null
       * only on signin success — route rotates `mmpm_session` to this
       * value.
       */
      sessionCookie: SessionCookieDescriptor | null;
      /**
       * Always `true` except on `not-found`. The state cookie is
       * cleared at the end of every concluded flow (success or error)
       * because the matching flow in the store has already been
       * consumed, and a dangling cookie outside its TTL is pure
       * debris.
       */
      clearStateCookie: boolean;
      /**
       * Short tag describing WHY we're redirecting. Not shown to the
       * user — the route uses it for server-side audit log lines
       * (`[oauth-callback] reason=state_mismatch`). Stable values; the
       * tests assert specific tags on specific branches.
       */
      reason: CallbackReason;
    };

/**
 * Machine-readable reason codes. Split from `CALLBACK_ERROR_CODES`
 * (user-facing) because some branches collapse to the same user-facing
 * code but are worth distinguishing in logs (e.g. `missing_code` vs
 * `state_mismatch` both land at `?error=oauth_state` but the audit
 * line should say which).
 */
export type CallbackReason =
  | "ok_signin"
  | "ok_link"
  | "provider_denied"
  | "missing_code"
  | "missing_state"
  | "missing_state_cookie"
  | "state_mismatch"
  | "flow_not_found"
  | "flow_provider_mismatch"
  | "email_unverified"
  | "nonce_mismatch"
  | "token_exchange_failed"
  | "claims_invalid"
  | "provider_network"
  | "provider_unknown_error"
  | "bridge_server_error"
  | "bridge_rejected"
  | "bridge_shape_invalid"
  | "link_reauth_required"
  | "link_no_session";

/**
 * Decide what the callback route should do. See module header for the
 * full decision order.
 *
 * Async because:
 *   - `deps.registry.get(id).exchangeCode(…)` hits the provider's
 *     token endpoint (HTTP).
 *   - `deps.bridgeClient.call(…)` hits compute.
 *
 * Does NOT throw on any input. Every rejection branch returns a
 * result object — that's the whole reason the surface is a
 * discriminated union. If you ever need to throw from here, something
 * is wrong with a dep, not the input.
 */
export async function handleOauthCallback(
  deps: CallbackFlowDeps,
  args: CallbackFlowArgs,
): Promise<CallbackResult> {
  // 1. Feature flag off — indistinguishable from "route doesn't exist".
  if (!deps.config.authOauthEnabled) {
    return { kind: "not-found" };
  }

  // 2. Unknown OR unconfigured provider → 404. Same collapse rationale
  //    as the start route — an external caller can't tell whether
  //    we've never heard of "facebook" or we have Google configured
  //    but not GitHub.
  const provider = deps.registry.get(args.providerId);
  if (provider === null) {
    return { kind: "not-found" };
  }

  // 3. Provider bounced the user (?error=access_denied etc.). This is
  //    distinct from our own validation errors — the user explicitly
  //    said "no" at the provider, or the provider refused to issue a
  //    code. Always clear the state cookie: the pending flow is done.
  //    We do NOT consume the flow in the store here because there is
  //    no `state` to key on in most bounce responses (OAuth 2.0 §
  //    4.1.2.1 mandates state echo-back on errors, but not every
  //    provider complies — e.g. old GitHub variants). Expired flows
  //    age out on their TTL.
  if (args.providerError !== null && args.providerError.length > 0) {
    return redirectError("denied", "provider_denied");
  }

  // 4. `code` and `state` both required — if either is missing the
  //    callback was hit by something that isn't a legitimate provider
  //    redirect (manual URL, attacker probing, or a provider misconf).
  if (args.code === null || args.code.length === 0) {
    return redirectError("state", "missing_code");
  }
  if (args.state === null || args.state.length === 0) {
    return redirectError("state", "missing_state");
  }

  // 5. State cookie must exist AND match the query param. This is
  //    the CSRF / cross-session-callback gate. Order matters: check
  //    cookie-presence and equality BEFORE consuming the flow so an
  //    attacker-forged `?state=…` URL doesn't delete a legitimate
  //    user's pending flow out of the store.
  if (args.stateCookie === null || args.stateCookie.length === 0) {
    return redirectError("state", "missing_state_cookie");
  }
  if (!constantTimeEqual(args.stateCookie, args.state)) {
    return redirectError("state", "state_mismatch");
  }

  // 6. Consume the flow. `consume` is single-use by contract — whether
  //    or not the rest of this function succeeds, the flow is gone
  //    after this line. An honest retry (user hits back, clicks sign-
  //    in again) starts a fresh flow with a fresh state; a replay
  //    finds nothing here.
  const flow = deps.store.consume(args.state);
  if (flow === null) {
    return redirectError("expired", "flow_not_found");
  }

  // 7. The flow's provider must match the URL segment. Each provider
  //    gets its own callback URL registered with the provider's
  //    console (e.g. Google's allowed redirect URI is
  //    `/api/auth/oauth/google/callback`). A state token created for
  //    `google` arriving at `/api/auth/oauth/github/callback` means
  //    either the browser replayed the wrong cookie, or someone
  //    crafted a URL — either way, reject.
  if (flow.provider !== provider.id) {
    return redirectError("state", "flow_provider_mismatch");
  }

  // 8. Exchange the code for normalised claims. The adapter does
  //    everything: HTTP call, signature verification (OIDC), email-
  //    verification gate, nonce comparison. Every failure maps to one
  //    of the exported error classes.
  let claims: NormalizedClaims;
  try {
    const redirectUri = redirectUriFor(provider.id, deps.config as Config);
    claims = await provider.exchangeCode({
      code: args.code,
      verifier: flow.verifier,
      redirectUri,
      expectedNonce: flow.nonce,
    });
  } catch (err) {
    return mapProviderError(err);
  }

  // 9. Intent branches diverge here. Both hit bridge endpoints; only
  //    signin rotates the session cookie.
  if (flow.intent === "signin") {
    return runSigninBranch(deps, args, flow, provider.id, claims);
  }

  return runLinkBranch(deps, args, flow, provider.id, claims);
}

/* ─────────────────────────── Internal helpers ──────────────────────────── */

/**
 * Build a redirect-error result. Centralised so every error branch
 * produces the same shape — easier to reason about in tests (one place
 * to audit for a forgotten `clearStateCookie: true`), and easier to
 * extend when we need a new error code.
 */
function redirectError(
  errorCode: keyof typeof CALLBACK_ERROR_CODES,
  reason: CallbackReason,
): CallbackResult {
  const code = CALLBACK_ERROR_CODES[errorCode];
  return {
    kind: "redirect",
    destination: `${LOGIN_PATH}?error=${code}`,
    sessionCookie: null,
    clearStateCookie: true,
    reason,
  };
}

/**
 * Build a rejected-branch redirect that includes the reason string
 * from compute. The login page reads both `error=oauth_rejected` and
 * `reason=<RejectionReason>` to pick the right copy.
 */
function redirectRejected(reason: string): CallbackResult {
  const encoded = encodeURIComponent(reason);
  return {
    kind: "redirect",
    destination: `${LOGIN_PATH}?error=${CALLBACK_ERROR_CODES.rejected}&reason=${encoded}`,
    sessionCookie: null,
    clearStateCookie: true,
    reason: "bridge_rejected",
  };
}

/**
 * Build a reauth-required redirect for the link branch. Preserves the
 * intended link destination so the user can retry after signing in.
 * `returnTo` is already validated (came from the pending flow), so
 * passing it back through the login page's `?returnTo=` param is safe.
 */
function redirectReauth(returnTo: string): CallbackResult {
  const encoded = encodeURIComponent(returnTo);
  return {
    kind: "redirect",
    destination: `${LOGIN_PATH}?error=${CALLBACK_ERROR_CODES.state}&returnTo=${encoded}&reauth=1`,
    sessionCookie: null,
    clearStateCookie: true,
    reason: "link_reauth_required",
  };
}

/**
 * Map an adapter-thrown error to a result. Split out so the main
 * function stays linear and the test matrix can hit each branch
 * without setting up a full happy path.
 */
function mapProviderError(err: unknown): CallbackResult {
  if (err instanceof ProviderEmailUnverifiedError) {
    return redirectError("unverifiedEmail", "email_unverified");
  }
  if (err instanceof ProviderNonceMismatchError) {
    // Nonce mismatch is shaped like a CSRF / replay — group it under
    // the state-mismatch user-facing code so the copy stays coherent.
    return redirectError("state", "nonce_mismatch");
  }
  if (err instanceof ProviderTokenExchangeError) {
    return redirectError("server", "token_exchange_failed");
  }
  if (err instanceof ProviderClaimsInvalidError) {
    return redirectError("server", "claims_invalid");
  }
  if (err instanceof ProviderNetworkError) {
    return redirectError("server", "provider_network");
  }
  if (err instanceof OauthError) {
    // Anything else inheriting OauthError is new and unclassified —
    // still an adapter-domain failure; bucket under server error
    // until someone widens the mapping.
    return redirectError("server", "provider_unknown_error");
  }
  // Non-OauthError exception: something the adapter didn't wrap. This
  // is a programming error we want the log to surface, but the user
  // still sees a friendly generic-error page.
  return redirectError("server", "provider_unknown_error");
}

/**
 * Signin branch — POST /bridge/signin, map response to a
 * CallbackResult.
 */
async function runSigninBranch(
  deps: CallbackFlowDeps,
  args: CallbackFlowArgs,
  flow: OauthFlow,
  providerId: ProviderId,
  claims: NormalizedClaims,
): Promise<CallbackResult> {
  const bridge = await deps.bridgeClient.call<SigninOutcome>({
    method: "POST",
    path: "/api/v1/auth/oauth/bridge/signin",
    body: {
      provider: providerId,
      providerSub: claims.providerSub,
      email: claims.email,
      emailVerified: claims.emailVerified,
      displayName: claims.displayName,
      // H2 (ADR-003 S2, 2026-04-20): compute re-verifies this against
      // the provider itself and rejects with `evidence_invalid` on any
      // mismatch with the claims above. See
      // `src/lib/auth/providers/types.ts#ProviderEvidence`.
      providerEvidence: claims.providerEvidence,
    },
    // No sessionCookie here — signin precedes session creation.
  });

  if (!bridge.ok || bridge.data === null) {
    return redirectError("server", "bridge_server_error");
  }

  if (!isSigninOutcome(bridge.data)) {
    // Shape validation failed — compute returned a 2xx body we don't
    // understand. Defence-in-depth against a partial deploy / misconf;
    // also covers the case where the bridge returns a malformed
    // non-rejected outcome (missing sessionId/rawSessionToken) that
    // `isSigninOutcome` now catches after the T7a contract widening.
    return redirectError("server", "bridge_shape_invalid");
  }

  const outcome: SigninOutcome = bridge.data;

  if (outcome.outcome === "rejected") {
    return redirectRejected(outcome.reason);
  }

  // Success — rotate session cookie, redirect to the validated
  // returnTo stored with the flow.
  return {
    kind: "redirect",
    destination: flow.returnTo,
    sessionCookie: buildSessionCookieDescriptor(outcome.rawSessionToken, args.hostname),
    clearStateCookie: true,
    reason: "ok_signin",
  };
}

/**
 * Link branch — POST /bridge/link, map response to a CallbackResult.
 *
 * Requires the caller to have forwarded a session cookie. If absent,
 * there is no authenticated user to link an identity to, and compute
 * would 401 — short-circuit locally with a friendlier redirect that
 * preserves the intended destination.
 */
async function runLinkBranch(
  deps: CallbackFlowDeps,
  args: CallbackFlowArgs,
  flow: OauthFlow,
  providerId: ProviderId,
  claims: NormalizedClaims,
): Promise<CallbackResult> {
  if (args.sessionCookie === null || args.sessionCookie.length === 0) {
    // No session — can't link without an authenticated user. Bounce
    // to login with the link destination preserved so signing in
    // returns the user to settings (where they can retry the link).
    return {
      kind: "redirect",
      destination: `${LOGIN_PATH}?error=${CALLBACK_ERROR_CODES.state}&returnTo=${encodeURIComponent(flow.returnTo)}`,
      sessionCookie: null,
      clearStateCookie: true,
      reason: "link_no_session",
    };
  }

  const bridge = await deps.bridgeClient.call<LinkOutcome>({
    method: "POST",
    path: "/api/v1/auth/oauth/bridge/link",
    body: {
      provider: providerId,
      providerSub: claims.providerSub,
      email: claims.email,
      emailVerified: claims.emailVerified,
      displayName: claims.displayName,
      // H2 — same rationale as the signin branch above.
      providerEvidence: claims.providerEvidence,
    },
    sessionCookie: args.sessionCookie,
  });

  // 401 reauth_required is the link-specific branch — compute returns
  // { code: "reauth_required", … } in the body. Distinguish from a
  // generic 401 (session expired) by checking for that code.
  if (bridge.status === 401) {
    const bodyCode =
      bridge.data !== null && typeof bridge.data === "object" && "code" in bridge.data
        ? (bridge.data as { code?: unknown }).code
        : null;
    if (bodyCode === "reauth_required") {
      return redirectReauth(flow.returnTo);
    }
    // Session genuinely expired (or cookie not valid). Treat as "link
    // needs signin" — preserve destination, send through login.
    return redirectReauth(flow.returnTo);
  }

  if (!bridge.ok || bridge.data === null) {
    return redirectError("server", "bridge_server_error");
  }

  if (!isLinkOutcome(bridge.data)) {
    return redirectError("server", "bridge_shape_invalid");
  }

  const outcome: LinkOutcome = bridge.data;

  if (outcome.outcome === "rejected") {
    return redirectRejected(outcome.reason);
  }

  // Success — user stays signed in with the same session; we just
  // redirect back to wherever they started the link from.
  return {
    kind: "redirect",
    destination: flow.returnTo,
    sessionCookie: null,
    clearStateCookie: true,
    reason: "ok_link",
  };
}

/**
 * Session cookie descriptor, centralised so every signin success
 * branch produces the same attribute set.
 */
function buildSessionCookieDescriptor(
  rawSessionToken: string,
  hostname: string,
): SessionCookieDescriptor {
  return {
    name: SESSION_COOKIE_NAME,
    value: rawSessionToken,
    httpOnly: true,
    secure: isSecureHost(hostname),
    sameSite: "lax",
    path: "/",
    maxAge: DEFAULT_SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * Constant-time string compare for state-cookie / state-param
 * equality. `===` leaks tiny timing differences that are usually
 * irrelevant against a random 256-bit state — but this is security
 * code and the cost of constant-time is negligible, so do it the
 * right way.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Re-export the state-cookie name so the route only imports one thing. */
export { STATE_COOKIE_NAME };
