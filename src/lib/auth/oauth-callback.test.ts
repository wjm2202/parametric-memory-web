/**
 * oauth-callback.test.ts — ADR-003 Phase 2 OAuth, S2T7b.2.
 *
 * Behavioural contract for `handleOauthCallback`:
 *
 *   1. Feature-flag off  ⇒  not-found, no side effects.
 *   2. Unknown / unconfigured provider  ⇒  not-found, no side effects.
 *      (Same collapse rationale as the start route — an external caller
 *      cannot tell "never heard of that provider" apart from "configured
 *      everywhere except here".)
 *   3. Provider bounced the user (`?error=access_denied`)  ⇒  redirect to
 *      `/login?error=oauth_denied` + clear state cookie. We never get
 *      far enough to consume the flow.
 *   4. `code` or `state` missing / empty  ⇒  redirect to
 *      `/login?error=oauth_state` with the matching `reason` tag.
 *   5. State cookie missing or mismatched  ⇒  same user-facing error
 *      code, distinct `reason` tags for server logs.
 *   6. Flow not in store (expired or replayed)  ⇒
 *      `/login?error=oauth_expired`, flow was consumed exactly once.
 *   7. Flow's provider ≠ URL segment provider  ⇒
 *      `/login?error=oauth_state&reason=flow_provider_mismatch`.
 *   8. `exchangeCode` throws — every error class maps to a specific
 *      `(errorCode, reason)` tuple. `ProviderEmailUnverifiedError`
 *      surfaces a distinct `unverified_email` code; every other
 *      adapter-domain error collapses to `oauth_server_error` with
 *      the specific subclass name preserved as the `reason` tag so
 *      server logs can still distinguish them.
 *   9. Intent=signin — happy path rotates the session cookie with the
 *      `rawSessionToken` compute returned, redirects to `flow.returnTo`,
 *      clears the state cookie. Bridge 5xx / network failure / a
 *      non-rejected response missing required session fields all fall
 *      to `oauth_server_error` with distinct `reason` tags.
 *  10. Intent=link — happy path DOES NOT rotate the session cookie
 *      (user is already signed in; linking attaches an identity to an
 *      existing account). Bridge 401 (regardless of body code) bounces
 *      to `/login` with `returnTo` preserved so the user can re-auth
 *      and retry. Missing session cookie short-circuits before the
 *      bridge call.
 *  11. The state cookie is cleared on EVERY non-not-found branch. The
 *      corresponding flow has been consumed (single-use) or never
 *      existed, so a dangling cookie past this point is pure debris.
 *  12. The session cookie is only set on signin success. Its `secure`
 *      flag follows `isSecureHost(hostname)`, matching the start
 *      route's dev affordance for localhost.
 *
 * Test strategy
 * ─────────────
 * `handleOauthCallback` takes every side-effectful dep via the
 * `CallbackFlowDeps` interface — that's why this whole suite runs
 * without mocking `node:crypto`, `Date.now`, the Next.js runtime, or a
 * real HTTP fetch. Structural fakes below implement the minimum surface:
 *
 *   - `FakeRegistry`        — id → stub AuthProvider. `null` for the
 *                              two failure modes (unknown + unconfigured).
 *   - `FakeStore`           — map-backed `consume` that deletes on
 *                              read (same single-use semantics as the
 *                              prod in-memory store). Logs every
 *                              `consume` call so the "exactly once"
 *                              invariant is checkable.
 *   - `FakeBridgeClient`    — captures every `call(…)` in an ordered
 *                              log, returns a scripted response the
 *                              test sets up before invocation.
 *   - `stubProvider()`      — `exchangeCode` returns fixed
 *                              `NormalizedClaims` unless the test
 *                              overrides with a custom impl (e.g. to
 *                              throw a specific error class).
 *
 * Why no real crypto / real registry / real bridge client
 * ───────────────────────────────────────────────────────
 * Entropy, adapter correctness, and HMAC byte-identity belong in the
 * pkce-store / adapter / compute-bridge-signed tests respectively. Here
 * we care about the DECISION LOGIC that glues them together:
 * "flag off → 404", "state mismatch → specific redirect", "rejected
 * outcome → user-facing code". Mixing in real crypto or network would
 * make assertions non-deterministic and blur the unit boundary.
 */

import { describe, it, expect } from "vitest";

import type { BridgeResponse } from "../compute-bridge-signed";
import {
  handleOauthCallback,
  STATE_COOKIE_NAME,
  CALLBACK_ERROR_CODES,
  type CallbackBridgeClient,
  type CallbackFlowArgs,
  type CallbackFlowDeps,
} from "./oauth-callback";
import { type OauthFlow, type OauthFlowStore } from "./pkce-store";
import { type ProviderRegistry } from "./providers/registry";
import {
  OauthError,
  ProviderClaimsInvalidError,
  ProviderEmailUnverifiedError,
  ProviderNetworkError,
  ProviderNonceMismatchError,
  ProviderTokenExchangeError,
  type AuthProvider,
  type ExchangeCodeArgs,
  type LinkOutcome,
  type NormalizedClaims,
  type ProviderId,
  type SigninOutcome,
} from "./providers/types";
import { DEFAULT_SESSION_MAX_AGE_SECONDS, SESSION_COOKIE_NAME } from "./session-rotation";

// ─── Constants used across tests ───────────────────────────────────────────

const VALID_STATE = "s".repeat(43);
const VALID_CODE = "auth-code-from-provider";
const RETURN_TO = "/dashboard";
const HOSTNAME_PROD = "parametric-memory.dev";
const HOSTNAME_DEV = "localhost";
const SESSION_TOKEN = "sess_raw_token_xyz";
const USER_SESSION_COOKIE = "mmpm_session=existing_user_session";

/** Canonical claims the stub provider returns on the happy path. */
const STUB_CLAIMS: NormalizedClaims = {
  providerSub: "google-123",
  email: "user@example.com",
  emailVerified: true,
  displayName: "Test User",
  // H2: provider evidence so compute can independently re-verify the
  // claim email/sub pair. Website's `emailVerified` flag above is
  // advisory — compute derives the real answer from this evidence.
  providerEvidence: { kind: "google-id-token", idToken: "stub-id-token" },
};

/** Canonical flow the fake store seeds for tests that reach `consume`. */
function baseFlow(overrides: Partial<OauthFlow> = {}): OauthFlow {
  return {
    verifier: "v".repeat(86),
    nonce: "n".repeat(43),
    provider: "google",
    intent: "signin",
    returnTo: RETURN_TO,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

// ─── Stubs ─────────────────────────────────────────────────────────────────

/**
 * Build a stub `AuthProvider`. `exchangeCode` is overrideable per-test
 * because the whole error-mapping matrix hinges on what this throws.
 * Default impl returns the canonical `STUB_CLAIMS` so happy-path tests
 * don't have to spell out a handler every time.
 */
function stubProvider(
  id: ProviderId,
  exchangeCode?: (args: ExchangeCodeArgs) => Promise<NormalizedClaims>,
): AuthProvider {
  return {
    id,
    displayName: id === "google" ? "Google" : "GitHub",
    isOidc: id === "google",
    buildAuthorizeUrl(): string {
      // Callback path does not call this — throw so a future refactor
      // that accidentally invokes it here fails loudly. TS allows an
      // implementation to drop trailing params it doesn't use, so the
      // zero-arg signature is still assignable to `AuthProvider`.
      throw new Error("buildAuthorizeUrl should not be called by handleOauthCallback");
    },
    exchangeCode: exchangeCode ?? (async () => STUB_CLAIMS),
  };
}

/**
 * Registry whose `get` consults a pre-seeded map. Seed with the subset
 * of providers the test wants configured. Anything else returns `null`,
 * which the module treats as "unknown or unconfigured".
 */
class FakeRegistry implements ProviderRegistry {
  private readonly providers: Map<string, AuthProvider>;
  constructor(providers: Record<string, AuthProvider> = {}) {
    this.providers = new Map(Object.entries(providers));
  }
  get(id: string): AuthProvider | null {
    return this.providers.get(id) ?? null;
  }
}

/**
 * Flow store backed by an in-memory map. `consume` deletes on read —
 * matches the prod store's single-use contract. `consumes` array lets
 * tests verify "called exactly once" and "called with this state".
 */
class FakeStore implements OauthFlowStore {
  readonly entries = new Map<string, OauthFlow>();
  readonly consumes: string[] = [];
  readonly puts: { state: string; flow: OauthFlow }[] = [];

  put(state: string, flow: OauthFlow): void {
    this.puts.push({ state, flow });
    this.entries.set(state, flow);
  }
  consume(state: string): OauthFlow | null {
    this.consumes.push(state);
    const flow = this.entries.get(state);
    if (!flow) return null;
    this.entries.delete(state);
    return flow;
  }
  size(): number {
    return this.entries.size;
  }
  /** Test helper — seed a flow without logging the put. */
  seed(state: string, flow: OauthFlow): void {
    this.entries.set(state, flow);
  }
}

/**
 * Bridge client whose `call` returns a scripted response. One script
 * entry is popped per call; if the test exhausts the script, the stub
 * throws so a missing scripted response surfaces as a loud test
 * failure rather than an undefined bridge result.
 */
class FakeBridgeClient implements CallbackBridgeClient {
  readonly calls: Array<{
    method: "GET" | "POST";
    path: string;
    body: unknown;
    sessionCookie: string | null;
  }> = [];

  private scripted: BridgeResponse<unknown>[] = [];

  script(...responses: BridgeResponse<unknown>[]): void {
    this.scripted.push(...responses);
  }

  async call<T = unknown>(opts: {
    method: "GET" | "POST";
    path: string;
    body?: unknown;
    sessionCookie?: string;
  }): Promise<BridgeResponse<T>> {
    this.calls.push({
      method: opts.method,
      path: opts.path,
      body: opts.body,
      sessionCookie: opts.sessionCookie ?? null,
    });
    const next = this.scripted.shift();
    if (!next) {
      throw new Error(
        `FakeBridgeClient: no scripted response for ${opts.method} ${opts.path}. ` +
          `Call .script(…) before invoking handleOauthCallback.`,
      );
    }
    return next as BridgeResponse<T>;
  }
}

/**
 * Canonical successful-signin bridge response. Carries every field the
 * T7a contract requires so `isSigninOutcome` accepts it.
 */
function signinSuccess(overrides: Partial<SigninOutcome> = {}): BridgeResponse<SigninOutcome> {
  const outcome: SigninOutcome = {
    outcome: "signed_in_existing",
    accountId: "acc_1",
    identityId: "id_1",
    sessionId: "sess_1",
    rawSessionToken: SESSION_TOKEN,
    ...overrides,
  } as SigninOutcome;
  return { ok: true, status: 200, data: outcome, error: null };
}

function signinRejected(reason: string): BridgeResponse<unknown> {
  return {
    ok: true,
    status: 200,
    data: { outcome: "rejected", reason },
    error: null,
  };
}

function linkSuccess(): BridgeResponse<LinkOutcome> {
  return {
    ok: true,
    status: 200,
    data: { outcome: "linked", identityId: "id_1" },
    error: null,
  };
}

function linkRejected(reason: string): BridgeResponse<unknown> {
  return {
    ok: true,
    status: 200,
    data: { outcome: "rejected", reason },
    error: null,
  };
}

// ─── Dep factory ───────────────────────────────────────────────────────────

interface MakeDepsOverrides {
  authOauthEnabled?: boolean;
  publicSiteUrl?: string;
  registry?: ProviderRegistry;
  store?: FakeStore;
  bridgeClient?: CallbackBridgeClient;
}

function makeDeps(overrides: MakeDepsOverrides = {}): {
  deps: CallbackFlowDeps;
  store: FakeStore;
  bridgeClient: FakeBridgeClient;
} {
  const store = overrides.store ?? new FakeStore();
  const bridgeClient =
    (overrides.bridgeClient as FakeBridgeClient | undefined) ?? new FakeBridgeClient();
  const deps: CallbackFlowDeps = {
    registry:
      overrides.registry ??
      new FakeRegistry({
        google: stubProvider("google"),
        github: stubProvider("github"),
      }),
    store,
    bridgeClient,
    config: {
      authOauthEnabled: overrides.authOauthEnabled ?? true,
      publicSiteUrl: overrides.publicSiteUrl ?? `https://${HOSTNAME_PROD}`,
    },
  };
  return { deps, store, bridgeClient };
}

/**
 * A set of `CallbackFlowArgs` that would pass every upstream check if
 * the store had a matching flow seeded. Tests override one field at a
 * time to exercise a single decision branch.
 */
function baseArgs(overrides: Partial<CallbackFlowArgs> = {}): CallbackFlowArgs {
  return {
    providerId: "google",
    code: VALID_CODE,
    state: VALID_STATE,
    providerError: null,
    providerErrorDescription: null,
    stateCookie: VALID_STATE,
    sessionCookie: null,
    hostname: HOSTNAME_PROD,
    ...overrides,
  };
}

/** Seed a matching signin flow — convenience for the many tests that need one. */
function seedSigninFlow(store: FakeStore, overrides: Partial<OauthFlow> = {}): void {
  store.seed(VALID_STATE, baseFlow(overrides));
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("handleOauthCallback — feature flag", () => {
  it("returns not-found when authOauthEnabled is false", async () => {
    const { deps } = makeDeps({ authOauthEnabled: false });
    const result = await handleOauthCallback(deps, baseArgs());
    expect(result).toEqual({ kind: "not-found" });
  });

  it("does not touch registry, store, or bridge when flag is off", async () => {
    // Prove the flag check is the FIRST thing — a failure here means
    // an external caller could probe feature-flag state via observable
    // side effects (timing, log lines, bridge traffic).
    let registryCalled = false;
    const registry: ProviderRegistry = {
      get() {
        registryCalled = true;
        return null;
      },
    };
    const { deps, store, bridgeClient } = makeDeps({
      authOauthEnabled: false,
      registry,
    });
    await handleOauthCallback(deps, baseArgs());
    expect(registryCalled).toBe(false);
    expect(store.consumes).toHaveLength(0);
    expect(bridgeClient.calls).toHaveLength(0);
  });
});

describe("handleOauthCallback — provider resolution", () => {
  it("returns not-found when the provider slug is unknown", async () => {
    const { deps } = makeDeps();
    const result = await handleOauthCallback(deps, baseArgs({ providerId: "facebook" }));
    expect(result).toEqual({ kind: "not-found" });
  });

  it("returns not-found when a known provider is unconfigured", async () => {
    // Empty registry → every `get` returns `null`. This is what
    // `createRegistry` does when credentials for that provider are
    // empty strings in config. Indistinguishable from "unknown" to
    // the caller — that's the whole point of the collapse.
    const { deps } = makeDeps({ registry: new FakeRegistry({}) });
    const result = await handleOauthCallback(deps, baseArgs({ providerId: "google" }));
    expect(result).toEqual({ kind: "not-found" });
  });

  it("does not consume the flow when provider is not-found", async () => {
    const { deps, store } = makeDeps({ registry: new FakeRegistry({}) });
    seedSigninFlow(store);
    await handleOauthCallback(deps, baseArgs({ providerId: "google" }));
    expect(store.consumes).toHaveLength(0);
    expect(store.size()).toBe(1); // flow still present — not consumed
  });
});

describe("handleOauthCallback — provider error bounce (?error=…)", () => {
  it("bounces to /login?error=oauth_denied on non-empty providerError", async () => {
    const { deps, store } = makeDeps();
    seedSigninFlow(store);
    const result = await handleOauthCallback(
      deps,
      baseArgs({ providerError: "access_denied", providerErrorDescription: "user said no" }),
    );
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(`/login?error=${CALLBACK_ERROR_CODES.denied}`);
    expect(result.reason).toBe("provider_denied");
    expect(result.sessionCookie).toBeNull();
    expect(result.clearStateCookie).toBe(true);
  });

  it("does not consume the flow on provider bounce (no state to key on reliably)", async () => {
    // OAuth 2.0 §4.1.2.1 says providers SHOULD echo `state` on error
    // responses, but in practice not every implementation complies.
    // The module deliberately returns before touching the store so a
    // non-compliant provider error doesn't nuke a legitimate pending flow.
    const { deps, store } = makeDeps();
    seedSigninFlow(store);
    await handleOauthCallback(deps, baseArgs({ providerError: "access_denied" }));
    expect(store.consumes).toHaveLength(0);
    expect(store.size()).toBe(1);
  });

  it("empty-string providerError is treated as absent (continues the flow)", async () => {
    // Some providers send `?error=` with a blank value on cancellation.
    // Treat that as "no error" — the code/state check is the next gate
    // and will decide what to do.
    const { deps, store, bridgeClient } = makeDeps();
    seedSigninFlow(store);
    bridgeClient.script(signinSuccess());
    const result = await handleOauthCallback(deps, baseArgs({ providerError: "" }));
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.reason).toBe("ok_signin");
  });
});

describe("handleOauthCallback — missing / empty query params", () => {
  it("missing code → /login?error=oauth_state (reason=missing_code)", async () => {
    const { deps } = makeDeps();
    const result = await handleOauthCallback(deps, baseArgs({ code: null }));
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(`/login?error=${CALLBACK_ERROR_CODES.state}`);
    expect(result.reason).toBe("missing_code");
    expect(result.clearStateCookie).toBe(true);
    expect(result.sessionCookie).toBeNull();
  });

  it("empty-string code → reason=missing_code", async () => {
    const { deps } = makeDeps();
    const result = await handleOauthCallback(deps, baseArgs({ code: "" }));
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.reason).toBe("missing_code");
  });

  it("missing state → /login?error=oauth_state (reason=missing_state)", async () => {
    const { deps } = makeDeps();
    const result = await handleOauthCallback(deps, baseArgs({ state: null }));
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(`/login?error=${CALLBACK_ERROR_CODES.state}`);
    expect(result.reason).toBe("missing_state");
  });

  it("empty-string state → reason=missing_state", async () => {
    const { deps } = makeDeps();
    const result = await handleOauthCallback(deps, baseArgs({ state: "" }));
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.reason).toBe("missing_state");
  });
});

describe("handleOauthCallback — state cookie gate", () => {
  it("missing state cookie → reason=missing_state_cookie", async () => {
    const { deps } = makeDeps();
    const result = await handleOauthCallback(deps, baseArgs({ stateCookie: null }));
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(`/login?error=${CALLBACK_ERROR_CODES.state}`);
    expect(result.reason).toBe("missing_state_cookie");
  });

  it("empty state cookie → reason=missing_state_cookie", async () => {
    const { deps } = makeDeps();
    const result = await handleOauthCallback(deps, baseArgs({ stateCookie: "" }));
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.reason).toBe("missing_state_cookie");
  });

  it("state cookie value ≠ query state → reason=state_mismatch", async () => {
    // CSRF / cross-session gate. Different non-empty values.
    const { deps } = makeDeps();
    const result = await handleOauthCallback(
      deps,
      baseArgs({ stateCookie: "x".repeat(43), state: "y".repeat(43) }),
    );
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(`/login?error=${CALLBACK_ERROR_CODES.state}`);
    expect(result.reason).toBe("state_mismatch");
  });

  it("state mismatch of different lengths → state_mismatch (constant-time path)", async () => {
    // Defence-in-depth: the constant-time compare short-circuits on
    // length inequality, which would bypass the loop. Prove it still
    // rejects.
    const { deps } = makeDeps();
    const result = await handleOauthCallback(
      deps,
      baseArgs({ stateCookie: "short", state: VALID_STATE }),
    );
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.reason).toBe("state_mismatch");
  });

  it("does NOT consume the flow when state-cookie check fails", async () => {
    // Order-of-checks invariant: cookie check runs BEFORE consume, so
    // an attacker forging a URL with a valid state cannot drain a
    // legitimate user's pending flow from the store.
    const { deps, store } = makeDeps();
    seedSigninFlow(store);
    await handleOauthCallback(deps, baseArgs({ stateCookie: null }));
    expect(store.consumes).toHaveLength(0);
    expect(store.size()).toBe(1);
  });
});

describe("handleOauthCallback — flow store lookup", () => {
  it("returns oauth_expired when the flow is not in the store (replay or TTL)", async () => {
    const { deps, store } = makeDeps();
    // Don't seed — consume returns null.
    const result = await handleOauthCallback(deps, baseArgs());
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(`/login?error=${CALLBACK_ERROR_CODES.expired}`);
    expect(result.reason).toBe("flow_not_found");
    expect(store.consumes).toEqual([VALID_STATE]); // still called once
  });

  it("consumes the flow exactly once", async () => {
    // Single-use semantics — even on the happy path, the flow is gone
    // after this call. A second callback with the same state won't find it.
    const { deps, store, bridgeClient } = makeDeps();
    seedSigninFlow(store);
    bridgeClient.script(signinSuccess());
    await handleOauthCallback(deps, baseArgs());
    expect(store.consumes).toEqual([VALID_STATE]);
    expect(store.size()).toBe(0);
  });

  it("bounces to oauth_state when flow.provider ≠ URL segment provider", async () => {
    // Belt-and-braces: a flow stored for google arriving at the
    // github callback URL is either a bug or URL tampering.
    const { deps, store } = makeDeps();
    store.seed(VALID_STATE, baseFlow({ provider: "github" }));
    const result = await handleOauthCallback(deps, baseArgs({ providerId: "google" }));
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(`/login?error=${CALLBACK_ERROR_CODES.state}`);
    expect(result.reason).toBe("flow_provider_mismatch");
  });
});

describe("handleOauthCallback — provider error class mapping", () => {
  // Each subclass → specific `(errorCode, reason)` tuple. The route
  // uses `reason` for server-side audit logs; users only see the
  // user-facing error code.
  async function runWithExchangeError(err: unknown) {
    const google = stubProvider("google", async () => {
      throw err;
    });
    const { deps, store } = makeDeps({
      registry: new FakeRegistry({ google }),
    });
    seedSigninFlow(store);
    return handleOauthCallback(deps, baseArgs());
  }

  it("ProviderEmailUnverifiedError → /login?error=unverified_email", async () => {
    const result = await runWithExchangeError(
      new ProviderEmailUnverifiedError("google", "unverified@example.com"),
    );
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(`/login?error=${CALLBACK_ERROR_CODES.unverifiedEmail}`);
    expect(result.reason).toBe("email_unverified");
  });

  it("ProviderNonceMismatchError → oauth_state (nonce_mismatch reason)", async () => {
    // Nonce mismatch is shaped like CSRF / replay — group it under
    // the user-facing oauth_state code so the copy stays coherent.
    // Server log distinguishes via the `reason` tag.
    const result = await runWithExchangeError(new ProviderNonceMismatchError("google"));
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(`/login?error=${CALLBACK_ERROR_CODES.state}`);
    expect(result.reason).toBe("nonce_mismatch");
  });

  it("ProviderTokenExchangeError → oauth_server_error (token_exchange_failed)", async () => {
    const result = await runWithExchangeError(
      new ProviderTokenExchangeError("google", 401, "bad_verification_code"),
    );
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(`/login?error=${CALLBACK_ERROR_CODES.server}`);
    expect(result.reason).toBe("token_exchange_failed");
  });

  it("ProviderClaimsInvalidError → oauth_server_error (claims_invalid)", async () => {
    const result = await runWithExchangeError(
      new ProviderClaimsInvalidError("google", "bad issuer"),
    );
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(`/login?error=${CALLBACK_ERROR_CODES.server}`);
    expect(result.reason).toBe("claims_invalid");
  });

  it("ProviderNetworkError → oauth_server_error (provider_network)", async () => {
    const result = await runWithExchangeError(new ProviderNetworkError("google", "fetch aborted"));
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(`/login?error=${CALLBACK_ERROR_CODES.server}`);
    expect(result.reason).toBe("provider_network");
  });

  it("bare OauthError → oauth_server_error (provider_unknown_error)", async () => {
    // Any new/future subclass inheriting OauthError but not explicitly
    // mapped should still bucket under server error with an
    // identifiable reason tag.
    const result = await runWithExchangeError(new OauthError("new-failure"));
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(`/login?error=${CALLBACK_ERROR_CODES.server}`);
    expect(result.reason).toBe("provider_unknown_error");
  });

  it("non-OauthError exception → oauth_server_error (provider_unknown_error)", async () => {
    // Adapter threw something it didn't wrap — programming bug. User
    // sees generic-error page; server log sees the specific reason.
    const result = await runWithExchangeError(new TypeError("undefined is not a function"));
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(`/login?error=${CALLBACK_ERROR_CODES.server}`);
    expect(result.reason).toBe("provider_unknown_error");
  });

  it("exchangeCode is called with the flow's verifier and nonce", async () => {
    // Pin the wire-up: the module reads verifier + expectedNonce off
    // the flow (not the query string) and passes them to the adapter.
    // A regression here would mean we're not actually validating the
    // PKCE proof.
    let receivedArgs: ExchangeCodeArgs | null = null;
    const google = stubProvider("google", async (args) => {
      receivedArgs = args;
      return STUB_CLAIMS;
    });
    const { deps, store, bridgeClient } = makeDeps({
      registry: new FakeRegistry({ google }),
    });
    const flow = baseFlow({ verifier: "pinned-verifier", nonce: "pinned-nonce" });
    store.seed(VALID_STATE, flow);
    bridgeClient.script(signinSuccess());
    await handleOauthCallback(deps, baseArgs());
    expect(receivedArgs).not.toBeNull();
    expect(receivedArgs!.code).toBe(VALID_CODE);
    expect(receivedArgs!.verifier).toBe("pinned-verifier");
    expect(receivedArgs!.expectedNonce).toBe("pinned-nonce");
    expect(receivedArgs!.redirectUri).toBe(
      `https://${HOSTNAME_PROD}/api/auth/oauth/google/callback`,
    );
  });
});

describe("handleOauthCallback — signin branch success", () => {
  it("signed_in_existing → redirect to flow.returnTo with session cookie set", async () => {
    const { deps, store, bridgeClient } = makeDeps();
    seedSigninFlow(store, { returnTo: "/my-page" });
    bridgeClient.script(signinSuccess({ outcome: "signed_in_existing" }));
    const result = await handleOauthCallback(deps, baseArgs());
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe("/my-page");
    expect(result.reason).toBe("ok_signin");
    expect(result.clearStateCookie).toBe(true);
    expect(result.sessionCookie).not.toBeNull();
    expect(result.sessionCookie).toEqual({
      name: SESSION_COOKIE_NAME,
      value: SESSION_TOKEN,
      httpOnly: true,
      secure: true, // parametric-memory.dev is not localhost
      sameSite: "lax",
      path: "/",
      maxAge: DEFAULT_SESSION_MAX_AGE_SECONDS,
    });
  });

  it("auto_linked → same happy-path shape as signed_in_existing", async () => {
    const { deps, store, bridgeClient } = makeDeps();
    seedSigninFlow(store);
    bridgeClient.script(signinSuccess({ outcome: "auto_linked" }));
    const result = await handleOauthCallback(deps, baseArgs());
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.reason).toBe("ok_signin");
    expect(result.sessionCookie?.value).toBe(SESSION_TOKEN);
  });

  it("new_account_created → same happy-path shape as signed_in_existing", async () => {
    const { deps, store, bridgeClient } = makeDeps();
    seedSigninFlow(store);
    bridgeClient.script(signinSuccess({ outcome: "new_account_created" }));
    const result = await handleOauthCallback(deps, baseArgs());
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.reason).toBe("ok_signin");
    expect(result.sessionCookie?.value).toBe(SESSION_TOKEN);
  });

  it("POSTs to /api/v1/auth/oauth/bridge/signin with normalised claims, no session cookie", async () => {
    // Signin precedes session creation — we must NOT forward a
    // session cookie, even if the browser happened to have one.
    // Compute's bridge-signin contract is "unauthenticated request".
    const { deps, store, bridgeClient } = makeDeps();
    seedSigninFlow(store);
    bridgeClient.script(signinSuccess());
    await handleOauthCallback(deps, baseArgs({ sessionCookie: USER_SESSION_COOKIE }));
    expect(bridgeClient.calls).toHaveLength(1);
    const call = bridgeClient.calls[0]!;
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/api/v1/auth/oauth/bridge/signin");
    expect(call.sessionCookie).toBeNull();
    expect(call.body).toEqual({
      provider: "google",
      providerSub: STUB_CLAIMS.providerSub,
      email: STUB_CLAIMS.email,
      emailVerified: true,
      displayName: STUB_CLAIMS.displayName,
      providerEvidence: STUB_CLAIMS.providerEvidence,
    });
  });

  it("session cookie secure=false when hostname is localhost (dev affordance)", async () => {
    // isSecureHost drops `secure` for localhost so Next dev-server
    // cookies stick over plain HTTP. A regression here breaks local
    // sign-in: browser drops the cookie silently, user appears signed
    // out immediately after signing in.
    const { deps, store, bridgeClient } = makeDeps();
    seedSigninFlow(store);
    bridgeClient.script(signinSuccess());
    const result = await handleOauthCallback(deps, baseArgs({ hostname: HOSTNAME_DEV }));
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.sessionCookie?.secure).toBe(false);
  });

  it("session cookie secure=false for 127.0.0.1", async () => {
    const { deps, store, bridgeClient } = makeDeps();
    seedSigninFlow(store);
    bridgeClient.script(signinSuccess());
    const result = await handleOauthCallback(deps, baseArgs({ hostname: "127.0.0.1" }));
    if (result.kind !== "redirect") throw new Error("expected redirect");
    expect(result.sessionCookie?.secure).toBe(false);
  });
});

describe("handleOauthCallback — signin branch rejections and failures", () => {
  it("rejected outcome → /login?error=oauth_rejected&reason=<encoded>", async () => {
    const { deps, store, bridgeClient } = makeDeps();
    seedSigninFlow(store);
    bridgeClient.script(signinRejected("ambiguous_email_match"));
    const result = await handleOauthCallback(deps, baseArgs());
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(
      `/login?error=${CALLBACK_ERROR_CODES.rejected}&reason=ambiguous_email_match`,
    );
    expect(result.reason).toBe("bridge_rejected");
    expect(result.sessionCookie).toBeNull();
    expect(result.clearStateCookie).toBe(true);
  });

  // NOTE: there is no separate "URL-encode the reason" test here — the
  // `encodeURIComponent` call in `redirectRejected` is unreachable with a
  // URL-unsafe reason through the public API, because `isSigninOutcome`
  // runs first and narrows via `isRejectionReason` against the closed
  // `REJECTION_REASONS` set (every entry a safe snake_case literal). A
  // future compute change that introduced an unsafe reason would trip the
  // `REJECTION_REASONS` parity test in `providers/types.test.ts` first,
  // and the encoding behaviour could be pinned then. For now the
  // encoder stays as belt-and-braces defence audited via code review.

  it("bridge 5xx → /login?error=oauth_server_error (bridge_server_error)", async () => {
    const { deps, store, bridgeClient } = makeDeps();
    seedSigninFlow(store);
    bridgeClient.script({
      ok: false,
      status: 503,
      data: null,
      error: "server_error",
    });
    const result = await handleOauthCallback(deps, baseArgs());
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(`/login?error=${CALLBACK_ERROR_CODES.server}`);
    expect(result.reason).toBe("bridge_server_error");
  });

  it("bridge network error (status=0, data=null) → bridge_server_error", async () => {
    // The client returns `{ok:false, status:0, data:null}` on a fetch
    // exception. From the callback's perspective this is
    // indistinguishable from a 5xx — both collapse to server error.
    const { deps, store, bridgeClient } = makeDeps();
    seedSigninFlow(store);
    bridgeClient.script({
      ok: false,
      status: 0,
      data: null,
      error: "network_error",
    });
    const result = await handleOauthCallback(deps, baseArgs());
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.reason).toBe("bridge_server_error");
  });

  it("bridge 2xx with shape-invalid response → bridge_shape_invalid", async () => {
    // Partial deploy / misconf scenario: compute replies 2xx but the
    // body doesn't match any known outcome. Module narrows via
    // `isSigninOutcome` — anything else collapses to shape_invalid.
    const { deps, store, bridgeClient } = makeDeps();
    seedSigninFlow(store);
    bridgeClient.script({
      ok: true,
      status: 200,
      data: { outcome: "weird_new_outcome" },
      error: null,
    });
    const result = await handleOauthCallback(deps, baseArgs());
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(`/login?error=${CALLBACK_ERROR_CODES.server}`);
    expect(result.reason).toBe("bridge_shape_invalid");
  });

  it("signin-success missing sessionId → bridge_shape_invalid (T7a contract)", async () => {
    // The T7a contract widened `isSigninOutcome` to require session
    // fields on every non-rejected outcome. Proving the callback
    // refuses a malformed non-rejected response is the whole reason
    // the guard got tightened — without this, compute's atomic
    // session-creation guarantee would silently degrade to "cookie
    // empty string".
    const { deps, store, bridgeClient } = makeDeps();
    seedSigninFlow(store);
    bridgeClient.script({
      ok: true,
      status: 200,
      data: {
        outcome: "signed_in_existing",
        accountId: "acc_1",
        identityId: "id_1",
        // sessionId + rawSessionToken missing
      },
      error: null,
    });
    const result = await handleOauthCallback(deps, baseArgs());
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.reason).toBe("bridge_shape_invalid");
  });

  it("signin-success with empty rawSessionToken → bridge_shape_invalid", async () => {
    // `isSigninOutcome` rejects empty rawSessionToken specifically so
    // the route never tries to cookie a zero-length token (which
    // rotateSessionCookie throws on).
    const { deps, store, bridgeClient } = makeDeps();
    seedSigninFlow(store);
    bridgeClient.script({
      ok: true,
      status: 200,
      data: {
        outcome: "signed_in_existing",
        accountId: "acc_1",
        identityId: "id_1",
        sessionId: "sess_1",
        rawSessionToken: "",
      },
      error: null,
    });
    const result = await handleOauthCallback(deps, baseArgs());
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.reason).toBe("bridge_shape_invalid");
  });

  it("bridge 2xx with null data → bridge_server_error (ok gated on parsed body)", async () => {
    // compute-bridge-signed returns ok=false when data parses to null.
    // Module collapses that to server_error — the bridge didn't give
    // us a usable outcome.
    const { deps, store, bridgeClient } = makeDeps();
    seedSigninFlow(store);
    bridgeClient.script({
      ok: false,
      status: 200,
      data: null,
      error: null,
    });
    const result = await handleOauthCallback(deps, baseArgs());
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.reason).toBe("bridge_server_error");
  });
});

describe("handleOauthCallback — link branch success", () => {
  it("linked → redirect to flow.returnTo with NO session cookie rotation", async () => {
    // Critical invariant: link does NOT rotate. The user is already
    // signed in; linking attaches an identity to the existing account.
    // Rotating here would imply a fresh session, which isn't what
    // happened.
    const { deps, store, bridgeClient } = makeDeps();
    store.seed(VALID_STATE, baseFlow({ intent: "link", returnTo: "/admin/security" }));
    bridgeClient.script(linkSuccess());
    const result = await handleOauthCallback(
      deps,
      baseArgs({ sessionCookie: USER_SESSION_COOKIE }),
    );
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe("/admin/security");
    expect(result.reason).toBe("ok_link");
    expect(result.sessionCookie).toBeNull();
    expect(result.clearStateCookie).toBe(true);
  });

  it("POSTs to /api/v1/auth/oauth/bridge/link with session cookie forwarded", async () => {
    const { deps, store, bridgeClient } = makeDeps();
    store.seed(VALID_STATE, baseFlow({ intent: "link" }));
    bridgeClient.script(linkSuccess());
    await handleOauthCallback(deps, baseArgs({ sessionCookie: USER_SESSION_COOKIE }));
    expect(bridgeClient.calls).toHaveLength(1);
    const call = bridgeClient.calls[0]!;
    expect(call.path).toBe("/api/v1/auth/oauth/bridge/link");
    expect(call.method).toBe("POST");
    expect(call.sessionCookie).toBe(USER_SESSION_COOKIE);
    expect(call.body).toEqual({
      provider: "google",
      providerSub: STUB_CLAIMS.providerSub,
      email: STUB_CLAIMS.email,
      emailVerified: true,
      displayName: STUB_CLAIMS.displayName,
      providerEvidence: STUB_CLAIMS.providerEvidence,
    });
  });
});

describe("handleOauthCallback — link branch failures", () => {
  it("no session cookie short-circuits before bridge call → link_no_session", async () => {
    // Can't link without an authenticated user. Bounce to login with
    // returnTo preserved so signing in brings the user back to retry.
    const { deps, store, bridgeClient } = makeDeps();
    store.seed(VALID_STATE, baseFlow({ intent: "link", returnTo: "/admin/security" }));
    const result = await handleOauthCallback(deps, baseArgs({ sessionCookie: null }));
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(
      `/login?error=${CALLBACK_ERROR_CODES.state}&returnTo=${encodeURIComponent("/admin/security")}`,
    );
    expect(result.reason).toBe("link_no_session");
    expect(result.sessionCookie).toBeNull();
    expect(result.clearStateCookie).toBe(true);
    // Bridge should NOT have been called.
    expect(bridgeClient.calls).toHaveLength(0);
  });

  it("empty-string session cookie also triggers link_no_session", async () => {
    const { deps, store, bridgeClient } = makeDeps();
    store.seed(VALID_STATE, baseFlow({ intent: "link" }));
    const result = await handleOauthCallback(deps, baseArgs({ sessionCookie: "" }));
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.reason).toBe("link_no_session");
    expect(bridgeClient.calls).toHaveLength(0);
  });

  it("link rejected → /login?error=oauth_rejected&reason=already_linked", async () => {
    const { deps, store, bridgeClient } = makeDeps();
    store.seed(VALID_STATE, baseFlow({ intent: "link" }));
    bridgeClient.script(linkRejected("already_linked"));
    const result = await handleOauthCallback(
      deps,
      baseArgs({ sessionCookie: USER_SESSION_COOKIE }),
    );
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(
      `/login?error=${CALLBACK_ERROR_CODES.rejected}&reason=already_linked`,
    );
    expect(result.reason).toBe("bridge_rejected");
    expect(result.sessionCookie).toBeNull();
  });

  it("link 401 with reauth_required body → reauth redirect with returnTo preserved", async () => {
    // Compute's recent-auth gate returned "you need to re-sign-in
    // before linking". Module redirects user through login, keeps
    // the intended link destination so they land back in the
    // settings page and can retry.
    const { deps, store, bridgeClient } = makeDeps();
    store.seed(VALID_STATE, baseFlow({ intent: "link", returnTo: "/admin/security" }));
    bridgeClient.script({
      ok: false,
      status: 401,
      data: { code: "reauth_required", reauthAgeSeconds: 1200 },
      error: "reauth_required",
    });
    const result = await handleOauthCallback(
      deps,
      baseArgs({ sessionCookie: USER_SESSION_COOKIE }),
    );
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(
      `/login?error=${CALLBACK_ERROR_CODES.state}` +
        `&returnTo=${encodeURIComponent("/admin/security")}&reauth=1`,
    );
    expect(result.reason).toBe("link_reauth_required");
    expect(result.sessionCookie).toBeNull();
  });

  it("link 401 without reauth_required body → same reauth redirect (generic 401 treated as expired)", async () => {
    // A 401 without a recognised body code means the session cookie
    // was rejected — either genuinely expired, or invalid. Module
    // treats both as "needs re-signin" and preserves returnTo.
    const { deps, store, bridgeClient } = makeDeps();
    store.seed(VALID_STATE, baseFlow({ intent: "link", returnTo: "/admin/security" }));
    bridgeClient.script({
      ok: false,
      status: 401,
      data: { error: "session_expired" },
      error: "session_expired",
    });
    const result = await handleOauthCallback(
      deps,
      baseArgs({ sessionCookie: USER_SESSION_COOKIE }),
    );
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.reason).toBe("link_reauth_required");
  });

  it("link bridge 5xx → bridge_server_error", async () => {
    const { deps, store, bridgeClient } = makeDeps();
    store.seed(VALID_STATE, baseFlow({ intent: "link" }));
    bridgeClient.script({
      ok: false,
      status: 502,
      data: null,
      error: "server_error",
    });
    const result = await handleOauthCallback(
      deps,
      baseArgs({ sessionCookie: USER_SESSION_COOKIE }),
    );
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.destination).toBe(`/login?error=${CALLBACK_ERROR_CODES.server}`);
    expect(result.reason).toBe("bridge_server_error");
  });

  it("link bridge 2xx with shape-invalid response → bridge_shape_invalid", async () => {
    const { deps, store, bridgeClient } = makeDeps();
    store.seed(VALID_STATE, baseFlow({ intent: "link" }));
    bridgeClient.script({
      ok: true,
      status: 200,
      data: { outcome: "linked" /* missing identityId */ },
      error: null,
    });
    const result = await handleOauthCallback(
      deps,
      baseArgs({ sessionCookie: USER_SESSION_COOKIE }),
    );
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.reason).toBe("bridge_shape_invalid");
  });

  it("link bridge 2xx with null data → bridge_server_error", async () => {
    const { deps, store, bridgeClient } = makeDeps();
    store.seed(VALID_STATE, baseFlow({ intent: "link" }));
    bridgeClient.script({ ok: false, status: 200, data: null, error: null });
    const result = await handleOauthCallback(
      deps,
      baseArgs({ sessionCookie: USER_SESSION_COOKIE }),
    );
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.reason).toBe("bridge_server_error");
  });
});

describe("handleOauthCallback — clearStateCookie invariant", () => {
  // Every non-not-found branch must instruct the route to clear the
  // state cookie. Exhaustively sweeping this at suite level would
  // duplicate the per-branch tests; instead, sample a representative
  // set and assert the flag.

  it("clears state cookie on provider_denied", async () => {
    const { deps } = makeDeps();
    const result = await handleOauthCallback(deps, baseArgs({ providerError: "access_denied" }));
    if (result.kind !== "redirect") throw new Error("expected redirect");
    expect(result.clearStateCookie).toBe(true);
  });

  it("clears state cookie on missing_code", async () => {
    const { deps } = makeDeps();
    const result = await handleOauthCallback(deps, baseArgs({ code: null }));
    if (result.kind !== "redirect") throw new Error("expected redirect");
    expect(result.clearStateCookie).toBe(true);
  });

  it("clears state cookie on state_mismatch", async () => {
    const { deps } = makeDeps();
    const result = await handleOauthCallback(
      deps,
      baseArgs({ stateCookie: "x".repeat(43), state: "y".repeat(43) }),
    );
    if (result.kind !== "redirect") throw new Error("expected redirect");
    expect(result.clearStateCookie).toBe(true);
  });

  it("clears state cookie on flow_not_found", async () => {
    const { deps } = makeDeps();
    const result = await handleOauthCallback(deps, baseArgs());
    if (result.kind !== "redirect") throw new Error("expected redirect");
    expect(result.clearStateCookie).toBe(true);
  });

  it("clears state cookie on ok_signin", async () => {
    const { deps, store, bridgeClient } = makeDeps();
    seedSigninFlow(store);
    bridgeClient.script(signinSuccess());
    const result = await handleOauthCallback(deps, baseArgs());
    if (result.kind !== "redirect") throw new Error("expected redirect");
    expect(result.clearStateCookie).toBe(true);
  });

  it("clears state cookie on ok_link", async () => {
    const { deps, store, bridgeClient } = makeDeps();
    store.seed(VALID_STATE, baseFlow({ intent: "link" }));
    bridgeClient.script(linkSuccess());
    const result = await handleOauthCallback(
      deps,
      baseArgs({ sessionCookie: USER_SESSION_COOKIE }),
    );
    if (result.kind !== "redirect") throw new Error("expected redirect");
    expect(result.clearStateCookie).toBe(true);
  });

  it("clears state cookie on link_no_session", async () => {
    const { deps, store } = makeDeps();
    store.seed(VALID_STATE, baseFlow({ intent: "link" }));
    const result = await handleOauthCallback(deps, baseArgs({ sessionCookie: null }));
    if (result.kind !== "redirect") throw new Error("expected redirect");
    expect(result.clearStateCookie).toBe(true);
  });
});

describe("STATE_COOKIE_NAME re-export", () => {
  it('is "mmpm_oauth_state" (single source of truth with oauth-start)', async () => {
    // The module re-exports oauth-start's constant so route handlers
    // import one module to know the cookie name. A drift here (e.g.
    // someone typoing a local const) would silently break the cookie
    // round-trip — callback can't find what start wrote.
    expect(STATE_COOKIE_NAME).toBe("mmpm_oauth_state");
  });
});

describe("CALLBACK_ERROR_CODES — stable user-facing codes", () => {
  it("exports the six documented codes with their exact wire values", () => {
    // Login page's error-copy mapping reads these strings. Changing
    // one here without updating login copy leaves users looking at a
    // blank error message.
    expect(CALLBACK_ERROR_CODES).toEqual({
      denied: "oauth_denied",
      state: "oauth_state",
      expired: "oauth_expired",
      unverifiedEmail: "unverified_email",
      server: "oauth_server_error",
      rejected: "oauth_rejected",
    });
  });
});
