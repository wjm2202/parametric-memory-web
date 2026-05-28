/**
 * Sprint nextjs-16-upgrade (2026-05-27) — middleware bypass regression suite.
 *
 * Locks the behaviour of src/middleware.ts against the four bypass shapes
 * called out in Vercel's May 2026 Next.js coordinated security release.
 *
 * The pattern this codebase uses for /admin and /dashboard is "redirect-only
 * gate at the middleware layer, real auth runs at the page level" (see the
 * comment block at the top of middleware.ts). That means the May 2026
 * bypass shapes are NOT currently exploitable for unauthorised access —
 * even if a request slipped past the middleware, the page-level check
 * against the DB session would still reject it.
 *
 * These tests exist as defence-in-depth: any change to the matcher, the
 * prefix-check logic, or the redirect target surfaces a failing assertion
 * before it ships, and any future engineer who weakens the gate (e.g. by
 * trusting headers, by switching to a regex that has a known-bad escape,
 * by adding i18n config without hardening the matcher) trips a clear test.
 *
 * CVE shape coverage (May 2026 advisory):
 *   1. App Router segment-prefetch bypass — RSC + Next-Router-Prefetch
 *      headers must not bypass.
 *   2. Pages-Router i18n default-locale prefix — does NOT apply to this
 *      codebase today (no i18n config). Documented inline so a future
 *      engineer adding i18n is reminded to harden the matcher.
 *   3. Dynamic-route parameter injection — encoded ../, double-slash,
 *      %2e variants must not bypass the prefix check.
 *   4. Server-action invocation on protected routes — POST with
 *      Next-Action header must not bypass.
 *
 * Reference: vercel.com/changelog/next-js-may-2026-security-release
 * See also: docs/SPRINT-NEXTJS-16-UPGRADE-2026-05-27.md (M1).
 */

import { describe, it, expect } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { proxy } from "./proxy";

// Post-Next-16 rename: `middleware` → `proxy`. Aliased here so the test
// bodies below keep reading naturally as "middleware-bypass regression
// suite" — the security concept these tests cover hasn't changed, only
// the framework's name for the lifecycle hook.
const middleware = proxy;

const ORIGIN = "https://parametric-memory.dev";

function req(opts: {
  path: string;
  method?: string;
  cookie?: string;
  headers?: Record<string, string>;
}): NextRequest {
  const url = new URL(opts.path, ORIGIN);
  const headers = new Headers(opts.headers ?? {});
  if (opts.cookie !== undefined) headers.set("cookie", opts.cookie);
  return new NextRequest(url, { method: opts.method ?? "GET", headers });
}

function expectRedirectToLogin(res: NextResponse, expectedRedirectParam: string) {
  expect(res.status).toBe(307);
  const loc = res.headers.get("location");
  expect(loc).toBeTruthy();
  const target = new URL(loc!);
  expect(target.pathname).toBe("/login");
  expect(target.searchParams.get("redirect")).toBe(expectedRedirectParam);
}

function expectPassthrough(res: NextResponse) {
  // NextResponse.next() emits the internal `x-middleware-next: 1` marker and
  // a 200 status. Asserting both is stricter than "status 200, no location"
  // alone (a misimplemented page could also return that shape).
  expect(res.status).toBe(200);
  expect(res.headers.get("location")).toBeNull();
  expect(res.headers.get("x-middleware-next")).toBe("1");
}

describe("middleware — baseline protected-route gating", () => {
  it("redirects /admin to /login?redirect=/admin when no session cookie", () => {
    const res = middleware(req({ path: "/admin" }));
    expectRedirectToLogin(res, "/admin");
  });

  it("redirects /dashboard similarly", () => {
    const res = middleware(req({ path: "/dashboard" }));
    expectRedirectToLogin(res, "/dashboard");
  });

  it("redirects deep paths (/admin/security/audit) and preserves them in ?redirect", () => {
    const res = middleware(req({ path: "/admin/security/audit" }));
    expectRedirectToLogin(res, "/admin/security/audit");
  });

  it("allows /admin through when a non-empty mmpm_session cookie is present", () => {
    const res = middleware(req({ path: "/admin", cookie: "mmpm_session=abc123" }));
    expectPassthrough(res);
  });

  it("treats an empty-value cookie as no cookie (still redirects)", () => {
    const res = middleware(req({ path: "/admin", cookie: "mmpm_session=" }));
    expectRedirectToLogin(res, "/admin");
  });

  it("passes through non-protected routes (/, /pricing, /blog/foo)", () => {
    expectPassthrough(middleware(req({ path: "/" })));
    expectPassthrough(middleware(req({ path: "/pricing" })));
    expectPassthrough(middleware(req({ path: "/blog/foo" })));
  });
});

describe("middleware — May 2026 CVE bypass shapes", () => {
  it("CVE-shape 1 (segment-prefetch): RSC + Next-Router-Prefetch headers do not bypass", () => {
    const res = middleware(
      req({
        path: "/admin/security",
        headers: { "next-router-prefetch": "1", rsc: "1" },
      }),
    );
    expectRedirectToLogin(res, "/admin/security");
  });

  it("CVE-shape 3a (encoded dot-segments): URL normalization neutralizes /admin/%2e%2e/login below the middleware layer", () => {
    /*
     * The WHATWG URL parser (used by `new URL()` and NextRequest internally)
     * resolves `%2e%2e` as a dot-segment DURING parsing. So a request for
     * `/admin/%2e%2e/login` is normalised to pathname=`/login` before any
     * application code runs. The attack is neutralised one layer below the
     * middleware: there is no path traversal for the middleware to defeat
     * because the URL parser has already collapsed it.
     *
     * This test pins TWO properties:
     *   (1) the URL parser normalises `%2e%2e` to `..` and collapses it;
     *   (2) the resulting `/login` pathname correctly passes through the
     *       middleware (redirecting /login → /login would be a loop).
     *
     * If a future Node / Next.js / runtime change ever stopped doing this
     * normalisation, (1) would fail loudly and prompt a matcher hardening.
     */
    const normalized = new URL("/admin/%2e%2e/login", ORIGIN);
    expect(normalized.pathname).toBe("/login");

    const res = middleware(req({ path: "/admin/%2e%2e/login" }));
    expectPassthrough(res);
  });

  it("CVE-shape 3b (param injection): /admin/..%2Fpublic still redirects", () => {
    const res = middleware(req({ path: "/admin/..%2Fpublic" }));
    expect(res.status).toBe(307);
  });

  it("CVE-shape 3c (param injection): /admin//double-slash still redirects", () => {
    const res = middleware(req({ path: "/admin//double-slash" }));
    expect(res.status).toBe(307);
  });

  it("CVE-shape 4 (server-action): POST /admin/anything with Next-Action header still redirects", () => {
    const res = middleware(
      req({
        path: "/admin/anything",
        method: "POST",
        headers: { "next-action": "fake-action-id" },
      }),
    );
    expectRedirectToLogin(res, "/admin/anything");
  });
});

describe("middleware — i18n bypass (CVE-shape 2): not applicable in this codebase", () => {
  /*
   * The May 2026 Pages-Router i18n default-locale path bypass affects apps
   * that configure i18n in next.config.{ts,js} via the `i18n` block (e.g.
   * `i18n: { locales: ["en-US","en"], defaultLocale: "en-US" }`). This
   * codebase does NOT configure i18n — next.config.ts has no i18n block —
   * so paths like /en-US/admin are routed normally and resolve to a 404
   * before reaching any protected page.
   *
   * The middleware's `pathname.startsWith("/admin")` check therefore
   * correctly returns NextResponse.next() for /en-US/admin because that
   * pathname genuinely does NOT begin with /admin. The 404 from the App
   * Router is the security boundary, not the middleware.
   *
   * **IF you add i18n configuration in the future**, this becomes a real
   * bypass: Next would route /en-US/admin to the /admin handler while
   * having passed it through the middleware unchallenged. The fix at
   * that point is to extend the matcher (or the prefix check) to also
   * catch locale-prefixed segments — and to update these tests to
   * assert redirect behaviour instead of passthrough.
   */
  it("currently passes /en-US/admin through (no i18n configured)", () => {
    expectPassthrough(middleware(req({ path: "/en-US/admin" })));
  });

  it("currently passes /en/dashboard through (no i18n configured)", () => {
    expectPassthrough(middleware(req({ path: "/en/dashboard" })));
  });
});
