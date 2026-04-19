/**
 * Tests for the deprecated POST /api/team-inquiry shim.
 *
 * Sprint 2026-W17 Item B generalised /api/team-inquiry → /api/capacity-inquiry.
 * The old endpoint is kept for 30 days so bookmarked URLs and any in-flight
 * Team-form submissions don't 500.
 *
 * Invariants the shim must preserve:
 *   1. Old request shape `{ name, email, teamSize }` still returns 200.
 *   2. Missing fields still return 400 missing_fields.
 *   3. The forwarded `tier` is exactly "team" (not e.g. "Team" or undefined).
 *   4. The composed `message` carries the team size so the inbox payload
 *      is not lost.
 *   5. A deprecation warning is logged so we can spot lingering traffic
 *      before pulling the route.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "./route";
import * as handlerModule from "../capacity-inquiry/handler";

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeReq(body: unknown): NextRequest {
  return {
    json: () =>
      body === undefined ? Promise.reject(new Error("malformed json")) : Promise.resolve(body),
  } as unknown as NextRequest;
}

describe("POST /api/team-inquiry — deprecated back-compat shim", () => {
  it("returns 200 for the legacy { name, email, teamSize } payload", async () => {
    const res = await POST(makeReq({ name: "Ada", email: "ada@example.com", teamSize: "6-20" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("forwards to handleCapacityInquiry with tier='team' and a composed message", async () => {
    const handlerSpy = vi.spyOn(handlerModule, "handleCapacityInquiry");

    await POST(makeReq({ name: "Ada Lovelace", email: "ada@example.com", teamSize: "20+" }));

    expect(handlerSpy).toHaveBeenCalledTimes(1);
    const call = handlerSpy.mock.calls[0][0];
    expect(call.name).toBe("Ada Lovelace");
    expect(call.email).toBe("ada@example.com");
    expect(call.tier).toBe("team");
    expect(call.message).toContain("20+");
  });

  it("logs a deprecation warning so we can see lingering traffic", async () => {
    await POST(makeReq({ name: "Ada", email: "ada@example.com", teamSize: "1-5" }));

    expect(warnSpy).toHaveBeenCalled();
    const logged = warnSpy.mock.calls.flat().join(" ");
    expect(logged.toLowerCase()).toContain("deprecated");
    expect(logged).toContain("/api/capacity-inquiry");
  });

  it("returns 400 invalid_body for malformed JSON", async () => {
    const res = await POST(makeReq(undefined));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("returns 400 missing_fields when teamSize is missing (legacy contract)", async () => {
    const res = await POST(makeReq({ name: "Ada", email: "ada@example.com" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_fields" });
  });

  it("returns 400 missing_fields when name is missing (legacy contract)", async () => {
    const res = await POST(makeReq({ email: "ada@example.com", teamSize: "1-5" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_fields" });
  });
});
