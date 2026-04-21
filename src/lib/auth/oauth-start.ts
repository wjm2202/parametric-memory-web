/**
 * OAuth start-flow decision logic (ADR-003 Phase 2 OAuth, S2T6).
 *
 * Purpose
 * ───────
 * Pure function that takes everything `/api/auth/oauth/[provider]/start`
 * needs to decide and returns a result object describing what the Next.js
 * route handler should do. All the cookie-setting and redirecting happens
 * in the route file — this module has zero Next.js runtime dependency so
 * every branch is unit-testable without a request context.
 *
 * Same pattern as session-rotation.ts (S2T5): structural deps injected,
 * result types narrow exhaustively, the caller owns the effectful work.
 *
 * Decision order
 * ──────────────
 *   1. Feature flag off                                  → `not-found`
 *   2. Provider unknown OR unconfigured                  → `not-found`
 *      (Collapsed intentionally — no signal to the outside about what's
 *      wired up in this environment.)
 *   3. Intent present but not "signin" / "link"          → `invalid-intent`
 *   4. Intent absent (null or "")                        → coerce "signin"
 *   5. returnTo hostile / missing                        → fall back to
 *                                                           `DEFAULT_RETURN_TO`
 *                                                           silently.
 *   6. Generate credentials, put flow in store, build authorize URL,
 *      return `redirect` with a `StateCookieDescriptor` the route will
 *      hand straight to `cookies().set(...)`.
 *
 * What this module does NOT do
 * ────────────────────────────
 *   - No Set-Cookie header assembly. The route translates the returned
 *     descriptor into `cookies().set(name, value, opts)` itself.
 *   - No redirect throwing. The route calls `redirect(authorizeUrl)`
 *     (Next.js NEXT_REDIRECT sentinel).
 *   - No session reading. Session lookup + recent-auth enforcement for
 *     `intent=link` happens at the compute bridge, NOT here — start is
 *     deliberately loose on auth state so an unauthenticated user
 *     clicking "Link GitHub" from a bookmark gets a clean 302 → login
 *     → retry rather than a mystery 401 at /start.
 *   - No I/O beyond the injected deps. `store.put` and
 *     `generateCredentials` are the only side effects.
 */
import type { Config } from "@/config";

import { OAUTH_FLOW_TTL_MS, type FlowCredentials, type OauthFlowStore } from "./pkce-store";
import { redirectUriFor, type ProviderRegistry } from "./providers/registry";
import type { OauthIntent } from "./providers/types";
import { validateReturnTo } from "./return-to";
import { isSecureHost } from "./session-rotation";

/**
 * State cookie name. Wire contract — must match `mmpm_oauth_state`
 * exactly because the callback route reads it by this name. Exporting
 * so the callback and tests can import one constant.
 */
export const STATE_COOKIE_NAME = "mmpm_oauth_state";

/**
 * State cookie Max-Age in seconds. Derived from `OAUTH_FLOW_TTL_MS` so
 * the cookie and the in-memory flow share one source of truth — a
 * mismatch here would leave the cookie alive past the flow's expiry
 * ("flow not found" at callback) or vice versa (ghost cookie after the
 * flow is consumed).
 *
 * Units: seconds (Next.js cookie API). `OAUTH_FLOW_TTL_MS` is in ms
 * (Node convention). This division is the one place to get that right.
 */
export const STATE_COOKIE_MAX_AGE_SECONDS = OAUTH_FLOW_TTL_MS / 1000;

/**
 * Fallback redirect target when `returnTo` is missing or hostile.
 * Matches the post-login destination used by the magic-link callback
 * (`/admin`) so the two auth paths land users in the same place.
 */
export const DEFAULT_RETURN_TO = "/admin";

/** Injectable deps. Tests stub every field; prod imports the real ones in the route. */
export interface StartFlowDeps {
  /** Registry for looking up a provider adapter by URL slug. */
  registry: ProviderRegistry;
  /** Single-use pending-flow store (in-memory Map in prod). */
  store: OauthFlowStore;
  /**
   * Credential factory. Prod: `generateFlowCredentials` from
   * `pkce-store`. Tests: a deterministic stub so exact cookie / URL
   * values are assertable without mocking `node:crypto`.
   */
  generateCredentials: (providerId: string) => FlowCredentials;
  /** Clock. Prod: `Date.now`. Tests: a fixed value for deterministic `createdAt`. */
  now: () => number;
  /** Narrow slice of Config — only the fields this module actually reads. */
  config: Pick<Config, "authOauthEnabled" | "publicSiteUrl">;
}

/**
 * Untrusted inputs from the request. The caller has NOT validated any
 * of these — this module owns every rejection branch.
 */
export interface StartFlowArgs {
  /** Raw URL segment (`[provider]`). Trusted only after registry lookup succeeds. */
  providerId: string;
  /**
   * Raw `intent` query param. `null` when absent (Next.js search-params
   * API convention); `""` when present-but-empty (`?intent=`). Both map
   * to the default `"signin"`. Any other non-empty value is rejected.
   */
  intent: string | null;
  /** Raw `returnTo` query param. Runs through `validateReturnTo`. */
  returnTo: string | null;
  /**
   * Post-proxy request hostname. Used for the cookie `secure` flag via
   * `isSecureHost`. In prod this is whatever the reverse proxy populated
   * from `X-Forwarded-Host` (Traefik strips client-supplied values
   * before they reach Next). In dev this is the real `Host` header.
   */
  hostname: string;
}

/** Discriminated result — the route handler switches on `kind`. */
export type StartFlowResult =
  | { kind: "not-found" }
  | { kind: "invalid-intent"; message: string }
  | { kind: "redirect"; authorizeUrl: string; cookie: StateCookieDescriptor };

/**
 * Everything the route needs to call `cookies().set(name, value, opts)`.
 * Deliberately narrow — no `expires`, no `domain`. Any flexibility here
 * is flexibility this logic would have to explain, and the 5 ADR-003-
 * mandated attributes are the whole contract.
 */
export interface StateCookieDescriptor {
  name: typeof STATE_COOKIE_NAME;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  /** Seconds. Equals `STATE_COOKIE_MAX_AGE_SECONDS`. */
  maxAge: number;
}

/**
 * Decide what the start route should do. See module header for the
 * full decision order.
 *
 * Pure except for three injected side effects:
 *   - `deps.store.put(state, flow)`         — writes the pending flow
 *   - `deps.generateCredentials(provider)`  — reads CSPRNG
 *   - `deps.now()`                          — reads the clock
 *
 * Does NOT throw on any input. Every rejection branch returns a result
 * object — that's the whole reason the surface is a discriminated
 * union. If you ever need to throw from here, something is wrong with
 * a dep, not the input.
 */
export function startOauthFlow(deps: StartFlowDeps, args: StartFlowArgs): StartFlowResult {
  // 1. Feature flag off — indistinguishable from "route doesn't exist".
  if (!deps.config.authOauthEnabled) {
    return { kind: "not-found" };
  }

  // 2. Unknown OR unconfigured provider → 404. The collapse is
  //    intentional: an external caller can't tell whether we've never
  //    heard of "facebook" or whether we have Google configured but
  //    not GitHub. This is the behaviour the registry is designed for —
  //    see `providers/registry.ts:56–67`.
  const provider = deps.registry.get(args.providerId);
  if (provider === null) {
    return { kind: "not-found" };
  }

  // 3. Intent validation. `null` and `""` both mean "no intent
  //    supplied" and default to `"signin"` — users arriving at /start
  //    without an explicit intent are signing in; `link` is only
  //    reachable from the settings page which always passes
  //    `intent=link` explicitly.
  const intentResult = normalizeIntent(args.intent);
  if (!intentResult.ok) {
    return {
      kind: "invalid-intent",
      message: `intent must be "signin" or "link" (got ${JSON.stringify(args.intent)})`,
    };
  }
  const intent = intentResult.intent;

  // 4. returnTo validation. `null` on hostile OR missing input, and we
  //    fall back silently in both cases — returning a 400 on a hostile
  //    input would hand the attacker useful signal. Audit logs on the
  //    server side record the fallback (out of scope here).
  const returnTo = validateReturnTo(args.returnTo) ?? DEFAULT_RETURN_TO;

  // 5. Fresh PKCE verifier + SHA-256 challenge + state token (+ nonce
  //    for OIDC providers). The injected `generateCredentials` is the
  //    only source of this randomness — tests inject a deterministic
  //    stub so the assertions below can pin exact values.
  const creds = deps.generateCredentials(provider.id);

  // 6. Pin the pending flow under the state key. Single-use + 5-min TTL
  //    are the store's guarantees; we just put and trust. `intent` and
  //    `returnTo` ride along so the callback doesn't need them in
  //    additional cookies.
  deps.store.put(creds.state, {
    verifier: creds.verifier,
    nonce: creds.nonce,
    provider: provider.id,
    intent,
    returnTo,
    createdAt: deps.now(),
  });

  // 7. Compose the authorize URL the browser will redirect to. The
  //    adapter owns provider-specific query params (scope, response_
  //    type, PKCE method, etc.); we supply the four cross-cutting
  //    values: state, challenge, nonce (null for non-OIDC), redirectUri.
  //
  //    `redirectUriFor` wants a full Config but only reads
  //    `publicSiteUrl`. The cast below is safe: the runtime contract
  //    is narrower than the declared signature. If `redirectUriFor`
  //    ever starts reading another field, TypeScript will NOT warn
  //    here — remember to widen this Pick or pass the full config.
  const redirectUri = redirectUriFor(provider.id, deps.config as Config);

  const authorizeUrl = provider.buildAuthorizeUrl({
    state: creds.state,
    challenge: creds.challenge,
    nonce: creds.nonce,
    redirectUri,
  });

  return {
    kind: "redirect",
    authorizeUrl,
    cookie: {
      name: STATE_COOKIE_NAME,
      value: creds.state,
      httpOnly: true,
      secure: isSecureHost(args.hostname),
      sameSite: "lax",
      path: "/",
      maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
    },
  };
}

/**
 * Result of intent normalization. Using a narrow discriminated union
 * rather than `OauthIntent | null` because `null` would be ambiguous —
 * is that "invalid" or "absent"? Spelling it out keeps the caller's
 * branches unambiguous.
 */
type NormalizedIntentResult = { ok: true; intent: OauthIntent } | { ok: false };

/**
 * Coerce a raw `intent` string to an `OauthIntent`, or return `{ ok:
 * false }` for unrecognised values. Treats `null` and `""` as "intent
 * was not supplied" and defaults to `"signin"`.
 */
function normalizeIntent(raw: string | null): NormalizedIntentResult {
  if (raw === null || raw === "") return { ok: true, intent: "signin" };
  if (raw === "signin" || raw === "link") return { ok: true, intent: raw };
  return { ok: false };
}
