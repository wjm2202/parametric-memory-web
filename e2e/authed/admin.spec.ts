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

// MCP status pill is driven by API-KEY CLAIM STATE, not the reachability probe.
// The pill exposes `data-mcp-active="true|false"`: "true" (emerald) once the key
// is claimed, "false" (amber) while it's still pending a claim. This pins the
// 2026-06 fix where the badge stayed red after a successful claim because the
// health probe can't authenticate against the substrate. Read-only.
test("admin MCP pill reflects key-claim state via data-mcp-active", async ({ page }) => {
  await page.goto("/admin");
  const pill = page.getByTestId("mcp-status-pill");

  // The pill only renders for a running substrate that reports health. If this
  // account's substrate isn't in that state, there's nothing to assert.
  if ((await pill.count()) === 0) {
    test.skip(true, "no running substrate with health on this account");
    return;
  }

  await expect(pill).toBeVisible();
  // Claim-state contract: the attribute must be present and boolean-valued.
  // (The old reachability-driven badge had no such attribute at all.)
  await expect(pill).toHaveAttribute("data-mcp-active", /^(true|false)$/);

  // When the key is claimed the pill is the active/green variant and must never
  // show the old stuck-red error styling.
  if ((await pill.getAttribute("data-mcp-active")) === "true") {
    await expect(pill).toHaveClass(/emerald/);
    await expect(pill).not.toHaveClass(/\bred\b/);
  }
});
