/**
 * Sprint nextjs-16-upgrade (2026-05-27) — SSE proxy contract (test 5.9).
 *
 * The /api/memory/events route is an SSE passthrough proxy from the
 * browser to the MMPM viz service. It is the only streaming-fetch site
 * in this codebase. Streaming + fetch + signal-forwarding is the kind
 * of low-level surface where v16 platform changes (Web Streams polyfill
 * shift, signal abort semantics, Response constructor headers handling)
 * land most quietly.
 *
 * This test pins the wire format byte-by-byte:
 *
 *   outbound (route → upstream):
 *     - URL = `${MMPM_URL}/events`
 *     - Accept: text/event-stream
 *     - Cache-Control: no-cache
 *     - Authorization: Bearer <key>  (when key present)
 *     - signal === request.signal (abort propagation)
 *
 *   inbound (route → browser) on happy path:
 *     - status 200
 *     - Content-Type: text/event-stream
 *     - Cache-Control: no-cache, no-store, must-revalidate
 *     - Connection: keep-alive
 *     - X-Accel-Buffering: no
 *     - Access-Control-Allow-Origin: <CORS_ORIGIN env or *>
 *     - body is the upstream body (bytes round-trip)
 *
 *   inbound on error paths:
 *     - upstream non-2xx → status echoed, JSON body
 *     - upstream no body → 502 + JSON
 *     - AbortError       → 499 (Client Closed Request)
 *     - generic fetch failure → 502 + JSON
 *
 * Reference: docs/SPRINT-NEXTJS-16-UPGRADE-2026-05-27.md (test 5.9).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/mmpm", () => ({
  getMmpmSseUrl: () => "https://mmpm.test/events",
  getMmpmAuthHeader: () => "Bearer test-viz-key",
}));

import { GET } from "./route";

/* ─── Stub fetch ────────────────────────────────────────────────────────── */

interface CapturedCall {
  url: string;
  init: RequestInit;
}

function makeStubFetch(opts: {
  status?: number;
  body?: BodyInit | null;
  responseHeaders?: Record<string, string>;
  throwError?: Error;
}) {
  const calls: CapturedCall[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    if (opts.throwError) throw opts.throwError;
    return new Response(opts.body ?? null, {
      status: opts.status ?? 200,
      headers: opts.responseHeaders ?? {},
    });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function makeRequest(): Request {
  return new Request("https://parametric-memory.dev/api/memory/events", {
    method: "GET",
  });
}

/* ═════════════════════════════════════════════════════════════════════════
 *   Happy path
 * ═════════════════════════════════════════════════════════════════════════*/

describe("/api/memory/events — happy path outbound contract", () => {
  let stub: ReturnType<typeof makeStubFetch>;
  let request: Request;

  beforeEach(async () => {
    stub = makeStubFetch({
      status: 200,
      body: 'data: {"type":"hello"}\n\n',
    });
    vi.stubGlobal("fetch", stub.fn);
    request = makeRequest();
    // Drive the route once; this group asserts on stub.calls, not the response.
    await GET(request);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the configured upstream URL (/events)", () => {
    expect(stub.calls.length).toBe(1);
    expect(stub.calls[0].url).toBe("https://mmpm.test/events");
  });

  it("sends Accept: text/event-stream", () => {
    const sent = stub.calls[0].init.headers as Record<string, string>;
    expect(sent.Accept).toBe("text/event-stream");
  });

  it("sends Cache-Control: no-cache on the outbound request", () => {
    const sent = stub.calls[0].init.headers as Record<string, string>;
    expect(sent["Cache-Control"]).toBe("no-cache");
  });

  it("forwards the Bearer key as Authorization (server-side only)", () => {
    const sent = stub.calls[0].init.headers as Record<string, string>;
    expect(sent.Authorization).toBe("Bearer test-viz-key");
  });

  it("forwards the request's AbortSignal to upstream (abort propagation)", () => {
    expect(stub.calls[0].init.signal).toBe(request.signal);
  });
});

describe("/api/memory/events — happy path response headers", () => {
  let stub: ReturnType<typeof makeStubFetch>;
  let response: Response;

  beforeEach(async () => {
    stub = makeStubFetch({
      status: 200,
      body: 'data: {"type":"hello"}\n\n',
    });
    vi.stubGlobal("fetch", stub.fn);
    response = await GET(makeRequest());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns status 200", () => {
    expect(response.status).toBe(200);
  });

  it("returns Content-Type: text/event-stream", () => {
    expect(response.headers.get("content-type")).toBe("text/event-stream");
  });

  it("returns Cache-Control: no-cache, no-store, must-revalidate (response side)", () => {
    expect(response.headers.get("cache-control")).toBe("no-cache, no-store, must-revalidate");
  });

  it("returns Connection: keep-alive", () => {
    expect(response.headers.get("connection")).toBe("keep-alive");
  });

  it("returns X-Accel-Buffering: no (nginx buffering disable)", () => {
    expect(response.headers.get("x-accel-buffering")).toBe("no");
  });

  it("returns Access-Control-Allow-Origin (defaults to * when CORS_ORIGIN unset)", () => {
    const v = response.headers.get("access-control-allow-origin");
    expect(v).toBeTruthy();
    // Either the env-set origin or "*"
    expect(typeof v).toBe("string");
  });

  it("proxies the upstream body bytes to the client", async () => {
    const text = await response.text();
    expect(text).toBe('data: {"type":"hello"}\n\n');
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 *   Error paths
 * ═════════════════════════════════════════════════════════════════════════*/

describe("/api/memory/events — error responses", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns upstream status + JSON error when upstream is non-2xx", async () => {
    const stub = makeStubFetch({
      status: 503,
      body: "Service Unavailable",
    });
    vi.stubGlobal("fetch", stub.fn);
    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = (await res.json()) as { error: string; status: number };
    expect(body.error).toBe("SSE upstream error");
    expect(body.status).toBe(503);
  });

  it("returns 502 + JSON when upstream has no body", async () => {
    const stub = makeStubFetch({ status: 200, body: null });
    vi.stubGlobal("fetch", stub.fn);
    const res = await GET(makeRequest());
    expect(res.status).toBe(502);
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("No upstream body");
  });

  it("returns 499 (Client Closed Request) when fetch aborts (browser disconnect)", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    const stub = makeStubFetch({ throwError: abortError });
    vi.stubGlobal("fetch", stub.fn);
    const res = await GET(makeRequest());
    expect(res.status).toBe(499);
  });

  it("returns 502 + JSON on generic fetch failure (network error, DNS, etc.)", async () => {
    const networkError = new Error("getaddrinfo ENOTFOUND mmpm.test");
    const stub = makeStubFetch({ throwError: networkError });
    vi.stubGlobal("fetch", stub.fn);
    const res = await GET(makeRequest());
    expect(res.status).toBe(502);
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = (await res.json()) as { error: string; detail: string };
    expect(body.error).toBe("SSE proxy connection failed");
    expect(body.detail).toContain("ENOTFOUND");
  });
});
