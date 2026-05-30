/**
 * CSRF wiring regression — every mutating session-authenticated BFF route under
 * src/app/api/ must call verifyCsrfOrigin() before forwarding to compute.
 *
 * This test proves the WIRING — that the CSRF helper is invoked. The helper
 * itself (src/lib/csrf.ts) has its own deep test in src/lib/csrf.test.ts.
 *
 * Sprint P0-5 (2026-05-18). Before this fix only three routes were guarded:
 *   - /api/auth/[...path]
 *   - /api/auth/factors/totp/login-verify
 *   - /api/signup
 *
 * After this fix the following mutating session-auth routes are also guarded:
 *   - /api/my-substrate/cancel        (highlight — destructive under D1)
 *   - /api/my-substrate/reactivate
 *   - /api/my-substrate/deprovision
 *   - /api/my-substrate/claim-key
 *   - /api/my-substrate/rotate-key
 *   - /api/billing/portal
 *   - /api/billing/upgrade
 *   - /api/checkout
 *   - /api/compute/[...path]           (POST + DELETE on the catch-all proxy)
 *
 * Routes intentionally NOT guarded and out of scope here:
 *   - /api/memory/[...path]            (public-CORS proxy, no session)
 *   - /api/waitlist, /api/team-inquiry, /api/capacity-inquiry (public forms;
 *     covered separately if/when they grow session state)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { cookies } from "next/headers";

const mockCookies = cookies as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // No session cookie — if CSRF check is somehow skipped, the routes will
  // 401 on the missing token. The point is to assert 403 from CSRF BEFORE
  // either the auth check or the fetch fires.
  mockCookies.mockResolvedValue({ get: () => undefined });
});

/**
 * Build a NextRequest for a given absolute URL with no Origin or Referer.
 * Under verifyCsrfOrigin this is the "neither provenance" branch — must 403.
 */
function noProvenanceRequest(url: string, method = "POST"): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? "{}" : undefined,
  });
}

/**
 * Build a NextRequest with a clearly cross-origin Origin header.
 * Under verifyCsrfOrigin this is the "wrong-origin" branch — must 403.
 */
function crossOriginRequest(url: string, method = "POST"): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "https://attacker.example.com",
    },
    body: method === "POST" ? "{}" : undefined,
  });
}

interface RouteUnderTest {
  label: string;
  importer: () => Promise<{
    POST?: (req: NextRequest, ctx?: unknown) => Promise<Response>;
    DELETE?: (req: NextRequest, ctx?: unknown) => Promise<Response>;
  }>;
  url: string;
  /** For catch-all proxies: the dynamic params Next would inject. */
  ctx?: unknown;
  methods: Array<"POST" | "DELETE">;
}

const ROUTES: RouteUnderTest[] = [
  {
    label: "/api/my-substrate/cancel",
    importer: () => import("./my-substrate/cancel/route"),
    url: "http://localhost:3000/api/my-substrate/cancel",
    methods: ["POST"],
  },
  {
    label: "/api/my-substrate/reactivate",
    importer: () => import("./my-substrate/reactivate/route"),
    url: "http://localhost:3000/api/my-substrate/reactivate",
    methods: ["POST"],
  },
  {
    label: "/api/my-substrate/deprovision",
    importer: () => import("./my-substrate/deprovision/route"),
    url: "http://localhost:3000/api/my-substrate/deprovision",
    methods: ["POST"],
  },
  {
    label: "/api/my-substrate/claim-key",
    importer: () => import("./my-substrate/claim-key/route"),
    url: "http://localhost:3000/api/my-substrate/claim-key",
    methods: ["POST"],
  },
  {
    label: "/api/my-substrate/rotate-key",
    importer: () => import("./my-substrate/rotate-key/route"),
    url: "http://localhost:3000/api/my-substrate/rotate-key",
    methods: ["POST"],
  },
  {
    label: "/api/billing/portal",
    importer: () => import("./billing/portal/route"),
    url: "http://localhost:3000/api/billing/portal",
    methods: ["POST"],
  },
  {
    label: "/api/billing/upgrade",
    importer: () => import("./billing/upgrade/route"),
    url: "http://localhost:3000/api/billing/upgrade",
    methods: ["POST"],
  },
  {
    label: "/api/checkout",
    importer: () => import("./checkout/route"),
    url: "http://localhost:3000/api/checkout",
    methods: ["POST"],
  },
  {
    label: "/api/compute/[...path] (POST)",
    importer: () => import("./compute/[...path]/route"),
    url: "http://localhost:3000/api/compute/instances",
    ctx: { params: Promise.resolve({ path: ["instances"] }) },
    methods: ["POST"],
  },
  {
    // Sprint 2026-05-18 E1: slug-scoped cancel BFF, distinct from the
    // legacy /api/my-substrate/cancel (implicit-substrate resolver).
    label: "/api/substrates/[slug]/cancel",
    importer: () => import("./substrates/[slug]/cancel/route"),
    url: "http://localhost:3000/api/substrates/alice-one/cancel",
    ctx: { params: Promise.resolve({ slug: "alice-one" }) },
    methods: ["POST"],
  },
  {
    // Sprint 2026-05-18 E2: slug-scoped reactivate BFF, inverse of the
    // cancel route above.
    label: "/api/substrates/[slug]/reactivate",
    importer: () => import("./substrates/[slug]/reactivate/route"),
    url: "http://localhost:3000/api/substrates/alice-one/reactivate",
    ctx: { params: Promise.resolve({ slug: "alice-one" }) },
    methods: ["POST"],
  },
  {
    label: "/api/compute/[...path] (DELETE)",
    importer: () => import("./compute/[...path]/route"),
    url: "http://localhost:3000/api/compute/instances/some-uuid",
    ctx: { params: Promise.resolve({ path: ["instances", "some-uuid"] }) },
    methods: ["DELETE"],
  },
];

describe("CSRF wiring — mutating BFF routes (P0-5)", () => {
  for (const route of ROUTES) {
    for (const method of route.methods) {
      describe(`${route.label} ${method}`, () => {
        it("rejects requests with no Origin and no Referer with 403", async () => {
          const mod = await route.importer();
          const handler = mod[method];
          expect(handler).toBeDefined();
          const res = await handler!(noProvenanceRequest(route.url, method), route.ctx);
          expect(res.status).toBe(403);
          // CSRF blocks BEFORE the upstream fetch is issued.
          expect(mockFetch).not.toHaveBeenCalled();
        });

        it("rejects requests with a cross-origin Origin with 403", async () => {
          const mod = await route.importer();
          const handler = mod[method];
          const res = await handler!(crossOriginRequest(route.url, method), route.ctx);
          expect(res.status).toBe(403);
          expect(mockFetch).not.toHaveBeenCalled();
        });
      });
    }
  }
});
