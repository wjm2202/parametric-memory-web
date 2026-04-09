import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────────────
// Mock next/headers before importing the route
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

// Mock global fetch for upstream proxy calls
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
  return new NextRequest("http://localhost:3000/api/my-substrate/rotate-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/my-substrate/rotate-key", () => {
  it("returns 401 when no session cookie is present", async () => {
    mockCookies.mockResolvedValue(makeCookieStore());

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("unauthorized");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("proxies POST to compute and returns jobId on success", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ jobId: "job_xyz", status: "pending" })),
      headers: new Headers({ "Content-Type": "application/json" }),
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.jobId).toBe("job_xyz");
    expect(body.status).toBe("pending");

    // Verify it called the correct upstream URL with Bearer auth
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/my-substrate/rotate-key"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sess_abc123",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("forwards 429 rate-limit responses from compute", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 429,
      text: () => Promise.resolve(JSON.stringify({ error: "Rate limit: 1 rotation per hour" })),
      headers: new Headers({ "Content-Type": "application/json" }),
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toContain("Rate limit");
  });

  it("returns 502 when compute is unreachable", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBe("upstream_error");
  });

  it("handles empty body gracefully", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ jobId: "job_empty", status: "pending" })),
      headers: new Headers({ "Content-Type": "application/json" }),
    });

    const req = new NextRequest("http://localhost:3000/api/my-substrate/rotate-key", {
      method: "POST",
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.jobId).toBe("job_empty");
  });
});
