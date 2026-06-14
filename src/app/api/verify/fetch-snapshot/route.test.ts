import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Security regression tests for POST /api/verify/fetch-snapshot.
 *
 * CVE (2026-06-13): this PUBLIC route forwarded a caller-controlled
 * `redactValues` to the substrate's master-key-protected /admin/export-snapshot.
 * A stranger POSTing {"redactValues":false} could dump full plaintext memory +
 * audit log. Fix: redaction/audit are hard-coded server-side and the body is
 * ignored; a per-IP rate limit caps abuse.
 *
 * These tests lock that invariant: NO request body may ever cause plaintext or
 * the audit log to be requested upstream.
 */

// The route captures MMPM_API_KEY / MMPM_API_URL at module-eval time, so env
// must be set BEFORE the (dynamic) import. Static import would capture too early.
process.env.MMPM_API_KEY = "mmpm_live_testkey_0000000000000000000000000000";
process.env.MMPM_API_URL = "https://demo.substrate.test";

let POST: (req: NextRequest) => Promise<Response>;

const fetchSpy = vi.fn();

beforeAll(async () => {
  ({ POST } = await import("./route"));
});

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ formatVersion: "1.0.0", atoms: [] }),
    text: () => Promise.resolve("{}"),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  fetchSpy.mockReset();
});

/** Build a POST request with a JSON body and a unique client IP. */
function req(body: unknown, ip: string): NextRequest {
  return new NextRequest("https://parametric-memory.dev/api/verify/fetch-snapshot", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

/** Pull the export options the route forwarded to the substrate. */
function forwardedOpts(): { redactValues?: boolean; includeAudit?: boolean } {
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  const [, init] = fetchSpy.mock.calls[0];
  return JSON.parse((init as RequestInit).body as string);
}

describe("POST /api/verify/fetch-snapshot — redaction is non-negotiable", () => {
  it("forces redactValues:true even when caller sends false", async () => {
    const res = await POST(req({ redactValues: false }, "10.0.0.1"));
    expect(res.status).toBe(200);
    expect(forwardedOpts().redactValues).toBe(true);
  });

  it("forces includeAudit:false even when caller sends true", async () => {
    const res = await POST(req({ includeAudit: true }, "10.0.0.2"));
    expect(res.status).toBe(200);
    expect(forwardedOpts().includeAudit).toBe(false);
  });

  it("ignores the body entirely (redacted+no-audit on empty body too)", async () => {
    await POST(req({}, "10.0.0.3"));
    const opts = forwardedOpts();
    expect(opts.redactValues).toBe(true);
    expect(opts.includeAudit).toBe(false);
  });

  it("uses the configured substrate URL + Bearer master key server-side", async () => {
    await POST(req({ redactValues: false }, "10.0.0.4"));
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://demo.substrate.test/admin/export-snapshot");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: expect.stringMatching(/^Bearer mmpm_/),
    });
  });
});

describe("POST /api/verify/fetch-snapshot — abuse limiting", () => {
  it("rate-limits a single IP after the window ceiling (429)", async () => {
    const ip = "10.9.9.9";
    let last: Response | undefined;
    // 10 allowed, 11th blocked.
    for (let i = 0; i < 11; i++) {
      last = await POST(req({}, ip));
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("Retry-After")).toBe("60");
  });
});
