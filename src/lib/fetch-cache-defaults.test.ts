/**
 * Sprint nextjs-16-upgrade (2026-05-27) — fetch() cache pins (test 5.11).
 *
 * This codebase makes EVERY fetch's cache discipline explicit. Most calls
 * pass `cache: "no-store"` (route handlers, bridge client, per-user
 * helpers). A small set pass `next: { revalidate: N }` (shared/scalable
 * reads like the public atom graph). Nothing relies on Next.js's implicit
 * default — and that's deliberate, because the default changes between
 * Next.js major versions:
 *
 *   - Next 14: `fetch()` GET was cached by default.
 *   - Next 15: default flipped to uncached for `fetch()` in route handlers.
 *   - Next 16: behaviour carried forward; defaults remain conservative.
 *
 * If a future engineer reads "v16 makes no-store the default" and decides
 * to delete the explicit `cache: "no-store"` on a route, they remove the
 * audit trail. The next Next.js major might flip the default again, and
 * the deletion turns into a silent behaviour change.
 *
 * These tests pin the explicit values — every cache-bearing helper this
 * file knows about must continue to pass the expected `cache` or `next`
 * key to fetch. Any accidental deletion fails a test before it ships.
 *
 * Reference: docs/SPRINT-NEXTJS-16-UPGRADE-2026-05-27.md (test 5.11).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeProxy } from "./compute-proxy";
import { createBridgeClient } from "./compute-bridge-signed";
import { fetchAllAtoms, fetchAtomGraph } from "./knowledge-api";

/* ─── Stub fetch ────────────────────────────────────────────────────────── */

interface CapturedCall {
  url: string;
  init: RequestInit;
}

function makeStubFetch(
  canned: { jsonBody: unknown; status?: number } = {
    jsonBody: { ok: true, atoms: [], treeVersion: 0 },
  },
) {
  const calls: CapturedCall[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify(canned.jsonBody), {
      status: canned.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

/* ─── computeProxy — always cache: "no-store" ───────────────────────────── */

describe("computeProxy — cache pin (no-store)", () => {
  let stub: ReturnType<typeof makeStubFetch>;

  beforeEach(() => {
    stub = makeStubFetch();
    vi.stubGlobal("fetch", stub.fn);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes cache: 'no-store' on a default GET", async () => {
    await computeProxy("api/v1/test");
    expect(stub.calls.length).toBe(1);
    expect(stub.calls[0].init.cache).toBe("no-store");
  });

  it("passes cache: 'no-store' on a POST with body", async () => {
    await computeProxy("api/v1/test", { method: "POST", body: { foo: 1 } });
    expect(stub.calls.length).toBe(1);
    expect(stub.calls[0].init.cache).toBe("no-store");
  });

  it("passes cache: 'no-store' regardless of caller-supplied headers", async () => {
    await computeProxy("api/v1/test", {
      method: "GET",
      headers: { Authorization: "Bearer xyz" },
    });
    expect(stub.calls[0].init.cache).toBe("no-store");
  });

  it("never sets a next.revalidate field on the init (only cache=no-store)", async () => {
    await computeProxy("api/v1/test");
    expect(stub.calls[0].init.cache).toBe("no-store");
    expect((stub.calls[0].init as { next?: unknown }).next).toBeUndefined();
  });
});

/* ─── bridgeClient.call — always cache: "no-store" ──────────────────────── */

describe("createBridgeClient(...).call — cache pin (no-store)", () => {
  /*
   * Uses injectable fetchImpl per the existing bridge test convention,
   * so we don't need to stub the global. Singleton is untouched.
   */
  it("passes cache: 'no-store' on a POST bridge call", async () => {
    const stub = makeStubFetch();
    const client = createBridgeClient({
      baseUrl: "http://localhost:3100",
      signingKey: "x".repeat(64),
      now: () => 1_700_000_000_000,
      fetchImpl: stub.fn,
    });
    await client.call({
      method: "POST",
      path: "/api/v1/auth/oauth/bridge/signin",
      body: { idToken: "fake" },
    });
    expect(stub.calls.length).toBe(1);
    expect(stub.calls[0].init.cache).toBe("no-store");
  });

  it("passes cache: 'no-store' on a GET bridge call (no body)", async () => {
    const stub = makeStubFetch();
    const client = createBridgeClient({
      baseUrl: "http://localhost:3100",
      signingKey: "x".repeat(64),
      now: () => 1_700_000_000_000,
      fetchImpl: stub.fn,
    });
    await client.call({
      method: "GET",
      path: "/api/v1/auth/oauth/identities",
      sessionCookie: "mmpm_session=abc",
    });
    expect(stub.calls.length).toBe(1);
    expect(stub.calls[0].init.cache).toBe("no-store");
  });
});

/* ─── knowledge-api — per-helper cache discipline ───────────────────────── */

describe("knowledge-api — explicit cache discipline per helper", () => {
  let stub: ReturnType<typeof makeStubFetch>;

  beforeEach(() => {
    stub = makeStubFetch({
      jsonBody: { atoms: [], treeVersion: 0 },
    });
    vi.stubGlobal("fetch", stub.fn);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchAllAtoms uses cache: 'no-store' (per-user view of atom state)", async () => {
    await fetchAllAtoms();
    expect(stub.calls.length).toBe(1);
    expect(stub.calls[0].init.cache).toBe("no-store");
    expect((stub.calls[0].init as { next?: unknown }).next).toBeUndefined();
  });

  it("fetchAtomGraph uses next: { revalidate: 30 } (KG-13, shared scaling cache)", async () => {
    /*
     * The atom graph endpoint is deliberately revalidated rather than
     * uncached — one origin request serves many concurrent visitors.
     * This is the ONE site in the codebase that should NOT be
     * `cache: "no-store"`. If someone "normalises" this for consistency,
     * scaling regresses silently. The test pins it to 30s explicitly.
     */
    await fetchAtomGraph();
    expect(stub.calls.length).toBe(1);
    expect(stub.calls[0].init.cache).toBeUndefined();
    const nextOpt = (stub.calls[0].init as { next?: { revalidate?: number } }).next;
    expect(nextOpt).toBeDefined();
    expect(nextOpt?.revalidate).toBe(30);
  });
});
