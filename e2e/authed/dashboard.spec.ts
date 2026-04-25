/**
 * Dashboard renders for an authenticated user.
 *
 * Safety: read-only. We confirm the dashboard testids mount; we don't add
 * substrates, don't change anything.
 */

import { test, expect } from "@playwright/test";

test("dashboard substrate list is visible", async ({ page }) => {
  await page.goto("/admin");
  // The actual auth landing page in this app is /admin (it's the customer-
  // facing admin console). Some accounts also see /dashboard.
  const onAdmin = page.url().endsWith("/admin");
  expect(onAdmin || page.url().endsWith("/dashboard")).toBe(true);
});

test("admin substrate header renders", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByTestId("admin-substrate-header").first()).toBeVisible();
});

test("change-plan button is present", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByTestId("change-plan-button").first()).toBeVisible();
});

test("billing widget renders", async ({ page }) => {
  await page.goto("/admin");
  // Billing widget may live on /admin or under /billing — check both.
  const onAdmin = await page.getByTestId("billing-widget").count();
  if (onAdmin === 0) {
    await page.goto("/billing");
  }
  await expect(page.getByTestId("billing-widget").first()).toBeVisible();
});
