/**
 * Sprint nextjs-16-upgrade (2026-05-27) — middleware matcher lock (test 5.2).
 *
 * The matcher regex in `src/middleware.ts` declares which routes the
 * middleware runs on. Any edit to this string changes the auth gate's
 * coverage — adding /admin to the exclusion list would unprotect the admin
 * panel; removing /api/ from the exclusion would route every API call
 * through the cookie check; and a typo in `_next/static` could subtly
 * disable static-asset bypass.
 *
 * Because the consequences of a wrong edit range from "needless redirect
 * loop" to "silent unprotection", we pin the exact string here. Any change
 * to the matcher MUST update both this file and `src/middleware.ts`, which
 * forces an explicit code review of the consequence.
 *
 * If you are reading this comment because the test failed: do NOT just
 * update the expected string. First, confirm the new matcher behaviour is
 * correct — write a corresponding test in `src/middleware.test.ts` that
 * exercises the new path/exclusion. Only then update the expected string
 * below.
 *
 * Reference: docs/SPRINT-NEXTJS-16-UPGRADE-2026-05-27.md (test 5.2).
 */

import { describe, it, expect } from "vitest";
import { config } from "./middleware";

const EXPECTED_MATCHER =
  "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/|auth/).*)";

describe("middleware.config.matcher — exact snapshot", () => {
  it("declares exactly one matcher entry", () => {
    expect(Array.isArray(config.matcher)).toBe(true);
    expect((config.matcher as string[]).length).toBe(1);
  });

  it("pins the matcher regex to its exact, reviewed form", () => {
    expect((config.matcher as string[])[0]).toBe(EXPECTED_MATCHER);
  });
});

describe("middleware.config.matcher — required exclusions present", () => {
  /*
   * Structural sanity checks. These give clearer failure messages than the
   * exact-string assertion above for the most common kind of regression:
   * accidentally dropping one of the exclusions while editing.
   */
  const matcher = (config.matcher as string[])[0];

  it("excludes _next/static (static assets)", () => {
    expect(matcher).toContain("_next/static");
  });

  it("excludes _next/image (image optimiser)", () => {
    expect(matcher).toContain("_next/image");
  });

  it("excludes favicon.ico, sitemap.xml, robots.txt (root statics)", () => {
    expect(matcher).toContain("favicon.ico");
    expect(matcher).toContain("sitemap.xml");
    expect(matcher).toContain("robots.txt");
  });

  it("excludes api/ (API routes handle their own auth)", () => {
    expect(matcher).toContain("api/");
  });

  it("excludes auth/ (callback handler)", () => {
    expect(matcher).toContain("auth/");
  });
});
