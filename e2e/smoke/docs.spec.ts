/**
 * Docs and blog index render and at least one entry is reachable.
 *
 * Safety: read-only. Navigates GET routes only.
 */

import { test, expect } from "@playwright/test";

test("docs index lists at least one doc", async ({ page }) => {
  await page.goto("/docs");
  // The index page should have at least one anchor that links into /docs/<slug>.
  const docLinks = page.locator('a[href^="/docs/"]');
  await expect(docLinks.first()).toBeVisible();
  expect(await docLinks.count()).toBeGreaterThan(0);
});

test("first doc page renders content", async ({ page }) => {
  await page.goto("/docs");
  const firstDoc = page.locator('a[href^="/docs/"]').first();
  const href = await firstDoc.getAttribute("href");
  expect(href).toBeTruthy();
  await firstDoc.click();
  await expect(page).toHaveURL(new RegExp(href!));
  // Doc pages render <article> or a heading.
  const heading = page.getByRole("heading").first();
  await expect(heading).toBeVisible();
});

test("blog index lists at least one post", async ({ page }) => {
  await page.goto("/blog");
  const blogLinks = page.locator('a[href^="/blog/"]');
  await expect(blogLinks.first()).toBeVisible();
});
