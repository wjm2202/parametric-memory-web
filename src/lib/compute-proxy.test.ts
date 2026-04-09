import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeProxy } from "./compute-proxy";

/**
 * Tests for the shared compute proxy utility.
 *
 * These tests enforce the contract: computeProxy ALWAYS returns valid JSON
 * in the NextResponse, regardless of what upstream (compute + nginx) sends.
 *
 * Every route that proxies to compute uses this utility. If these tests pass,
 * the M-0A class of bug (HTML forwarded as JSON) is structurally impossible.
 */

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function fakeResponse(body: string, status = 200, contentType = "application/json") {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
    headers: new Headers({ "Content-Type": contentType }),
  };
}

async function parseResponse(res: Response): Promise<unknown> {
  return res.json();
}

// ── Happy path ───────────────────────────────────────────────────────────────

describe("computeProxy — valid JSON upstream", () => {
  it("forwards valid JSON with 200 status", async () => {
    const upstream = { tier: "indie", status: "active" };
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify(upstream)));

    const result = await computeProxy("api/v1/billing/status");

    expect(result.ok).toBe(true);
    expect(result.upstreamStatus).toBe(200);
    expect(result.data).toEqual(upstream);
    expect(result.response.status).toBe(200);

    const body = await parseResponse(result.response);
    expect(body).toEqual(upstream);
  });

  it("preserves 4xx status for semantic errors", async () => {
    const error = { error: "not_found", message: "Substrate not found" };
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify(error), 404));

    const result = await computeProxy("api/v1/my-substrate");

    expect(result.ok).toBe(false);
    expect(result.upstreamStatus).toBe(404);
    expect(result.response.status).toBe(404);
    expect(result.data).toEqual(error);
  });

  it("preserves 401 status for auth errors", async () => {
    const error = { error: "unauthorized" };
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify(error), 401));

    const result = await computeProxy("api/v1/billing/status");

    expect(result.response.status).toBe(401);
    expect(result.data).toEqual(error);
  });

  it("sends body for POST requests", async () => {
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify({ ok: true })));

    await computeProxy("api/v1/my-substrate/rotate-key", {
      method: "POST",
      body: { action: "rotate_keys" },
      headers: { Authorization: "Bearer session123" },
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ action: "rotate_keys" });
    expect(init.headers).toMatchObject({ Authorization: "Bearer session123" });
  });
});

// ── M-0A regression: non-JSON upstream ───────────────────────────────────────

describe("computeProxy — non-JSON upstream (M-0A regression)", () => {
  it("returns 502 JSON when nginx sends HTML 502 page", async () => {
    const html =
      "<html><head><title>502 Bad Gateway</title></head><body><h1>502 Bad Gateway</h1></body></html>";
    fetchSpy.mockResolvedValueOnce(fakeResponse(html, 502, "text/html"));

    const result = await computeProxy("api/v1/capacity", { label: "capacity" });

    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.response.status).toBe(502);
    expect(result.response.headers.get("Content-Type")).toContain("application/json");

    const body = await parseResponse(result.response);
    expect(body).toHaveProperty("error", "upstream_error");
  });

  it("returns 502 JSON when upstream returns empty body", async () => {
    fetchSpy.mockResolvedValueOnce(fakeResponse("", 200));

    const result = await computeProxy("api/v1/capacity");

    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.response.status).toBe(502);

    const body = await parseResponse(result.response);
    expect(body).toHaveProperty("error", "upstream_error");
  });

  it("returns 502 JSON when upstream returns 200 with HTML (nginx misconfig)", async () => {
    fetchSpy.mockResolvedValueOnce(
      fakeResponse("<html>Service Unavailable</html>", 200, "text/html"),
    );

    const result = await computeProxy("api/v1/billing/status");

    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(502);
    expect(result.response.headers.get("Content-Type")).toContain("application/json");
  });

  it("remaps 500 status to 502 (upstream server error)", async () => {
    const error = { error: "internal" };
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify(error), 500));

    const result = await computeProxy("api/v1/capacity");

    expect(result.response.status).toBe(502);
    expect(result.data).toEqual(error);
  });
});

// ── Network failures ─────────────────────────────────────────────────────────

describe("computeProxy — network failures", () => {
  it("returns 502 JSON when compute is unreachable", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await computeProxy("api/v1/capacity");

    expect(result.ok).toBe(false);
    expect(result.upstreamStatus).toBeNull();
    expect(result.response.status).toBe(502);

    const body = await parseResponse(result.response);
    expect(body).toHaveProperty("error", "upstream_error");
    expect(body).toHaveProperty("message", "Failed to reach compute service");
  });

  it("returns 502 JSON on DNS failure", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND memory.kiwi"));

    const result = await computeProxy("api/v1/billing/status");

    expect(result.response.status).toBe(502);
    expect(result.response.headers.get("Content-Type")).toContain("application/json");
  });

  it("returns 502 JSON on fetch timeout", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("network timeout"));

    const result = await computeProxy("api/v1/my-substrate");

    expect(result.response.status).toBe(502);
  });
});

// ── Header forwarding ────────────────────────────────────────────────────────

describe("computeProxy — header forwarding", () => {
  it("forwards specified headers from upstream response", async () => {
    const res = fakeResponse(JSON.stringify({ ok: true }));
    res.headers.set("X-RateLimit-Limit", "100");
    res.headers.set("X-RateLimit-Remaining", "42");
    fetchSpy.mockResolvedValueOnce(res);

    const result = await computeProxy("api/auth/request-link", {
      method: "POST",
      forwardHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    });

    expect(result.response.headers.get("X-RateLimit-Limit")).toBe("100");
    expect(result.response.headers.get("X-RateLimit-Remaining")).toBe("42");
    // X-RateLimit-Reset was not present upstream, so it should not be set
    expect(result.response.headers.get("X-RateLimit-Reset")).toBeNull();
  });
});

// ── Contract: Content-Type is ALWAYS application/json ────────────────────────

describe("computeProxy — Content-Type invariant", () => {
  const scenarios = [
    {
      name: "valid JSON 200",
      setup: () => fetchSpy.mockResolvedValueOnce(fakeResponse('{"ok":true}')),
    },
    {
      name: "HTML 502",
      setup: () =>
        fetchSpy.mockResolvedValueOnce(fakeResponse("<html>502</html>", 502, "text/html")),
    },
    { name: "empty body", setup: () => fetchSpy.mockResolvedValueOnce(fakeResponse("", 200)) },
    {
      name: "network error",
      setup: () => fetchSpy.mockRejectedValueOnce(new Error("ECONNREFUSED")),
    },
    {
      name: "JSON 404",
      setup: () => fetchSpy.mockResolvedValueOnce(fakeResponse('{"error":"not_found"}', 404)),
    },
    {
      name: "JSON 500",
      setup: () => fetchSpy.mockResolvedValueOnce(fakeResponse('{"error":"internal"}', 500)),
    },
  ];

  for (const { name, setup } of scenarios) {
    it(`returns application/json for: ${name}`, async () => {
      setup();
      const result = await computeProxy("api/v1/test");
      expect(result.response.headers.get("Content-Type")).toContain("application/json");
    });
  }
});
