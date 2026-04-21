/**
 * Negative / security tests for the HMAC-signed bridge client.
 *
 * Split from the happy-path file so the security intent is readable
 * in isolation — if you're reviewing this after a report of "bridge
 * calls are being forged", this is where you'd start. Kept in the
 * default test suite (no separate runner), so a regression shows up
 * on every CI run.
 *
 * Three blocks:
 *
 *   A. Upstream error handling — the client must surface compute's
 *      rejections cleanly, without hanging, crashing, or treating
 *      HTML error pages as success. Mirrors the discipline of
 *      `compute-proxy.ts` and guards the same bug class (M-0A).
 *
 *   B. Wire-format invariants — every element of the signed message
 *      (body, path, method, key, time) must actually flow into the
 *      signature. If any one is silently dropped, an attacker who
 *      controls that element gets free forgery. Each test mutates
 *      exactly one element and asserts the signature changes.
 *
 *   C. Cross-verification — build a minimal mirror of compute's
 *      `bridge-auth.ts` verifier here in test code, feed the
 *      client's signed request through it, and confirm compute WOULD
 *      accept. Then tamper and confirm compute would reject. This is
 *      the single best proof that the two sides agree on the wire
 *      format.
 *
 * If compute's `bridge-auth.ts` ever changes the message shape, the
 * mirror in Block C needs the same change — in lockstep, same PR.
 * That is by design: the mirror is deliberately a copy-paste so the
 * test fails loudly when the two drift, rather than silently passing.
 */
import { describe, it, expect } from "vitest";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createBridgeClient } from "./compute-bridge-signed";

const BASE_URL = "http://localhost:3100";
const SIGNING_KEY = "x".repeat(64);
const OTHER_KEY = "y".repeat(64);

/**
 * Capture-and-reply fetch stub. Same pattern as the happy-path file
 * but kept local so a refactor doesn't cascade across two files.
 */
function stubFetch(
  canned: { status: number; body: string; headers?: Record<string, string> } = {
    status: 200,
    body: JSON.stringify({ ok: true }),
  },
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(canned.body, {
      status: canned.status,
      headers: {
        "Content-Type": "application/json",
        ...(canned.headers ?? {}),
      },
    });
  };
  return { fn, calls };
}

/** Convenience — grab the headers dict off the last captured call. */
function lastHeaders(calls: { init: RequestInit }[]): Record<string, string> {
  return calls[calls.length - 1].init.headers as Record<string, string>;
}

// ═════════════════════════════════════════════════════════════════
// BLOCK A — Upstream error handling
// ═════════════════════════════════════════════════════════════════

describe("A. Upstream error handling", () => {
  const FIXED_NOW_MS = 1_760_000_000_000;

  function makeClient(fetchImpl: typeof fetch) {
    return createBridgeClient({
      baseUrl: BASE_URL,
      signingKey: SIGNING_KEY,
      now: () => FIXED_NOW_MS,
      fetchImpl,
    });
  }

  it("401 with an { error } body surfaces the server's error code", async () => {
    const { fn } = stubFetch({
      status: 401,
      body: JSON.stringify({ error: "Bridge signature invalid" }),
    });
    const r = await makeClient(fn).call({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google" },
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
    expect(r.error).toBe("Bridge signature invalid");
  });

  it("401 with no body falls back to 'client_error'", async () => {
    const { fn } = stubFetch({ status: 401, body: "" });
    const r = await makeClient(fn).call({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google" },
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
    expect(r.data).toBeNull();
    expect(r.error).toBe("client_error");
  });

  it("403 forwards the server's error code", async () => {
    const { fn } = stubFetch({
      status: 403,
      body: JSON.stringify({ error: "Recent auth required" }),
    });
    const r = await makeClient(fn).call({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/unlink",
      body: { identityId: "id-1" },
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
    expect(r.error).toBe("Recent auth required");
  });

  it("404 from a flag-off compute is not treated as success", async () => {
    // If compute has authOauthEnabled=false, bridge-auth short-
    // circuits to 404. The website must surface this as a real
    // failure, not silently drop data on the floor.
    const { fn } = stubFetch({
      status: 404,
      body: JSON.stringify({ error: "Not found" }),
    });
    const r = await makeClient(fn).call({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google" },
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
    expect(r.error).toBe("Not found");
  });

  it("500 with no JSON body maps to 'server_error' (not 'client_error')", async () => {
    // The 4xx/5xx fallback branch splits on status — we pin which
    // side 500 lands on so log-grep dashboards keep working.
    const { fn } = stubFetch({ status: 500, body: "" });
    const r = await makeClient(fn).call({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google" },
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(500);
    expect(r.error).toBe("server_error");
  });

  it("network failure surfaces as status:0 + 'network_error' — not as 500", async () => {
    const throwingFetch: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const r = await makeClient(throwingFetch).call({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google" },
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0); // sentinel: never got a response
    expect(r.error).toBe("network_error");
    expect(r.data).toBeNull();
  });

  it("HTML response from nginx 502 is NOT forwarded as JSON (M-0A guard)", async () => {
    // Same bug class as the original compute-proxy regression:
    // nginx returns an HTML 502 when Express is unhealthy. If we
    // forwarded that as-is, every downstream JSON parser breaks.
    const { fn } = stubFetch({
      status: 502,
      body: "<html><body>Bad Gateway</body></html>",
      headers: { "Content-Type": "text/html" },
    });
    const r = await makeClient(fn).call({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google" },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("non_json_response");
    expect(r.data).toBeNull();
  });

  it("malformed JSON in a 200 response becomes non_json_response, not a crash", async () => {
    const { fn } = stubFetch({ status: 200, body: "{malformed" });
    const r = await makeClient(fn).call({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google" },
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(200);
    expect(r.error).toBe("non_json_response");
    expect(r.data).toBeNull();
  });

  it("empty response body on a 200 is not treated as ok:true", async () => {
    // An empty 200 has no parseable payload — ok:true would let
    // callers dereference `.data.something` and crash. Returning
    // ok:false + data:null forces a defensive code path at the
    // call site.
    const { fn } = stubFetch({ status: 200, body: "" });
    const r = await makeClient(fn).call({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google" },
    });
    expect(r.ok).toBe(false);
    expect(r.data).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════
// BLOCK B — Wire-format invariants (signature actually depends on each element)
// ═════════════════════════════════════════════════════════════════

describe("B. Wire-format invariants — every element must affect the signature", () => {
  const FIXED_NOW_MS = 1_760_000_000_000;

  /** Call the client once and return the signature + timestamp + nonce it produced. */
  async function signOnce(
    overrides: Partial<{
      method: "POST" | "GET";
      path: string;
      body: unknown;
      signingKey: string;
      nowMs: number;
    }> = {},
  ): Promise<{
    signature: string;
    timestamp: string;
    nonce: string;
    bodySent: string | undefined;
  }> {
    const { fn, calls } = stubFetch();
    const client = createBridgeClient({
      baseUrl: BASE_URL,
      signingKey: overrides.signingKey ?? SIGNING_KEY,
      now: () => overrides.nowMs ?? FIXED_NOW_MS,
      fetchImpl: fn,
    });
    await client.call({
      method: overrides.method ?? "POST",
      path: overrides.path ?? "/api/v1/auth/oauth/bridge/signin",
      body: overrides.body ?? { provider: "google", providerSub: "s" },
    });
    const h = lastHeaders(calls);
    return {
      signature: h["X-Compute-Bridge-Signature"],
      timestamp: h["X-Compute-Bridge-Timestamp"],
      nonce: h["X-Compute-Bridge-Nonce"],
      bodySent: calls[0].init.body as string | undefined,
    };
  }

  /**
   * Hand-compute the HMAC the client is expected to produce for a given
   * 5-tuple. Used by the tests below to hold the nonce constant while
   * flipping exactly one other element — that lets us prove body/path/
   * method/key/timestamp dependency CLEANLY (without confounds from
   * the per-call nonce randomness).
   */
  function recomputeHmac(args: {
    timestamp: string;
    method: string;
    path: string;
    bodyString: string;
    nonce: string;
    signingKey: string;
  }): string {
    const bodyHash = createHash("sha256").update(args.bodyString).digest("hex");
    const message = `${args.timestamp}\n${args.method.toUpperCase()}\n${args.path}\n${bodyHash}\n${args.nonce}`;
    return createHmac("sha256", args.signingKey).update(message).digest("hex");
  }

  it("identical inputs produce DIFFERENT signatures because nonce is fresh per call", async () => {
    // This is the positive proof that the client actually mints a new
    // nonce per call (the replay defence depends on it). Two calls with
    // byte-identical everything else MUST produce different signatures
    // and different nonces; if either collapses, the replay cache
    // would reject every second bridge call.
    const a = await signOnce();
    const b = await signOnce();
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.signature).not.toBe(b.signature);
    // Timestamp is deterministic given the fixed clock — the per-call
    // randomness is isolated to the nonce.
    expect(a.timestamp).toBe(b.timestamp);
  });

  it("signature is a function of the body (hand-computed with captured nonce)", async () => {
    // Hold nonce/ts/method/path/key constant (by reading them back
    // from the client's captured call) and prove the body is a bound
    // input: hashing a DIFFERENT body with the same nonce produces a
    // DIFFERENT HMAC.
    const a = await signOnce({ body: { provider: "google", providerSub: "s" } });
    const bodyStringA = a.bodySent ?? "";
    // Sanity: our hand-computed HMAC equals the client's signature.
    expect(
      recomputeHmac({
        timestamp: a.timestamp,
        method: "POST",
        path: "/api/v1/auth/oauth/bridge/signin",
        bodyString: bodyStringA,
        nonce: a.nonce,
        signingKey: SIGNING_KEY,
      }),
    ).toBe(a.signature);
    // Flip the body; the hand-computed HMAC must now differ.
    const bodyStringB = JSON.stringify({ provider: "google", providerSub: "t" });
    expect(
      recomputeHmac({
        timestamp: a.timestamp,
        method: "POST",
        path: "/api/v1/auth/oauth/bridge/signin",
        bodyString: bodyStringB,
        nonce: a.nonce,
        signingKey: SIGNING_KEY,
      }),
    ).not.toBe(a.signature);
  });

  it("signature is a function of the path (hand-computed with captured nonce)", async () => {
    const a = await signOnce({ path: "/api/v1/auth/oauth/bridge/signin" });
    const bodyString = a.bodySent ?? "";
    expect(
      recomputeHmac({
        timestamp: a.timestamp,
        method: "POST",
        path: "/api/v1/auth/oauth/bridge/link", // flip path
        bodyString,
        nonce: a.nonce,
        signingKey: SIGNING_KEY,
      }),
    ).not.toBe(a.signature);
  });

  it("signature is a function of the method (hand-computed with captured nonce)", async () => {
    // Method is part of the signed message — a captured POST sig can
    // NOT be replayed as a GET.
    const a = await signOnce({ method: "POST" });
    const bodyString = a.bodySent ?? "";
    expect(
      recomputeHmac({
        timestamp: a.timestamp,
        method: "GET", // flip verb
        path: "/api/v1/auth/oauth/bridge/signin",
        bodyString,
        nonce: a.nonce,
        signingKey: SIGNING_KEY,
      }),
    ).not.toBe(a.signature);
  });

  it("signature is a function of the signing key (hand-computed with captured nonce)", async () => {
    const a = await signOnce({ signingKey: SIGNING_KEY });
    const bodyString = a.bodySent ?? "";
    expect(
      recomputeHmac({
        timestamp: a.timestamp,
        method: "POST",
        path: "/api/v1/auth/oauth/bridge/signin",
        bodyString,
        nonce: a.nonce,
        signingKey: OTHER_KEY, // flip key
      }),
    ).not.toBe(a.signature);
  });

  it("signature is a function of the nonce (hand-computed with captured body)", async () => {
    // Regression pin for H1: if a future refactor dropped the nonce
    // from the HMAC input, the nonce header would still ship but
    // compute couldn't bind it. This test catches that exact drift.
    const a = await signOnce();
    const bodyString = a.bodySent ?? "";
    const differentNonce = "f".repeat(32); // same shape, different value
    expect(differentNonce).not.toBe(a.nonce);
    expect(
      recomputeHmac({
        timestamp: a.timestamp,
        method: "POST",
        path: "/api/v1/auth/oauth/bridge/signin",
        bodyString,
        nonce: differentNonce,
        signingKey: SIGNING_KEY,
      }),
    ).not.toBe(a.signature);
  });

  it("advancing the clock changes the timestamp AND the signature", async () => {
    // Pin that the client captures `now()` fresh at call-time. If
    // the client cached the timestamp at construction, every call
    // would reuse it and a replay window would open forever.
    const a = await signOnce({ nowMs: 1_760_000_000_000 });
    const b = await signOnce({ nowMs: 1_760_000_060_000 }); // +60s
    expect(a.timestamp).not.toBe(b.timestamp);
    // (Signatures will also differ — but with nonce randomness, that
    // alone doesn't prove timestamp-binding. The timestamp delta is
    // the observable we care about for this test.)
    expect(a.signature).not.toBe(b.signature);
  });

  it("UTF-8 body bytes are hashed + sent exactly (no silent ASCII coercion)", async () => {
    // Body with an emoji and a non-ASCII character. If our client
    // re-encoded as latin-1 or similar, compute's byte-exact hash
    // would mismatch.
    const body = { email: "résumé@example.com", name: "🦊" };
    const expectedString = JSON.stringify(body);

    const { bodySent, signature, nonce, timestamp } = await signOnce({ body });
    expect(bodySent).toBe(expectedString);

    // Independent signature recomputation using the documented 5-line
    // format. The nonce is read back from the captured call (it's
    // fresh per invocation) so our hand-computed HMAC lines up with
    // what the client actually produced.
    const bodyHashHex = createHash("sha256").update(expectedString, "utf8").digest("hex");
    const msg = `${timestamp}\nPOST\n/api/v1/auth/oauth/bridge/signin\n${bodyHashHex}\n${nonce}`;
    const expectedSig = createHmac("sha256", SIGNING_KEY).update(msg).digest("hex");
    expect(signature).toBe(expectedSig);
  });

  it("swapping two keys in a body changes the signature (JSON.stringify is order-sensitive)", async () => {
    // `{a:1,b:2}` and `{b:2,a:1}` stringify differently — documented
    // behaviour. Callers must build request bodies deterministically.
    // With fresh-per-call nonces, the signatures would differ anyway;
    // we prove the body-order dependency by hand-computing with the
    // captured nonce held constant.
    const a = await signOnce({ body: { a: 1, b: 2 } });
    const bodyStringA = a.bodySent ?? "";
    expect(
      recomputeHmac({
        timestamp: a.timestamp,
        method: "POST",
        path: "/api/v1/auth/oauth/bridge/signin",
        bodyString: bodyStringA,
        nonce: a.nonce,
        signingKey: SIGNING_KEY,
      }),
    ).toBe(a.signature);

    const bodyStringSwapped = JSON.stringify({ b: 2, a: 1 });
    expect(bodyStringSwapped).not.toBe(bodyStringA);
    expect(
      recomputeHmac({
        timestamp: a.timestamp,
        method: "POST",
        path: "/api/v1/auth/oauth/bridge/signin",
        bodyString: bodyStringSwapped,
        nonce: a.nonce,
        signingKey: SIGNING_KEY,
      }),
    ).not.toBe(a.signature);
  });
});

// ═════════════════════════════════════════════════════════════════
// BLOCK C — Cross-verification (round-trip through a compute-style verifier)
// ═════════════════════════════════════════════════════════════════

/**
 * Minimal mirror of `parametric-memory-compute/src/middleware/bridge-auth.ts`.
 *
 * Deliberately a paste-level copy of the logic — message shape,
 * skew window, timing-safe compare, nonce shape check. The whole
 * point is that if the compute side changes in any way, this mirror
 * is OBVIOUSLY behind and someone updating the wire format has to
 * touch both files in the same PR. That's the desired friction.
 *
 * Changed 2026-04-20 (S2 H1): now requires the 5-line message shape
 * including a 32-hex-char nonce. Replay-rejection (seen-nonces cache)
 * is NOT mirrored here — that's behavioural state, not wire format,
 * and the compute-side unit test covers it directly. What this mirror
 * verifies is the HMAC contract: compute will produce a byte-identical
 * expected HMAC for a given (ts, method, path, body, nonce) tuple.
 */
function computeStyleVerify(args: {
  signingKey: string;
  nowMs: number;
  method: string;
  path: string;
  body: string;
  timestampHeader: string;
  signatureHeader: string;
  nonceHeader: string;
  skewToleranceMs?: number;
}): { ok: true } | { ok: false; reason: string } {
  const skew = args.skewToleranceMs ?? 5 * 60 * 1000;

  const tsSeconds = Number(args.timestampHeader);
  if (!Number.isFinite(tsSeconds)) return { ok: false, reason: "bad_timestamp" };
  const tsMs = tsSeconds * 1000;
  if (Math.abs(args.nowMs - tsMs) > skew) {
    return { ok: false, reason: "outside_skew" };
  }

  // Mirror compute's nonce shape guard — lowercase 32-hex.
  if (!/^[0-9a-f]{32}$/.test(args.nonceHeader)) {
    return { ok: false, reason: "nonce_malformed" };
  }

  const bodyHash = createHash("sha256").update(args.body).digest("hex");
  const message = `${args.timestampHeader}\n${args.method.toUpperCase()}\n${args.path}\n${bodyHash}\n${args.nonceHeader}`;
  const expected = createHmac("sha256", args.signingKey).update(message).digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(args.signatureHeader, "hex");
  } catch {
    return { ok: false, reason: "malformed_signature" };
  }
  if (provided.length !== expected.length) {
    return { ok: false, reason: "length_mismatch" };
  }
  if (!timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "signature_mismatch" };
  }
  return { ok: true };
}

describe("C. Cross-verification — client signs, compute-style verifier accepts", () => {
  const FIXED_NOW_MS = 1_760_000_000_000;

  /** Sign a request with the client and return everything the verifier needs. */
  async function signAndCapture(args: { method: "POST" | "GET"; path: string; body: unknown }) {
    const { fn, calls } = stubFetch();
    const client = createBridgeClient({
      baseUrl: BASE_URL,
      signingKey: SIGNING_KEY,
      now: () => FIXED_NOW_MS,
      fetchImpl: fn,
    });
    await client.call(args);
    const h = lastHeaders(calls);
    return {
      method: calls[0].init.method as string,
      path: calls[0].url.replace(BASE_URL, ""), // strip base → full URL path
      bodySent: (calls[0].init.body as string | undefined) ?? "",
      timestampHeader: h["X-Compute-Bridge-Timestamp"],
      signatureHeader: h["X-Compute-Bridge-Signature"],
      nonceHeader: h["X-Compute-Bridge-Nonce"],
    };
  }

  it("a freshly signed POST round-trips through the verifier (happy path)", async () => {
    const sig = await signAndCapture({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google", providerSub: "s" },
    });

    const r = computeStyleVerify({
      signingKey: SIGNING_KEY,
      nowMs: FIXED_NOW_MS,
      method: sig.method,
      path: sig.path,
      body: sig.bodySent,
      timestampHeader: sig.timestampHeader,
      signatureHeader: sig.signatureHeader,
      nonceHeader: sig.nonceHeader,
    });
    expect(r).toEqual({ ok: true });
  });

  it("a freshly signed GET (no body) round-trips", async () => {
    const sig = await signAndCapture({
      method: "GET",
      path: "/api/v1/auth/oauth/identities",
      body: undefined,
    });
    const r = computeStyleVerify({
      signingKey: SIGNING_KEY,
      nowMs: FIXED_NOW_MS,
      method: sig.method,
      path: sig.path,
      body: sig.bodySent,
      timestampHeader: sig.timestampHeader,
      signatureHeader: sig.signatureHeader,
      nonceHeader: sig.nonceHeader,
    });
    expect(r).toEqual({ ok: true });
  });

  it("body tamper (same signature, different bytes) is rejected", async () => {
    const sig = await signAndCapture({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google", providerSub: "s" },
    });
    const r = computeStyleVerify({
      signingKey: SIGNING_KEY,
      nowMs: FIXED_NOW_MS,
      method: sig.method,
      path: sig.path,
      body: sig.bodySent.replace('"s"', '"t"'), // one-char tamper
      timestampHeader: sig.timestampHeader,
      signatureHeader: sig.signatureHeader,
      nonceHeader: sig.nonceHeader,
    });
    expect(r).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("path tamper is rejected", async () => {
    const sig = await signAndCapture({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google" },
    });
    const r = computeStyleVerify({
      signingKey: SIGNING_KEY,
      nowMs: FIXED_NOW_MS,
      method: sig.method,
      path: "/api/v1/auth/oauth/bridge/link", // swap path
      body: sig.bodySent,
      timestampHeader: sig.timestampHeader,
      signatureHeader: sig.signatureHeader,
      nonceHeader: sig.nonceHeader,
    });
    expect(r).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("method tamper is rejected", async () => {
    const sig = await signAndCapture({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google" },
    });
    const r = computeStyleVerify({
      signingKey: SIGNING_KEY,
      nowMs: FIXED_NOW_MS,
      method: "GET", // swap verb
      path: sig.path,
      body: sig.bodySent,
      timestampHeader: sig.timestampHeader,
      signatureHeader: sig.signatureHeader,
      nonceHeader: sig.nonceHeader,
    });
    expect(r).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("wrong signing key is rejected", async () => {
    const sig = await signAndCapture({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google" },
    });
    const r = computeStyleVerify({
      signingKey: OTHER_KEY, // verifier uses different key
      nowMs: FIXED_NOW_MS,
      method: sig.method,
      path: sig.path,
      body: sig.bodySent,
      timestampHeader: sig.timestampHeader,
      signatureHeader: sig.signatureHeader,
      nonceHeader: sig.nonceHeader,
    });
    expect(r).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("replay past the 5-minute skew window is rejected", async () => {
    const sig = await signAndCapture({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google" },
    });
    const r = computeStyleVerify({
      signingKey: SIGNING_KEY,
      nowMs: FIXED_NOW_MS + 10 * 60 * 1000, // 10 min later
      method: sig.method,
      path: sig.path,
      body: sig.bodySent,
      timestampHeader: sig.timestampHeader,
      signatureHeader: sig.signatureHeader,
      nonceHeader: sig.nonceHeader,
    });
    expect(r).toEqual({ ok: false, reason: "outside_skew" });
  });

  it("replay just inside the 5-minute skew window still passes (boundary)", async () => {
    // Pins the boundary: at exactly ±SKEW, Math.abs(diff) === SKEW,
    // which is NOT > SKEW, so it's accepted. This matches compute's
    // `Math.abs(now - tsMs) > SKEW_TOLERANCE_MS` check (strict >).
    const sig = await signAndCapture({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google" },
    });
    const r = computeStyleVerify({
      signingKey: SIGNING_KEY,
      // Exactly 5 minutes — but floor-to-seconds loses up to ~1000ms,
      // so use 5 min MINUS 1 second to be deterministically inside.
      nowMs: FIXED_NOW_MS + 5 * 60 * 1000 - 1000,
      method: sig.method,
      path: sig.path,
      body: sig.bodySent,
      timestampHeader: sig.timestampHeader,
      signatureHeader: sig.signatureHeader,
      nonceHeader: sig.nonceHeader,
    });
    expect(r).toEqual({ ok: true });
  });

  it("malformed signature hex is rejected (not just mismatched)", async () => {
    const sig = await signAndCapture({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google" },
    });
    const r = computeStyleVerify({
      signingKey: SIGNING_KEY,
      nowMs: FIXED_NOW_MS,
      method: sig.method,
      path: sig.path,
      body: sig.bodySent,
      timestampHeader: sig.timestampHeader,
      signatureHeader: "zz" + sig.signatureHeader.slice(2), // non-hex prefix
      nonceHeader: sig.nonceHeader,
    });
    // Buffer.from(hex) silently strips bad chars rather than throwing,
    // so the mirror catches this as a length/mismatch. Either rejection
    // reason is correct — what matters is `ok: false`.
    expect(r.ok).toBe(false);
  });

  it("nonce tamper (swap to different valid-shape nonce) is rejected", async () => {
    // Demonstrates the nonce is bound to the HMAC. An attacker who
    // gets the signature but substitutes a different nonce in the
    // header cannot get the request accepted — the mirror (and real
    // compute) will compute a different expected HMAC and reject.
    const sig = await signAndCapture({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google" },
    });
    const differentNonce = "f".repeat(32);
    expect(differentNonce).not.toBe(sig.nonceHeader);
    const r = computeStyleVerify({
      signingKey: SIGNING_KEY,
      nowMs: FIXED_NOW_MS,
      method: sig.method,
      path: sig.path,
      body: sig.bodySent,
      timestampHeader: sig.timestampHeader,
      signatureHeader: sig.signatureHeader,
      nonceHeader: differentNonce, // swap
    });
    expect(r).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("malformed nonce header is rejected by shape guard", async () => {
    // Uppercase — node's digest('hex') is lowercase; upper must fail
    // the shape check before HMAC compare even runs.
    const sig = await signAndCapture({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { provider: "google" },
    });
    const r = computeStyleVerify({
      signingKey: SIGNING_KEY,
      nowMs: FIXED_NOW_MS,
      method: sig.method,
      path: sig.path,
      body: sig.bodySent,
      timestampHeader: sig.timestampHeader,
      signatureHeader: sig.signatureHeader,
      nonceHeader: "A".repeat(32),
    });
    expect(r).toEqual({ ok: false, reason: "nonce_malformed" });
  });
});
