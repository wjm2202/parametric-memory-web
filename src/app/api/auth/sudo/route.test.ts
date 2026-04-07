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

function makeRequest(body?: Record<string, unknown>, { omitOrigin = false } = {}): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!omitOrigin) headers["Origin"] = "http://localhost:3000";
  return new NextRequest("http://localhost:3000/api/auth/sudo", {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/sudo", () => {
  it("returns 403 when Origin header is missing (CSRF)", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));

    const res = await POST(
      makeRequest({ action: "rotate_keys", totpCode: "123456" }, { omitOrigin: true }),
    );
    expect(res.status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 401 when no session cookie is present", async () => {
    mockCookies.mockResolvedValue(makeCookieStore());

    const res = await POST(makeRequest({ action: "rotate_keys", totpCode: "123456" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("unauthorized");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 when request body is invalid JSON", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));

    // Send a request with no body — json() will throw
    const req = new NextRequest("http://localhost:3000/api/auth/sudo", {
      method: "POST",
      headers: { Origin: "http://localhost:3000" },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_body");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("proxies to compute and returns sudoToken on success", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            sudoToken: "sudo_tok_xyz",
            expiresAt: "2026-04-07T12:00:00Z",
            action: "rotate_keys",
          }),
        ),
      headers: new Headers({ "Content-Type": "application/json" }),
    });

    const res = await POST(makeRequest({ action: "rotate_keys", totpCode: "123456" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sudoToken).toBe("sudo_tok_xyz");
    expect(body.action).toBe("rotate_keys");

    // Verify upstream call has Bearer auth and forwards the body
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/sudo"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sess_abc123",
          "Content-Type": "application/json",
        }),
      }),
    );

    const callArgs = mockFetch.mock.calls[0][1];
    const sentBody = JSON.parse(callArgs.body);
    expect(sentBody.action).toBe("rotate_keys");
    expect(sentBody.totpCode).toBe("123456");
  });

  it("forwards invalid_totp_code error from compute", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ error: "invalid_totp_code" })),
      headers: new Headers({ "Content-Type": "application/json" }),
    });

    const res = await POST(makeRequest({ action: "rotate_keys", totpCode: "000000" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("invalid_totp_code");
  });

  it("forwards cancel_subscription action correctly", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            sudoToken: "sudo_billing_tok",
            expiresAt: "2026-04-07T12:05:00Z",
            action: "cancel_subscription",
          }),
        ),
      headers: new Headers({ "Content-Type": "application/json" }),
    });

    const res = await POST(makeRequest({ action: "cancel_subscription", totpCode: "654321" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sudoToken).toBe("sudo_billing_tok");
    expect(body.action).toBe("cancel_subscription");
  });

  it("returns 502 when compute is unreachable", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await POST(makeRequest({ action: "rotate_keys", totpCode: "123456" }));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBe("upstream_error");
  });
});
