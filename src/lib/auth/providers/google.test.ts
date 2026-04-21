// @vitest-environment node
//
// ─────────────────────────────────────────────────────────────────────
// Why Node, not jsdom: the project-wide vitest config uses `jsdom`
// for React component tests, but jose's internals (`FlattenedSign`,
// `createLocalJWKSet`, etc.) construct Uint8Arrays and then assert
// `payload instanceof Uint8Array`. Under jsdom the test file runs in
// a VM sandbox whose global `Uint8Array` can diverge from the one
// jose's encoder produces, making the instanceof check throw
// `payload must be an instance of Uint8Array` at sign time. Running
// this file in the Node environment keeps all typed-array constructors
// in one realm. No other provider test needs this — only Google,
// because only Google signs/verifies real JWTs in-test.
// ─────────────────────────────────────────────────────────────────────
/**
 * Unit tests for the Google OIDC provider adapter.
 *
 * Every test is offline: `fetchImpl` is a hand-written mock that
 * captures the exact request, and `jwksLoader` is a local `jose`
 * `createLocalJWKSet` built from a test keypair generated in
 * `beforeAll`. No network, no real Google endpoints.
 *
 * Coverage strategy
 * ─────────────────
 *   - buildAuthorizeUrl: every query param pinned; invariants
 *     (PKCE method, scope, prompt) asserted so a future refactor
 *     can't quietly drop one.
 *   - exchangeCode happy path: valid id_token → normalised claims.
 *   - exchangeCode failure modes: token endpoint 400, non-JSON token
 *     body, missing id_token, JWKS verification failure, wrong
 *     issuer, wrong audience, nonce mismatch, unverified email,
 *     missing sub/email, network error.
 *   - Request shape: body is form-urlencoded with the exact param
 *     set compute's Google OAuth app expects.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPair, SignJWT, exportJWK, createLocalJWKSet, type JSONWebKeySet } from "jose";
import {
  createGoogleProvider,
  GOOGLE_ENDPOINTS,
  GOOGLE_FETCH_TIMEOUT_MS,
  type JwksLoader,
} from "./google";
import {
  ProviderClaimsInvalidError,
  ProviderEmailUnverifiedError,
  ProviderNetworkError,
  ProviderNonceMismatchError,
  ProviderTokenExchangeError,
} from "./types";

// ── Test crypto setup ──────────────────────────────────────────────
//
// Each test that verifies an id_token uses a single RS256 keypair
// generated once in `beforeAll`. We build a JWKS from the public key
// and hand `createLocalJWKSet` to the adapter as its `jwksLoader`.
let privateKey: CryptoKey;
let jwks: JSONWebKeySet;
let jwksLoader: JwksLoader;

beforeAll(async () => {
  const kp = await generateKeyPair("RS256", { extractable: true });
  privateKey = kp.privateKey;
  const pubJwk = await exportJWK(kp.publicKey);
  pubJwk.alg = "RS256";
  pubJwk.kid = "test-key-1";
  pubJwk.use = "sig";
  jwks = { keys: [pubJwk] };
  // No cast — jose's createLocalJWKSet return signature is exactly
  // assignable to JwksLoader now that JwksLoader mirrors it accurately.
  jwksLoader = createLocalJWKSet(jwks);
});

/**
 * Sign a test id_token with the test private key. Defaults produce a
 * token that passes every check; overrides let individual tests poke
 * at one claim at a time.
 */
async function signIdToken(
  overrides: Partial<{
    iss: string;
    aud: string;
    sub: string;
    email: string;
    emailVerified: boolean | unknown;
    name: string | null;
    nonce: string;
    expInSeconds: number;
  }> = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    sub: overrides.sub ?? "google-sub-42",
    email: overrides.email ?? "user@example.com",
    email_verified: overrides.emailVerified === undefined ? true : overrides.emailVerified,
    nonce: overrides.nonce ?? "test-nonce",
  };
  if (overrides.name !== null) {
    claims.name = overrides.name ?? "Example User";
  }
  const signer = new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
    .setIssuer(overrides.iss ?? "https://accounts.google.com")
    .setAudience(overrides.aud ?? "test-client-id")
    .setIssuedAt(now)
    .setExpirationTime(now + (overrides.expInSeconds ?? 3600));
  return signer.sign(privateKey);
}

/** Stub fetch that always returns `{ status, body }` with JSON. */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("buildAuthorizeUrl — param set + invariants", () => {
  const provider = createGoogleProvider({
    clientId: "test-client-id",
    clientSecret: "test-secret",
    fetchImpl: (async () => new Response("", { status: 200 })) as typeof fetch,
    jwksLoader: (async () => new Uint8Array()) as unknown as JwksLoader,
  });

  const args = {
    state: "test-state",
    challenge: "test-challenge",
    nonce: "test-nonce",
    redirectUri: "https://parametric-memory.dev/api/auth/oauth/google/callback",
  };

  it("builds a URL pointing at Google's authorize endpoint", () => {
    const url = new URL(provider.buildAuthorizeUrl(args));
    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_ENDPOINTS.authorize);
  });

  it("includes every required OAuth 2.0 + PKCE + OIDC param", () => {
    const u = new URL(provider.buildAuthorizeUrl(args));
    expect(u.searchParams.get("client_id")).toBe("test-client-id");
    expect(u.searchParams.get("redirect_uri")).toBe(args.redirectUri);
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("scope")).toBe(GOOGLE_ENDPOINTS.scopes);
    expect(u.searchParams.get("state")).toBe("test-state");
    expect(u.searchParams.get("code_challenge")).toBe("test-challenge");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("nonce")).toBe("test-nonce");
    expect(u.searchParams.get("prompt")).toBe("select_account");
  });

  it("does NOT request offline access (we don't store refresh tokens)", () => {
    const u = new URL(provider.buildAuthorizeUrl(args));
    expect(u.searchParams.get("access_type")).toBeNull();
  });

  it("throws (not silently wrong) when nonce is null for OIDC", () => {
    expect(() => provider.buildAuthorizeUrl({ ...args, nonce: null })).toThrow(/nonce is required/);
  });
});

describe("exchangeCode — happy path", () => {
  it("returns normalised claims on a valid id_token", async () => {
    const idToken = await signIdToken({ nonce: "ok-nonce" });
    const fetchImpl = (async () => jsonResponse(200, { id_token: idToken })) as typeof fetch;

    const provider = createGoogleProvider({
      clientId: "test-client-id",
      clientSecret: "test-secret",
      fetchImpl,
      jwksLoader,
    });

    const claims = await provider.exchangeCode({
      code: "auth-code-123",
      verifier: "test-verifier",
      redirectUri: "https://parametric-memory.dev/api/auth/oauth/google/callback",
      expectedNonce: "ok-nonce",
    });
    expect(claims).toEqual({
      providerSub: "google-sub-42",
      email: "user@example.com",
      emailVerified: true,
      displayName: "Example User",
      // H2: the raw id_token carried forward as provider evidence so
      // compute can independently verify the signature + claims against
      // Google's JWKS — website's `emailVerified: true` above is
      // advisory only.
      providerEvidence: { kind: "google-id-token", idToken },
    });
  });

  it("accepts the legacy issuer string `accounts.google.com`", async () => {
    const idToken = await signIdToken({
      iss: "accounts.google.com",
      nonce: "ok-nonce",
    });
    const fetchImpl = (async () => jsonResponse(200, { id_token: idToken })) as typeof fetch;
    const provider = createGoogleProvider({
      clientId: "test-client-id",
      clientSecret: "test-secret",
      fetchImpl,
      jwksLoader,
    });

    const claims = await provider.exchangeCode({
      code: "c",
      verifier: "v",
      redirectUri: "https://x/cb",
      expectedNonce: "ok-nonce",
    });
    expect(claims.providerSub).toBe("google-sub-42");
  });

  it("returns displayName=null when id_token has no name claim", async () => {
    const idToken = await signIdToken({ name: null, nonce: "ok-nonce" });
    const fetchImpl = (async () => jsonResponse(200, { id_token: idToken })) as typeof fetch;
    const provider = createGoogleProvider({
      clientId: "test-client-id",
      clientSecret: "test-secret",
      fetchImpl,
      jwksLoader,
    });

    const claims = await provider.exchangeCode({
      code: "c",
      verifier: "v",
      redirectUri: "https://x/cb",
      expectedNonce: "ok-nonce",
    });
    expect(claims.displayName).toBeNull();
  });
});

describe("exchangeCode — request shape", () => {
  it("POSTs form-urlencoded body with all required params", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    // Sign the id_token's `aud` to match this test's adapter clientId.
    // The test's purpose is to verify the POST body carries the
    // configured client_id / client_secret verbatim — so we pin the
    // adapter to "ci"/"cs" and make the signed token's audience
    // agree, otherwise jose rightly rejects before the request
    // assertions ever run.
    const idToken = await signIdToken({ nonce: "ok-nonce", aud: "ci" });
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      captured = { url: String(url), init: init ?? {} };
      return jsonResponse(200, { id_token: idToken });
    }) as typeof fetch;

    const provider = createGoogleProvider({
      clientId: "ci",
      clientSecret: "cs",
      fetchImpl,
      jwksLoader,
    });

    await provider.exchangeCode({
      code: "CODE",
      verifier: "VERIFIER",
      redirectUri: "https://r/cb",
      expectedNonce: "ok-nonce",
    });

    expect(captured).not.toBeNull();
    expect(captured!.url).toBe(GOOGLE_ENDPOINTS.token);
    expect(captured!.init.method).toBe("POST");
    const headers = captured!.init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const params = new URLSearchParams(captured!.init.body as string);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("CODE");
    expect(params.get("code_verifier")).toBe("VERIFIER");
    expect(params.get("redirect_uri")).toBe("https://r/cb");
    expect(params.get("client_id")).toBe("ci");
    expect(params.get("client_secret")).toBe("cs");
  });
});

describe("exchangeCode — failure modes", () => {
  const baseDeps = {
    clientId: "test-client-id",
    clientSecret: "test-secret",
  };
  const baseArgs = {
    code: "c",
    verifier: "v",
    redirectUri: "https://x/cb",
    expectedNonce: "ok-nonce",
  };

  it("throws ProviderNetworkError on fetch rejection", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("ECONNREFUSED");
    }) as typeof fetch;
    const p = createGoogleProvider({ ...baseDeps, fetchImpl, jwksLoader });
    await expect(p.exchangeCode(baseArgs)).rejects.toBeInstanceOf(ProviderNetworkError);
  });

  it("maps TimeoutError from AbortSignal.timeout → ProviderNetworkError with 'timed out' (H3)", async () => {
    // Simulates the exact thing `AbortSignal.timeout(5000)` fires when
    // the upstream stalls past the budget: a DOMException with
    // `name: "TimeoutError"`. We don't want to wait the real 5 s in
    // unit tests, so we just raise it synchronously from the stub.
    // The adapter's `ProviderNetworkError.fromFetchError` classifies
    // timeouts into a stable "<context> timed out after <ms>ms" message
    // that log searches can match on regardless of the underlying
    // runtime's error-name choice.
    const fetchImpl = (async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    }) as typeof fetch;
    const p = createGoogleProvider({ ...baseDeps, fetchImpl, jwksLoader });
    try {
      await p.exchangeCode(baseArgs);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderNetworkError);
      expect((err as ProviderNetworkError).message).toContain(
        `timed out after ${GOOGLE_FETCH_TIMEOUT_MS}ms`,
      );
      expect((err as ProviderNetworkError).message).toContain("token exchange");
    }
  });

  it("also maps legacy AbortError → ProviderNetworkError timed-out (H3)", async () => {
    // Some runtimes / polyfills still name the abort as `AbortError`
    // rather than `TimeoutError`. Pin that both are normalised.
    const fetchImpl = (async () => {
      throw new DOMException("Request was aborted.", "AbortError");
    }) as typeof fetch;
    const p = createGoogleProvider({ ...baseDeps, fetchImpl, jwksLoader });
    await expect(p.exchangeCode(baseArgs)).rejects.toThrow(/timed out after/);
  });

  it("passes an AbortSignal on the token-exchange fetch (H3)", async () => {
    // Without asserting the signal is present, a refactor could drop
    // the timeout wire-up entirely and every other test would still
    // pass because they stub fetch-reject shapes rather than honouring
    // the signal. This one test makes the wire-up observable.
    let capturedSignal: AbortSignal | null | undefined = undefined;
    const idToken = await signIdToken({ nonce: "ok-nonce" });
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
      capturedSignal = init?.signal;
      return jsonResponse(200, { id_token: idToken });
    }) as typeof fetch;
    const p = createGoogleProvider({ ...baseDeps, fetchImpl, jwksLoader });
    await p.exchangeCode(baseArgs);
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it("throws ProviderTokenExchangeError on 400 with error body", async () => {
    const fetchImpl = (async () => jsonResponse(400, { error: "invalid_grant" })) as typeof fetch;
    const p = createGoogleProvider({ ...baseDeps, fetchImpl, jwksLoader });
    try {
      await p.exchangeCode(baseArgs);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderTokenExchangeError);
      const e = err as ProviderTokenExchangeError;
      expect(e.upstreamStatus).toBe(400);
      expect(e.upstreamCode).toBe("invalid_grant");
    }
  });

  it("throws ProviderTokenExchangeError on non-JSON token response", async () => {
    const fetchImpl = (async () =>
      new Response("<html>oops</html>", {
        status: 502,
        headers: { "content-type": "text/html" },
      })) as typeof fetch;
    const p = createGoogleProvider({ ...baseDeps, fetchImpl, jwksLoader });
    await expect(p.exchangeCode(baseArgs)).rejects.toBeInstanceOf(ProviderTokenExchangeError);
  });

  it("throws ProviderClaimsInvalidError when token body is missing id_token", async () => {
    const fetchImpl = (async () => jsonResponse(200, { access_token: "whatever" })) as typeof fetch;
    const p = createGoogleProvider({ ...baseDeps, fetchImpl, jwksLoader });
    await expect(p.exchangeCode(baseArgs)).rejects.toBeInstanceOf(ProviderClaimsInvalidError);
  });

  it("throws ProviderClaimsInvalidError when id_token has wrong audience", async () => {
    const idToken = await signIdToken({
      aud: "different-client",
      nonce: "ok-nonce",
    });
    const fetchImpl = (async () => jsonResponse(200, { id_token: idToken })) as typeof fetch;
    const p = createGoogleProvider({ ...baseDeps, fetchImpl, jwksLoader });
    await expect(p.exchangeCode(baseArgs)).rejects.toBeInstanceOf(ProviderClaimsInvalidError);
  });

  it("throws ProviderClaimsInvalidError when id_token has wrong issuer", async () => {
    const idToken = await signIdToken({
      iss: "https://evil.example",
      nonce: "ok-nonce",
    });
    const fetchImpl = (async () => jsonResponse(200, { id_token: idToken })) as typeof fetch;
    const p = createGoogleProvider({ ...baseDeps, fetchImpl, jwksLoader });
    await expect(p.exchangeCode(baseArgs)).rejects.toBeInstanceOf(ProviderClaimsInvalidError);
  });

  it("throws ProviderClaimsInvalidError when id_token is expired", async () => {
    const idToken = await signIdToken({
      nonce: "ok-nonce",
      expInSeconds: -60, // expired 1 minute ago
    });
    const fetchImpl = (async () => jsonResponse(200, { id_token: idToken })) as typeof fetch;
    const p = createGoogleProvider({ ...baseDeps, fetchImpl, jwksLoader });
    await expect(p.exchangeCode(baseArgs)).rejects.toBeInstanceOf(ProviderClaimsInvalidError);
  });

  it("throws ProviderNonceMismatchError when id_token nonce != expected", async () => {
    const idToken = await signIdToken({ nonce: "wrong-nonce" });
    const fetchImpl = (async () => jsonResponse(200, { id_token: idToken })) as typeof fetch;
    const p = createGoogleProvider({ ...baseDeps, fetchImpl, jwksLoader });
    await expect(p.exchangeCode({ ...baseArgs, expectedNonce: "ok-nonce" })).rejects.toBeInstanceOf(
      ProviderNonceMismatchError,
    );
  });

  it("throws ProviderEmailUnverifiedError on email_verified=false", async () => {
    const idToken = await signIdToken({
      emailVerified: false,
      nonce: "ok-nonce",
    });
    const fetchImpl = (async () => jsonResponse(200, { id_token: idToken })) as typeof fetch;
    const p = createGoogleProvider({ ...baseDeps, fetchImpl, jwksLoader });
    await expect(p.exchangeCode(baseArgs)).rejects.toBeInstanceOf(ProviderEmailUnverifiedError);
  });

  it("throws ProviderEmailUnverifiedError on non-boolean email_verified", async () => {
    // If Google ever sent `email_verified: "true"` (string) we treat it
    // as unverified — we only trust the literal boolean `true`.
    const idToken = await signIdToken({
      emailVerified: "true" as unknown as boolean,
      nonce: "ok-nonce",
    });
    const fetchImpl = (async () => jsonResponse(200, { id_token: idToken })) as typeof fetch;
    const p = createGoogleProvider({ ...baseDeps, fetchImpl, jwksLoader });
    await expect(p.exchangeCode(baseArgs)).rejects.toBeInstanceOf(ProviderEmailUnverifiedError);
  });

  it("rejects expectedNonce=null for Google (OIDC is mandatory here)", async () => {
    const p = createGoogleProvider({
      ...baseDeps,
      fetchImpl: (async () => new Response("", { status: 200 })) as typeof fetch,
      jwksLoader,
    });
    await expect(p.exchangeCode({ ...baseArgs, expectedNonce: null })).rejects.toThrow(
      /expectedNonce is required/,
    );
  });
});

describe("provider metadata", () => {
  it("exposes id + displayName + isOidc consistently", () => {
    const p = createGoogleProvider({
      clientId: "c",
      clientSecret: "s",
      jwksLoader,
    });
    expect(p.id).toBe("google");
    expect(p.displayName).toBe("Google");
    expect(p.isOidc).toBe(true);
  });
});
