/**
 * BFF /api/checkout — body pass-through contract
 *
 * SPRINT-CHECKOUT-ADBLOCKER-RESILIENCE-2026-05-29.md (D3.2)
 *
 * The website's BFF is a thin proxy. It pulls the session cookie off the
 * request, attaches it as a Bearer token, and forwards the request body
 * verbatim to compute. The hosted-mode fallback added in this sprint
 * relies on this transparency: when `PricingCTA` POSTs
 * `{ tier, mode: "hosted" }`, the BFF must NOT strip or rewrite `mode` —
 * it has to land on compute exactly as sent.
 *
 * This file pins that contract. Pattern mirrors
 * `src/app/api/billing/portal/route.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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

function makeRequest(body?: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/checkout", () => {
  it("returns 401 when no session cookie is present", async () => {
    mockCookies.mockResolvedValue(makeCookieStore());

    const res = await POST(makeRequest({ tier: "indie" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Not authenticated");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("forwards { tier } body to compute (embedded default)", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            clientSecret: "cs_test_xxx_secret",
            tier: "indie",
            amountCents: 900,
          }),
        ),
    });

    const res = await POST(makeRequest({ tier: "indie" }));
    expect(res.status).toBe(200);

    const upstreamInit = mockFetch.mock.calls[0][1] as { body?: string };
    expect(JSON.parse(upstreamInit.body!)).toEqual({ tier: "indie" });
  });

  it("forwards mode: 'hosted' through to compute verbatim (adblock fallback)", async () => {
    // The core regression guard for the sprint. If a future "validate body
    // shape at the edge" refactor strips unknown fields, the hosted
    // fallback silently degrades to embedded and breaks for ad blocker
    // users.
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            url: "https://checkout.stripe.com/c/pay/cs_test_hosted_xxx",
            tier: "pro",
            amountCents: 2900,
          }),
        ),
    });

    const res = await POST(makeRequest({ tier: "pro", mode: "hosted" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe("https://checkout.stripe.com/c/pay/cs_test_hosted_xxx");
    expect(body).not.toHaveProperty("clientSecret");

    const upstreamInit = mockFetch.mock.calls[0][1] as { body?: string };
    expect(JSON.parse(upstreamInit.body!)).toEqual({ tier: "pro", mode: "hosted" });
  });

  it("forwards mode: 'embedded' through verbatim too", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            clientSecret: "cs_test_explicit_embedded_xxx_secret",
            tier: "indie",
            amountCents: 900,
          }),
        ),
    });

    const res = await POST(makeRequest({ tier: "indie", mode: "embedded" }));
    expect(res.status).toBe(200);

    const upstreamInit = mockFetch.mock.calls[0][1] as { body?: string };
    expect(JSON.parse(upstreamInit.body!)).toEqual({
      tier: "indie",
      mode: "embedded",
    });
  });

  it("attaches the session cookie as Bearer for upstream auth", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_xyz789"));
    mockFetch.mockResolvedValue({
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({ clientSecret: "cs_test", tier: "indie", amountCents: 900 }),
        ),
    });

    await POST(makeRequest({ tier: "indie" }));

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/checkout"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sess_xyz789",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("forwards 409 tier_at_capacity from compute verbatim (hosted-mode path)", async () => {
    // The hosted-fallback uses the same /api/checkout endpoint as embedded,
    // so capacity errors must round-trip with the same shape — PricingCTA
    // reads `body.message` for the 409 case.
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 409,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            error: "tier_at_capacity",
            tier: "indie",
            status: "waitlist",
            message: "Solo slots are full — please join the waitlist.",
          }),
        ),
    });

    const res = await POST(makeRequest({ tier: "indie", mode: "hosted" }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.message).toBe("Solo slots are full — please join the waitlist.");
  });

  it("returns 502 when compute is unreachable", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await POST(makeRequest({ tier: "indie", mode: "hosted" }));
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
