/**
 * Pricing CTA — adblock-resilient hosted-redirect fallback (canary)
 *
 * SPRINT-CHECKOUT-ADBLOCKER-RESILIENCE-2026-05-29.md (D3.5)
 *
 * What this proves end-to-end
 *   When `js.stripe.com` is blocked at the network layer (real-world ad
 *   blockers, Brave Shields, strict EasyPrivacy filters), clicking
 *   `pricing-card-solo-cta` triggers the hosted-mode fallback: a POST to
 *   `/api/checkout` with `{ mode: "hosted" }` followed by a top-level
 *   navigation to the returned Stripe-hosted URL. The amber adblock notice
 *   must NOT appear.
 *
 * Safety against accidental prod mutation
 *   This spec intercepts the `/api/checkout` POST and answers with a
 *   synthetic 200 carrying a fake `checkout.stripe.com/c/pay/cs_test_…`
 *   URL. The real BFF is never reached, no real Stripe session is ever
 *   created. The navigation to checkout.stripe.com is also intercepted
 *   and aborted before any HTTPS request leaves the browser — we capture
 *   the attempted URL via `page.waitForRequest` and assert on it.
 *
 *   Result: 100% safe to run against prod baseURL. Nothing mutates.
 *
 * Why authed/ and not smoke/
 *   Only the logged-in CTA flow exercises the probe → hosted-redirect
 *   path; the logged-out CTA renders a `<Link>` to /login and never
 *   touches `probeStripeAvailability()`. Reusing the storageState from
 *   the `setup` project keeps us in the right branch.
 */

import { test, expect } from "@playwright/test";

test("hosted-redirect fallback fires when js.stripe.com is blocked", async ({
  page,
  context,
}) => {
  // ── 1. Block js.stripe.com at the network layer ────────────────────────
  // Same effect as uBlock Origin's EasyPrivacy entry. The PricingCTA probe
  // (`probeStripeAvailability` → `loadStripe`) will see a load error and
  // resolve `{ ok: false, reason: "load_failed" }`.
  await context.route("**/js.stripe.com/**", (route) => route.abort());

  // ── 2. Intercept /api/checkout to keep this safe against prod ──────────
  // The real BFF would create a Stripe Checkout Session. Synthesise the
  // response shape compute returns for `mode: "hosted"` and assert on the
  // request body once Playwright hands it to us.
  await context.route("**/api/checkout", (route) => {
    const request = route.request();
    // Hard guarantee: nothing reaches the real /api/checkout for any
    // method other than the POST we expect.
    if (request.method() !== "POST") return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        url: "https://checkout.stripe.com/c/pay/cs_test_e2e_adblock_canary_fake",
        tier: "indie",
        amountCents: 900,
      }),
    });
  });

  // ── 3. Abort the navigation to checkout.stripe.com ─────────────────────
  // We want to observe that the redirect was attempted, not actually
  // hit Stripe's servers. `aborted` is still observable on the
  // requestfailed event.
  await context.route("**/checkout.stripe.com/**", (route) => route.abort());

  // ── 4. Drive the flow ──────────────────────────────────────────────────
  await page.goto("/pricing");

  const cta = page.getByTestId("pricing-card-solo-cta").first();
  await expect(cta).toBeVisible();

  // The pricing card's clickwrap must be ticked before the button enables.
  // `getByRole("checkbox").first()` picks the Solo card's checkbox; on
  // small viewports there's still only one card per breakpoint.
  const checkbox = page.getByRole("checkbox").first();
  await checkbox.check();

  // Start listening for both the /api/checkout POST and the eventual
  // attempted navigation to checkout.stripe.com — before the click so
  // we don't race the page.
  const checkoutPostP = page.waitForRequest(
    (req) => req.url().includes("/api/checkout") && req.method() === "POST",
  );
  const stripeNavP = page.waitForRequest((req) =>
    req.url().startsWith("https://checkout.stripe.com/"),
  );

  await cta.click();

  // ── 5. Assert the /api/checkout body carries mode: "hosted" ─────────────
  const checkoutPost = await checkoutPostP;
  expect(checkoutPost.postDataJSON()).toEqual({ tier: "indie", mode: "hosted" });

  // ── 6. Assert the browser tried to navigate to the returned Stripe URL ─
  const stripeNav = await stripeNavP;
  expect(stripeNav.url()).toBe(
    "https://checkout.stripe.com/c/pay/cs_test_e2e_adblock_canary_fake",
  );

  // ── 7. The amber adblock notice MUST NOT appear ────────────────────────
  // It's the legacy fallback (sprint 2026-05-18 D10) — sprint 2026-05-29
  // demotes it to a last-resort. If it ever shows up here the new flow
  // has regressed back to the dead-end UX in the original screenshot.
  await expect(page.getByTestId("pricing-cta-adblock-notice")).toHaveCount(0);
});
