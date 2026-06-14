import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Security regression tests for the /api/compute/[...path] BFF proxy.
 *
 * Bug (F-4, 2026-06-13): the catch-all forwarded to mmpm-compute even with NO
 * session cookie (authHeaders(undefined) → no Authorization header), unlike its
 * /api/substrate(s) siblings which 401. These tests lock the session guard:
 * a missing cookie must 401 and must NOT issue an upstream fetch.
 *
 * CSRF is mocked to "pass" here so the tests isolate the session guard; the
 * CSRF wiring itself is covered by csrf-wiring.test.ts (no-origin/cross-origin
 * → 403, which fires BEFORE the session guard on POST/DELETE).
 */

let sessionValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "mmpm_session" && sessionValue ? { value: sessionValue } : undefined,
  })),
}));

vi.mock("@/lib/csrf", () => ({
  verifyCsrfOrigin: vi.fn(() => null), // CSRF passes; session guard under test
}));

import { GET, POST, DELETE } from "./route";

const fetchSpy = vi.fn();

beforeEach(() => {
  sessionValue = undefined;
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify({ ok: true })),
    headers: new Headers({ "Content-Type": "application/json" }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  fetchSpy.mockReset();
});

function req(method: string, path = "instances"): NextRequest {
  return new NextRequest(`https://parametric-memory.dev/api/compute/${path}`, { method });
}
const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });

describe("/api/compute/[...path] — session guard (F-4)", () => {
  it("GET without a session → 401 and NO upstream fetch", async () => {
    const res = await GET(req("GET"), ctx(["instances"]));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POST without a session (CSRF passing) → 401 and NO upstream fetch", async () => {
    const res = await POST(req("POST"), ctx(["instances"]));
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("DELETE without a session (CSRF passing) → 401 and NO upstream fetch", async () => {
    const res = await DELETE(req("DELETE", "instances/uuid"), ctx(["instances", "uuid"]));
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("GET WITH a session → forwards to compute", async () => {
    sessionValue = "tok_abc";
    const res = await GET(req("GET"), ctx(["instances"]));
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("DELETE WITH a session → forwards to compute", async () => {
    sessionValue = "tok_abc";
    const res = await DELETE(req("DELETE", "instances/uuid"), ctx(["instances", "uuid"]));
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
