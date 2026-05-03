/**
 * Tests for GET /api/billing/upgrade-options — session-auth proxy to
 *   compute:/api/v1/substrates/:slug/upgrade/tiers
 *
 * Covers:
 *   1. No session cookie → 401, never calls compute.
 *   2. No substrateSlug → 400, never calls compute (slug is part of path).
 *   3. Happy path → compute's response is TRANSFORMED to the dashboard's
 *      legacy shape (availableUpgrades→options, transitionType→
 *      transitionKind, snake-case limits → camelCase limits, prorations
 *      zeroed because they come from a separate /upgrade/preview call).
 *   4. substrateSlug is URL-encoded into the path segment.
 *   5. Malformed compute body (missing fields) → forward verbatim, the
 *      dashboard's error path renders "couldn't load options".
 *   6. Compute 401 (session expired) → forwarded as 401.
 *   7. Compute 404 (substrate not found) → forwarded as 404.
 *   8. Compute unreachable → 502.
 *
 * Pattern mirrors src/app/api/billing/status/route.test.ts so the two proxy
 * tests look alike for anyone reading them side-by-side.
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

function makeReq(substrateSlug?: string): NextRequest {
  const params = new URLSearchParams();
  if (substrateSlug) params.set("substrateSlug", substrateSlug);
  return { nextUrl: { searchParams: params } } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/billing/upgrade-options", () => {
  it("returns 401 when no session cookie is present — never calls compute", async () => {
    mockCookies.mockResolvedValue(makeCookieStore());

    const res = await GET(makeReq("bold-junction"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("unauthorized");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 directly when substrateSlug is missing — never calls compute", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));

    const res = await GET(makeReq(/* no slug */));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("substrateSlug_required");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("transforms compute's response to the dashboard's shape", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));

    // Compute's canonical shape (src/api/substrates/upgrade-handlers.ts).
    const upstream = {
      currentTier: "starter",
      availableUpgrades: [
        {
          tier: "indie",
          name: "Solo",
          description: "For solo developers",
          amountCents: 900,
          hostingModel: "shared",
          limits: { maxAtoms: 10000, maxBootstrapsPerMonth: 1000, maxStorageMB: 500 },
          transitionType: "shared_to_shared",
        },
        {
          tier: "pro",
          name: "Professional",
          description: "Dedicated tier",
          amountCents: 2900,
          hostingModel: "dedicated",
          limits: { maxAtoms: 100000, maxBootstrapsPerMonth: 10000, maxStorageMB: 5000 },
          transitionType: "shared_to_dedicated",
        },
      ],
    };

    mockFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify(upstream)),
    });

    const res = await GET(makeReq("bold-junction"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      currentTier: "starter",
      options: [
        {
          tier: "indie",
          name: "Solo",
          amountCents: 900,
          hostingModel: "shared",
          transitionKind: "shared_to_shared",
          estimatedProrationCents: 0,
          limits: { maxAtoms: 10000, maxBootstrapsMonth: 1000, maxStorageMb: 500 },
        },
        {
          tier: "pro",
          name: "Professional",
          amountCents: 2900,
          hostingModel: "dedicated",
          transitionKind: "shared_to_dedicated",
          estimatedProrationCents: 0,
          limits: { maxAtoms: 100000, maxBootstrapsMonth: 10000, maxStorageMb: 5000 },
        },
      ],
    });

    // Path: slug-scoped substrate route, not the legacy /api/v1/billing path.
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/substrates/bold-junction/upgrade/tiers"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sess_abc123" }),
        cache: "no-store",
      }),
    );
  });

  it("URL-encodes unusual substrateSlug values into the path segment", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ currentTier: "free", availableUpgrades: [] })),
    });

    await GET(makeReq("weird slug/with?chars"));

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/substrates/weird%20slug%2Fwith%3Fchars/upgrade/tiers"),
      expect.any(Object),
    );
  });

  it("forwards a malformed compute body verbatim — no transform", async () => {
    // Defensive: if compute drops `availableUpgrades` (e.g. shape drift from
    // a future refactor), we don't synthesize a fake `options: []` because
    // that masks the regression. The dashboard's error branch will fire.
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ currentTier: "starter" })),
    });

    const res = await GET(makeReq("bold-junction"));
    const body = await res.json();

    // Pass-through, not transformed.
    expect(body).not.toHaveProperty("options");
    expect(body).toEqual({ currentTier: "starter" });
  });

  it("forwards 401 when compute rejects the session as expired", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_stale"));
    mockFetch.mockResolvedValue({
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ error: "Authentication required" })),
    });

    const res = await GET(makeReq("bold-junction"));
    expect(res.status).toBe(401);
  });

  it("forwards 404 when compute reports the substrate is not found", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 404,
      text: () => Promise.resolve(JSON.stringify({ error: "substrate_not_found" })),
    });

    const res = await GET(makeReq("bold-junction"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("substrate_not_found");
  });

  it("returns 502 when compute is unreachable", async () => {
    // compute-proxy.ts logs a diagnostic console.error on network failure —
    // that's intended ops signal in prod. Silence it here so `npm run
    // preflight` doesn't paint its output amber while still asserting the
    // alarm actually fired.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await GET(makeReq("bold-junction"));
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
