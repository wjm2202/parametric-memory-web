import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

/**
 * Regression tests for GET /api/capacity proxy.
 *
 * BUG (M-0A): In production, compute's nginx returns HTML 502/504 pages when
 * the Express process is unhealthy. The original proxy forwarded this HTML
 * with Content-Type: text/html, causing JSON.parse failures in the pricing
 * page. The fix validates JSON before forwarding and fails open on any error.
 *
 * These tests ensure the proxy ALWAYS returns parseable JSON with the correct
 * tier structure, regardless of what compute/nginx returns.
 */

// Shape of a single tier in the fail-open response
const FAIL_OPEN_TIER = {
  available: true,
  status: "open",
  fillPct: null,
  slotsRemaining: null,
  message: null,
};

// ---------- fetch mock ----------
const fetchSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------- helpers ----------

/** Build a minimal Response-like object that the route's fetch() returns. */
function fakeResponse(
  body: string,
  status = 200,
  contentType = "application/json",
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
    headers: new Headers({ "Content-Type": contentType }),
  };
}

/** Assert that a response body is the fail-open shape with all tiers open. */
async function expectFailOpen(res: Response) {
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toContain("application/json");
  expect(res.headers.get("Cache-Control")).toBe("no-store");

  const body = await res.json();
  expect(body.tiers.indie).toMatchObject(FAIL_OPEN_TIER);
  expect(body.tiers.pro).toMatchObject(FAIL_OPEN_TIER);
  expect(body.tiers.team).toMatchObject(FAIL_OPEN_TIER);
  expect(body).toHaveProperty("cachedAt");
  return body;
}

// ---------- tests ----------

describe("GET /api/capacity", () => {
  // ── Happy path ──────────────────────────────────────────────────────────

  it("passes through valid JSON from compute", async () => {
    const upstream = {
      tiers: {
        indie: {
          available: true,
          status: "open",
          fillPct: 42,
          slotsRemaining: 8,
          message: null,
        },
        pro: {
          available: true,
          status: "open",
          fillPct: 10,
          slotsRemaining: 20,
          message: null,
        },
        team: {
          available: true,
          status: "open",
          fillPct: 0,
          slotsRemaining: null,
          message: null,
        },
      },
      cachedAt: "2026-04-09T12:00:00.000Z",
    };
    fetchSpy.mockResolvedValueOnce(fakeResponse(JSON.stringify(upstream)));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(body.tiers.indie.fillPct).toBe(42);
    expect(body.tiers.pro.slotsRemaining).toBe(20);
  });

  // ── M-0A regression: the exact production bug ───────────────────────────

  it("REGRESSION M-0A: nginx 502 HTML page is NOT forwarded as JSON", async () => {
    // This is the exact failure mode from production: compute's nginx returns
    // an HTML 502 page when Express is down, and the proxy used to forward it
    // with Content-Type: text/html. The pricing page then failed on JSON.parse.
    const nginxHtml = [
      "<html>",
      "<head><title>502 Bad Gateway</title></head>",
      "<body>",
      "<center><h1>502 Bad Gateway</h1></center>",
      "<hr><center>nginx/1.24.0 (Ubuntu)</center>",
      "</body>",
      "</html>",
    ].join("\n");

    fetchSpy.mockResolvedValueOnce(fakeResponse(nginxHtml, 502, "text/html"));

    const res = await GET();
    // Must NOT forward HTML. Must return valid JSON with fail-open tiers.
    await expectFailOpen(res);
  });

  it("REGRESSION M-0A: 200 with HTML body is caught (nginx misconfiguration)", async () => {
    // Edge case: nginx returns 200 but with an HTML body (possible in some
    // misconfigurations where nginx serves a cached error page as 200).
    const html = "<html><body><h1>Service Unavailable</h1></body></html>";
    fetchSpy.mockResolvedValueOnce(fakeResponse(html, 200, "text/html"));

    await expectFailOpen(await GET());
  });

  // ── Other failure modes ─────────────────────────────────────────────────

  it("returns fail-open when compute returns an empty body", async () => {
    fetchSpy.mockResolvedValueOnce(fakeResponse("", 200));
    await expectFailOpen(await GET());
  });

  it("returns fail-open when compute returns 500 JSON error", async () => {
    // Compute's Express handler returns 500 with JSON (not nginx)
    const errJson = JSON.stringify({
      error: "Capacity check temporarily unavailable.",
    });
    fetchSpy.mockResolvedValueOnce(fakeResponse(errJson, 500));
    await expectFailOpen(await GET());
  });

  it("returns fail-open when compute is unreachable (network error)", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expectFailOpen(await GET());
  });

  it("returns fail-open on fetch timeout", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("network timeout at: https://memory.kiwi"));
    await expectFailOpen(await GET());
  });

  // ── Contract: pricing page compatibility ────────────────────────────────

  it("fail-open response is parseable by PricingCardClient", async () => {
    // PricingCardClient does: data.tiers?.[tierId]?.status ?? "open"
    fetchSpy.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const res = await GET();
    const data = await res.json();

    for (const tierId of ["indie", "pro", "team"] as const) {
      const tierData = data.tiers?.[tierId];
      expect(tierData).toBeDefined();
      expect(tierData.status).toBe("open");
      expect(tierData.available).toBe(true);
      expect(tierData.slotsRemaining).toBeNull();
      expect(tierData.message).toBeNull();
    }
  });

  it("always returns Content-Type application/json, never text/html", async () => {
    // The core invariant: no matter what upstream sends, we return JSON.
    fetchSpy.mockResolvedValueOnce(
      fakeResponse("<html>anything</html>", 200, "text/html"),
    );

    const res = await GET();
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Content-Type")).not.toContain("text/html");
  });
});
