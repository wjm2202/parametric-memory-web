/**
 * Happy-path unit tests for the HMAC-signed bridge client.
 *
 * Scope
 * ─────
 * This file pins DOWN the wire format — headers, message shape, body
 * handling — so that any accidental drift from what
 * `parametric-memory-compute/src/middleware/bridge-auth.ts` verifies
 * fails the test. The negative / security cases (missing key, replay,
 * method swap, body tamper, etc.) live in a separate file for S1T7.
 *
 * Cross-verification principle
 * ────────────────────────────
 * We recompute the expected HMAC *locally* using the documented
 * message format. If our client ever diverges — e.g. hashes bytes
 * before stringifying, or drops a newline, or uppercases the path —
 * the expected signature won't match the one the client produced and
 * the test fails. This is a stronger assertion than "just check a
 * signature header exists".
 *
 * Injection discipline
 * ────────────────────
 * Every test builds its own client with a stub `fetchImpl` and a
 * frozen `now()`, so cases are deterministic and don't touch real
 * timers, sockets, or the module-level singleton. The singleton is
 * deliberately NOT imported here.
 */
import { describe, it, expect } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { createBridgeClient } from "./compute-bridge-signed";

const BASE_URL = "http://localhost:3100";
const SIGNING_KEY = "x".repeat(64); // 64 chars — well over the 32-char min.

/**
 * A stub `fetch` that captures the last call and returns a canned
 * response. Returning a new `Response` per call keeps the body stream
 * consumable (real fetch responses can only be read once).
 */
function stubFetch(
  canned: { status: number; jsonBody: unknown } = {
    status: 200,
    jsonBody: { ok: true },
  },
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(canned.jsonBody), {
      status: canned.status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fn, calls };
}

/**
 * Recompute the HMAC the client is expected to produce.
 *
 * IMPORTANT: this MUST mirror the format in
 * `parametric-memory-compute/src/middleware/bridge-auth.ts`. The fifth
 * line is the per-call anti-replay nonce, added in S2 sprint 2026-04-20.
 * If either side drifts from the 5-line message shape, every live
 * bridge call 401s — so the test shape is deliberately strict.
 */
function expectedSignature(
  timestamp: string,
  method: string,
  path: string,
  bodyString: string,
  nonce: string,
): string {
  const bodyHash = createHash("sha256").update(bodyString).digest("hex");
  const message = `${timestamp}\n${method.toUpperCase()}\n${path}\n${bodyHash}\n${nonce}`;
  return createHmac("sha256", SIGNING_KEY).update(message).digest("hex");
}

describe("bridgeClient.call — POST with JSON body (signin/link/unlink shape)", () => {
  const FIXED_NOW_MS = 1_760_000_000_000; // 2025-10-09 ish; exact value unimportant
  const EXPECTED_TS = "1760000000"; // floor(ms / 1000)

  it("sends method, URL, and body string exactly as signed", async () => {
    const { fn, calls } = stubFetch();
    const client = createBridgeClient({
      baseUrl: BASE_URL,
      signingKey: SIGNING_KEY,
      now: () => FIXED_NOW_MS,
      fetchImpl: fn,
    });
    const body = { provider: "google", providerSub: "sub-123" };

    await client.call({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://localhost:3100/api/v1/auth/oauth/bridge/signin");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe(JSON.stringify(body));
  });

  it("attaches Content-Type, timestamp, nonce, and signature headers", async () => {
    const { fn, calls } = stubFetch();
    const client = createBridgeClient({
      baseUrl: BASE_URL,
      signingKey: SIGNING_KEY,
      now: () => FIXED_NOW_MS,
      fetchImpl: fn,
    });
    const body = { provider: "google", providerSub: "sub-123" };

    await client.call({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body,
    });

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Compute-Bridge-Timestamp"]).toBe(EXPECTED_TS);
    expect(headers["X-Compute-Bridge-Signature"]).toMatch(/^[0-9a-f]{64}$/);
    // Nonce: 32 lowercase hex chars, minted per call. Lowercase-only so
    // compute's `^[0-9a-f]{32}$` pattern matches without having to
    // normalise — node's digest('hex') is always lowercase.
    expect(headers["X-Compute-Bridge-Nonce"]).toMatch(/^[0-9a-f]{32}$/);
  });

  it("signature matches hand-computed HMAC of the documented message", async () => {
    const { fn, calls } = stubFetch();
    const client = createBridgeClient({
      baseUrl: BASE_URL,
      signingKey: SIGNING_KEY,
      now: () => FIXED_NOW_MS,
      fetchImpl: fn,
    });
    const body = { provider: "google", providerSub: "sub-123" };
    const bodyString = JSON.stringify(body);

    await client.call({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body,
    });

    const headers = calls[0].init.headers as Record<string, string>;
    // Nonce is minted per-call inside the client, so we read it back
    // from the headers and feed it to the hand-computed HMAC. If the
    // client omitted the nonce from the hashed message (or hashed the
    // wrong bytes around it), the signatures would diverge and this
    // expectation fails — the exact property we want.
    const nonceHeader = headers["X-Compute-Bridge-Nonce"];
    expect(nonceHeader).toMatch(/^[0-9a-f]{32}$/);
    expect(headers["X-Compute-Bridge-Signature"]).toBe(
      expectedSignature(
        EXPECTED_TS,
        "POST",
        "/api/v1/auth/oauth/bridge/signin",
        bodyString,
        nonceHeader,
      ),
    );
  });

  it("mints a fresh nonce per call (no reuse across successive requests)", async () => {
    // Regression guard: the replay defence relies on nonces being
    // unique per call. If the client ever cached or constified the
    // nonce, compute would reject every call after the first inside a
    // skew window.
    const { fn, calls } = stubFetch();
    const client = createBridgeClient({
      baseUrl: BASE_URL,
      signingKey: SIGNING_KEY,
      now: () => FIXED_NOW_MS,
      fetchImpl: fn,
    });
    const body = { provider: "google", providerSub: "sub-123" };

    await client.call({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body,
    });
    await client.call({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body,
    });
    await client.call({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body,
    });

    const nonces = calls.map(
      (c) => (c.init.headers as Record<string, string>)["X-Compute-Bridge-Nonce"],
    );
    expect(new Set(nonces).size).toBe(3);
    // Signatures must also differ — the nonce is part of the HMAC'd
    // message, so reusing a nonce would reuse the signature (same
    // timestamp + method + path + body in this test) and this check
    // pins that the nonce actually joins the message hash.
    const sigs = calls.map(
      (c) => (c.init.headers as Record<string, string>)["X-Compute-Bridge-Signature"],
    );
    expect(new Set(sigs).size).toBe(3);
  });

  it("returns ok:true with parsed data on 200 JSON response", async () => {
    const { fn } = stubFetch({
      status: 200,
      jsonBody: { outcome: "signed_in", accountId: "acc-42" },
    });
    const client = createBridgeClient({
      baseUrl: BASE_URL,
      signingKey: SIGNING_KEY,
      now: () => FIXED_NOW_MS,
      fetchImpl: fn,
    });

    const r = await client.call<{ outcome: string; accountId: string }>({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google", providerSub: "sub-123" },
    });

    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ outcome: "signed_in", accountId: "acc-42" });
    expect(r.error).toBeNull();
  });

  it("forwards a session cookie when provided (link/unlink path)", async () => {
    const { fn, calls } = stubFetch();
    const client = createBridgeClient({
      baseUrl: BASE_URL,
      signingKey: SIGNING_KEY,
      now: () => FIXED_NOW_MS,
      fetchImpl: fn,
    });

    await client.call({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/link",
      body: { provider: "github", providerSub: "456" },
      sessionCookie: "mmpm_session=abc123",
    });

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Cookie"]).toBe("mmpm_session=abc123");
  });

  it("does NOT include a Cookie header when no sessionCookie was given", async () => {
    // /bridge/signin is called pre-session — a stray empty Cookie
    // header would confuse some proxies. Verify we omit it cleanly.
    const { fn, calls } = stubFetch();
    const client = createBridgeClient({
      baseUrl: BASE_URL,
      signingKey: SIGNING_KEY,
      now: () => FIXED_NOW_MS,
      fetchImpl: fn,
    });

    await client.call({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google", providerSub: "sub-123" },
    });

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Cookie"]).toBeUndefined();
  });
});

describe("bridgeClient.call — GET with no body (identities shape)", () => {
  const FIXED_NOW_MS = 1_760_000_500_000;
  const EXPECTED_TS = "1760000500";

  it("signs the empty-body hash and omits Content-Type + body", async () => {
    const { fn, calls } = stubFetch({
      status: 200,
      jsonBody: { identities: [] },
    });
    const client = createBridgeClient({
      baseUrl: BASE_URL,
      signingKey: SIGNING_KEY,
      now: () => FIXED_NOW_MS,
      fetchImpl: fn,
    });

    await client.call({
      method: "GET",
      path: "/api/v1/auth/oauth/identities",
      sessionCookie: "mmpm_session=xyz",
    });

    const headers = calls[0].init.headers as Record<string, string>;
    // Content-Type is only set when we send a body — GET must not have it.
    expect(headers["Content-Type"]).toBeUndefined();
    // No body field on the request init.
    expect(calls[0].init.body).toBeUndefined();
    // Signature covers the empty-body hash + the minted nonce.
    const nonceHeader = headers["X-Compute-Bridge-Nonce"];
    expect(nonceHeader).toMatch(/^[0-9a-f]{32}$/);
    expect(headers["X-Compute-Bridge-Signature"]).toBe(
      expectedSignature(EXPECTED_TS, "GET", "/api/v1/auth/oauth/identities", "", nonceHeader),
    );
  });

  it("returns parsed JSON on success", async () => {
    const { fn } = stubFetch({
      status: 200,
      jsonBody: { identities: [{ id: "id-1", provider: "google" }] },
    });
    const client = createBridgeClient({
      baseUrl: BASE_URL,
      signingKey: SIGNING_KEY,
      now: () => FIXED_NOW_MS,
      fetchImpl: fn,
    });

    const r = await client.call<{
      identities: { id: string; provider: string }[];
    }>({
      method: "GET",
      path: "/api/v1/auth/oauth/identities",
      sessionCookie: "mmpm_session=xyz",
    });

    expect(r.ok).toBe(true);
    expect(r.data?.identities[0]?.provider).toBe("google");
  });
});

describe("bridgeClient.call — timestamp", () => {
  it("uses floor(now()/1000) — not ms, not ceil", async () => {
    // Compute's verifier parses the header with `Number()` and
    // multiplies by 1000. If we sent millis, we'd be 1000× outside
    // the skew window and every call would 401. Pin the conversion.
    const { fn, calls } = stubFetch();
    const client = createBridgeClient({
      baseUrl: BASE_URL,
      signingKey: SIGNING_KEY,
      now: () => 1_760_000_000_999, // has .999 sub-second component
      fetchImpl: fn,
    });

    await client.call({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google", providerSub: "s" },
    });

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["X-Compute-Bridge-Timestamp"]).toBe("1760000000");
  });
});

describe("bridgeClient.call — defensive guards", () => {
  it("throws if the signing key is empty (misconfigured call)", async () => {
    const client = createBridgeClient({
      baseUrl: BASE_URL,
      signingKey: "",
      fetchImpl: stubFetch().fn,
    });

    await expect(
      client.call({
        method: "POST",
        path: "/api/v1/auth/oauth/bridge/signin",
        body: {},
      }),
    ).rejects.toThrow(/signingKey is empty/);
  });
});
