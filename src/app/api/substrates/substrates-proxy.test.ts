import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeProxy } from "@/lib/compute-proxy";

/**
 * Tests for the multi-substrate proxy routes.
 *
 * These verify that the slug-scoped proxy routes correctly forward
 * requests to compute's /api/v1/substrates/* endpoints and maintain
 * the JSON response contract from compute-proxy.
 */

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function fakeResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
    headers: new Headers({ "Content-Type": "application/json" }),
  };
}

// ── List substrates ─────────────────────────────────────────────────────────

describe("substrates proxy — list endpoint", () => {
  it("forwards GET /api/v1/substrates and returns substrates array", async () => {
    const upstream = {
      substrates: [
        {
          id: "uuid-1",
          slug: "my-brain",
          tier: "indie",
          status: "running",
          createdAt: "2026-04-01T00:00:00Z",
          updatedAt: "2026-04-13T00:00:00Z",
        },
        {
          id: "uuid-2",
          slug: "work-notes",
          tier: "pro",
          status: "provisioning",
          createdAt: "2026-04-12T00:00:00Z",
          updatedAt: "2026-04-13T00:00:00Z",
        },
      ],
    };
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify(upstream)));

    const result = await computeProxy("api/v1/substrates", {
      headers: { Authorization: "Bearer test-token" },
      label: "substrates/list",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(upstream);
    expect((result.data as { substrates: unknown[] }).substrates).toHaveLength(2);
  });

  it("returns empty substrates array for new accounts", async () => {
    const upstream = { substrates: [] };
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify(upstream)));

    const result = await computeProxy("api/v1/substrates", {
      headers: { Authorization: "Bearer test-token" },
    });

    expect(result.ok).toBe(true);
    expect((result.data as { substrates: unknown[] }).substrates).toHaveLength(0);
  });

  it("returns 401 for unauthenticated requests", async () => {
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify({ error: "unauthorized" }), 401));

    const result = await computeProxy("api/v1/substrates");

    expect(result.ok).toBe(false);
    expect(result.upstreamStatus).toBe(401);
  });
});

// ── Get substrate by slug ───────────────────────────────────────────────────

describe("substrates proxy — get by slug", () => {
  it("forwards GET /api/v1/substrates/:slug and returns substrate detail", async () => {
    const upstream = {
      substrate: {
        id: "uuid-1",
        slug: "my-brain",
        tier: "indie",
        status: "running",
        createdAt: "2026-04-01T00:00:00Z",
        updatedAt: "2026-04-13T00:00:00Z",
      },
    };
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify(upstream)));

    const result = await computeProxy("api/v1/substrates/my-brain", {
      headers: { Authorization: "Bearer test-token" },
    });

    expect(result.ok).toBe(true);
    expect((result.data as { substrate: { slug: string } }).substrate.slug).toBe("my-brain");
  });

  it("returns 404 for non-owned slug (no existence leak)", async () => {
    fetchSpy.mockResolvedValueOnce(
      fakeResponse(JSON.stringify({ error: "substrate_not_found" }), 404),
    );

    const result = await computeProxy("api/v1/substrates/someone-elses-brain", {
      headers: { Authorization: "Bearer test-token" },
    });

    expect(result.ok).toBe(false);
    expect(result.upstreamStatus).toBe(404);
    expect((result.data as { error: string }).error).toBe("substrate_not_found");
  });
});

// ── Slug-scoped actions ─────────────────────────────────────────────────────

describe("substrates proxy — slug-scoped actions", () => {
  it("forwards POST cancel and returns scheduled cancellation", async () => {
    const upstream = { scheduled: true, cancelAt: "2026-05-01T00:00:00Z" };
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify(upstream)));

    const result = await computeProxy("api/v1/substrates/my-brain/cancel", {
      method: "POST",
      headers: { Authorization: "Bearer test-token" },
    });

    expect(result.ok).toBe(true);
    expect((result.data as { scheduled: boolean }).scheduled).toBe(true);
  });

  it("forwards POST reactivate", async () => {
    const upstream = { reactivated: true };
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify(upstream)));

    const result = await computeProxy("api/v1/substrates/my-brain/reactivate", {
      method: "POST",
      headers: { Authorization: "Bearer test-token" },
    });

    expect(result.ok).toBe(true);
    expect((result.data as { reactivated: boolean }).reactivated).toBe(true);
  });

  it("forwards POST rotate-key and returns job ID", async () => {
    const upstream = { jobId: "job-123", status: "pending" };
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify(upstream), 202));

    const result = await computeProxy("api/v1/substrates/my-brain/rotate-key", {
      method: "POST",
      headers: { Authorization: "Bearer test-token" },
    });

    expect(result.ok).toBe(true);
    expect((result.data as { jobId: string }).jobId).toBe("job-123");
  });

  it("forwards POST claim-key and returns API key (one-time)", async () => {
    const upstream = {
      claimed: true,
      substrateId: "uuid-1",
      slug: "my-brain",
      apiKeyPrefix: "mmpm_",
      apiKey: "mmpm_test-key-12345",
      warning: "Store this key securely — it will not be shown again.",
    };
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify(upstream)));

    const result = await computeProxy("api/v1/substrates/my-brain/claim-key", {
      method: "POST",
      headers: { Authorization: "Bearer test-token" },
    });

    expect(result.ok).toBe(true);
    expect((result.data as { claimed: boolean; apiKey: string }).claimed).toBe(true);
    expect((result.data as { apiKey: string }).apiKey).toBe("mmpm_test-key-12345");
  });

  it("forwards GET key-rotation/status", async () => {
    const upstream = { status: "none" };
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify(upstream)));

    const result = await computeProxy("api/v1/substrates/my-brain/key-rotation/status", {
      headers: { Authorization: "Bearer test-token" },
    });

    expect(result.ok).toBe(true);
    expect((result.data as { status: string }).status).toBe("none");
  });

  it("forwards POST deprovision", async () => {
    const upstream = {
      status: "deprovisioned",
      slug: "my-brain",
      message: "Substrate is being torn down. Your data will be retained for 30 days.",
    };
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify(upstream)));

    const result = await computeProxy("api/v1/substrates/my-brain/deprovision", {
      method: "POST",
      headers: { Authorization: "Bearer test-token" },
    });

    expect(result.ok).toBe(true);
    expect((result.data as { status: string }).status).toBe("deprovisioned");
  });

  it("forwards GET usage with live metrics", async () => {
    const upstream = {
      slug: "my-brain",
      tier: "indie",
      status: "running",
      atomsUsed: 1234,
      atomsLimit: 10000,
      bootstrapsUsed: 56,
      bootstrapsLimit: 1000,
      usageUnavailable: false,
    };
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify(upstream)));

    const result = await computeProxy("api/v1/substrates/my-brain/usage", {
      headers: { Authorization: "Bearer test-token" },
    });

    expect(result.ok).toBe(true);
    expect((result.data as { atomsUsed: number }).atomsUsed).toBe(1234);
  });
});

// ── Billing status with slug ────────────────────────────────────────────────

describe("substrates proxy — billing status with slug", () => {
  it("forwards billing status with slug query param", async () => {
    const upstream = {
      tier: "indie",
      status: "active",
      renewsAt: "2026-05-01T00:00:00Z",
      trialEndsAt: null,
      lastPaymentFailed: false,
      hasStripeCustomer: true,
      usageUnavailable: false,
      tierDisplay: {
        name: "Solo",
        atomsUsed: 1234,
        atomsLimit: 10000,
        bootstrapsUsed: 56,
        bootstrapsLimit: 1000,
      },
    };
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify(upstream)));

    const result = await computeProxy("api/v1/billing/status?slug=my-brain", {
      headers: { Authorization: "Bearer test-token" },
      label: "billing/status",
    });

    expect(result.ok).toBe(true);
    expect((result.data as { tier: string }).tier).toBe("indie");

    // Verify the fetch URL included the slug param
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("slug=my-brain");
  });
});

// ── Substrate checkout ──────────────────────────────────────────────────────

describe("substrates proxy — substrate checkout", () => {
  it("forwards POST substrate-checkout and returns Stripe session", async () => {
    const upstream = {
      sessionId: "cs_test_123",
      sessionUrl: "https://checkout.stripe.com/c/pay/cs_test_123",
      tier: "indie",
      amountCents: 900,
      limits: { maxAtoms: 10000, maxBootstrapsPerMonth: 1000 },
    };
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify(upstream)));

    const result = await computeProxy("api/v1/billing/substrate-checkout", {
      method: "POST",
      headers: { Authorization: "Bearer test-token" },
      body: { accountId: "account-123", tier: "indie" },
      label: "billing/substrate-checkout",
    });

    expect(result.ok).toBe(true);
    expect((result.data as { sessionUrl: string }).sessionUrl).toContain("stripe.com");
  });

  it("rejects invalid tier", async () => {
    fetchSpy.mockResolvedValueOnce(
      fakeResponse(
        JSON.stringify({ error: "Invalid tier: gold. Must be one of: free, indie, pro, team" }),
        400,
      ),
    );

    const result = await computeProxy("api/v1/billing/substrate-checkout", {
      method: "POST",
      body: { accountId: "account-123", tier: "gold" },
    });

    expect(result.ok).toBe(false);
    expect(result.upstreamStatus).toBe(400);
  });
});

// ── Error handling ──────────────────────────────────────────────────────────

describe("substrates proxy — error handling", () => {
  it("wraps network errors as 502 JSON", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await computeProxy("api/v1/substrates/my-brain", {
      headers: { Authorization: "Bearer test-token" },
    });

    expect(result.ok).toBe(false);
    expect(result.upstreamStatus).toBeNull();
    const body = await result.response.json();
    expect(body.error).toBe("upstream_error");
  });

  it("wraps HTML error pages (nginx 502) as 502 JSON", async () => {
    fetchSpy.mockResolvedValueOnce(fakeResponse("<html><body>502 Bad Gateway</body></html>", 502));

    const result = await computeProxy("api/v1/substrates/my-brain", {
      headers: { Authorization: "Bearer test-token" },
    });

    expect(result.ok).toBe(false);
    const body = await result.response.json();
    expect(body.error).toBe("upstream_error");
  });

  it("preserves 409 conflict errors for lifecycle guards", async () => {
    fetchSpy.mockResolvedValueOnce(
      fakeResponse(
        JSON.stringify({
          error: "substrate_not_reactivatable",
          message: "Substrate is in status 'deprovisioned' and can no longer be reactivated.",
        }),
        409,
      ),
    );

    const result = await computeProxy("api/v1/substrates/my-brain/reactivate", {
      method: "POST",
      headers: { Authorization: "Bearer test-token" },
    });

    expect(result.ok).toBe(false);
    expect(result.upstreamStatus).toBe(409);
    expect((result.data as { error: string }).error).toBe("substrate_not_reactivatable");
  });

  it("preserves 403 for active subscription guard on deprovision", async () => {
    fetchSpy.mockResolvedValueOnce(
      fakeResponse(
        JSON.stringify({
          error: "active_subscription",
          message: "Cancel your subscription first, then wait for the grace period to expire.",
        }),
        403,
      ),
    );

    const result = await computeProxy("api/v1/substrates/my-brain/deprovision", {
      method: "POST",
      headers: { Authorization: "Bearer test-token" },
    });

    expect(result.ok).toBe(false);
    expect(result.upstreamStatus).toBe(403);
    expect((result.data as { error: string }).error).toBe("active_subscription");
  });
});
