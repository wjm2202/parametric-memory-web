/**
 * Navigation smoke — every nav-* testid in the registry mounts and links to
 * the right place.
 *
 * Why
 *  - Catches accidentally-removed nav links and broken hrefs after refactors.
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

    // Some links live inside the drawer on smaller viewports — desktop tests
    // assume the wider layout where they're inline.
    const expected = [
      "nav-link-pricing",
      "nav-link-docs",
      "nav-link-blog",
      "nav-link-faq",
      "nav-link-about",
      "nav-link-knowledge",
    ];
    for (const tid of expected) {
      await expect(page.getByTestId(tid).first()).toBeVisible();
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
