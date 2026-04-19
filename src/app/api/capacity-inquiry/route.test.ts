/**
 * Tests for POST /api/capacity-inquiry.
 *
 * Scope: wiring only — JSON body parsing + mapping HandlerResult to the
 * HTTP response. The validation/side-effect matrix lives in handler.test.ts,
 * so we don't re-test that here; we just confirm the route threads the
 * result through correctly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "./route";

// Silence the handler's structured logs during route tests.
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CAPACITY_INQUIRY_WEBHOOK_URL;
  delete process.env.TEAM_INQUIRY_WEBHOOK_URL;
});

/**
 * Minimal NextRequest stand-in. The route only calls `request.json()`.
 * Pass `undefined` to simulate malformed body.
 */
function makeReq(body: unknown): NextRequest {
  return {
    json: () =>
      body === undefined ? Promise.reject(new Error("malformed json")) : Promise.resolve(body),
  } as unknown as NextRequest;
}

describe("POST /api/capacity-inquiry", () => {
  it("returns 200 { ok: true } for a valid payload", async () => {
    const res = await POST(
      makeReq({
        name: "Ada Lovelace",
        email: "ada@example.com",
        tier: "pro",
        message: "need more atoms",
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("accepts every canonical billing tier (covers new Starter/Solo/Pro surface)", async () => {
    for (const tier of ["starter", "indie", "pro", "team"]) {
      const res = await POST(
        makeReq({
          name: "Ada",
          email: "ada@example.com",
          tier,
          message: "hi",
        }),
      );
      expect(res.status, `tier=${tier} should be accepted`).toBe(200);
    }
  });

  it("returns 400 invalid_body when the request body is not JSON", async () => {
    const res = await POST(makeReq(undefined));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("returns 400 missing_fields when required fields are absent", async () => {
    const res = await POST(
      makeReq({
        name: "Ada",
        email: "ada@example.com",
        tier: "pro",
        // message missing
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_fields" });
  });

  it("returns 400 invalid_tier for an unknown tier", async () => {
    const res = await POST(
      makeReq({
        name: "Ada",
        email: "ada@example.com",
        tier: "enterprise-cloud",
        message: "hi",
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_tier" });
  });

  it("returns 400 invalid_email for a malformed email", async () => {
    const res = await POST(
      makeReq({
        name: "Ada",
        email: "not-an-email",
        tier: "pro",
        message: "hi",
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_email" });
  });
});
