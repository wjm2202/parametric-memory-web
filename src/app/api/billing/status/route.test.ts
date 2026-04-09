import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────
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

beforeEach(() => {
  vi.clearAllMocks();
});

// ── The proxy layer ──────────────────────────────────────────────────────────
//
// These tests cover the Next.js API route that proxies to compute.
// They verify:
//   1. No session cookie → 401 (never calls compute)
//   2. Happy path → 200 with billing snapshot forwarded transparently
//   3. Compute returns 404 (account not found) → forwarded as 404
//   4. Compute returns 401 (session expired/invalid) → forwarded as 401
//   5. Compute is unreachable → 502
//
// The 404 and 401 cases are the two "silent failure" paths that caused the
// original bug. They must propagate correctly so DashboardClient can act on them.

describe("GET /api/billing/status", () => {
  it("returns 401 when no session cookie is present — never calls compute", async () => {
    mockCookies.mockResolvedValue(makeCookieStore());

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("unauthorized");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("proxies to compute and returns 200 billing snapshot", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));

    const snapshot = {
      tier: "indie",
      status: "active",
      renewsAt: "2026-05-08T00:00:00.000Z",
      trialEndsAt: null,
      lastPaymentFailed: false,
      hasStripeCustomer: true,
      tierDisplay: {
        name: "Solo",
        atomsUsed: 0,
        atomsLimit: 50000,
        bootstrapsUsed: 0,
        bootstrapsLimit: 500,
      },
    };

    mockFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify(snapshot)),
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.tier).toBe("indie");
    expect(body.status).toBe("active");
    expect(body.hasStripeCustomer).toBe(true);

    // Verify the Bearer token was forwarded
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/billing/status"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sess_abc123",
        }),
        cache: "no-store",
      }),
    );
  });

  it("forwards 404 when compute reports account not found", async () => {
    // This is the root cause of the original bug: account row missing in DB.
    // The proxy must forward 404 so DashboardClient can distinguish it from
    // a successful-but-empty response.
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 404,
      text: () => Promise.resolve(JSON.stringify({ error: "Account not found" })),
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Account not found");
  });

  it("forwards 401 when compute rejects the session token as expired or invalid", async () => {
    // Session cookie is present in the browser and passes edge middleware,
    // but compute's auth_sessions lookup fails (expired_at < now, or row deleted).
    // Must forward 401 so DashboardClient can redirect to login.
    mockCookies.mockResolvedValue(makeCookieStore("sess_stale_token"));
    mockFetch.mockResolvedValue({
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ error: "Authentication required" })),
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Authentication required");
  });

  it("returns 502 when compute is unreachable", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBe("upstream_error");
  });

  it("forwards 429 rate-limit response from compute", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 429,
      text: () => Promise.resolve(JSON.stringify({ error: "Too Many Requests" })),
    });

    const res = await GET();

    expect(res.status).toBe(429);
  });
});
