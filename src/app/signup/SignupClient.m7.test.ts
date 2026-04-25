/**
 * Sprint 2026-W18 — M7 (decorative blob overflow guard)
 *
 * Contract test: signup / admin / dashboard all ship with overflow-x guard
 * on their outermost div so a decorative blob (or any other wide content)
 * can never force horizontal scroll at 320-412px.
 *
 * The real assertion — scrollWidth === innerWidth at 320px on the rendered
 * page — needs Playwright. Until then, source-guard tests catch regressions.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/**
 * Helper — asserts that SOME `<div className="...">` in the source contains
 * every required token, regardless of the order Tailwind emits them in.
 * Token-order-sensitive regexes broke on the first real test run because
 * the Tailwind class-sort plugin reorders them.
 */
function hasDivWithAllTokens(src: string, tokens: string[]): boolean {
  const divs = Array.from(src.matchAll(/<div className="([^"]+)"/g));
  return divs.some(([, classes]) =>
    tokens.every((tok) => new RegExp(`(^|\\s)${escapeForRegex(tok)}(\\s|$)`).test(classes)),
  );
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("M7 overflow-x guards (contract test)", () => {
  it("Signup outer wrapper has relative + overflow-x-hidden + min-h-[100dvh]", () => {
    const src = read("app/signup/SignupClient.tsx");
    // Phase 3 (SSO tap targets + iOS polish) swapped `min-h-screen` for
    // `min-h-[100dvh]` so iOS Safari's retracting bottom bar does not
    // crop the form. The overflow-x guard is unchanged — still needed for
    // decorative blobs at 320-412px widths. phase3-sso-tap-targets.test.tsx
    // is the authoritative source for the min-h-[100dvh] invariant.
    expect(
      hasDivWithAllTokens(src, ["relative", "overflow-x-hidden", "min-h-[100dvh]"]),
      "Signup has no single <div> with `relative`, `overflow-x-hidden`, and `min-h-[100dvh]` on the same element",
    ).toBe(true);
  });

  it("Admin outer wrapper has overflow-x-hidden + min-h-screen + brand bg", () => {
    const src = read("app/admin/AdminClient.tsx");
    expect(
      hasDivWithAllTokens(src, ["min-h-screen", "overflow-x-hidden", "bg-[#030712]"]),
      "Admin has no single <div> with `min-h-screen`, `overflow-x-hidden`, and `bg-[#030712]` on the same element",
    ).toBe(true);
  });

  it("Dashboard outer wrapper has overflow-x-hidden + min-h-screen + brand bg", () => {
    const src = read("app/dashboard/DashboardClient.tsx");
    expect(
      hasDivWithAllTokens(src, ["min-h-screen", "overflow-x-hidden", "bg-[#030712]"]),
      "Dashboard has no single <div> with `min-h-screen`, `overflow-x-hidden`, and `bg-[#030712]` on the same element",
    ).toBe(true);
  });
});

/**
 * PENDING — requires Playwright (see SPRINT Ready-to-claim checklist).
 */
describe.skip("M7 real mobile assertion (Playwright)", () => {
  it("no horizontal scroll at 320px on signup, admin, dashboard", () => {
    // await page.setViewportSize({ width: 320, height: 568 });
    // for (const path of ["/signup", "/admin", "/dashboard"]) {
    //   await page.goto(path);
    //   const overflows = await page.evaluate(
    //     () => document.documentElement.scrollWidth > window.innerWidth,
    //   );
    //   expect(overflows, `${path} has horizontal scroll at 320px`).toBe(false);
    // }
  });
});
