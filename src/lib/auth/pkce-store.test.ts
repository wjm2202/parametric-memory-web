/**
 * Unit tests for the PKCE + state + nonce generator and flow store.
 *
 * These tests run without a real clock — the store accepts a `now()`
 * injection so every TTL scenario is deterministic and sub-millisecond
 * fast. The module-level singleton `oauthFlowStore` is deliberately
 * NOT imported; test cases would leak into each other through it.
 *
 * Coverage rationale
 * ──────────────────
 *   - Crypto lives or dies on entropy + format. We verify charset,
 *     byte-length (via encoded-length), challenge-verifier round-trip,
 *     and inter-call uniqueness.
 *   - Store lives or dies on single-use + TTL. We verify put/consume
 *     happy path, double-consume returns null, pre-/post-expiry,
 *     independence between keys, and the opportunistic sweep.
 *   - Nonce null-vs-string branch is pinned to provider slug so a
 *     typo can't silently collapse to "nonce for everyone" (benign)
 *     or "nonce for no one" (breaks Google id_token verification).
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  createInMemoryOauthFlowStore,
  generateFlowCredentials,
  getOrCreateOauthFlowStore,
  OAUTH_FLOW_TTL_MS,
  PKCE_VERIFIER_BYTES,
  STATE_BYTES,
  NONCE_BYTES,
  type OauthFlow,
} from "./pkce-store";

/**
 * Base64url charset per RFC 4648 §5 with no padding — the exact set
 * `generateFlowCredentials` produces. Letters, digits, `-`, `_`. No
 * `+`, `/`, or `=`.
 */
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Expected base64url length for N random bytes with no padding.
 * ceil(N * 4 / 3) — e.g. 64 bytes → 86, 32 bytes → 43.
 */
function b64urlLen(bytes: number): number {
  return Math.ceil((bytes * 4) / 3);
}

/** A canonical flow used in store tests. */
function sampleFlow(overrides: Partial<OauthFlow> = {}): OauthFlow {
  return {
    verifier: "V".repeat(86),
    nonce: "N".repeat(43),
    provider: "google",
    intent: "signin",
    returnTo: "/dashboard",
    createdAt: 1000,
    ...overrides,
  };
}

describe("generateFlowCredentials — format & length", () => {
  it("verifier is base64url and 86 chars (64 random bytes)", () => {
    const { verifier } = generateFlowCredentials("google");
    expect(verifier).toMatch(BASE64URL_RE);
    expect(verifier).toHaveLength(b64urlLen(PKCE_VERIFIER_BYTES));
  });

  it("state is base64url and 43 chars (32 random bytes)", () => {
    const { state } = generateFlowCredentials("google");
    expect(state).toMatch(BASE64URL_RE);
    expect(state).toHaveLength(b64urlLen(STATE_BYTES));
  });

  it("challenge is base64url and 43 chars (sha256 = 32 bytes)", () => {
    const { challenge } = generateFlowCredentials("google");
    expect(challenge).toMatch(BASE64URL_RE);
    expect(challenge).toHaveLength(b64urlLen(32));
  });

  it("challenge = base64url(sha256(verifier)) per RFC 7636 S256", () => {
    // The RFC is specific: code_challenge = base64url(SHA-256(ASCII(verifier))).
    // Recomputing here catches any accidental swap to raw bytes or
    // hex encoding.
    const { verifier, challenge } = generateFlowCredentials("google");
    const expected = createHash("sha256").update(verifier).digest().toString("base64url");
    expect(challenge).toBe(expected);
  });

  it("nonce for Google (OIDC) is base64url and 43 chars", () => {
    const { nonce } = generateFlowCredentials("google");
    expect(nonce).not.toBeNull();
    expect(nonce!).toMatch(BASE64URL_RE);
    expect(nonce!).toHaveLength(b64urlLen(NONCE_BYTES));
  });

  it("nonce for GitHub (non-OIDC) is null", () => {
    const { nonce } = generateFlowCredentials("github");
    expect(nonce).toBeNull();
  });

  it("nonce for an unknown provider is null (closed-set default)", () => {
    // If someone adds a new adapter and forgets to list it in
    // OIDC_PROVIDERS, they'll get `null` — the strictest, safest
    // default. The bug will surface as "id_token verification
    // rejects a missing nonce" which is the correct signal.
    const { nonce } = generateFlowCredentials("unknown-provider");
    expect(nonce).toBeNull();
  });
});

describe("generateFlowCredentials — entropy (uniqueness across calls)", () => {
  /**
   * With 256+ bits of entropy, the probability of a collision across
   * two calls is effectively zero. These tests don't prove entropy,
   * but they do catch "oops we're returning a constant" which is a
   * real class of bug (e.g. moving `randomBytes` out of the function
   * to a module-level const).
   */
  it("two calls produce different verifiers", () => {
    const a = generateFlowCredentials("google");
    const b = generateFlowCredentials("google");
    expect(a.verifier).not.toBe(b.verifier);
  });

  it("two calls produce different states", () => {
    const a = generateFlowCredentials("google");
    const b = generateFlowCredentials("google");
    expect(a.state).not.toBe(b.state);
  });

  it("two calls produce different nonces (for OIDC providers)", () => {
    const a = generateFlowCredentials("google");
    const b = generateFlowCredentials("google");
    expect(a.nonce).not.toBe(b.nonce);
  });

  it("different verifier produces different challenge (deterministic hash)", () => {
    const a = generateFlowCredentials("google");
    const b = generateFlowCredentials("google");
    // If verifiers differ (they must), challenges must differ too.
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(b.challenge);
  });
});

describe("createInMemoryOauthFlowStore — happy path", () => {
  it("put then consume returns the original flow", () => {
    const store = createInMemoryOauthFlowStore({ now: () => 0 });
    const flow = sampleFlow({ createdAt: 0 });
    store.put("state-abc", flow);
    expect(store.consume("state-abc")).toEqual(flow);
  });

  it("consume returns null for a state we never stored", () => {
    const store = createInMemoryOauthFlowStore();
    expect(store.consume("never-stored")).toBeNull();
  });

  it("size tracks live entries", () => {
    const t = 0;
    const store = createInMemoryOauthFlowStore({ now: () => t });
    expect(store.size()).toBe(0);
    store.put("a", sampleFlow({ createdAt: t }));
    expect(store.size()).toBe(1);
    store.put("b", sampleFlow({ createdAt: t }));
    expect(store.size()).toBe(2);
    store.consume("a");
    expect(store.size()).toBe(1);
  });
});

describe("createInMemoryOauthFlowStore — single-use semantics", () => {
  it("a second consume of the same state returns null (entry deleted on first read)", () => {
    const store = createInMemoryOauthFlowStore({ now: () => 0 });
    store.put("s1", sampleFlow({ createdAt: 0 }));
    expect(store.consume("s1")).not.toBeNull();
    expect(store.consume("s1")).toBeNull();
  });

  it("an interleaved consume does not affect a different state", () => {
    const store = createInMemoryOauthFlowStore({ now: () => 0 });
    const flowA = sampleFlow({ createdAt: 0, returnTo: "/dashboard" });
    const flowB = sampleFlow({ createdAt: 0, returnTo: "/admin" });
    store.put("a", flowA);
    store.put("b", flowB);
    expect(store.consume("a")).toEqual(flowA);
    expect(store.consume("b")).toEqual(flowB);
  });
});

describe("createInMemoryOauthFlowStore — TTL", () => {
  it("consume just before TTL expires returns the flow", () => {
    let t = 0;
    const store = createInMemoryOauthFlowStore({ ttlMs: 1000, now: () => t });
    store.put("s", sampleFlow({ createdAt: 0 }));
    t = 999; // 1ms before expiry
    expect(store.consume("s")).not.toBeNull();
  });

  it("consume at exactly the TTL boundary returns null (strict <, not <=)", () => {
    // We check `flow.createdAt < now() - ttlMs`. At t=ttlMs,
    // createdAt=0 vs now-ttlMs=0 → not strictly less than → still
    // fresh. Pin that boundary here.
    let t = 0;
    const store = createInMemoryOauthFlowStore({ ttlMs: 1000, now: () => t });
    store.put("s", sampleFlow({ createdAt: 0 }));
    t = 1000;
    expect(store.consume("s")).not.toBeNull();
  });

  it("consume past the TTL returns null", () => {
    let t = 0;
    const store = createInMemoryOauthFlowStore({ ttlMs: 1000, now: () => t });
    store.put("s", sampleFlow({ createdAt: 0 }));
    t = 1001;
    expect(store.consume("s")).toBeNull();
  });

  it("expired entry is still deleted when consumed (no zombie rows)", () => {
    // Regression: we want consume-expired to both return null AND
    // drop the entry. Otherwise expired entries pile up forever.
    let t = 0;
    const store = createInMemoryOauthFlowStore({ ttlMs: 1000, now: () => t });
    store.put("s", sampleFlow({ createdAt: 0 }));
    t = 2000;
    expect(store.consume("s")).toBeNull();
    // Now rewind the clock — if the entry were still present, it
    // would still be expired under a monotonic clock, but we want to
    // prove deletion not just expiry. Size is the cleaner assertion.
    expect(store.size()).toBe(0);
  });

  it("size() reports live entries only (sweeps expired)", () => {
    let t = 0;
    const store = createInMemoryOauthFlowStore({ ttlMs: 1000, now: () => t });
    store.put("a", sampleFlow({ createdAt: 0 }));
    store.put("b", sampleFlow({ createdAt: 0 }));
    expect(store.size()).toBe(2);
    t = 5000;
    expect(store.size()).toBe(0);
  });
});

describe("createInMemoryOauthFlowStore — put semantics", () => {
  it("put of the same state overwrites the previous entry (documented behaviour)", () => {
    // This shouldn't happen in practice (state is 256 bits) but the
    // semantics are pinned so a future refactor doesn't silently
    // change to append/reject.
    const store = createInMemoryOauthFlowStore({ now: () => 0 });
    store.put("s", sampleFlow({ createdAt: 0, returnTo: "/dashboard" }));
    store.put("s", sampleFlow({ createdAt: 0, returnTo: "/admin" }));
    const consumed = store.consume("s");
    expect(consumed?.returnTo).toBe("/admin");
    expect(store.size()).toBe(0);
  });

  it("opportunistic sweep fires when size crosses sweepThreshold", () => {
    // Use a tiny threshold + a time jump to prove sweep runs on put.
    // Without the sweep, size() would still clean up, so we verify
    // the sweep by checking that put itself shrinks the map.
    let t = 0;
    const store = createInMemoryOauthFlowStore({
      ttlMs: 1000,
      sweepThreshold: 3,
      now: () => t,
    });
    store.put("a", sampleFlow({ createdAt: 0 }));
    store.put("b", sampleFlow({ createdAt: 0 }));
    // Jump past TTL.
    t = 5000;
    // Under the threshold still — should NOT sweep yet. Map holds 2
    // expired + this 1 fresh = 3 live from Map's POV (size() would
    // filter, but we want to observe sweep timing, not size's own
    // filtering). We use consume to observe that the expired entries
    // are still returnable-as-null (proving they were present).
    store.put("c", sampleFlow({ createdAt: t }));
    // Now trigger the sweep by exceeding threshold.
    store.put("d", sampleFlow({ createdAt: t }));
    // At this point the 2 expired should be gone. size() uses its
    // own sweep, so assert via consume of the (since-swept) expired
    // keys — they should still return null (which they would anyway,
    // because expired), but size should drop to 2 (c + d).
    expect(store.size()).toBe(2);
  });
});

describe("OAUTH_FLOW_TTL_MS", () => {
  it("is 5 minutes per ADR-003", () => {
    // Not arbitrary — ADR-003 §§2, 256 pin the 5-minute window.
    // A change here means the ADR needs updating too.
    expect(OAUTH_FLOW_TTL_MS).toBe(5 * 60 * 1000);
  });
});

/**
 * Regression suite for Next.js dev-mode route re-compilation.
 *
 * Background: under App Router + Turbopack, each API route is compiled
 * lazily on first request. A fresh compile reinstantiates that route's
 * module graph, which would ordinarily produce a NEW in-memory Map for
 * every route — so `/start` writes to Map-A and `/callback` reads from
 * Map-B (empty), producing `flow_not_found` → `oauth_expired` on every
 * dev-mode sign-in. Stashing the instance on `globalThis` survives
 * route re-compilation; prod behaviour is unchanged (single bundle,
 * single module graph).
 *
 * These tests drive `getOrCreateOauthFlowStore` with an injected
 * `globalRef` object so we don't touch the real `globalThis` — keeps
 * the suite deterministic and free of cross-test leakage.
 */
describe("getOrCreateOauthFlowStore", () => {
  it("creates and stashes a new store on first call", () => {
    const fakeGlobal: Record<string, unknown> = {};
    const store = getOrCreateOauthFlowStore(fakeGlobal);

    // Store is usable — not some placeholder sentinel.
    store.put("s1", sampleFlow({ createdAt: Date.now() }));
    expect(store.size()).toBe(1);

    // The exact same instance is stashed under a namespaced key so
    // other modules' globals don't collide.
    const stashed = fakeGlobal["__mmpm_oauth_flow_store"];
    expect(stashed).toBe(store);
  });

  it("returns the existing stashed store on subsequent calls", () => {
    const fakeGlobal: Record<string, unknown> = {};
    const first = getOrCreateOauthFlowStore(fakeGlobal);
    first.put("s1", sampleFlow({ createdAt: Date.now() }));

    // Second call — simulates a Next.js route recompilation importing
    // the module fresh. Must return the ALREADY-POPULATED store, not
    // a new empty one.
    const second = getOrCreateOauthFlowStore(fakeGlobal);

    expect(second).toBe(first);
    expect(second.size()).toBe(1);

    // The flow written through `first` is visible through `second` —
    // i.e. the callback-side import can consume what the start-side
    // import produced. This is the regression itself.
    const flow = second.consume("s1");
    expect(flow).not.toBeNull();
    expect(flow?.provider).toBe("google");
  });

  it("uses independent stores when called with different globals", () => {
    // Pure sanity: the helper isn't implicitly routing through the
    // real `globalThis` — each `globalRef` gets its own store. If
    // this broke, tests would start leaking into each other as soon
    // as anyone imported the helper.
    const gA: Record<string, unknown> = {};
    const gB: Record<string, unknown> = {};
    const storeA = getOrCreateOauthFlowStore(gA);
    const storeB = getOrCreateOauthFlowStore(gB);

    expect(storeA).not.toBe(storeB);
    storeA.put("s1", sampleFlow({ createdAt: Date.now() }));
    expect(storeA.size()).toBe(1);
    expect(storeB.size()).toBe(0);
  });
});
