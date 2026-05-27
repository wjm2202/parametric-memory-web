/**
 * Tests for GET /api/checkout/session/:id — D4 BFF proxy.
 *
 * Covers:
 *   1. No session cookie → 401, never calls compute.
 *   2. Empty id param → 400, never calls compute.
 *   3. Happy path → forwards GET to compute and pipes the response through.
 *   4. Compute 404 → forwarded verbatim (no-leak posture for ownership
 *      mismatch + Stripe resource_missing).
 *   5. Compute unreachable → 502 upstream_error.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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

// GET has no body. NextRequest construction is the same as POST minus body.
function makeRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/checkout/session/${id}`);
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/checkout/session/:id", () => {
  it("returns 401 when no session cookie is present", async () => {
    mockCookies.mockResolvedValue(makeCookieStore());
    const res = await GET(makeRequest("cs_test_1"), makeParams("cs_test_1"));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe("unauthorized");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 when the id param is empty", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc"));
    const res = await GET(makeRequest(""), makeParams(""));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_session_id");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("proxies the GET to compute and forwards the payload on 200", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc"));
    const computePayload = {
      status: "complete",
      customerEmail: "jane@example.com",
      tier: "indie",
      substrateId: "subst_001",
      substrateSlug: "spicy-tortoise",
      substrateStatus: "running",
    };
    mockFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify(computePayload)),
    });

    const res = await GET(makeRequest("cs_test_2"), makeParams("cs_test_2"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(computePayload);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/checkout/session/cs_test_2"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer sess_abc" }),
      }),
    );
  });

  it("forwards 404 verbatim (no-leak posture for ownership/resource_missing)", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc"));
    mockFetch.mockResolvedValue({
      status: 404,
      text: () => Promise.resolve(JSON.stringify({ error: "session_not_found" })),
    });

    const res = await GET(makeRequest("cs_missing"), makeParams("cs_missing"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("session_not_found");
  });

  it("returns 502 when compute is unreachable", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc"));
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await GET(makeRequest("cs_dead"), makeParams("cs_dead"));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBe("upstream_error");
    errSpy.mockRestore();
  });
});
