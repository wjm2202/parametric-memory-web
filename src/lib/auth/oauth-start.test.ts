/**
 * oauth-start.test.ts — ADR-003 Phase 2 OAuth, T6.3.
 *
 * Behavioural contract for `startOauthFlow`:
 *   1. Feature-flag off ⇒ not-found, no side effects.
 *   2. Unknown / unconfigured provider ⇒ not-found, no side effects.
 *      (The two failure modes collapse to a single `not-found` so that
 *      an external caller can't probe which providers we have wired
 *      up in this environment.)
 *   3. Intent query param is strictly `"signin"` | `"link"`; `null` and
 *      `""` default to `"signin"`; everything else is `invalid-intent`.
 *   4. `returnTo` that fails `validateReturnTo` silently falls back to
 *      `DEFAULT_RETURN_TO`. No 400 — giving attackers no signal is the
 *      whole point of the allow-list.
 *   5. Happy path: credentials generated once, flow pinned under the
 *      state key, authorize URL built by the provider adapter, cookie
 *      descriptor returned with the 5 ADR-003 attributes exactly.
 *   6. `cookie.secure` tracks `isSecureHost(hostname)` — the dev
 *      affordance that localhost drops secure so dev-without-HTTPS works.
 *   7. `cookie.maxAge` equals `OAUTH_FLOW_TTL_MS / 1000` (single source
 *      of truth shared with the pending-flow TTL).
 *
 * Test strategy
 * ─────────────
 * `startOauthFlow` takes all its side-effectful dependencies via the
 * `StartFlowDeps` interface — that's why this whole test file runs
 * synchronously, without mocking `node:crypto`, `Date.now`, the Next.js
 * runtime, or a real HTTP fetch. Stubs below implement the minimum
 * structural surface the module uses:
 *
 *   - `FakeRegistry`     — id → stub AuthProvider lookup, `null` for the
 *                          two failure modes (unknown + unconfigured).
 *   - `FakeStore`        — captures every `put` call in an ordered log.
 *   - `stubProvider()`   — constant `buildAuthorizeUrl` output so exact-
 *                          URL assertions are stable.
 *   - `stubCredentials`  — deterministic verifier / challenge / state /
 *                          nonce so we can pin the exact cookie value
 *                          and authorize-URL query string.
 *
 * Why no real `crypto` or real registry
 * ─────────────────────────────────────
 * Entropy and adapter correctness are the pkce-store / registry tests'
 * jobs. Here we care about the DECISION LOGIC that glues them together:
 * "flag off → 404", "hostile returnTo → silent fallback", "cookie shape".
 * Mixing in real crypto would make assertions non-deterministic and drag
 * in an extra failure surface that isn't this module's responsibility.
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  startOauthFlow,
  STATE_COOKIE_NAME,
  STATE_COOKIE_MAX_AGE_SECONDS,
  DEFAULT_RETURN_TO,
  type StartFlowDeps,
  type StartFlowArgs,
} from "./oauth-start";
import {
  OAUTH_FLOW_TTL_MS,
  type FlowCredentials,
  type OauthFlow,
  type OauthFlowStore,
} from "./pkce-store";
import { type ProviderRegistry } from "./providers/registry";
import { type AuthProvider, type BuildAuthorizeUrlArgs } from "./providers/types";

// ─── Stubs ─────────────────────────────────────────────────────────────────

/**
 * The constant credentials returned by the default `generateCredentials`
 * stub. Pinned so tests can match against exact values without splitting
 * "we called generate" from "we used the output correctly".
 */
const stubCredentials: FlowCredentials = {
  verifier: "V".repeat(86),
  challenge: "C".repeat(43),
  state: "S".repeat(43),
  nonce: "N".repeat(43),
};

/**
 * Build a stub `AuthProvider`. `buildAuthorizeUrl` echoes every input
 * into the query string so we can prove the route fed the credentials
 * and the redirect URI through unchanged.
 */
function stubProvider(id: "google" | "github"): AuthProvider {
  return {
    id,
    displayName: id === "google" ? "Google" : "GitHub",
    isOidc: id === "google",
    buildAuthorizeUrl(args: BuildAuthorizeUrlArgs): string {
      const qp = new URLSearchParams({
        state: args.state,
        challenge: args.challenge,
        nonce: args.nonce ?? "",
        redirectUri: args.redirectUri,
      });
      return `https://example-oauth.test/${id}/authorize?${qp.toString()}`;
    },
    // `exchangeCode` is unused by `/start`. Kept as a throwing stub so a
    // future refactor that accidentally invokes it here fails loudly.
    async exchangeCode(): Promise<never> {
      throw new Error("exchangeCode should not be called by startOauthFlow");
    },
  };
}

/**
 * Registry whose `get` consults a pre-seeded map. Seed with the subset
 * of providers a given test case wants "configured"; anything else
 * returns `null`, which this module treats as "unknown or unconfigured"
 * and maps to `{ kind: "not-found" }`.
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
 * Flow store that logs every `put` in order. `consume` / `size` are
 * implemented minimally because the start path never calls them — if a
 * refactor accidentally does, the assertions will catch it.
 */
class FakeStore implements OauthFlowStore {
  puts: { state: string; flow: OauthFlow }[] = [];
  put(state: string, flow: OauthFlow): void {
    this.puts.push({ state, flow });
  }
  consume(): OauthFlow | null {
    return null;
  }
  size(): number {
    return this.puts.length;
  }
}

// ─── Dep factory ───────────────────────────────────────────────────────────

interface MakeDepsOverrides {
  authOauthEnabled?: boolean;
  publicSiteUrl?: string;
  registry?: ProviderRegistry;
  store?: OauthFlowStore;
  generateCredentials?: (id: string) => FlowCredentials;
  now?: () => number;
}

/**
 * Build a full `StartFlowDeps` with sensible defaults. Each test
 * overrides just the fields that matter to its behaviour under test.
 * Default config enables the flag and wires Google + GitHub.
 */
function makeDeps(overrides: MakeDepsOverrides = {}): StartFlowDeps {
  return {
    registry:
      overrides.registry ??
      new FakeRegistry({
        google: stubProvider("google"),
        github: stubProvider("github"),
      }),
    store: overrides.store ?? new FakeStore(),
    generateCredentials: overrides.generateCredentials ?? (() => stubCredentials),
    now: overrides.now ?? (() => 1_700_000_000_000),
    config: {
      authOauthEnabled: overrides.authOauthEnabled ?? true,
      publicSiteUrl: overrides.publicSiteUrl ?? "https://parametric-memory.dev",
    },
  };
}

/**
 * A set of `StartFlowArgs` that passes every happy-path check. Tests
 * override one field at a time to exercise a single decision branch.
 */
function baseArgs(overrides: Partial<StartFlowArgs> = {}): StartFlowArgs {
  return {
    providerId: "google",
    intent: "signin",
    returnTo: "/dashboard",
    hostname: "parametric-memory.dev",
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("startOauthFlow — feature flag", () => {
  it("returns not-found when authOauthEnabled is false", () => {
    const deps = makeDeps({ authOauthEnabled: false });
    const result = startOauthFlow(deps, baseArgs());
    expect(result).toEqual({ kind: "not-found" });
  });

  it("does not touch registry, store, or credentials when flag is off", () => {
    // Prove the flag check is the FIRST thing — a failure here means the
    // route would leak "configured providers exist" signal via timing or
    // observable side effects.
    let registryCalled = false;
    let credsCalled = false;
    const registry: ProviderRegistry = {
      get() {
        registryCalled = true;
        return null;
      },
    };
    const store = new FakeStore();
    const deps = makeDeps({
      authOauthEnabled: false,
      registry,
      store,
      generateCredentials: () => {
        credsCalled = true;
        return stubCredentials;
      },
    });
    startOauthFlow(deps, baseArgs());
    expect(registryCalled).toBe(false);
    expect(credsCalled).toBe(false);
    expect(store.puts).toHaveLength(0);
  });
});

describe("startOauthFlow — provider resolution", () => {
  it("returns not-found when the provider slug is unknown (registry miss)", () => {
    const deps = makeDeps();
    const result = startOauthFlow(deps, baseArgs({ providerId: "facebook" }));
    expect(result).toEqual({ kind: "not-found" });
  });

  it("returns not-found when a known provider is unconfigured", () => {
    // Empty registry → every `get` returns `null`. This is what
    // `createRegistry` does when credentials for that provider are empty
    // strings in config. Indistinguishable from "unknown" to the caller
    // — that's the whole point.
    const deps = makeDeps({ registry: new FakeRegistry({}) });
    const result = startOauthFlow(deps, baseArgs({ providerId: "google" }));
    expect(result).toEqual({ kind: "not-found" });
  });

  it("does not put a flow in the store when provider is not-found", () => {
    const store = new FakeStore();
    const deps = makeDeps({ registry: new FakeRegistry({}), store });
    startOauthFlow(deps, baseArgs({ providerId: "google" }));
    expect(store.puts).toHaveLength(0);
  });
});

describe("startOauthFlow — intent validation", () => {
  it("defaults intent to signin when the query param is null", () => {
    const store = new FakeStore();
    const deps = makeDeps({ store });
    const result = startOauthFlow(deps, baseArgs({ intent: null }));
    expect(result.kind).toBe("redirect");
    expect(store.puts[0]!.flow.intent).toBe("signin");
  });

  it("defaults intent to signin when the query param is empty string", () => {
    // `?intent=` with no value parses to `""` in Next.js search-params.
    // Treating this identically to `null` keeps the URL-legal "empty"
    // case from silently falling into the `invalid-intent` branch.
    const store = new FakeStore();
    const deps = makeDeps({ store });
    const result = startOauthFlow(deps, baseArgs({ intent: "" }));
    expect(result.kind).toBe("redirect");
    expect(store.puts[0]!.flow.intent).toBe("signin");
  });

  it("accepts and stores intent=link", () => {
    const store = new FakeStore();
    const deps = makeDeps({ store });
    const result = startOauthFlow(deps, baseArgs({ intent: "link" }));
    expect(result.kind).toBe("redirect");
    expect(store.puts[0]!.flow.intent).toBe("link");
  });

  it("rejects unknown intent values with invalid-intent result", () => {
    const store = new FakeStore();
    const deps = makeDeps({ store });
    const result = startOauthFlow(deps, baseArgs({ intent: "signup" }));
    expect(result.kind).toBe("invalid-intent");
    // Nothing should be stored when we reject.
    expect(store.puts).toHaveLength(0);
  });

  it("invalid-intent message quotes the raw bad value via JSON.stringify", () => {
    // JSON-stringify makes "null", '"signup"', and other JS-value shapes
    // unambiguous in logs. Pin the format.
    const deps = makeDeps();
    const result = startOauthFlow(deps, baseArgs({ intent: "signup" }));
    expect(result.kind).toBe("invalid-intent");
    if (result.kind !== "invalid-intent") return;
    expect(result.message).toContain('"signup"');
    expect(result.message).toMatch(/signin.*link/);
  });
});

describe("startOauthFlow — returnTo handling", () => {
  it("falls back to DEFAULT_RETURN_TO when returnTo is null", () => {
    const store = new FakeStore();
    const deps = makeDeps({ store });
    startOauthFlow(deps, baseArgs({ returnTo: null }));
    expect(store.puts[0]!.flow.returnTo).toBe(DEFAULT_RETURN_TO);
  });

  it("falls back silently (no error kind) when returnTo is hostile", () => {
    // `validateReturnTo("https://evil.com")` returns null — we must NOT
    // surface that to the attacker as a 4xx. Redirect proceeds normally,
    // landing on the safe default.
    const store = new FakeStore();
    const deps = makeDeps({ store });
    const result = startOauthFlow(deps, baseArgs({ returnTo: "https://evil.com/steal" }));
    expect(result.kind).toBe("redirect");
    expect(store.puts[0]!.flow.returnTo).toBe(DEFAULT_RETURN_TO);
  });

  it("preserves a valid returnTo", () => {
    const store = new FakeStore();
    const deps = makeDeps({ store });
    startOauthFlow(deps, baseArgs({ returnTo: "/dashboard" }));
    expect(store.puts[0]!.flow.returnTo).toBe("/dashboard");
  });
});

describe("startOauthFlow — happy-path redirect", () => {
  it("builds the authorize URL via the provider adapter with the generated credentials", () => {
    const deps = makeDeps();
    const result = startOauthFlow(deps, baseArgs({ providerId: "google" }));
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    // Stub provider echoes inputs into query string — this is how we
    // prove the decision logic passed state / challenge / nonce /
    // redirectUri straight through with no mutation.
    const url = new URL(result.authorizeUrl);
    expect(url.hostname).toBe("example-oauth.test");
    expect(url.pathname).toBe("/google/authorize");
    expect(url.searchParams.get("state")).toBe(stubCredentials.state);
    expect(url.searchParams.get("challenge")).toBe(stubCredentials.challenge);
    expect(url.searchParams.get("nonce")).toBe(stubCredentials.nonce);
    expect(url.searchParams.get("redirectUri")).toBe(
      "https://parametric-memory.dev/api/auth/oauth/google/callback",
    );
  });

  it("pins the pending flow in the store with every field", () => {
    const store = new FakeStore();
    const deps = makeDeps({ store, now: () => 12_345 });
    startOauthFlow(deps, baseArgs({ providerId: "google", returnTo: "/admin" }));
    expect(store.puts).toHaveLength(1);
    expect(store.puts[0]!.state).toBe(stubCredentials.state);
    expect(store.puts[0]!.flow).toEqual({
      verifier: stubCredentials.verifier,
      nonce: stubCredentials.nonce,
      provider: "google",
      intent: "signin",
      returnTo: "/admin",
      createdAt: 12_345,
    });
  });

  it("stores a non-OIDC provider flow with nonce=null", () => {
    // Stub GitHub provider returns OIDC=false; our creds stub still has
    // a nonce value, but the real `generateFlowCredentials("github")`
    // returns null. To exercise both wiring points we swap in a creds
    // stub that honours the provider branching.
    const store = new FakeStore();
    const deps = makeDeps({
      store,
      generateCredentials: (id) => ({
        ...stubCredentials,
        nonce: id === "google" ? stubCredentials.nonce : null,
      }),
    });
    startOauthFlow(deps, baseArgs({ providerId: "github" }));
    expect(store.puts[0]!.flow.nonce).toBeNull();
  });
});

describe("startOauthFlow — cookie descriptor", () => {
  it("returns a cookie whose value equals the generated state", () => {
    const deps = makeDeps();
    const result = startOauthFlow(deps, baseArgs());
    if (result.kind !== "redirect") throw new Error("expected redirect");
    expect(result.cookie.name).toBe(STATE_COOKIE_NAME);
    expect(result.cookie.value).toBe(stubCredentials.state);
  });

  it("issues the ADR-003 cookie attribute set exactly", () => {
    // The 5-attribute contract: httpOnly, secure, sameSite=lax, path=/,
    // maxAge. No `domain`, no `expires` — those would broaden cookie
    // scope or duplicate the TTL source of truth. Pin the whole shape.
    const deps = makeDeps();
    const result = startOauthFlow(deps, baseArgs());
    if (result.kind !== "redirect") throw new Error("expected redirect");
    expect(result.cookie).toEqual({
      name: STATE_COOKIE_NAME,
      value: stubCredentials.state,
      httpOnly: true,
      secure: true, // parametric-memory.dev is not localhost
      sameSite: "lax",
      path: "/",
      maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
    });
  });

  it("cookie.secure is true for a real hostname", () => {
    const deps = makeDeps();
    const result = startOauthFlow(deps, baseArgs({ hostname: "parametric-memory.dev" }));
    if (result.kind !== "redirect") throw new Error("expected redirect");
    expect(result.cookie.secure).toBe(true);
  });

  it("cookie.secure is false for localhost (dev affordance)", () => {
    // `isSecureHost` drops `secure` for localhost so Next dev-server
    // cookies stick over plain HTTP. A regression here would break the
    // full dev-mode OAuth flow silently — the browser drops the cookie
    // and the callback 403s on missing state.
    const deps = makeDeps();
    const result = startOauthFlow(deps, baseArgs({ hostname: "localhost" }));
    if (result.kind !== "redirect") throw new Error("expected redirect");
    expect(result.cookie.secure).toBe(false);
  });

  it("cookie.secure is false for 127.0.0.1 (dev affordance)", () => {
    const deps = makeDeps();
    const result = startOauthFlow(deps, baseArgs({ hostname: "127.0.0.1" }));
    if (result.kind !== "redirect") throw new Error("expected redirect");
    expect(result.cookie.secure).toBe(false);
  });
});

describe("STATE_COOKIE_MAX_AGE_SECONDS lockstep with OAUTH_FLOW_TTL_MS", () => {
  it("is OAUTH_FLOW_TTL_MS / 1000 (single source of truth)", () => {
    // The cookie lifetime and the in-memory flow TTL MUST agree — a
    // split here would leave the cookie alive past the flow's expiry
    // ("flow not found" at callback) or vice versa (ghost cookie after
    // the flow is consumed). Both are hard to debug.
    expect(STATE_COOKIE_MAX_AGE_SECONDS).toBe(OAUTH_FLOW_TTL_MS / 1000);
  });

  it("equals 300 seconds (5 minutes per ADR-003)", () => {
    // Belt and braces for the ADR number. If ADR-003 widens the window,
    // both this and pkce-store.test.ts need updating together.
    expect(STATE_COOKIE_MAX_AGE_SECONDS).toBe(300);
  });
});

describe("DEFAULT_RETURN_TO", () => {
  it('is "/admin" (matches the magic-link post-login destination)', () => {
    // Magic-link callback and OAuth callback should land users in the
    // same place when no explicit returnTo is supplied. If the magic-
    // link handler moves off /admin, this needs to move with it.
    expect(DEFAULT_RETURN_TO).toBe("/admin");
  });
});

// Ensure every test case that's supposed to fall through to a redirect
// actually did — a silent result-kind drift is how you end up with a
// "green" suite that doesn't actually exercise the happy path.
describe("sanity — suite exercises both branches", () => {
  let happyCount = 0;
  let notFoundCount = 0;
  beforeEach(() => {
    happyCount = 0;
    notFoundCount = 0;
  });

  it("running every scenario type produces both redirect and not-found results", () => {
    const deps = makeDeps();
    const happy = startOauthFlow(deps, baseArgs());
    if (happy.kind === "redirect") happyCount += 1;
    const nf = startOauthFlow(makeDeps({ authOauthEnabled: false }), baseArgs());
    if (nf.kind === "not-found") notFoundCount += 1;
    expect(happyCount).toBe(1);
    expect(notFoundCount).toBe(1);
  });
});
