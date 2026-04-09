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

  it("returns 502 when compute is unreachable", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBe("upstream_error");
  });
});
