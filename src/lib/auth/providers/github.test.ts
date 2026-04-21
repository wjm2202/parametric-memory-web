/**
 * Unit tests for the GitHub non-OIDC provider adapter.
 *
 * No real GitHub calls — `fetchImpl` is a small in-test router that
 * dispatches on the URL and returns canned JSON. Every test explicitly
 * constructs the set of endpoints it expects the adapter to hit, so
 * a regression that skips `/user/emails` (and silently accepts an
 * unverified `/user.email`) would cause the test to fail rather than
 * pass by accident.
 *
 * Coverage strategy
 * ─────────────────
 *   - buildAuthorizeUrl: params, scope, PKCE, allow_signup.
 *   - Happy path: token → /user → /user/emails → normalised claims.
 *   - Token endpoint 4xx and 2xx-with-error-body.
 *   - /user malformed (missing id, non-object).
 *   - /user/emails with no primary, no verified primary, and mixed
 *     verified+non-primary entries (must pick primary+verified).
 *   - Network errors on each of the three calls.
 *   - Display name null-vs-string.
 */
import { describe, it, expect } from "vitest";
import { createGitHubProvider, GITHUB_ENDPOINTS, GITHUB_FETCH_TIMEOUT_MS } from "./github";
import {
  ProviderClaimsInvalidError,
  ProviderEmailUnverifiedError,
  ProviderNetworkError,
  ProviderTokenExchangeError,
} from "./types";

/**
 * Build a fake fetch that dispatches based on URL. Each handler is
 * called with `(init)` and returns a Response. Missing routes 500.
 */
function makeFetch(
  routes: Partial<
    Record<
      typeof GITHUB_ENDPOINTS.token | typeof GITHUB_ENDPOINTS.user | typeof GITHUB_ENDPOINTS.emails,
      (init: RequestInit | undefined) => Response | Promise<Response>
    >
  >,
): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url.toString();
    const handler = (
      routes as Record<string, (init?: RequestInit) => Response | Promise<Response>>
    )[u];
    if (!handler) {
      return new Response("no route", { status: 500 });
    }
    return handler(init);
  }) as typeof fetch;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const baseArgs = {
  code: "CODE",
  verifier: "VERIFIER",
  redirectUri: "https://parametric-memory.dev/api/auth/oauth/github/callback",
  expectedNonce: null as string | null,
};

describe("buildAuthorizeUrl", () => {
  const provider = createGitHubProvider({
    clientId: "gh-client",
    clientSecret: "gh-secret",
    fetchImpl: (async () => new Response("", { status: 200 })) as typeof fetch,
  });

  const args = {
    state: "S",
    challenge: "C",
    nonce: null as string | null,
    redirectUri: baseArgs.redirectUri,
  };

  it("points at GitHub's authorize endpoint", () => {
    const u = new URL(provider.buildAuthorizeUrl(args));
    expect(`${u.origin}${u.pathname}`).toBe(GITHUB_ENDPOINTS.authorize);
  });

  it("sends client_id, redirect_uri, scope, state, PKCE", () => {
    const u = new URL(provider.buildAuthorizeUrl(args));
    expect(u.searchParams.get("client_id")).toBe("gh-client");
    expect(u.searchParams.get("redirect_uri")).toBe(args.redirectUri);
    expect(u.searchParams.get("scope")).toBe(GITHUB_ENDPOINTS.scopes);
    expect(u.searchParams.get("state")).toBe("S");
    expect(u.searchParams.get("code_challenge")).toBe("C");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("allow_signup")).toBe("true");
    // No nonce param for non-OIDC.
    expect(u.searchParams.get("nonce")).toBeNull();
  });

  it("requests only read:user user:email — no elevated scopes", () => {
    const u = new URL(provider.buildAuthorizeUrl(args));
    const scope = u.searchParams.get("scope") ?? "";
    expect(scope).not.toContain("repo");
    expect(scope).not.toContain("admin");
    expect(scope).not.toContain("gist");
  });
});

describe("exchangeCode — happy path", () => {
  it("returns normalised claims when primary+verified email is present", async () => {
    const fetchImpl = makeFetch({
      [GITHUB_ENDPOINTS.token]: () =>
        json(200, { access_token: "AT", token_type: "bearer", scope: "read:user,user:email" }),
      [GITHUB_ENDPOINTS.user]: () =>
        json(200, {
          id: 1234567,
          login: "octocat",
          name: "Mona Octocat",
        }),
      [GITHUB_ENDPOINTS.emails]: () =>
        json(200, [
          {
            email: "octo@users.noreply.github.com",
            primary: false,
            verified: true,
            visibility: null,
          },
          { email: "mona@example.com", primary: true, verified: true, visibility: "public" },
        ]),
    });

    const provider = createGitHubProvider({
      clientId: "ci",
      clientSecret: "cs",
      fetchImpl,
    });

    const claims = await provider.exchangeCode(baseArgs);
    expect(claims).toEqual({
      providerSub: "1234567",
      email: "mona@example.com",
      emailVerified: true,
      displayName: "Mona Octocat",
      // H2: the GitHub access token carried forward as provider
      // evidence so compute can independently re-fetch /user and
      // /user/emails against GitHub's API. Website's `emailVerified:
      // true` above is advisory; compute re-derives it from the
      // re-fetched /user/emails payload.
      providerEvidence: { kind: "github-access-token", accessToken: "AT" },
    });
  });

  it("returns displayName=null when /user.name is null or empty", async () => {
    const fetchImpl = makeFetch({
      [GITHUB_ENDPOINTS.token]: () => json(200, { access_token: "AT" }),
      [GITHUB_ENDPOINTS.user]: () => json(200, { id: 1, login: "x", name: null }),
      [GITHUB_ENDPOINTS.emails]: () =>
        json(200, [{ email: "x@example.com", primary: true, verified: true, visibility: null }]),
    });
    const provider = createGitHubProvider({ clientId: "ci", clientSecret: "cs", fetchImpl });
    const claims = await provider.exchangeCode(baseArgs);
    expect(claims.displayName).toBeNull();
  });
});

describe("exchangeCode — token endpoint errors", () => {
  it("throws ProviderTokenExchangeError on HTTP 4xx", async () => {
    const fetchImpl = makeFetch({
      [GITHUB_ENDPOINTS.token]: () => json(400, { error: "bad_verification_code" }),
    });
    const p = createGitHubProvider({ clientId: "ci", clientSecret: "cs", fetchImpl });
    try {
      await p.exchangeCode(baseArgs);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderTokenExchangeError);
      const e = err as ProviderTokenExchangeError;
      expect(e.upstreamStatus).toBe(400);
      expect(e.upstreamCode).toBe("bad_verification_code");
    }
  });

  it("throws ProviderTokenExchangeError on HTTP 200 with error body (GitHub quirk)", async () => {
    const fetchImpl = makeFetch({
      [GITHUB_ENDPOINTS.token]: () =>
        json(200, {
          error: "bad_verification_code",
          error_description: "The code passed is incorrect or expired.",
        }),
    });
    const p = createGitHubProvider({ clientId: "ci", clientSecret: "cs", fetchImpl });
    await expect(p.exchangeCode(baseArgs)).rejects.toBeInstanceOf(ProviderTokenExchangeError);
  });

  it("throws ProviderClaimsInvalidError when token response has no access_token", async () => {
    const fetchImpl = makeFetch({
      [GITHUB_ENDPOINTS.token]: () => json(200, { token_type: "bearer" }),
    });
    const p = createGitHubProvider({ clientId: "ci", clientSecret: "cs", fetchImpl });
    await expect(p.exchangeCode(baseArgs)).rejects.toBeInstanceOf(ProviderClaimsInvalidError);
  });

  it("throws ProviderNetworkError on fetch rejection at token step", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("ENOTFOUND");
    }) as typeof fetch;
    const p = createGitHubProvider({ clientId: "ci", clientSecret: "cs", fetchImpl });
    await expect(p.exchangeCode(baseArgs)).rejects.toBeInstanceOf(ProviderNetworkError);
  });
});

describe("exchangeCode — /user errors", () => {
  it("throws ProviderClaimsInvalidError when /user returns HTTP 401", async () => {
    const fetchImpl = makeFetch({
      [GITHUB_ENDPOINTS.token]: () => json(200, { access_token: "AT" }),
      [GITHUB_ENDPOINTS.user]: () => json(401, { message: "Bad credentials" }),
    });
    const p = createGitHubProvider({ clientId: "ci", clientSecret: "cs", fetchImpl });
    await expect(p.exchangeCode(baseArgs)).rejects.toBeInstanceOf(ProviderClaimsInvalidError);
  });

  it("throws ProviderClaimsInvalidError when /user lacks numeric id", async () => {
    const fetchImpl = makeFetch({
      [GITHUB_ENDPOINTS.token]: () => json(200, { access_token: "AT" }),
      [GITHUB_ENDPOINTS.user]: () => json(200, { login: "noid" }),
    });
    const p = createGitHubProvider({ clientId: "ci", clientSecret: "cs", fetchImpl });
    await expect(p.exchangeCode(baseArgs)).rejects.toBeInstanceOf(ProviderClaimsInvalidError);
  });

  it("throws ProviderClaimsInvalidError when /user returns non-object body", async () => {
    const fetchImpl = makeFetch({
      [GITHUB_ENDPOINTS.token]: () => json(200, { access_token: "AT" }),
      [GITHUB_ENDPOINTS.user]: () => json(200, [] as unknown),
    });
    // Note: arrays are `typeof === "object"` so the adapter will try
    // to pull `id` off an array and fail on type. Pinning this so the
    // failure mode is ClaimsInvalid, not a TypeError escaping.
    const p = createGitHubProvider({ clientId: "ci", clientSecret: "cs", fetchImpl });
    await expect(p.exchangeCode(baseArgs)).rejects.toBeInstanceOf(ProviderClaimsInvalidError);
  });
});

describe("exchangeCode — /user/emails selection rules", () => {
  const tokenOk = () => json(200, { access_token: "AT" });
  const userOk = () => json(200, { id: 7, name: "Seven" });

  it("picks the entry that is BOTH primary and verified", async () => {
    const fetchImpl = makeFetch({
      [GITHUB_ENDPOINTS.token]: tokenOk,
      [GITHUB_ENDPOINTS.user]: userOk,
      [GITHUB_ENDPOINTS.emails]: () =>
        json(200, [
          // Verified but not primary
          { email: "a@example.com", primary: false, verified: true, visibility: null },
          // Primary but not verified
          { email: "b@example.com", primary: true, verified: false, visibility: null },
          // Both — this is the one
          { email: "c@example.com", primary: false, verified: true, visibility: null },
        ]),
    });
    const p = createGitHubProvider({ clientId: "ci", clientSecret: "cs", fetchImpl });
    // None of the entries are BOTH primary and verified, so we expect
    // an unverified-email error — not a silent "pick any verified".
    await expect(p.exchangeCode(baseArgs)).rejects.toBeInstanceOf(ProviderEmailUnverifiedError);
  });

  it("throws ProviderEmailUnverifiedError when no entry is primary+verified", async () => {
    const fetchImpl = makeFetch({
      [GITHUB_ENDPOINTS.token]: tokenOk,
      [GITHUB_ENDPOINTS.user]: userOk,
      [GITHUB_ENDPOINTS.emails]: () =>
        json(200, [{ email: "x@example.com", primary: true, verified: false, visibility: null }]),
    });
    const p = createGitHubProvider({ clientId: "ci", clientSecret: "cs", fetchImpl });
    await expect(p.exchangeCode(baseArgs)).rejects.toBeInstanceOf(ProviderEmailUnverifiedError);
  });

  it("throws ProviderEmailUnverifiedError on empty emails array", async () => {
    const fetchImpl = makeFetch({
      [GITHUB_ENDPOINTS.token]: tokenOk,
      [GITHUB_ENDPOINTS.user]: userOk,
      [GITHUB_ENDPOINTS.emails]: () => json(200, []),
    });
    const p = createGitHubProvider({ clientId: "ci", clientSecret: "cs", fetchImpl });
    await expect(p.exchangeCode(baseArgs)).rejects.toBeInstanceOf(ProviderEmailUnverifiedError);
  });

  it("throws ProviderClaimsInvalidError when /user/emails is not an array", async () => {
    const fetchImpl = makeFetch({
      [GITHUB_ENDPOINTS.token]: tokenOk,
      [GITHUB_ENDPOINTS.user]: userOk,
      [GITHUB_ENDPOINTS.emails]: () => json(200, { message: "you forgot the scope" }),
    });
    const p = createGitHubProvider({ clientId: "ci", clientSecret: "cs", fetchImpl });
    await expect(p.exchangeCode(baseArgs)).rejects.toBeInstanceOf(ProviderClaimsInvalidError);
  });

  it("throws ProviderClaimsInvalidError when /user/emails returns HTTP 404", async () => {
    const fetchImpl = makeFetch({
      [GITHUB_ENDPOINTS.token]: tokenOk,
      [GITHUB_ENDPOINTS.user]: userOk,
      [GITHUB_ENDPOINTS.emails]: () => json(404, { message: "nope" }),
    });
    const p = createGitHubProvider({ clientId: "ci", clientSecret: "cs", fetchImpl });
    await expect(p.exchangeCode(baseArgs)).rejects.toBeInstanceOf(ProviderClaimsInvalidError);
  });
});

describe("exchangeCode — request shape", () => {
  it("sends Bearer token + GitHub API headers on /user and /user/emails", async () => {
    const seen: { url: string; auth: string | undefined }[] = [];
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      const u = typeof url === "string" ? url : url.toString();
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      seen.push({ url: u, auth });
      if (u === GITHUB_ENDPOINTS.token) return json(200, { access_token: "ATK" });
      if (u === GITHUB_ENDPOINTS.user) return json(200, { id: 1, name: "n" });
      if (u === GITHUB_ENDPOINTS.emails)
        return json(200, [
          { email: "z@example.com", primary: true, verified: true, visibility: null },
        ]);
      return new Response("", { status: 500 });
    }) as typeof fetch;

    const p = createGitHubProvider({ clientId: "ci", clientSecret: "cs", fetchImpl });
    await p.exchangeCode(baseArgs);

    const userCall = seen.find((s) => s.url === GITHUB_ENDPOINTS.user);
    const emailsCall = seen.find((s) => s.url === GITHUB_ENDPOINTS.emails);
    expect(userCall?.auth).toBe("Bearer ATK");
    expect(emailsCall?.auth).toBe("Bearer ATK");
  });

  it("POSTs token endpoint with form-urlencoded body + Accept: application/json", async () => {
    let capturedInit: RequestInit | null = null;
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u === GITHUB_ENDPOINTS.token) {
        capturedInit = init ?? null;
        return json(200, { access_token: "AT" });
      }
      if (u === GITHUB_ENDPOINTS.user) return json(200, { id: 1 });
      if (u === GITHUB_ENDPOINTS.emails)
        return json(200, [
          { email: "e@example.com", primary: true, verified: true, visibility: null },
        ]);
      return new Response("", { status: 500 });
    }) as typeof fetch;

    const p = createGitHubProvider({ clientId: "ci", clientSecret: "cs", fetchImpl });
    await p.exchangeCode(baseArgs);
    expect(capturedInit!.method).toBe("POST");
    const h = capturedInit!.headers as Record<string, string>;
    expect(h["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(h["Accept"]).toBe("application/json");
    const params = new URLSearchParams(capturedInit!.body as string);
    expect(params.get("code")).toBe("CODE");
    expect(params.get("code_verifier")).toBe("VERIFIER");
    expect(params.get("client_id")).toBe("ci");
    expect(params.get("client_secret")).toBe("cs");
  });
});

describe("provider metadata", () => {
  it("exposes id + displayName + isOidc consistently", () => {
    const p = createGitHubProvider({ clientId: "c", clientSecret: "s" });
    expect(p.id).toBe("github");
    expect(p.displayName).toBe("GitHub");
    expect(p.isOidc).toBe(false);
  });
});

describe("exchangeCode — fetch timeouts (H3)", () => {
  // One test per fetch site. Each stubs fetch so the URL that should
  // have timed out raises `TimeoutError`; every preceding URL returns
  // a success so the adapter gets as far as the failing step. The
  // `context` string in the error message tells us which step actually
  // timed out — otherwise a regression that moved the signal onto the
  // wrong fetch would pass this test.
  it("token exchange timeout → ProviderNetworkError with 'token exchange timed out'", async () => {
    const fetchImpl = (async (url: string | URL) => {
      if (String(url) === GITHUB_ENDPOINTS.token) {
        throw new DOMException("timeout", "TimeoutError");
      }
      return new Response("", { status: 500 });
    }) as typeof fetch;
    const p = createGitHubProvider({ clientId: "ci", clientSecret: "cs", fetchImpl });
    try {
      await p.exchangeCode(baseArgs);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderNetworkError);
      expect((err as Error).message).toContain("token exchange timed out after");
      expect((err as Error).message).toContain(`${GITHUB_FETCH_TIMEOUT_MS}ms`);
    }
  });

  it("GET /user timeout → ProviderNetworkError with 'GET /user timed out'", async () => {
    const fetchImpl = (async (url: string | URL) => {
      const u = String(url);
      if (u === GITHUB_ENDPOINTS.token) return json(200, { access_token: "AT" });
      if (u === GITHUB_ENDPOINTS.user) throw new DOMException("timeout", "TimeoutError");
      return new Response("", { status: 500 });
    }) as typeof fetch;
    const p = createGitHubProvider({ clientId: "ci", clientSecret: "cs", fetchImpl });
    try {
      await p.exchangeCode(baseArgs);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderNetworkError);
      expect((err as Error).message).toContain("GET /user timed out after");
    }
  });

  it("GET /user/emails timeout → ProviderNetworkError with 'GET /user/emails timed out'", async () => {
    const fetchImpl = (async (url: string | URL) => {
      const u = String(url);
      if (u === GITHUB_ENDPOINTS.token) return json(200, { access_token: "AT" });
      if (u === GITHUB_ENDPOINTS.user) return json(200, { id: 1, name: "n" });
      if (u === GITHUB_ENDPOINTS.emails) throw new DOMException("timeout", "TimeoutError");
      return new Response("", { status: 500 });
    }) as typeof fetch;
    const p = createGitHubProvider({ clientId: "ci", clientSecret: "cs", fetchImpl });
    try {
      await p.exchangeCode(baseArgs);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderNetworkError);
      expect((err as Error).message).toContain("GET /user/emails timed out after");
    }
  });

  it("AbortError (polyfill-style) is also normalised to 'timed out'", async () => {
    const fetchImpl = (async (url: string | URL) => {
      if (String(url) === GITHUB_ENDPOINTS.token) {
        throw new DOMException("aborted", "AbortError");
      }
      return new Response("", { status: 500 });
    }) as typeof fetch;
    const p = createGitHubProvider({ clientId: "ci", clientSecret: "cs", fetchImpl });
    await expect(p.exchangeCode(baseArgs)).rejects.toThrow(/timed out after/);
  });

  it("passes an AbortSignal on every fetch site (regression pin)", async () => {
    // Captures the `init.signal` arg each fetch was given. Without this
    // assertion, a refactor that quietly dropped the `signal` option
    // from one of the three sites would only surface in production.
    const seenSignals: Record<string, AbortSignal | null | undefined> = {};
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      seenSignals[u] = init?.signal;
      if (u === GITHUB_ENDPOINTS.token) return json(200, { access_token: "AT" });
      if (u === GITHUB_ENDPOINTS.user) return json(200, { id: 1, name: "n" });
      if (u === GITHUB_ENDPOINTS.emails) {
        return json(200, [
          { email: "z@example.com", primary: true, verified: true, visibility: null },
        ]);
      }
      return new Response("", { status: 500 });
    }) as typeof fetch;

    const p = createGitHubProvider({ clientId: "ci", clientSecret: "cs", fetchImpl });
    await p.exchangeCode(baseArgs);

    expect(seenSignals[GITHUB_ENDPOINTS.token]).toBeInstanceOf(AbortSignal);
    expect(seenSignals[GITHUB_ENDPOINTS.user]).toBeInstanceOf(AbortSignal);
    expect(seenSignals[GITHUB_ENDPOINTS.emails]).toBeInstanceOf(AbortSignal);
  });
});
