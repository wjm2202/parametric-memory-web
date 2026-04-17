/**
 * Tests for GET /api/billing/upgrade-options — session-auth proxy to
 *   compute:/api/v1/billing/upgrade-options?substrateSlug=<slug>
 *
 * Covers:
 *   1. No session cookie → 401, never calls compute.
 *   2. Happy path → 200 list of upgrade options forwarded transparently.
 *   3. substrateSlug query param is forwarded to compute verbatim.
 *   4. No substrateSlug query — compute returns 400, proxy forwards it.
 *   5. Compute 401 (session expired) → forwarded as 401.
 *   6. Compute 404 (substrate not found) → forwarded as 404.
 *   7. Compute unreachable → 502.
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

/**
 * Minimal NextRequest stand-in. The route only reads
 * `request.nextUrl.searchParams.get("substrateSlug")`, so we only need that
 * shape.
 */
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

  it("proxies to compute and returns the upgrade-options list", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));

    const upstream = {
      currentTier: "starter",
      options: [
        {
          tier: "indie",
          displayName: "Solo",
          monthlyCents: 900,
          prorationCents: 200,
          nextBillingDate: "2026-05-17T00:00:00Z",
          transitionKind: "shared_to_shared",
          warnings: [],
        },
        {
          tier: "pro",
          displayName: "Professional",
          monthlyCents: 2900,
          prorationCents: 633,
          nextBillingDate: "2026-05-17T00:00:00Z",
          transitionKind: "shared_to_dedicated",
          warnings: [
            { code: "dedicated_migration", message: "We'll provision a private droplet…" },
          ],
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
    expect(body.currentTier).toBe("starter");
    expect(body.options).toHaveLength(2);
    expect(body.options[1].warnings[0].code).toBe("dedicated_migration");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/billing/upgrade-options?substrateSlug=bold-junction"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sess_abc123" }),
        cache: "no-store",
      }),
    );
  });

  it("URL-encodes unusual substrateSlug values", async () => {
    // Substrate slugs should be kebab-case but defend against odd inputs.
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ currentTier: "free", options: [] })),
    });

    await GET(makeReq("weird slug/with?chars"));

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("substrateSlug=weird%20slug%2Fwith%3Fchars"),
      expect.any(Object),
    );
  });

  it("forwards compute's 400 when substrateSlug is missing", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 400,
      text: () => Promise.resolve(JSON.stringify({ error: "substrateSlug_required" })),
    });

    const res = await GET(makeReq(/* no slug */));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("substrateSlug_required");
    // When slug is missing we don't append the query string — compute decides.
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/billing\/upgrade-options$/),
      expect.any(Object),
    );
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
    // that's intended ops signal in prod. In tests the log leaks into vitest
    // output and clutters `npm run preflight` logs, so silence it here while
    // still verifying the alarm fired.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await GET(makeReq("bold-junction"));
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
