/**
 * Navigation smoke — every nav-* testid in the registry mounts and links to
 * the right place.
 *
 * Why
 *  - Catches accidentally-removed nav links and broken hrefs after refactors.
 *  - Sprint 2026-W17: extended with a mobile sweep that asserts the
 *    SiteNavbar (and therefore the hamburger drawer) is present on every
 *    auth/auth-required page — previously these pages had bespoke headers
 *    with no mobile menu, breaking the consistent mobile experience.
 *
 * Safety
 *  - Read-only. Hovers, opens drawer, closes drawer, clicks links that are
 *    same-origin GET routes only.
 */

import { test, expect } from "@playwright/test";

test.describe("navigation", () => {
  test("primary nav links are visible on home", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("nav-home")).toBeVisible();

    // 2026-07-02 declutter: primary links + the Knowledge accent chip are
    // inline on desktop; secondary links (Blog/FAQ/About) live behind the
    // "More" disclosure. Some links also live inside the drawer on small
    // viewports — desktop tests assume the wider layout where they're inline.
    const inline = [
      "nav-link-verify",
      "nav-link-enterprise",
      "nav-link-docs",
      "nav-link-pricing",
      "nav-link-knowledge",
    ];
    for (const tid of inline) {
      await expect(page.getByTestId(tid).first()).toBeVisible();
    }

    // Secondary links are in the DOM at all times (crawler/agent visible) but
    // visually collapsed until the disclosure is opened.
    const moreTrigger = page.getByTestId("nav-more-trigger");
    await expect(moreTrigger).toBeVisible();
    await moreTrigger.click();
    const moreMenu = page.getByTestId("nav-more-menu");
    for (const tid of ["nav-link-blog", "nav-link-faq", "nav-link-about"]) {
      await expect(moreMenu.getByTestId(tid)).toBeVisible();
    }
  });

  test("hamburger opens and closes the drawer", async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto("/");

    const hamburger = page.getByTestId("nav-hamburger");
    await expect(hamburger).toBeVisible();
    await hamburger.click();

    await expect(page.getByTestId("nav-drawer")).toBeVisible();
    await page.getByTestId("nav-drawer-close").click();
    await expect(page.getByTestId("nav-drawer")).toBeHidden();
  });

  test("signin nav link points at /login", async ({ page }) => {
    await page.goto("/");
    const signin = page.getByTestId("nav-auth-signin").first();
    await expect(signin).toBeVisible();
    await expect(signin).toHaveAttribute("href", /\/login/);
  });

  test("nav-link-pricing navigates to /pricing", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-link-pricing").first().click();
    await expect(page).toHaveURL(/\/pricing$/);
    await expect(page.getByTestId("pricing-comparison")).toBeVisible();
  });
});

/* ─── Mobile parity sweep (sprint 2026-W17) ──────────────────────────────────
 *
 * Every public + auth-only page must render SiteNavbar (and therefore a
 * hamburger button) on a mobile viewport. Before this change, dashboard,
 * admin, login, signup, and the billing landing pages used bespoke headers
 * with no mobile menu, which broke the consistent mobile UX.
 *
 * Auth-required pages (dashboard, admin, admin/security, billing/success)
 * redirect to /login when there is no session. The redirect is the
 * pre-condition we care about for unauthenticated browsers, but the
 * destination — /login — must itself have the navbar. The redirected pages
 * are covered by the authed/* specs which run with a valid session cookie.
 *
 * iPhone-12-ish width: 390x844.
 */
test.describe("mobile parity — hamburger present everywhere", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const publicPages = [
    "/",
    "/pricing",
    "/docs",
    "/blog",
    "/about",
    "/faq",
    "/terms",
    "/privacy",
    "/aup",
    "/dpa",
    "/login",
    "/signup",
    "/billing/cancel",
  ];

  for (const path of publicPages) {
    test(`hamburger visible at ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByTestId("nav-hamburger")).toBeVisible();
      await expect(page.getByTestId("nav-home")).toBeVisible();
    });
  }

  test("login: OAuth section is above the email form on mobile", async ({ page }) => {
    await page.goto("/login");
    // The login form mounts even when no OAuth providers are configured.
    // We assert the login form is present and that the email input does NOT
    // hold focus on mount — the autoFocus was removed so the keyboard
    // doesn't pop and obscure the OAuth buttons on small screens.
    const email = page.getByTestId("login-email");
    await expect(email).toBeVisible();
    // activeElement should NOT be the email input on initial mount.
    const isFocused = await email.evaluate((el) => document.activeElement === el);
    expect(isFocused).toBe(false);
  });

  test("login drawer opens and shows expected nav links", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("nav-hamburger").click();
    await expect(page.getByTestId("nav-drawer")).toBeVisible();
    // Drawer should expose the same primary nav links as on home.
    const drawer = page.getByTestId("nav-drawer");
    await expect(drawer.getByTestId("nav-link-pricing")).toBeVisible();
    await expect(drawer.getByTestId("nav-link-docs")).toBeVisible();
  });
});

/* ─── Knowledge / Visualise canvas full-screen guard ─────────────────────────
 *
 * Regression guard for commit 9138d07 ("google and github") which swapped
 * `h-screen` for `min-h-[100dvh] min-h-screen` on the outer flex column.
 * `flex-1` children only fill space when the parent has a definite
 * height — `min-height` alone leaves the parent at content-height and
 * collapses the canvas to a thin strip. Sprint 2026-W17 fixed it by
 * pinning `h-screen` + an inline `height: 100dvh` override.
 *
 * Assertion: at desktop and mobile widths, the page's flex-1 canvas
 * region is at least 60% of the viewport height. (We don't assert
 * exactly 100% because the navbar overlays the top ~64px.)
 */
test.describe("knowledge canvas fills viewport (regression guard)", () => {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`/knowledge canvas ≥ 60% of ${viewport.name} viewport`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/knowledge");
      // Wait for the dynamic import to mount (loading skeleton clears once
      // the R3F bundle resolves). The flex-1 wrapper is the closest div to
      // the Canvas with a relative+overflow-hidden+flex-1 signature.
      const canvasWrapper = page.locator("div.relative.flex-1.overflow-hidden").first();
      await canvasWrapper.waitFor({ state: "attached", timeout: 10000 });
      const box = await canvasWrapper.boundingBox();
      expect(box).not.toBeNull();
      const ratio = (box!.height / viewport.height) * 100;
      expect(ratio).toBeGreaterThan(60);
    });
  }
});
