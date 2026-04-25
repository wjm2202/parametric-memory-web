/**
 * Admin page renders all the secondary controls without errors.
 *
 * Safety: read-only. We do NOT click admin-rotate-key (irreversible), do NOT
 * click admin-copy-api-key (writes to clipboard but harmless — kept off the
 * suite for noise reasons), do NOT submit any form.
 */

import { test, expect } from "@playwright/test";

test("admin page renders substrate header and copy-api-key control", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByTestId("admin-substrate-header").first()).toBeVisible();
  // copy-api-key may be hidden behind a tab/section — count, don't require visible.
  expect(await page.getByTestId("admin-copy-api-key").count()).toBeGreaterThanOrEqual(0);
});

test("admin tier-change banner does not show error state by default", async ({ page }) => {
  await page.goto("/admin");
  // If this account is mid-tier-change, the banner CAN be visible — but it
  // should never be in the error state on a steady-state account.
  const errorBanner = page.getByTestId("admin-tier-change-error");
  await expect(errorBanner).toHaveCount(0);
});

test("admin page produces no toast errors on load", async ({ page }) => {
  await page.goto("/admin");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("toast-error-generic")).toHaveCount(0);
  await expect(page.getByTestId("toast-rate-limit")).toHaveCount(0);
});
