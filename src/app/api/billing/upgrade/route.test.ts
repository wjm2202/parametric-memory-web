/**
 * Tests for POST /api/billing/upgrade — session-auth proxy to
 *   compute:/api/v1/billing/upgrade
 *
 * Covers:
 *   1. No session cookie → 401, never calls compute.
 *   2. Happy path → 200 with { checkoutUrl } forwarded.
 *   3. Body is forwarded verbatim (substrateSlug, targetTier, idempotencyKey).
 *   4. Malformed/empty body → forward empty {} to compute; compute responds 400.
 *   5. Compute 409 (in-flight tier change already exists) → forwarded as 409.
 *   6. Compute unreachable → 502.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { POST } from "./route";
import { cookies } from "next/headers";

const mockCookies = cookies as unknown as ReturnType<typeof vi.fn>;

function makeCookieStore(token?: string) {
  return {
    get: (name: string) => (name === "mmpm_session" && token ? { value: token } : undefined),
  };
}

/**
 * Minimal NextRequest stand-in for POST. The route only calls
 * `request.json()`, so we only need that method.
 * Pass `null` or `undefined` to simulate malformed body (json() rejects).
 */
function makeReq(body: unknown): NextRequest {
  return {
    json: () =>
      body === undefined ? Promise.reject(new Error("malformed json")) : Promise.resolve(body),
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/billing/upgrade", () => {
  it("returns 401 when no session cookie is present — never calls compute", async () => {
    mockCookies.mockResolvedValue(makeCookieStore());

    const res = await POST(makeReq({ substrateSlug: "bold-junction", targetTier: "pro" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("unauthorized");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("proxies to compute and returns the checkout URL", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));

    const upstream = { checkoutUrl: "https://checkout.stripe.com/c/abc123" };
    mockFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify(upstream)),
    });

    const res = await POST(
      makeReq({
        substrateSlug: "bold-junction",
        targetTier: "pro",
        idempotencyKey: "upg_01HA7Z0",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checkoutUrl).toBe("https://checkout.stripe.com/c/abc123");

    // Body is forwarded verbatim.
    const call = mockFetch.mock.calls[0];
    const init = call[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      substrateSlug: "bold-junction",
      targetTier: "pro",
      idempotencyKey: "upg_01HA7Z0",
    });

    expect(call[0]).toContain("/api/v1/billing/upgrade");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer sess_abc123" });
  });

  it("forwards an empty body {} when request.json() throws (malformed body)", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 400,
      text: () => Promise.resolve(JSON.stringify({ error: "substrateSlug_required" })),
    });

    const res = await POST(makeReq(undefined)); // json() rejects
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("substrateSlug_required");

    // Should still have fired the upstream call with an empty body object.
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  it("forwards 409 when a tier change is already in flight", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 409,
      text: () => Promise.resolve(JSON.stringify({ error: "tier_change_in_flight" })),
    });

    const res = await POST(makeReq({ substrateSlug: "bold-junction", targetTier: "pro" }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("tier_change_in_flight");
  });

  it("returns 502 when compute is unreachable", async () => {
    // compute-proxy.ts logs a diagnostic console.error on network failure —
    // that's intended ops signal in prod. Silence it here so `npm run
    // preflight` doesn't paint its output amber while still asserting the
    // alarm actually fired.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await POST(makeReq({ substrateSlug: "bold-junction", targetTier: "pro" }));
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
