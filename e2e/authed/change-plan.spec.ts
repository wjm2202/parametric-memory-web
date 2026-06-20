/**
 * Change-plan sheet opens and closes WITHOUT confirming.
 *
 * Why
 *  - This is the most-loaded flow in the admin console. A regression in the
 *    sheet's open/close handlers used to silently strand customers mid-
 *    upgrade. Catching that doesn't require us to actually change a plan.
 *
 * Safety
 *  - We click `change-plan-button` to OPEN the sheet.
 *  - We click `change-plan-sheet-close` (or the backdrop) to CLOSE it.
 *  - We NEVER click `confirm-upgrade-confirm`. Doing so against prod would
 *    actually re-tier the live account.
 */

import { test, expect } from "@playwright/test";

test("change-plan sheet opens and closes via close button", async ({ page }) => {
  await page.goto("/admin");

  await page.getByTestId("change-plan-button").first().click();
  const sheet = page.getByTestId("change-plan-sheet");
  await expect(sheet).toBeVisible();

  // Either the loading state or the populated options should appear.
  const loadingVisible = await page.getByTestId("change-plan-sheet-loading").isVisible();
  if (loadingVisible) {
    await expect(page.getByTestId("change-plan-sheet-loading")).toBeHidden({ timeout: 15_000 });
  }
  await expect(page.getByTestId("change-plan-sheet-options")).toBeVisible();

  await page.getByTestId("change-plan-sheet-close").click();
  await expect(sheet).toBeHidden();
});

test("change-plan sheet closes via backdrop click", async ({ page }) => {
  await page.goto("/admin");
  await page.getByTestId("change-plan-button").first().click();
  await expect(page.getByTestId("change-plan-sheet")).toBeVisible();

  await page.getByTestId("change-plan-sheet-backdrop").click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId("change-plan-sheet")).toBeHidden();
});

test("change-plan options render expected per-tier sub-testids", async ({ page }) => {
  await page.goto("/admin");
  await page.getByTestId("change-plan-button").first().click();
  await expect(page.getByTestId("change-plan-sheet-options")).toBeVisible();

  // We don't assume which tiers are offered to this account — just that at
  // least one set of per-tier sub-testids is wired up.
  const anyDeltas = await page.locator("[data-testid^='change-plan-option-'][data-testid$='-deltas']").count();
  expect(anyDeltas, "expected at least one change-plan-option-*-deltas").toBeGreaterThan(0);

  await page.getByTestId("change-plan-sheet-close").click();
});

// Layout regression: on a short viewport the ConfirmUpgradeDialog (pricing +
// dedicated-hosting warning + provisioning-fee consent + buttons) used to push
// the Upgrade button off-screen. The footer is now pinned and the body scrolls.
//
// Safety: clicking Select only OPENS the dialog (which fetches a read-only
// proration preview). We NEVER click confirm-upgrade-confirm — that would
// re-tier the live account — and close via Cancel.
test("layout: confirm-upgrade action buttons stay on-screen on a short viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 460 });
  await page.goto("/admin");

  await page.getByTestId("change-plan-button").first().click();
  await expect(page.getByTestId("change-plan-sheet-options")).toBeVisible();

  // Open the confirm dialog for the first offered tier (read-only preview fetch).
  await page
    .locator("[data-testid^='change-plan-option-'][data-testid$='-select']")
    .first()
    .click();

  await expect(page.getByTestId("confirm-upgrade-dialog")).toBeVisible();
  await expect(page.getByTestId("confirm-upgrade-footer")).toBeInViewport();
  await expect(page.getByTestId("confirm-upgrade-confirm")).toBeInViewport();

  // Close WITHOUT confirming.
  await page.getByTestId("confirm-upgrade-cancel").click();
  await expect(page.getByTestId("confirm-upgrade-dialog")).toBeHidden();
});
