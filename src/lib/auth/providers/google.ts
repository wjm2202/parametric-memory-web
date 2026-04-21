/**
 * Google OIDC AuthProvider adapter (ADR-003, Phase 2).
 *
 * Endpoints and contract
 * ──────────────────────
 *   Authorize : https://accounts.google.com/o/oauth2/v2/auth
 *   Token     : https://oauth2.googleapis.com/token
 *   JWKS      : https://www.googleapis.com/oauth2/v3/certs
 *   Issuer    : "https://accounts.google.com"   (OIDC discovery)
 *               "accounts.google.com"            (legacy — still emitted for some tenants)
 *
 * Scopes requested: `openid email profile` — the minimum that gets us
 * `sub`, `email`, `email_verified`, and `name`. No `offline_access`,
 * no refresh token — we don't store Google refresh tokens (ADR pre-
 * kickoff decision #4).
 *
 * What this adapter verifies
 * ──────────────────────────
 * After the token exchange, Google returns an `id_token` (JWT). We
 * `jose.jwtVerify` it with a remote JWKS pinned to Google's endpoint:
 *   - signature  — jose checks against JWKS
 *   - `iss`      — must be one of Google's documented issuers
 *   - `aud`      — must equal `clientId`
 *   - `exp/iat`  — jose checks (≤5 min skew default)
 *   - `nonce`    — must equal `expectedNonce` (we check this explicitly —
 *                  jose's `requiredClaims` enforces presence, not value)
 *   - `email_verified` — must be true; throws `ProviderEmailUnverifiedError`
 *
 * Failure taxonomy
 * ────────────────
 * Every failure path throws one of the error classes from `./types.ts`.
 * The callback route catches at the outer scope and maps to the
 * appropriate UI / audit response. This keeps the happy path readable
 * as straight-line code.
 *
 * Testability
 * ───────────
 * `createGoogleProvider` accepts:
 *   - `clientId` / `clientSecret`  — config
 *   - `fetchImpl`                  — defaults to global `fetch`
 *   - `jwksLoader`                 — defaults to `createRemoteJWKSet`
 *     pointed at Google's certs URL. Tests pass a synchronous fake
 *     that returns an in-test JWK so we never touch the network.
 *   - `nowSeconds`                 — frozen clock for expiry testing
 *
 * The real adapter holds a module-level `createRemoteJWKSet` instance
 * so jose can cache the keys across requests. Tests override.
 */
import {
  createRemoteJWKSet as createRemoteJWKSetReal,
  jwtVerify,
  type CryptoKey as JoseCryptoKey,
  type JWSHeaderParameters,
  type FlattenedJWSInput,
  type JWTPayload,
} from "jose";
import {
  AuthProvider,
  BuildAuthorizeUrlArgs,
  ExchangeCodeArgs,
  NormalizedClaims,
  ProviderClaimsInvalidError,
  ProviderEmailUnverifiedError,
  ProviderNetworkError,
  ProviderNonceMismatchError,
  ProviderTokenExchangeError,
} from "./types";

/**
 * Google's well-known OAuth endpoints. Hard-coded rather than fetched
 * from the OIDC discovery document because they haven't changed in
 * many years and a discovery-fetch adds a round-trip per cold start
 * AND a surprising failure mode if Google's discovery JSON is
 * momentarily unavailable.
 */
const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

/**
 * Both issuer strings Google has historically emitted in id_tokens.
 * Accepting both is standard practice — see Google's own
 * "Validating an ID token" docs. If we pinned only one, some older
 * tenants' tokens would falsely reject.
 */
const GOOGLE_ISSUERS = new Set<string>(["https://accounts.google.com", "accounts.google.com"]);

/** Space-separated scope string for the authorize URL. */
const GOOGLE_SCOPES = "openid email profile";

/**
 * Per-fetch budget (ms). The OAuth callback runs in the hot path of a
 * user sign-in; an upstream provider that has stopped answering must
 * NOT hang a Next.js server request forever. Chosen higher than the
 * 95th-percentile Google token round-trip (~800 ms over transpacific
 * links) and well under the 30 s platform-wide request budget so the
 * user sees a deterministic "try again" instead of a timeout page.
 *
 * Exported as part of `GOOGLE_ENDPOINTS` at the bottom of the file so
 * the unit tests can assert against the same constant rather than
 * duplicating the magic number.
 *
 * Review finding H3 ("no fetch timeouts"): before this existed, a
 * Google token endpoint that silently hung on `await` would hang the
 * entire callback request handler with no log line. `AbortSignal.timeout`
 * fires a `DOMException` with `name: 'TimeoutError'` (Node 18+); the
 * catch block maps it onto `ProviderNetworkError` so the outer error
 * taxonomy is unchanged.
 */
export const GOOGLE_FETCH_TIMEOUT_MS = 5000;

/**
 * Signature jose's `createRemoteJWKSet` / `createLocalJWKSet` return —
 * a callable key resolver for `jwtVerify`. Re-typed here so our
 * factory's DI slot stays compatible with both the real jose and our
 * test fakes.
 *
 * The return is `Promise<JoseCryptoKey>` (jose's narrowed `CryptoKey`,
 * which is `Extract<generateKey return, { type: string }>` — i.e. not
 * `CryptoKeyPair`). jose v6 JWKS resolvers never return `Uint8Array`;
 * that type only appears in `jwtVerify`'s accept shape, not in what
 * a JWKS callable produces. Keeping the return narrow prevents
 * future devs from writing a `Uint8Array` branch that can't fire.
 */
export type JwksLoader = (
  protectedHeader?: JWSHeaderParameters,
  token?: FlattenedJWSInput,
) => Promise<JoseCryptoKey>;

/**
 * Extra knobs for testing. Production code should pass only `clientId`
 * + `clientSecret`; everything else has a sensible default.
 */
export interface GoogleProviderDeps {
  /** `GOOGLE_OAUTH_CLIENT_ID` from env. */
  clientId: string;
  /** `GOOGLE_OAUTH_CLIENT_SECRET` from env. */
  clientSecret: string;
  /** Injectable fetch. Defaults to global. */
  fetchImpl?: typeof fetch;
  /**
   * Injectable JWKS resolver. Defaults to `createRemoteJWKSet(GOOGLE_JWKS_URL)`
   * with the library's built-in caching. Tests pass a fake that
   * returns a single key without I/O.
   */
  jwksLoader?: JwksLoader;
  /**
   * Injectable `now` (seconds). jose's internal clock comes from the
   * environment by default; passing this overrides for deterministic
   * expiry tests. Accepts seconds, not milliseconds, to match jose.
   */
  nowSeconds?: () => number;
}

/**
 * Build a Google AuthProvider. Pure factory — no network until you
 * call `exchangeCode`. Create one per server process; the `jwksLoader`
 * default caches keys across calls.
 */
export function createGoogleProvider(deps: GoogleProviderDeps): AuthProvider {
  const { clientId, clientSecret } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;

  // Build the default JWKS resolver once per adapter instance. The
  // jose library caches keys internally with an ETag + TTL; reusing
  // the same resolver keeps that cache warm.
  const jwksLoader: JwksLoader =
    deps.jwksLoader ?? createRemoteJWKSetReal(new URL(GOOGLE_JWKS_URL));

  // jose accepts `currentDate` (ms-precision Date). We take `nowSeconds`
  // for symmetry with the rest of this codebase and construct a Date.
  // Bind to a local so TS narrows without a non-null assertion.
  const nowSecondsFn = deps.nowSeconds;
  const nowDate = nowSecondsFn ? () => new Date(nowSecondsFn() * 1000) : undefined;

  return {
    id: "google",
    displayName: "Google",
    isOidc: true,

    buildAuthorizeUrl({ state, challenge, nonce, redirectUri }: BuildAuthorizeUrlArgs): string {
      // Google requires `nonce` for `openid` scope. Surface the bug
      // early if the caller somehow got here without one, rather than
      // letting Google reject the authorize request with a generic
      // "invalid_request".
      if (nonce === null) {
        throw new Error(
          "createGoogleProvider.buildAuthorizeUrl: nonce is required for OIDC (Google)",
        );
      }

      const url = new URL(GOOGLE_AUTHORIZE_URL);
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", GOOGLE_SCOPES);
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");
      url.searchParams.set("nonce", nonce);
      // `prompt=select_account` lets the user pick an account on a
      // machine with multiple Google logins — otherwise Google will
      // silently auto-select whichever is most recent, which is a bad
      // surprise on shared machines. Cost: one extra click.
      url.searchParams.set("prompt", "select_account");
      // We never ask for a refresh token — no `access_type=offline`.
      return url.toString();
    },

    async exchangeCode({
      code,
      verifier,
      redirectUri,
      expectedNonce,
    }: ExchangeCodeArgs): Promise<NormalizedClaims> {
      if (expectedNonce === null) {
        throw new Error(
          "createGoogleProvider.exchangeCode: expectedNonce is required for OIDC (Google)",
        );
      }

      // ── Step 1: POST the token endpoint ──────────────────────────
      // application/x-www-form-urlencoded per OAuth 2.0 §4.1.3.
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      });

      let res: Response;
      try {
        res = await fetchImpl(GOOGLE_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            // Explicit Accept — Google normally returns JSON but a
            // misconfigured proxy could negotiate HTML. We treat
            // non-JSON as a hard fail downstream.
            Accept: "application/json",
          },
          body: body.toString(),
          // Never cache token exchanges — each `code` is single-use.
          cache: "no-store",
          // Hard budget on the upstream call. See GOOGLE_FETCH_TIMEOUT_MS
          // for rationale; the catch block below normalises TimeoutError.
          signal: AbortSignal.timeout(GOOGLE_FETCH_TIMEOUT_MS),
        });
      } catch (err) {
        throw ProviderNetworkError.fromFetchError(
          "google",
          err,
          "token exchange",
          GOOGLE_FETCH_TIMEOUT_MS,
        );
      }

      let tokenBody: unknown;
      try {
        tokenBody = await res.json();
      } catch {
        // Non-JSON response = definitely an upstream error. Surface
        // the status so ops sees it in logs.
        throw new ProviderTokenExchangeError("google", res.status, null);
      }

      if (!res.ok) {
        // Google's error body shape: `{ error: "invalid_grant", error_description: "..." }`
        // — we log the `error` code, not the description (which can
        // contain user-visible text).
        const code =
          tokenBody !== null &&
          typeof tokenBody === "object" &&
          "error" in tokenBody &&
          typeof (tokenBody as { error: unknown }).error === "string"
            ? (tokenBody as { error: string }).error
            : null;
        throw new ProviderTokenExchangeError("google", res.status, code);
      }

      // ── Step 2: pluck id_token + verify ──────────────────────────
      const idToken =
        tokenBody !== null &&
        typeof tokenBody === "object" &&
        "id_token" in tokenBody &&
        typeof (tokenBody as { id_token: unknown }).id_token === "string"
          ? (tokenBody as { id_token: string }).id_token
          : null;
      if (idToken === null) {
        throw new ProviderClaimsInvalidError("google", "token response missing id_token");
      }

      let payload: JWTPayload;
      try {
        // Note on at_hash / c_hash: OIDC allows but doesn't require
        // hash validation when using the Authorization Code flow with
        // PKCE — PKCE's code_verifier binding supersedes c_hash, and
        // at_hash is only relevant for the Implicit / Hybrid flows we
        // don't use. If Google ever emits them we simply ignore them.
        const verified = await jwtVerify(idToken, jwksLoader, {
          issuer: [...GOOGLE_ISSUERS],
          audience: clientId,
          // jose's default algorithms include RS256, which is what
          // Google uses. Listing explicitly pins the accepted set.
          algorithms: ["RS256"],
          requiredClaims: ["sub", "email", "email_verified", "nonce"],
          ...(nowDate ? { currentDate: nowDate() } : {}),
        });
        payload = verified.payload;
      } catch (err) {
        throw new ProviderClaimsInvalidError(
          "google",
          err instanceof Error ? err.message : "id_token verification failed",
        );
      }

      // ── Step 3: nonce (value, not presence) ─────────────────────
      if (payload.nonce !== expectedNonce) {
        throw new ProviderNonceMismatchError("google");
      }

      // ── Step 4: verified-email gate ─────────────────────────────
      // Google emits `email_verified: true|false`. Anything else (e.g.
      // missing entirely — which jose's requiredClaims should catch —
      // or a non-boolean) we treat as unverified. The bridge would
      // reject anyway, but better to short-circuit here with a clear
      // error for the UI.
      const email = typeof payload.email === "string" ? payload.email : null;
      const emailVerified = payload.email_verified === true;
      if (email === null) {
        throw new ProviderClaimsInvalidError("google", "email claim is missing or non-string");
      }
      if (!emailVerified) {
        throw new ProviderEmailUnverifiedError("google", email);
      }

      const sub = typeof payload.sub === "string" ? payload.sub : null;
      if (sub === null) {
        // jose's requiredClaims already enforced presence; this is
        // belt-and-braces for a payload with `sub: null` slipping
        // through.
        throw new ProviderClaimsInvalidError("google", "sub claim is missing or non-string");
      }

      const displayName =
        typeof payload.name === "string" && payload.name.length > 0 ? payload.name : null;

      return {
        providerSub: sub,
        email,
        emailVerified: true,
        displayName,
        // H2: forward the raw id_token so compute can re-verify end-to-end
        // (signature, iss, aud, email_verified, and that sub/email match
        // the claims we're asserting in the bridge body). A compromised
        // website that tampered with any of the above fields above would
        // be caught on compute's side because the id_token's payload
        // wouldn't match the tampered body.
        providerEvidence: { kind: "google-id-token", idToken },
      };
    },
  };
}

/**
 * Exported constants so the test suite can assert we're hitting the
 * right endpoints without duplicating the strings.
 */
export const GOOGLE_ENDPOINTS = {
  authorize: GOOGLE_AUTHORIZE_URL,
  token: GOOGLE_TOKEN_URL,
  jwks: GOOGLE_JWKS_URL,
  issuers: [...GOOGLE_ISSUERS],
  scopes: GOOGLE_SCOPES,
} as const;
