/**
 * AuthProvider types + error taxonomy (ADR-003, Phase 2 OAuth).
 *
 * What this module does
 * ─────────────────────
 * Defines the shared vocabulary every OAuth adapter speaks:
 *
 *   - `ProviderId` — the registry key (`"google"`, `"github"`, …). Kept
 *     in sync with compute's `OauthProvider` union so a mismatch fails
 *     at compile time, not at the bridge call.
 *   - `NormalizedClaims` — the minimal, provider-agnostic shape the
 *     callback route hands to the bridge. Adapters normalise provider-
 *     specific id_token / /user / /user/emails payloads down to this.
 *   - `AuthProvider` interface — two methods: `buildAuthorizeUrl` (pure,
 *     used by `/start`) and `exchangeCode` (network, used by `/callback`).
 *     Adapters are factory-constructed with their config injected so
 *     tests can build one with stub fetch + fixed JWKS.
 *   - Error classes — one per well-known failure mode. Route handlers
 *     `instanceof`-match to map to HTTP responses and audit-log reasons.
 *   - Rejection-reason constants — mirror compute's bridge-response
 *     `reason` strings byte-for-byte. Typed as string-literal unions so
 *     the callback's switch statements are exhaustively checked.
 *
 * Why this module has no behaviour
 * ────────────────────────────────
 * Types + errors only. All state and I/O live in the adapter files
 * (`./google.ts`, `./github.ts`) and the registry (`./registry.ts`).
 * Keeping this file pure means every adapter test imports it without
 * dragging in fetch, node:crypto, or jose — which also means no risk
 * of accidental module-load side effects.
 *
 * Why error classes, not tagged unions
 * ────────────────────────────────────
 * The callback route is already deep into a control flow with early
 * returns per error branch (state mismatch → 403, unverified email →
 * redirect-with-flash, reauth required → 401+redirect). Throwing from
 * inside `exchangeCode` and catching in the route keeps the happy path
 * linear and the error branches explicit. `Error` subclasses also
 * survive serialisation in audit logs (`error.name`) without extra code.
 *
 * Relationship to compute
 * ───────────────────────
 * `REJECTION_REASONS` MUST match compute's `oauth-service.ts` reason
 * strings exactly. If compute adds a new reason (say,
 * `"ambiguous_email_match"`), it must land here simultaneously or the
 * callback route silently falls through to a generic error. The test
 * file keeps a boundary test that fails if the sets diverge.
 */

/**
 * The set of provider identifiers this website supports, as of Phase 2.
 *
 * Compute's `OauthProvider` type also allows `saml:*` — deliberately
 * not surfaced here because Phase 2 does not include SAML. Adding SAML
 * later means widening this union AND registering adapters; until
 * then, SAML-string inputs coming from the URL should reject at the
 * registry boundary, not silently succeed.
 */
export type ProviderId = "google" | "github";

/**
 * Human-friendly label for a provider — used only in UI copy and audit
 * messages. Not the same as `ProviderId`. Adapters expose this via
 * `displayName` so the registry can generate button labels without a
 * separate lookup table.
 */
export type ProviderDisplayName = "Google" | "GitHub";

/**
 * Why the user is running this OAuth flow. Both intents go through the
 * same `/start` → provider → `/callback` path; the callback branches
 * on intent to call the right bridge endpoint (signin vs link).
 *
 *   - `"signin"` — no session required; creates or resumes one.
 *   - `"link"`  — session + recent-auth required; attaches an identity.
 *
 * `"unlink"` is NOT an intent here — unlinking does not redirect
 * through a provider, it's a direct bridge call from the settings page.
 */
export type OauthIntent = "signin" | "link";

/**
 * Raw provider response material that compute can independently
 * re-verify. Review finding H2 (ADR-003 S2 hardening, 2026-04-20):
 * compute must NOT blindly trust the claims field — a compromised
 * website (or leaked bridge signing key) could otherwise mint a
 * `{email: "victim@x.com", emailVerified: true}` body and cause
 * auto-link onto an arbitrary account. With `providerEvidence`
 * forwarded verbatim, compute re-verifies the claims against the
 * original provider response and rejects any mismatch or tampering
 * with `reason: "evidence_invalid"`.
 *
 * Google: the unmodified id_token JWT. Compute re-verifies signature
 * against Google's JWKS, `iss`/`aud`, and `email_verified`, and
 * cross-checks `payload.sub`/`payload.email` against the body's
 * `providerSub`/`email`.
 *
 * GitHub: the raw OAuth access token. Compute re-fetches `/user` and
 * `/user/emails`, confirms the token belongs to `providerSub`, and
 * confirms the primary+verified email matches `email`.
 *
 * The discriminant is `kind`. Adding a new provider means adding a
 * new branch here AND the corresponding re-verifier on compute —
 * keeping both sides in the same discriminated union makes
 * exhaustiveness a compile-time check.
 */
export type ProviderEvidence =
  | { kind: "google-id-token"; idToken: string }
  | { kind: "github-access-token"; accessToken: string };

/**
 * Verified, provider-agnostic claims produced by an adapter after a
 * successful token exchange. These are what the callback route forwards
 * to `/api/v1/auth/oauth/bridge/signin` (or `/bridge/link`).
 *
 * Every field is REQUIRED except `displayName` — providers vary on
 * whether a user has a display name set, and compute treats `null`
 * as "don't overwrite an existing one". Email presence and verification
 * are non-negotiable: adapters throw `ProviderEmailUnverifiedError`
 * rather than returning `emailVerified: false` so the route can't
 * forget to check.
 *
 * `providerEvidence` carries the raw material compute needs to
 * independently re-verify everything else on this object — see the
 * type's docstring for the defence-in-depth rationale (H2).
 */
export interface NormalizedClaims {
  /**
   * Provider's stable unique ID for this user. Google: `sub` claim
   * from the id_token. GitHub: numeric `id` from `GET /user`, coerced
   * to string. Never the email — emails change, `sub` doesn't.
   */
  providerSub: string;
  /**
   * Verified email address. Adapters MUST confirm verification before
   * putting a value here — compute will also check, but two layers of
   * defence is the point.
   */
  email: string;
  /**
   * Always `true` at this layer. Present for the compute bridge
   * contract (which accepts it as the canonical signal) and to keep
   * the downstream call site obvious: if you ever see `false` here it
   * means the adapter is lying to you.
   */
  emailVerified: true;
  /**
   * Optional human-friendly name. `null` if the provider doesn't
   * supply one or the user has it hidden.
   */
  displayName: string | null;
  /**
   * Raw provider response material for compute-side independent
   * re-verification. See `ProviderEvidence`. MUST match the provider
   * of the claims: a `google` adapter returns `{kind:
   * "google-id-token", …}`, a `github` adapter returns
   * `{kind: "github-access-token", …}`. Compute rejects any
   * provider/kind mismatch with `evidence_invalid`.
   */
  providerEvidence: ProviderEvidence;
}

/**
 * What an adapter needs to build the initial authorize redirect URL.
 * All four values come from this process (either `pkce-store`'s fresh
 * credentials, or the config for `redirectUri`). No per-request side
 * effects, no I/O — pure string concatenation.
 */
export interface BuildAuthorizeUrlArgs {
  /** Opaque random token. Included verbatim in the `state` param. */
  state: string;
  /** PKCE S256 challenge — base64url(sha256(verifier)). */
  challenge: string;
  /** OIDC nonce (Google). `null` for non-OIDC adapters (GitHub). */
  nonce: string | null;
  /**
   * Absolute redirect URI registered with the provider. Must match
   * character-for-character what the OAuth app was configured with
   * (e.g. `https://parametric-memory.dev/api/auth/oauth/google/callback`).
   */
  redirectUri: string;
}

/**
 * What an adapter needs to exchange an authorization `code` for claims.
 * The caller supplies the authorization code it received on the
 * redirect plus the PKCE verifier that was NOT sent to the provider on
 * the way out — together they prove possession of the original request.
 */
export interface ExchangeCodeArgs {
  /** Authorization code from the provider's redirect. */
  code: string;
  /** PKCE verifier that hashes to the challenge we sent on the way out. */
  verifier: string;
  /** Same redirect URI used in `buildAuthorizeUrl` — providers require it. */
  redirectUri: string;
  /**
   * Expected nonce, OIDC only. The adapter MUST compare this to the
   * `nonce` claim inside the returned id_token and throw
   * `ProviderNonceMismatchError` on mismatch. Non-OIDC adapters ignore
   * this field (value: `null`).
   */
  expectedNonce: string | null;
}

/**
 * The provider-adapter contract. Two methods, both explicit about what
 * they read and what they throw. Concrete adapters live in sibling
 * files; tests never construct the real implementations — they either
 * use a fake provider that implements this interface or the adapter
 * factory with stubbed `fetch` and `jose`.
 */
export interface AuthProvider {
  /** Registry key (`"google"`, `"github"`). */
  readonly id: ProviderId;
  /** Human-friendly label for UI copy. */
  readonly displayName: ProviderDisplayName;
  /** `true` for OIDC providers (Google); `false` for non-OIDC (GitHub). */
  readonly isOidc: boolean;

  /**
   * Compose the provider's authorization URL. Pure — no network, no
   * state store writes. The caller has already generated state /
   * challenge / nonce from `pkce-store.generateFlowCredentials` and
   * stored them; all this does is stitch them into a URL.
   *
   * @throws never. If the implementation crashes here something is
   *   badly wrong (e.g. `URL` constructor rejecting a malformed
   *   `redirectUri`), which is a config bug, not a runtime bug.
   */
  buildAuthorizeUrl(args: BuildAuthorizeUrlArgs): string;

  /**
   * Redeem a code for normalised, verified claims. Performs the token
   * exchange (HTTP), verifies id_token or fetches /user+/user/emails
   * (HTTP), and returns the minimal claims set the bridge wants.
   *
   * Every failure mode maps to one of the exported error classes —
   * callers `instanceof`-match.
   *
   * @throws {ProviderTokenExchangeError} token endpoint returned non-2xx
   * @throws {ProviderClaimsInvalidError} id_token signature bad, or
   *   `/user` response missing required fields
   * @throws {ProviderEmailUnverifiedError} `email_verified` is false /
   *   no verified primary email on /user/emails
   * @throws {ProviderNonceMismatchError} id_token nonce ≠ expectedNonce
   * @throws {ProviderNetworkError} transport-layer failure
   *   (DNS, timeout, etc.)
   */
  exchangeCode(args: ExchangeCodeArgs): Promise<NormalizedClaims>;
}

/* ───────────────────────────── Error classes ───────────────────────────── */

/**
 * Base class for everything an OAuth flow can go wrong on. The callback
 * route catches `OauthError` at the outer scope and maps by `name`, so
 * never swallow these — rethrow them. Extending `Error` directly (no
 * `cause` wrangling at this layer) because the error chain is always
 * shallow: provider response → this error → audit log line.
 */
export class OauthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OauthError";
  }
}

/** Network-layer failure during `exchangeCode`. Retryable in principle; we don't retry. */
export class ProviderNetworkError extends OauthError {
  constructor(
    public readonly providerId: ProviderId,
    message: string,
  ) {
    super(`[${providerId}] ${message}`);
    this.name = "ProviderNetworkError";
  }

  /**
   * Factory for classifying a caught fetch error. `AbortSignal.timeout`
   * fires a `DOMException` with `name: "TimeoutError"` on Node 18+; some
   * polyfills still throw `AbortError`. Both are normalised to a stable
   * message ending in "timed out after <N>ms" so log searches don't
   * have to care about runtime differences.
   *
   * Everything else (DNS failure, connection reset, etc.) falls through
   * to the raw message.
   *
   * Why we read `name` via a structural check instead of `instanceof
   * Error`: jsdom's `DOMException` is NOT a subclass of jsdom's `Error`
   * (their realms diverge), so `err instanceof Error` is false under
   * jsdom-env tests and timeout classification silently fails. Checking
   * for a string `name` property works on `Error`, `DOMException`, and
   * any polyfill that stamps a `name`.
   *
   * @param providerId  which adapter threw
   * @param err         the caught value (typed `unknown` — we don't trust it)
   * @param context     short label for what was being fetched
   *                    (e.g. `"token exchange"`, `"GET /user"`)
   * @param timeoutMs   the configured timeout so the message is factual
   */
  static fromFetchError(
    providerId: ProviderId,
    err: unknown,
    context: string,
    timeoutMs: number,
  ): ProviderNetworkError {
    const errName =
      typeof err === "object" &&
      err !== null &&
      "name" in err &&
      typeof (err as { name: unknown }).name === "string"
        ? (err as { name: string }).name
        : null;
    const isTimeout = errName === "TimeoutError" || errName === "AbortError";
    if (isTimeout) {
      return new ProviderNetworkError(providerId, `${context} timed out after ${timeoutMs}ms`);
    }
    // For non-timeout failures, prefer `.message` when present, then
    // fall back to String(). Again, accessed structurally so jsdom
    // DOMExceptions (which have `.message` but don't extend Error) get
    // their human-readable text through rather than `"[object DOMException]"`.
    const errMessage =
      typeof err === "object" &&
      err !== null &&
      "message" in err &&
      typeof (err as { message: unknown }).message === "string"
        ? (err as { message: string }).message
        : String(err);
    return new ProviderNetworkError(providerId, errMessage);
  }
}

/** Token endpoint returned non-2xx. Includes the upstream status code for logs. */
export class ProviderTokenExchangeError extends OauthError {
  constructor(
    public readonly providerId: ProviderId,
    public readonly upstreamStatus: number,
    public readonly upstreamCode: string | null,
  ) {
    super(
      `[${providerId}] token exchange failed: HTTP ${upstreamStatus}` +
        (upstreamCode ? ` (${upstreamCode})` : ""),
    );
    this.name = "ProviderTokenExchangeError";
  }
}

/** id_token signature / issuer / audience invalid, OR /user response malformed. */
export class ProviderClaimsInvalidError extends OauthError {
  constructor(
    public readonly providerId: ProviderId,
    public readonly detail: string,
  ) {
    super(`[${providerId}] claims invalid: ${detail}`);
    this.name = "ProviderClaimsInvalidError";
  }
}

/**
 * Email-verification gate. Distinct from the generic claims-invalid
 * error because the UI treatment is distinct — we tell the user
 * plainly that their provider email isn't verified, rather than
 * surfacing a generic "something went wrong".
 */
export class ProviderEmailUnverifiedError extends OauthError {
  constructor(
    public readonly providerId: ProviderId,
    public readonly email: string,
  ) {
    // Do NOT include the full email in the public message — logs only.
    super(`[${providerId}] provider email is not verified`);
    this.name = "ProviderEmailUnverifiedError";
  }
}

/**
 * OIDC nonce came back different from what we sent. Almost always
 * indicates id_token replay or a cross-session callback.
 */
export class ProviderNonceMismatchError extends OauthError {
  constructor(public readonly providerId: ProviderId) {
    super(`[${providerId}] id_token nonce mismatch`);
    this.name = "ProviderNonceMismatchError";
  }
}

/**
 * The `state` query parameter didn't match the `mmpm_oauth_state`
 * cookie. Thrown by the callback route, not by adapters — kept here
 * for taxonomy unity.
 */
export class OauthStateMismatchError extends OauthError {
  constructor() {
    super("state parameter does not match cookie");
    this.name = "OauthStateMismatchError";
  }
}

/**
 * State looked valid but the flow was not found in the store — either
 * expired (>5 min) or already consumed (replay attempt).
 */
export class OauthFlowNotFoundError extends OauthError {
  constructor() {
    super("flow not found or already consumed");
    this.name = "OauthFlowNotFoundError";
  }
}

/**
 * Compute's bridge returned `{ code: "reauth_required" }`. The caller
 * must redirect the user through re-authentication and retry. Carries
 * the `reauthAgeSeconds` value from the 401 body so UI copy can say
 * "You last signed in X minutes ago".
 */
export class OauthReauthRequiredError extends OauthError {
  constructor(public readonly reauthAgeSeconds: number | null) {
    super("recent authentication required");
    this.name = "OauthReauthRequiredError";
  }
}

/* ─────────────────────── Rejection reason constants ─────────────────────── */

/**
 * All rejection reasons emitted by compute's OAuth service. These are
 * the `reason` string on `{outcome: "rejected", reason: "…"}` bodies
 * from the bridge. Kept here so the callback route can switch
 * exhaustively and the test suite can assert we don't miss any.
 *
 * IF COMPUTE ADDS A REASON, ADD IT HERE — tests enforce parity.
 */
export const REJECTION_REASONS = [
  "unverified_email",
  "ambiguous_email_match",
  "identity_taken_by_another_account",
  "provider_already_linked_to_this_account",
  // SPRINT-11.H3 (2026-04-30): added — compute's `RejectionCode` type
  // (`oauth-service.ts:183`) declares this as an unlink-flow rejection
  // for the "would leave account with zero auth paths" guard. The
  // runtime check is forward-looking (per `features/oauth.ts:488` —
  // "fires correctly once future features allow deleting the email")
  // but the wire union accepts it now so a future compute deploy that
  // ships the check doesn't need a lockstep website deploy.
  "last_auth_method",
  "identity_not_found",
  // H2 (ADR-003 S2 hardening, 2026-04-20): compute's re-verification of
  // the raw provider evidence (id_token for Google, access_token for
  // GitHub) failed — signature bad, issuer/audience wrong, email not
  // verified at the provider, or the claims body was tampered with
  // (sub / email don't match the evidence). Distinct from
  // `unverified_email` so ops can tell "provider said not verified"
  // from "we couldn't independently re-verify the claims".
  "evidence_invalid",
  // SPRINT-11.H3 (2026-04-30) historical note: `already_linked` was
  // here pre-Sprint-11 but is NOT a wire rejection. It appears in
  // compute as an audit-row `reason` field on the SUCCESS path of an
  // idempotent re-link (`oauth-service.ts:788` returns
  // { outcome: 'linked' }, never 'rejected'). Removed from the union
  // so the narrower stops accepting strings compute never emits.
] as const;

/** Union of all rejection reason strings. */
export type RejectionReason = (typeof REJECTION_REASONS)[number];

/**
 * Runtime type guard for compute rejection reasons. Use in the callback
 * route to narrow an unknown `data.reason` from the bridge envelope.
 */
export function isRejectionReason(x: unknown): x is RejectionReason {
  return typeof x === "string" && (REJECTION_REASONS as readonly string[]).includes(x);
}

/* ───────────────────── Bridge response outcome shapes ───────────────────── */

/**
 * The outcomes compute returns on `/bridge/signin`. Mirrored from
 * `parametric-memory-compute/src/services/oauth-service.ts`.
 * `'rejected'` carries a `RejectionReason`.
 *
 * **Session fields (T7a contract)**: the three session-bearing
 * outcomes (`signed_in_existing`, `auto_linked`, `new_account_created`)
 * each carry `sessionId` and `rawSessionToken`. Compute mints the
 * session inside the same transaction as the identity row — there is
 * no reachable "identity created, session missing" half-state — so the
 * callback route can always cookie `rawSessionToken` without a second
 * round trip. `sessionId` is exposed for observability only; only
 * `rawSessionToken` goes in the `mmpm_session` cookie.
 *
 * **Sprint 9.5 — pending_factor**: when the resolved account has TOTP
 * (or another factor) enrolled, compute returns `pending_factor` with
 * `rawPendingToken` + `requiredFactor` and NO session fields. This
 * variant is mutually exclusive with the three session-bearing ones —
 * `isSigninOutcome` enforces the absence of `rawSessionToken` on this
 * branch, so the route handler cannot accidentally cookie an empty
 * session value.
 */
export type SigninOutcome =
  | {
      outcome: "signed_in_existing";
      accountId: string;
      identityId: string;
      sessionId: string;
      rawSessionToken: string;
    }
  | {
      outcome: "auto_linked";
      accountId: string;
      identityId: string;
      sessionId: string;
      rawSessionToken: string;
    }
  | {
      outcome: "new_account_created";
      accountId: string;
      identityId: string;
      sessionId: string;
      rawSessionToken: string;
    }
  | {
      // Sprint 9.5 — TOTP login fork for OAuth. Mirror of compute's
      // `SigninResult.pending_factor` variant in
      // `parametric-memory-compute/src/services/oauth-service.ts`.
      //
      // Compute returns this when the resolved account has at least one
      // active second factor (TOTP today; WebAuthn future). The identity
      // row + the totp_pending_sessions row both committed inside the
      // same transaction, but NO session was minted — the website must
      // exchange `rawPendingToken` for a real session by collecting a
      // factor code from the user via the /auth/two-factor challenge
      // page.
      //
      // CRITICAL: `rawSessionToken` is deliberately ABSENT here.
      // `isSigninOutcome` enforces that absence so the route handler
      // cannot accidentally cookie a non-existent session token if a
      // future refactor introduces a half-merged shape.
      //
      // Only `signed_in_existing` and `auto_linked` can produce this
      // outcome — `new_account_created` cannot, because a brand-new
      // account has no factors enrolled yet.
      outcome: "pending_factor";
      accountId: string;
      identityId: string;
      /**
       * Raw 64-hex-char pending token. SHA-256-hashed on storage in
       * compute. The website sets this verbatim as the
       * `mmpm_pending_token` httpOnly cookie (10-min TTL, mirrors the
       * row TTL); the cookie is consumed by the BFF route at
       * `/api/auth/factors/totp/login-verify`.
       */
      rawPendingToken: string;
      /**
       * Which factor must produce a code to exchange the pending
       * token. Mirror of compute's `FactorKind`. Only `"totp"` ships
       * today — widen this union in lockstep with compute when
       * WebAuthn (or anything else) lands. The narrower below pins
       * the literal so a divergent compute response (e.g.
       * `requiredFactor: "webauthn"`) fails the shape check and the
       * route falls back to a generic error rather than silently
       * silently routing the user to a TOTP page they cannot use.
       *
       * TODO(webauthn-sprint): widen this literal to `FactorKind` (or
       * the union of currently-supported kinds) when WebAuthn ships in
       * compute. Compute's `oauth-service.ts` `pending_factor` outcome
       * already declares `requiredFactor: FactorKind`; the website
       * pin here exists only because TOTP is the lone implementation
       * today. When the union widens on compute, update both this
       * literal AND the runtime narrower check below in the same PR.
       */
      requiredFactor: "totp";
    }
  | { outcome: "rejected"; reason: RejectionReason };

/** Outcomes returned by `/bridge/link`. */
export type LinkOutcome =
  | { outcome: "linked"; identityId: string }
  | { outcome: "rejected"; reason: RejectionReason };

/** Outcomes returned by `/bridge/unlink`. */
export type UnlinkOutcome =
  | { outcome: "unlinked" }
  | { outcome: "rejected"; reason: RejectionReason };

/**
 * Runtime narrowing helpers. The bridge envelope's `data` is `unknown`
 * until we poke it; these let the callback route narrow without
 * duplicating the shape check at three call sites.
 */
export function isSigninOutcome(x: unknown): x is SigninOutcome {
  if (x === null || typeof x !== "object") return false;
  const rec = x as Record<string, unknown>;
  switch (rec.outcome) {
    case "signed_in_existing":
    case "auto_linked":
    case "new_account_created":
      // All four identifier fields are mandatory on any non-rejected
      // outcome. Missing `sessionId` or `rawSessionToken` is a bug on
      // compute's side (or a MITM'd response) — narrow to false so the
      // callback route maps it to a generic server error, not a
      // silent signed-in-without-session state.
      return (
        typeof rec.accountId === "string" &&
        typeof rec.identityId === "string" &&
        typeof rec.sessionId === "string" &&
        typeof rec.rawSessionToken === "string" &&
        rec.rawSessionToken.length > 0
      );
    case "pending_factor":
      // Sprint 9.5 — OAuth TOTP fork. accountId + identityId are
      // committed and required. rawPendingToken must be a non-empty
      // string (compute hashes it to storage; an empty string here
      // would mean "we minted a row whose token is the empty string"
      // — impossible from compute, defensive against MITM). Pin
      // requiredFactor to the literal "totp" — any other value is a
      // protocol mismatch we'd rather see as `bridge_shape_invalid`
      // than silently route the user to a 2FA page they cannot
      // complete.
      //
      // TODO(webauthn-sprint): widen this check in lockstep with the
      // type literal above. Suggested replacement when WebAuthn lands:
      //   (rec.requiredFactor === "totp" || rec.requiredFactor === "webauthn")
      // Update SAME PR as the type widening; do not relax this check
      // before compute is actually shipping the new factor.
      return (
        typeof rec.accountId === "string" &&
        typeof rec.identityId === "string" &&
        typeof rec.rawPendingToken === "string" &&
        rec.rawPendingToken.length > 0 &&
        rec.requiredFactor === "totp"
      );
    case "rejected":
      return isRejectionReason(rec.reason);
    default:
      return false;
  }
}

export function isLinkOutcome(x: unknown): x is LinkOutcome {
  if (x === null || typeof x !== "object") return false;
  const rec = x as Record<string, unknown>;
  switch (rec.outcome) {
    case "linked":
      return typeof rec.identityId === "string";
    case "rejected":
      return isRejectionReason(rec.reason);
    default:
      return false;
  }
}

export function isUnlinkOutcome(x: unknown): x is UnlinkOutcome {
  if (x === null || typeof x !== "object") return false;
  const rec = x as Record<string, unknown>;
  switch (rec.outcome) {
    case "unlinked":
      return true;
    case "rejected":
      return isRejectionReason(rec.reason);
    default:
      return false;
  }
}
