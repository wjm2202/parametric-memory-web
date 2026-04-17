/**
 * Tests for GET /api/billing/tier-change/:slug — dynamic-route proxy to
 *   compute:/api/v1/billing/tier-change/:slug
 *
 * Covers:
 *   1. No session cookie → 401, never calls compute.
 *   2. Happy path processing state → 200 with full payload forwarded.
 *   3. Slug is URL-encoded before hitting compute.
 *   4. Idle path (no in-flight row) → compute returns 404, proxy forwards 404
 *      so useTierChangePoll can map it to { state: "none" }.
 *   5. Compute 401 (session expired) → forwarded.
 *   6. Compute unreachable → 502.
 *
 * Next.js 15 dynamic-route params are wrapped in a Promise — we mirror that
 * shape when invoking GET directly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { GET } from "./route";
import { cookies } from "next/headers";

const mockCookies = cookies as unknown as ReturnType<typeof vi.fn>;

function makeCookieStore(token?: string) {
  return {
    get: (name: string) => (name === "mmpm_session" && token ? { value: token } : undefined),
  };
}

/**
 * Next.js 15 route handlers receive params as `Promise<...>`. We pass a
 * resolved promise — the route awaits it either way.
 */
function makeCtx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

// The route doesn't read anything off the request — a bare cast is enough.
const DUMMY_REQ = {} as unknown as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/billing/tier-change/:slug", () => {
  it("returns 401 when no session cookie is present — never calls compute", async () => {
    mockCookies.mockResolvedValue(makeCookieStore());

    const res = await GET(DUMMY_REQ, makeCtx("bold-junction"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("unauthorized");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("proxies to compute and returns the in-flight tier-change payload", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));

    const upstream = {
      state: "processing",
      phase: "transferring",
      targetTier: "team",
      transitionKind: "shared_to_dedicated",
      startedAt: "2026-04-17T10:00:00Z",
      estimatedCompletionAt: "2026-04-17T10:05:00Z",
      transferAttempts: 1,
      migrationProgress: { atomCountBefore: 42817, atomCountAfter: null, newDropletIp: null },
      error: null,
    };

    mockFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify(upstream)),
    });

    const res = await GET(DUMMY_REQ, makeCtx("bold-junction"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.state).toBe("processing");
    expect(body.phase).toBe("transferring");
    expect(body.migrationProgress.atomCountBefore).toBe(42817);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/billing/tier-change/bold-junction"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sess_abc123" }),
        cache: "no-store",
      }),
    );
  });

  it("URL-encodes unusual slug values", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ state: "none" })),
    });

    await GET(DUMMY_REQ, makeCtx("weird/slug with?chars"));

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("tier-change/weird%2Fslug%20with%3Fchars"),
      expect.any(Object),
    );
  });

  it("forwards 404 when no tier_change row exists (idle path)", async () => {
    // This is the critical "idle" path. The hook maps 404 → { state: "none" }
    // so the banner renders nothing. Must forward the 404 verbatim.
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 404,
      text: () => Promise.resolve(JSON.stringify({ error: "not_found" })),
    });

    const res = await GET(DUMMY_REQ, makeCtx("bold-junction"));

    expect(res.status).toBe(404);
  });

  it("forwards 401 when compute rejects the session as expired", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_stale"));
    mockFetch.mockResolvedValue({
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ error: "Authentication required" })),
    });

    const res = await GET(DUMMY_REQ, makeCtx("bold-junction"));

    expect(res.status).toBe(401);
  });

  it("returns 502 when compute is unreachable", async () => {
    // compute-proxy.ts logs a diagnostic console.error on network failure —
    // that's intended ops signal in prod. Silence it here so `npm run
    // preflight` doesn't paint its output amber while still asserting the
    // alarm actually fired.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await GET(DUMMY_REQ, makeCtx("bold-junction"));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBe("upstream_error");
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("[compute-proxy]"),
      expect.any(Error),
    );
    errSpy.mockRestore();
  });
});
