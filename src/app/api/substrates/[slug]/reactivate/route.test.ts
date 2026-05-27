/**
 * Tests for POST /api/substrates/:slug/reactivate — E2 BFF.
 * Mirrors the cancel-route tests; happy path + auth + CSRF + error coverage.
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
  return new NextRequest(`http://localhost:3000/api/substrates/${slug}/reactivate`, {
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

describe("POST /api/substrates/:slug/reactivate", () => {
  it("returns 403 when no Origin header is present (CSRF)", async () => {
    mockCookies.mockResolvedValue(cookieStore("sess_abc"));
    const res = await POST(makeRequest("x", false), makeParams("x"));
    expect(res.status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 401 when no session cookie is present", async () => {
    mockCookies.mockResolvedValue(cookieStore());
    const res = await POST(makeRequest("x"), makeParams("x"));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe("unauthorized");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("proxies POST to the slug-scoped compute endpoint and returns reactivated:true", async () => {
    mockCookies.mockResolvedValue(cookieStore("sess_abc"));
    mockFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ reactivated: true })),
    });

    const res = await POST(makeRequest("spicy-tortoise"), makeParams("spicy-tortoise"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reactivated).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/substrates/spicy-tortoise/reactivate"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sess_abc" }),
      }),
    );
  });

  it("forwards 404 substrate_not_found verbatim", async () => {
    mockCookies.mockResolvedValue(cookieStore("sess_abc"));
    mockFetch.mockResolvedValue({
      status: 404,
      text: () => Promise.resolve(JSON.stringify({ error: "substrate_not_found" })),
    });
    const res = await POST(makeRequest("nope"), makeParams("nope"));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe("substrate_not_found");
  });

  it("remaps a compute 5xx to 502 (computeProxy M-0A guard)", async () => {
    mockCookies.mockResolvedValue(cookieStore("sess_abc"));
    mockFetch.mockResolvedValue({
      status: 500,
      text: () => Promise.resolve(JSON.stringify({ error: "reactivation_failed" })),
    });
    const res = await POST(makeRequest("x"), makeParams("x"));
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.error).toBe("reactivation_failed");
  });
});
