/**
 * Public pages render correctly when visited unauthenticated.
 *
 * Why
 *  - Catches deploy regressions where a public page 5xxs, 404s, or fails to
 *    hydrate after a Next.js build change.
 *
 * Safety
 *  - Read-only. Visits only. No clicks that mutate state.
 */

import { test, expect } from "@playwright/test";

const PUBLIC_PAGES: Array<{ path: string; expect: string }> = [
  { path: "/", expect: "nav-home" },
  { path: "/pricing", expect: "pricing-comparison" },
  { path: "/enterprise", expect: "nav-link-enterprise" },
  { path: "/about", expect: "nav-link-about" },
  { path: "/faq", expect: "nav-link-faq" },
  { path: "/blog", expect: "nav-link-blog" },
  { path: "/docs", expect: "nav-link-docs" },
  { path: "/contact", expect: "capacity-form" },
  // 2026-07-02: Legal/Privacy left the top nav (now in the footer sitemap as
  // footer-link-*). Anchor these on nav-home, which the SiteNavbar renders on
  // every page — still proves the page hydrated. Footer legal links are
  // covered by SiteFooter.test.tsx.
  { path: "/privacy", expect: "nav-home" },
  { path: "/terms", expect: "nav-home" },
  { path: "/dpa", expect: "nav-home" },
  { path: "/aup", expect: "nav-home" },
  // Sprint 2026-W18 — closed-source migration: /copyright page
  // is the public NZ-jurisdiction copyright statement. Anchored on
  // its H1 testid because there is no nav-link-copyright (the page
  // is reached via footer Link, not the SiteNavbar).
  { path: "/copyright", expect: "copyright-page-heading" },
];

for (const page of PUBLIC_PAGES) {
  test(`${page.path} renders without errors`, async ({ page: pw }) => {
    const response = await pw.goto(page.path);
    expect(response?.ok(), `Expected 2xx for ${page.path}, got ${response?.status()}`).toBe(true);

    // The body element should exist. Trivial but catches blank pages.
    await expect(pw.locator("body")).toBeVisible();

    // No client-side console errors during the initial render. We capture them
    // before navigation in a stricter version of this test; here we just
    // confirm the marker testid is present, which proves hydration ran.
    await expect(pw.locator(`[data-testid='${page.expect}']`).first()).toBeVisible({
      timeout: 10_000,
    });
  });
}

test("home shows landing hero CTAs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("landing-hero-cta-primary")).toBeVisible();
  await expect(page.getByTestId("landing-hero-cta-secondary")).toBeVisible();
});

test("home features section renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("landing-section-features")).toBeVisible();
});
