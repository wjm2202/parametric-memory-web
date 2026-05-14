import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────────────
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
  return new NextRequest("http://localhost:3000/api/billing/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/billing/portal", () => {
  it("returns 401 when no session cookie is present", async () => {
    mockCookies.mockResolvedValue(makeCookieStore());

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("unauthorized");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("proxies POST to compute and returns portalUrl", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 200,
      text: () =>
        Promise.resolve(JSON.stringify({ portalUrl: "https://billing.stripe.com/session/xyz" })),
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.portalUrl).toBe("https://billing.stripe.com/session/xyz");

    // Verify upstream call
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/billing/portal"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sess_abc123",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("forwards 422 when account has no Stripe customer", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 422,
      text: () => Promise.resolve(JSON.stringify({ error: "no_stripe_customer" })),
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toBe("no_stripe_customer");
  });

  it("forwards substrateSlug body field to compute for scoped deep-link", async () => {
    // 2026-05-14 — the substrate-scoped cancel flow sends `{ substrateSlug }`
    // in the body. The website proxy doesn't interpret or strip it — compute
    // is the ownership-and-existence authority. This test pins that contract
    // so a future "validate body shape at the edge" refactor doesn't silently
    // drop the field on the floor.
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 200,
      text: () =>
        Promise.resolve(JSON.stringify({ portalUrl: "https://billing.stripe.com/session/scoped" })),
    });

    const res = await POST(makeRequest({ substrateSlug: "research-droplet-syd1" }));
    expect(res.status).toBe(200);

    // The upstream POST body must include the slug, verbatim.
    const upstreamCall = mockFetch.mock.calls[0];
    const upstreamInit = upstreamCall[1] as { body?: string };
    expect(upstreamInit.body).toBeTruthy();
    const upstreamBody = JSON.parse(upstreamInit.body!);
    expect(upstreamBody).toEqual({ substrateSlug: "research-droplet-syd1" });
  });

  it("forwards 404 substrate_subscription_not_found from compute (scoped path)", async () => {
    // When the slug doesn't resolve to an owned + active subscription, compute
    // returns 404. The proxy must surface it verbatim so the dashboard can
    // show the "page is out of date — refresh" alert rather than the generic
    // "could not open portal" one.
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 404,
      text: () =>
        Promise.resolve(JSON.stringify({ error: "substrate_subscription_not_found" })),
    });

    const res = await POST(makeRequest({ substrateSlug: "not-mine-or-cancelled" }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("substrate_subscription_not_found");
  });

  it("returns 502 when compute is unreachable", async () => {
    // compute-proxy.ts logs a diagnostic console.error on network failure —
    // that's intended ops signal in prod. In tests the log leaks into vitest
    // output and clutters `npm run preflight` logs, so silence it here while
    // still verifying the alarm fired.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBe("upstream_error");
    // Prove compute-proxy raised its network-error alarm (swallowed-silently
    // would be a worse bug than log noise).
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("[compute-proxy]"),
      expect.any(Error),
    );
    errSpy.mockRestore();
  });
});
