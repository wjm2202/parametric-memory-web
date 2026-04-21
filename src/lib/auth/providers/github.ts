/**
 * GitHub non-OIDC AuthProvider adapter (ADR-003, Phase 2).
 *
 * Endpoints
 * ─────────
 *   Authorize : https://github.com/login/oauth/authorize
 *   Token     : https://github.com/login/oauth/access_token
 *   User      : https://api.github.com/user
 *   Emails    : https://api.github.com/user/emails
 *
 * Why two API calls after the token exchange
 * ──────────────────────────────────────────
 * GitHub's `/user` endpoint exposes a `email` field, but it's
 * frequently `null` because many users keep their primary email
 * private. The canonical place to find a verified email is the
 * `/user/emails` endpoint, which returns every email on the account
 * with a `{primary, verified}` boolean pair. We pick the one flagged
 * primary AND verified; if no such row exists we fail closed with
 * `ProviderEmailUnverifiedError`.
 *
 * `/user` still gives us the stable `id` (numeric, coerced to string
 * for `providerSub`) and `name` (optional display name).
 *
 * Scopes requested: `read:user user:email` — read-only profile access
 * plus the email list. No repo, gist, or admin scopes. The minimum we
 * can ask for and still identify the user.
 *
 * Why we still send PKCE
 * ──────────────────────
 * GitHub OAuth Apps accept PKCE parameters as of 2022. Sending
 * `code_challenge`/`code_verifier` is defence-in-depth — if a
 * `code` is intercepted, it's still useless without the verifier.
 * GitHub silently ignores the challenge if an app hasn't opted in,
 * so the parameters are safe to send unconditionally.
 *
 * Failure taxonomy
 * ────────────────
 * Same set of error classes as the Google adapter, minus
 * `ProviderNonceMismatchError` (non-OIDC, no nonce). Adapters MUST NOT
 * invent new error classes for private failure modes — if a shape
 * doesn't map to the documented set, reconsider the mapping rather
 * than adding yet another throw.
 *
 * Testability
 * ───────────
 * `createGitHubProvider` takes `clientId`, `clientSecret`, and an
 * injectable `fetchImpl`. Tests stub fetch with a small router that
 * dispatches on URL — `/access_token`, `/user`, `/user/emails`.
 */
import {
  AuthProvider,
  BuildAuthorizeUrlArgs,
  ExchangeCodeArgs,
  NormalizedClaims,
  ProviderClaimsInvalidError,
  ProviderEmailUnverifiedError,
  ProviderNetworkError,
  ProviderTokenExchangeError,
} from "./types";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";

/**
 * Space-separated OAuth scope string. We ask for the minimum that
 * gets us an identifier + a verified email.
 */
const GITHUB_SCOPES = "read:user user:email";

/**
 * Per-fetch budget (ms). See `google.ts:GOOGLE_FETCH_TIMEOUT_MS` for the
 * rationale. GitHub makes THREE sequential calls per sign-in (token +
 * /user + /user/emails), so the worst-case total wait is 3× this
 * constant — still comfortably below the platform-wide 30 s request
 * budget. A per-call limit keeps the failure localised: if /user/emails
 * hangs, /user and the token exchange have already succeeded and we
 * can log which step stalled.
 *
 * Review finding H3 ("no fetch timeouts").
 */
export const GITHUB_FETCH_TIMEOUT_MS = 5000;

/**
 * Shape of a single entry in GitHub's `/user/emails` response.
 * Typed here so the filter logic stays readable; we only narrow the
 * fields we care about.
 */
interface GitHubEmailEntry {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

export interface GitHubProviderDeps {
  /** `GITHUB_OAUTH_CLIENT_ID` from env. */
  clientId: string;
  /** `GITHUB_OAUTH_CLIENT_SECRET` from env. */
  clientSecret: string;
  /** Injectable fetch. Defaults to global. */
  fetchImpl?: typeof fetch;
}

/**
 * Build a GitHub AuthProvider. Pure factory — no network until
 * `exchangeCode`. Tests construct their own with a stub `fetchImpl`.
 */
export function createGitHubProvider(deps: GitHubProviderDeps): AuthProvider {
  const { clientId, clientSecret } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;

  return {
    id: "github",
    displayName: "GitHub",
    isOidc: false,

    buildAuthorizeUrl({ state, challenge, redirectUri }: BuildAuthorizeUrlArgs): string {
      // GitHub has no OIDC and no nonce. If the caller mistakenly
      // passed one we ignore it — the adapter interface lets the
      // caller supply one (Google needs it) and being strict here
      // would just add a pointless throw on an innocuous input.
      const url = new URL(GITHUB_AUTHORIZE_URL);
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", GITHUB_SCOPES);
      url.searchParams.set("state", state);
      // PKCE — GitHub OAuth Apps silently accept these since 2022.
      // See module header for the rationale on sending unconditionally.
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");
      // `allow_signup=true` is the default; we set it explicitly so a
      // future GitHub policy change can't flip our behaviour.
      url.searchParams.set("allow_signup", "true");
      return url.toString();
    },

    async exchangeCode({
      code,
      verifier,
      redirectUri,
    }: ExchangeCodeArgs): Promise<NormalizedClaims> {
      // ── Step 1: token exchange ───────────────────────────────────
      // Form-urlencoded body + Accept: application/json to get the
      // response as JSON instead of GitHub's default form-encoded.
      const tokenBody = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      });

      let tokenRes: Response;
      try {
        tokenRes = await fetchImpl(GITHUB_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: tokenBody.toString(),
          cache: "no-store",
          signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS),
        });
      } catch (err) {
        throw ProviderNetworkError.fromFetchError(
          "github",
          err,
          "token exchange",
          GITHUB_FETCH_TIMEOUT_MS,
        );
      }

      let tokenPayload: unknown;
      try {
        tokenPayload = await tokenRes.json();
      } catch {
        throw new ProviderTokenExchangeError("github", tokenRes.status, null);
      }

      if (!tokenRes.ok) {
        const upstreamCode =
          tokenPayload !== null &&
          typeof tokenPayload === "object" &&
          "error" in tokenPayload &&
          typeof (tokenPayload as { error: unknown }).error === "string"
            ? (tokenPayload as { error: string }).error
            : null;
        throw new ProviderTokenExchangeError("github", tokenRes.status, upstreamCode);
      }

      // GitHub returns 200 even on logical errors like `bad_verification_code`
      // — the body has an `error` field but status is 2xx. Check it.
      if (
        tokenPayload !== null &&
        typeof tokenPayload === "object" &&
        "error" in tokenPayload &&
        typeof (tokenPayload as { error: unknown }).error === "string"
      ) {
        throw new ProviderTokenExchangeError(
          "github",
          tokenRes.status,
          (tokenPayload as { error: string }).error,
        );
      }

      const accessToken =
        tokenPayload !== null &&
        typeof tokenPayload === "object" &&
        "access_token" in tokenPayload &&
        typeof (tokenPayload as { access_token: unknown }).access_token === "string"
          ? (tokenPayload as { access_token: string }).access_token
          : null;
      if (accessToken === null) {
        throw new ProviderClaimsInvalidError("github", "token response missing access_token");
      }

      // ── Step 2: GET /user ────────────────────────────────────────
      // Common headers for every API call. GitHub asks for a
      // `User-Agent` on unauthenticated traffic, but OAuth-token
      // requests get a pass. We set a stable UA anyway for
      // operator-side traceability.
      const apiHeaders: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "parametric-memory-website",
      };

      let userRes: Response;
      try {
        userRes = await fetchImpl(GITHUB_USER_URL, {
          method: "GET",
          headers: apiHeaders,
          cache: "no-store",
          signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS),
        });
      } catch (err) {
        throw ProviderNetworkError.fromFetchError(
          "github",
          err,
          "GET /user",
          GITHUB_FETCH_TIMEOUT_MS,
        );
      }

      if (!userRes.ok) {
        throw new ProviderClaimsInvalidError(
          "github",
          `GET /user failed with HTTP ${userRes.status}`,
        );
      }

      let userPayload: unknown;
      try {
        userPayload = await userRes.json();
      } catch {
        throw new ProviderClaimsInvalidError("github", "GET /user returned non-JSON body");
      }

      if (userPayload === null || typeof userPayload !== "object") {
        throw new ProviderClaimsInvalidError("github", "/user body not an object");
      }
      const user = userPayload as Record<string, unknown>;

      // GitHub's `id` is a number. We coerce to string for
      // `providerSub` because compute's schema stores it as text —
      // consistency with Google (`sub` is already a string).
      const id = user.id;
      if (typeof id !== "number" || !Number.isFinite(id)) {
        throw new ProviderClaimsInvalidError("github", "/user response missing numeric id");
      }
      const providerSub = String(id);

      const displayName =
        typeof user.name === "string" && user.name.length > 0 ? (user.name as string) : null;

      // ── Step 3: GET /user/emails ────────────────────────────────
      let emailsRes: Response;
      try {
        emailsRes = await fetchImpl(GITHUB_EMAILS_URL, {
          method: "GET",
          headers: apiHeaders,
          cache: "no-store",
          signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS),
        });
      } catch (err) {
        throw ProviderNetworkError.fromFetchError(
          "github",
          err,
          "GET /user/emails",
          GITHUB_FETCH_TIMEOUT_MS,
        );
      }

      if (!emailsRes.ok) {
        throw new ProviderClaimsInvalidError(
          "github",
          `GET /user/emails failed with HTTP ${emailsRes.status}`,
        );
      }

      let emailsPayload: unknown;
      try {
        emailsPayload = await emailsRes.json();
      } catch {
        throw new ProviderClaimsInvalidError("github", "GET /user/emails returned non-JSON body");
      }

      if (!Array.isArray(emailsPayload)) {
        throw new ProviderClaimsInvalidError("github", "/user/emails body is not an array");
      }

      const primaryVerified = (emailsPayload as GitHubEmailEntry[]).find(
        (e) =>
          typeof e.email === "string" &&
          e.email.length > 0 &&
          e.primary === true &&
          e.verified === true,
      );

      if (!primaryVerified) {
        // If the account has a primary email but it isn't verified —
        // or has no primary at all — we surface the same error the
        // Google adapter uses. The UI branches on the error class to
        // produce a "verify your email with GitHub" flash.
        //
        // We pass the unverified-primary email if we have one (for
        // the log's structured field) or `""` if nothing is primary.
        const primaryAny = (emailsPayload as GitHubEmailEntry[]).find(
          (e) => typeof e.email === "string" && e.primary === true,
        );
        throw new ProviderEmailUnverifiedError("github", primaryAny?.email ?? "");
      }

      return {
        providerSub,
        email: primaryVerified.email,
        emailVerified: true,
        displayName,
        // H2: forward the raw access_token so compute can re-fetch
        // /user + /user/emails itself and confirm the token really
        // belongs to `providerSub` with `primaryVerified.email`. A
        // compromised website that swapped email/sub for a victim's
        // values would fail compute's re-fetch because the access
        // token would resolve to a different user on GitHub.
        providerEvidence: { kind: "github-access-token", accessToken },
      };
    },
  };
}

export const GITHUB_ENDPOINTS = {
  authorize: GITHUB_AUTHORIZE_URL,
  token: GITHUB_TOKEN_URL,
  user: GITHUB_USER_URL,
  emails: GITHUB_EMAILS_URL,
  scopes: GITHUB_SCOPES,
} as const;
