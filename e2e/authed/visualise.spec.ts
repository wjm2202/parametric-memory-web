/**
 * The /visualise route mounts the substrate viewer (Three.js / R3F).
 *
 * Why
 *  - WebGL-heavy pages have historically broken silently after dependency
 *    bumps. This test confirms the canvas mounts and the memory-ring SVG
 *    renders, without asserting on the actual graphics.
 *
 * Safety: read-only.
 */

import { test, expect } from "@playwright/test";

test("/visualise loads and mounts a canvas", async ({ page }) => {
  await page.goto("/visualise");
  // R3F renders a <canvas> inside its mount node.
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
});

test("/visualise memory ring SVG renders", async ({ page }) => {
  await page.goto("/visualise");
  const ring = page.getByTestId("memory-ring-svg");
  // Ring may be lazy-mounted — give it a generous window.
  await expect(ring).toBeVisible({ timeout: 15_000 });
});

test("/knowledge sidepanel renders for authed user", async ({ page }) => {
  await page.goto("/knowledge");
  await expect(page.getByTestId("knowledge-sidepanel").first()).toBeVisible({ timeout: 15_000 });
});
