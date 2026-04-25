/**
 * Catches console errors and uncaught page errors on the headline pages.
 *
 * Why
 *  - A Next.js hydration error or a missing-asset 404 commonly only shows up
 *    in the browser console, not in a 200 response. This test explicitly
 *    fails on console.error and pageerror events.
 *
 * Safety: read-only.
 *
 * Tuning
 *  - We allow-list the noisy third-party warnings we don't control (e.g.
 *    Stripe's deprecation notices). Add patterns to ALLOW with care.
 */

import { test, expect } from "@playwright/test";

const ALLOW: RegExp[] = [
  // Add specific allow-listed messages here, e.g. /Stripe.*deprecated/i.
];

const PAGES = ["/", "/pricing", "/login", "/signup", "/docs", "/blog", "/faq", "/about"];

for (const path of PAGES) {
  test(`${path} produces no console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (!ALLOW.some((re) => re.test(text))) errors.push(`[console] ${text}`);
      }
    });
    page.on("pageerror", (err) => {
      const text = err.message;
      if (!ALLOW.some((re) => re.test(text))) errors.push(`[pageerror] ${text}`);
    });

    const response = await page.goto(path, { waitUntil: "networkidle" });
    expect(response?.ok()).toBe(true);

    // Tiny settle — some errors fire post-hydration.
    await page.waitForTimeout(500);

    expect(errors, `Console errors on ${path}:\n  ${errors.join("\n  ")}`).toHaveLength(0);
  });
}
