/**
 * Tests for POST /api/substrates/:slug/cancel — E1 BFF.
 *
 * Covers:
 *   1. CSRF — request with no Origin → 403, never calls compute.
 *   2. No session cookie → 401, never calls compute.
 *   3. Happy path → forwards POST to slug-scoped compute endpoint.
 *   4. Compute 404 (slug not owned) → forwarded verbatim.
 *   5. Compute 500 → 500 forwarded.
 *   6. Compute unreachable → 502 upstream_error.
 *
 * The csrf-wiring.test.ts file separately covers CSRF for every mutating
 * BFF in one place; the test here is the per-route deep-coverage check.
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

function cookieStore(token?: string) {
  return {
    get: (name: string) => (name === "mmpm_session" && token ? { value: token } : undefined),
  };
}

function makeRequest(slug: string, withOrigin = true): NextRequest {
  return new NextRequest(`http://localhost:3000/api/substrates/${slug}/cancel`, {
    method: "POST",
    headers: withOrigin
      ? { "Content-Type": "application/json", Origin: "http://localhost:3000" }
      : { "Content-Type": "application/json" },
  });
}

function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/substrates/:slug/cancel", () => {
  it("returns 403 when no Origin header is present (CSRF)", async () => {
    mockCookies.mockResolvedValue(cookieStore("sess_abc"));
    const res = await POST(
      makeRequest("alice-one", /* withOrigin */ false),
      makeParams("alice-one"),
    );
    expect(res.status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 401 when no session cookie is present", async () => {
    mockCookies.mockResolvedValue(cookieStore());
    const res = await POST(makeRequest("alice-one"), makeParams("alice-one"));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe("unauthorized");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("proxies POST to the slug-scoped compute endpoint and returns the cancelAt payload", async () => {
    mockCookies.mockResolvedValue(cookieStore("sess_abc"));
    mockFetch.mockResolvedValue({
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            scheduled: true,
            cancelAt: "2026-06-14T00:00:00.000Z",
          }),
        ),
    });

    const res = await POST(makeRequest("spicy-tortoise"), makeParams("spicy-tortoise"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.scheduled).toBe(true);
    expect(body.cancelAt).toBe("2026-06-14T00:00:00.000Z");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/substrates/spicy-tortoise/cancel"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sess_abc" }),
      }),
    );
  });

  it("forwards a compute 404 (slug not owned) verbatim", async () => {
    mockCookies.mockResolvedValue(cookieStore("sess_abc"));
    mockFetch.mockResolvedValue({
      status: 404,
      text: () => Promise.resolve(JSON.stringify({ error: "substrate_not_found" })),
    });
    const res = await POST(makeRequest("not-mine"), makeParams("not-mine"));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe("substrate_not_found");
  });

  it("remaps a compute 5xx to 502 but forwards the JSON body (M-0A nginx-HTML-leak guard)", async () => {
    // compute-proxy.ts:226 remaps all 5xx to 502 to prevent nginx HTML error
    // pages reaching the client. The JSON body from compute is preserved so
    // the client can still see the underlying error code.
    mockCookies.mockResolvedValue(cookieStore("sess_abc"));
    mockFetch.mockResolvedValue({
      status: 500,
      text: () => Promise.resolve(JSON.stringify({ error: "cancellation_failed" })),
    });
    const res = await POST(makeRequest("alice-one"), makeParams("alice-one"));
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.error).toBe("cancellation_failed");
  });

  it("returns 502 upstream_error when compute is unreachable", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCookies.mockResolvedValue(cookieStore("sess_abc"));
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await POST(makeRequest("alice-one"), makeParams("alice-one"));
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.error).toBe("upstream_error");
    errSpy.mockRestore();
  });
});
