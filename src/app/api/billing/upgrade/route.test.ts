/**
 * Tests for POST /api/billing/upgrade — session-auth proxy to
 *   compute:/api/v1/substrates/:slug/upgrade
 *
 * Covers:
 *   1. No session cookie → 401, never calls compute.
 *   2. Missing substrateSlug in body → 400, never calls compute.
 *   3. Happy path → forwards { tier, idempotencyKey } to the slug-scoped
 *      compute path; response is forwarded verbatim.
 *   4. Malformed/empty body → 400 (no slug to build the path with).
 *   5. Compute 409 (in-flight tier change) → forwarded as 409.
 *   6. Compute unreachable → 502.
 *
 * Pattern mirrors the upgrade-options test so the two upgrade-flow proxies
 * read the same way side-by-side.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

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

/**
 * Minimal NextRequest stand-in. The route calls `request.json()` AND (after
 * P0-5 CSRF wiring) reads `request.method`, `request.url`, and
 * `request.headers.get()` via verifyCsrfOrigin. Pass `undefined` for body to
 * simulate a json() rejection.
 *
 * Headers default to a same-origin Origin so the CSRF check passes; tests that
 * want to exercise the CSRF block should override `originHeader`.
 */
function makeReq(body: unknown, opts: { originHeader?: string | null } = {}): NextRequest {
  const headers = new Map<string, string>();
  // Default to same-origin localhost — matches the request URL below.
  if (opts.originHeader !== null) {
    headers.set("origin", opts.originHeader ?? "http://localhost:3000");
  }
  return {
    method: "POST",
    url: "http://localhost:3000/api/billing/upgrade",
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    },
    json: () =>
      body === undefined ? Promise.reject(new Error("malformed json")) : Promise.resolve(body),
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/billing/upgrade", () => {
  it("returns 401 when no session cookie is present — never calls compute", async () => {
    mockCookies.mockResolvedValue(makeCookieStore());

    const res = await POST(makeReq({ substrateSlug: "bold-junction", targetTier: "pro" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("unauthorized");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 directly when substrateSlug is missing — never calls compute", async () => {
    // The slug lives in the path now; without it we can't construct a valid
    // upstream URL, so we short-circuit with a structured 400.
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));

    const res = await POST(makeReq({ targetTier: "pro" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("substrateSlug_required");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 when the request body itself is malformed", async () => {
    // Same surface as missing slug — without a parseable body we can't read
    // the slug. compute is never called.
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));

    const res = await POST(makeReq(undefined));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("substrateSlug_required");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("proxies to the slug-scoped path and renames targetTier→tier in the body", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));

    // Compute's commit response shape — {accepted, currentTier, targetTier,
    // transitionType, stripeSubscriptionId, prorationCents}. The BFF passes
    // the body through verbatim; the dialog's own response handling is a
    // separate frontend concern (see route.ts docstring).
    const upstream = {
      accepted: true,
      currentTier: "starter",
      targetTier: "pro",
      transitionType: "shared_to_dedicated",
      stripeSubscriptionId: "sub_test_abc",
      prorationCents: 200,
    };

    mockFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify(upstream)),
    });

    const res = await POST(
      makeReq({
        substrateSlug: "bold-junction",
        targetTier: "pro",
        idempotencyKey: "upg_01HA7Z0",
      }),
    );
    const responseBody = await res.json();

    expect(res.status).toBe(200);
    expect(responseBody).toEqual(upstream);

    // Path: slug is in the path segment, not a query string.
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toContain("/api/v1/substrates/bold-junction/upgrade");

    // Body: targetTier→tier rename, idempotencyKey forwarded, substrateSlug
    // dropped (it's in the path now).
    const init = call[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      tier: "pro",
      idempotencyKey: "upg_01HA7Z0",
    });
    expect(init.headers).toMatchObject({ Authorization: "Bearer sess_abc123" });
  });

  it("URL-encodes unusual substrateSlug values into the path segment", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ accepted: true })),
    });

    await POST(makeReq({ substrateSlug: "weird slug/with?chars", targetTier: "pro" }));

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/substrates/weird%20slug%2Fwith%3Fchars/upgrade"),
      expect.any(Object),
    );
  });

  it("forwards 409 when a tier change is already in flight", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockResolvedValue({
      status: 409,
      text: () => Promise.resolve(JSON.stringify({ error: "upgrade_in_progress" })),
    });

    const res = await POST(makeReq({ substrateSlug: "bold-junction", targetTier: "pro" }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("upgrade_in_progress");
  });

  it("returns 502 when compute is unreachable", async () => {
    // compute-proxy.ts logs a diagnostic console.error on network failure —
    // that's intended ops signal in prod. Silence it here so `npm run
    // preflight` doesn't paint its output amber while still asserting the
    // alarm actually fired.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockCookies.mockResolvedValue(makeCookieStore("sess_abc123"));
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await POST(makeReq({ substrateSlug: "bold-junction", targetTier: "pro" }));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBe("upstream_error");
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("[compute-proxy]"),
      expect.any(Error),
    );
    errSpy.mockRestore();
  });
});
