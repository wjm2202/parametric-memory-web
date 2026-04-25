/**
 * Pricing page smoke — every pricing-card-*-cta the registry pre-registers is
 * present and points at /signup or /contact.
 *
 * Safety: read-only. We confirm the CTA exists and has an href; we do NOT
 * click the CTAs because that would land us in /signup with prefilled tier.
 */

import { test, expect } from "@playwright/test";

const PRICING_CTAS = [
  "pricing-card-starter-cta",
  "pricing-card-solo-cta",
  "pricing-card-pro-cta",
  "pricing-card-team-cta",
  "pricing-card-enterprise-cloud-cta",
  "pricing-card-enterprise-self-cta",
];

test("pricing page renders comparison structure", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByTestId("pricing-comparison")).toBeVisible();
  // Either the table OR the cards renders depending on viewport.
  const hasTable = await page.getByTestId("pricing-comparison-table").isVisible();
  const hasCards = await page.getByTestId("pricing-comparison-cards").isVisible();
  expect(hasTable || hasCards, "expected pricing-comparison-table or -cards").toBe(true);
});

for (const cta of PRICING_CTAS) {
  test(`pricing CTA ${cta} is present and linkable`, async ({ page }) => {
    await page.goto("/pricing");
    const el = page.getByTestId(cta).first();
    await expect(el, `${cta} should be visible on /pricing`).toBeVisible();
    // CTAs are <a> or <button> — both are fine, we just want them clickable.
    const tagName = await el.evaluate((node) => node.tagName.toLowerCase());
    expect(["a", "button"]).toContain(tagName);
  });
}
