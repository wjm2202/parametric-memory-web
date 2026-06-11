/**
 * Tests for GET /api/billing/upgrade/preview — BFF proxy to
 *   compute:/api/v1/substrates/:slug/upgrade/preview?tier=<target>
 *
 * Covers:
 *   1. No session cookie → 401, never calls compute.
 *   2. Missing substrateSlug → 400, never calls compute.
 *   3. Missing tier → 400, never calls compute.
 *   4. Happy path → compute's UpgradePreviewResponse forwarded verbatim.
 *   5. substrateSlug and tier are URL-encoded into the upstream path/query.
 *   6. Compute 400 (bad tier / no subscription) → forwarded as 400.
 *   7. Compute 404 (substrate not found) → forwarded as 404.
 *   8. Compute 500 → remapped to 502 (compute-proxy semantics).
 *   9. Compute unreachable → 502.
 *
 * Pattern mirrors src/app/api/billing/upgrade-options/route.test.ts.
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

function makeReq(params: Record<string, string> = {}): NextRequest {
  const sp = new URLSearchParams(params);
  return { nextUrl: { searchParams: sp } } as unknown as NextRequest;
}

function mockComputeOk(body: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function mockComputeError(status: number, body: unknown = { error: "err" }) {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

const PREVIEW_RESPONSE = {
  currentTier: "indie",
  targetTier: "pro",
  transitionType: "shared_to_shared",
  currentPriceCents: 900,
  newPriceCents: 2900,
  prorationCents: 633,
  currency: "usd",
  nextInvoiceDate: "2026-07-01T00:00:00.000Z",
  nextInvoiceTotalCents: 2900,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/billing/upgrade/preview", () => {
  it("returns 401 when no session cookie — never calls compute", async () => {
    mockCookies.mockResolvedValue(makeCookieStore());

    const res = await GET(makeReq({ substrateSlug: "bold-junction", tier: "pro" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toMatchObject({ error: "unauthorized" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 when substrateSlug is missing — never calls compute", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("tok_abc"));

    const res = await GET(makeReq({ tier: "pro" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toMatchObject({ error: "substrateSlug_required" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 when tier is missing — never calls compute", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("tok_abc"));

    const res = await GET(makeReq({ substrateSlug: "bold-junction" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toMatchObject({ error: "tier_required" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("happy path — forwards compute's UpgradePreviewResponse verbatim", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("tok_abc"));
    mockComputeOk(PREVIEW_RESPONSE);

    const res = await GET(makeReq({ substrateSlug: "bold-junction", tier: "pro" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(PREVIEW_RESPONSE);
  });

  it("URL-encodes substrateSlug and tier into the upstream path/query", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("tok_abc"));
    mockComputeOk(PREVIEW_RESPONSE);

    await GET(makeReq({ substrateSlug: "bold/junction", tier: "pro plus" }));

    const calledUrl: string = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("bold%2Fjunction");
    expect(calledUrl).toContain("pro%20plus");
  });

  it("forwards compute 400 (bad tier / no subscription) as 400", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("tok_abc"));
    mockComputeError(400, { error: "invalid_tier" });

    const res = await GET(makeReq({ substrateSlug: "bold-junction", tier: "free" }));

    expect(res.status).toBe(400);
  });

  it("forwards compute 404 (substrate not found) as 404", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("tok_abc"));
    mockComputeError(404, { error: "not_found" });

    const res = await GET(makeReq({ substrateSlug: "gone-slug", tier: "pro" }));

    expect(res.status).toBe(404);
  });

  it("remaps compute 500 to 502 (compute-proxy semantics)", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("tok_abc"));
    mockComputeError(500, { error: "preview_failed" });

    const res = await GET(makeReq({ substrateSlug: "bold-junction", tier: "pro" }));

    expect(res.status).toBe(502);
  });

  it("returns 502 when compute is unreachable", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("tok_abc"));
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const res = await GET(makeReq({ substrateSlug: "bold-junction", tier: "pro" }));

    expect(res.status).toBe(502);
  });
});
