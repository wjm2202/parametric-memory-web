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
  // compute-proxy.ts intentionally emits console.error on network/parse
  // failures — that's the prod ops signal. Silence it in tests so the log
  // noise doesn't clutter `npm run preflight` output. afterEach's
  // restoreAllMocks brings console.error back between tests.
  vi.spyOn(console, "error").mockImplementation(() => {});
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

// ── SPRINT-11.H1: X-Forwarded-For pass-through ───────────────────────────────

describe("computeProxy — X-Forwarded-For forwarding (SPRINT-11.H1)", () => {
  /**
   * Build a minimal stand-in for `NextRequest` shaped just enough for
   * computeProxy to read the inbound XFF / X-Real-IP. Using a real Headers
   * object keeps the contract honest — Headers#get is the only surface the
   * proxy is allowed to touch.
   */
  function inboundWith(headers: Record<string, string>): { headers: Headers } {
    return { headers: new Headers(headers) };
  }

  it("forwards the inbound X-Forwarded-For chain verbatim", async () => {
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify({ ok: true })));

    await computeProxy("api/auth/request-link", {
      method: "POST",
      body: { email: "user@example.com" },
      inbound: inboundWith({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers).toMatchObject({
      "X-Forwarded-For": "203.0.113.7, 10.0.0.1",
    });
  });

  it("falls back to X-Real-IP when X-Forwarded-For is absent", async () => {
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify({ ok: true })));

    await computeProxy("api/auth/request-link", {
      method: "POST",
      inbound: inboundWith({ "x-real-ip": "203.0.113.42" }),
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers).toMatchObject({
      "X-Forwarded-For": "203.0.113.42",
      "X-Real-IP": "203.0.113.42",
    });
  });

  it("does NOT overwrite an existing X-Forwarded-For chain with X-Real-IP", async () => {
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify({ ok: true })));

    await computeProxy("api/auth/request-link", {
      method: "POST",
      inbound: inboundWith({
        "x-forwarded-for": "203.0.113.7, 10.0.0.1",
        "x-real-ip": "10.0.0.99",
      }),
    });

    const [, init] = fetchSpy.mock.calls[0];
    // The chain wins over X-Real-IP — nginx already authored the chain we trust.
    expect(init.headers["X-Forwarded-For"]).toBe("203.0.113.7, 10.0.0.1");
    // X-Real-IP is still passed through unchanged so compute can correlate
    // logs, but it must NOT replace the chain.
    expect(init.headers["X-Real-IP"]).toBe("10.0.0.99");
  });

  it("omits X-Forwarded-For entirely when neither inbound header is present", async () => {
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify({ ok: true })));

    await computeProxy("api/auth/request-link", {
      method: "POST",
      inbound: inboundWith({}),
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers).not.toHaveProperty("X-Forwarded-For");
    expect(init.headers).not.toHaveProperty("X-Real-IP");
  });

  it("omits X-Forwarded-For when no inbound request is supplied (back-compat)", async () => {
    // Existing callers that don't pass `inbound` MUST keep working — we
    // don't want to break every non-auth route that proxies to compute.
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify({ ok: true })));

    await computeProxy("api/v1/billing/status");

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers).not.toHaveProperty("X-Forwarded-For");
    expect(init.headers).not.toHaveProperty("X-Real-IP");
  });

  it("explicit `headers` opts override forwarded XFF (caller-final wins)", async () => {
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify({ ok: true })));

    await computeProxy("api/auth/request-link", {
      method: "POST",
      inbound: inboundWith({ "x-forwarded-for": "203.0.113.7" }),
      // Last-write-wins semantics in the spread inside computeProxy. This
      // pins that contract — a future refactor flipping the order would be
      // a real behavioural change and should fail this test.
      headers: { "X-Forwarded-For": "0.0.0.0" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers["X-Forwarded-For"]).toBe("0.0.0.0");
  });

  // ─── SPRINT-11.L2: Sec-Fetch-Site forwarding ────────────────────────────
  //
  // Compute uses `Sec-Fetch-Site: same-origin` to gate `attemptsRemaining`
  // disclosure on TOTP login-verify failures. The BFF must forward the
  // header verbatim so a browser-initiated request reaches compute with
  // the value preserved; non-browser callers (curl, scripts) don't set
  // the header, so compute sees nothing and omits the field.

  it("SPRINT-11.L2: forwards inbound Sec-Fetch-Site verbatim", async () => {
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify({ ok: true })));

    await computeProxy("api/auth/factors/totp/login-verify", {
      method: "POST",
      body: { pendingToken: "x", code: "000000" },
      inbound: inboundWith({ "sec-fetch-site": "same-origin" }),
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers["Sec-Fetch-Site"]).toBe("same-origin");
  });

  it("SPRINT-11.L2: forwards non-same-origin values unchanged (no whitelisting at the BFF)", async () => {
    // The BFF is dumb-pipe — it doesn't decide which values are 'safe'.
    // Compute owns the same-origin gate. The BFF's job is forward-verbatim
    // so a hypothetical cross-site call from a misconfigured embed would
    // STILL reach compute as "cross-site", which compute then refuses to
    // unlock attemptsRemaining for. Pinning the verbatim contract.
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify({ ok: true })));

    await computeProxy("api/auth/factors/totp/login-verify", {
      method: "POST",
      inbound: inboundWith({ "sec-fetch-site": "cross-site" }),
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers["Sec-Fetch-Site"]).toBe("cross-site");
  });

  it("SPRINT-11.L2: omits Sec-Fetch-Site when inbound has none", async () => {
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify({ ok: true })));

    await computeProxy("api/auth/factors/totp/login-verify", {
      method: "POST",
      inbound: inboundWith({}),
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers).not.toHaveProperty("Sec-Fetch-Site");
  });
});
