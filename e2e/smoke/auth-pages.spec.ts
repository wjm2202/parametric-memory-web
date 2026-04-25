/**
 * Login and signup pages render their forms and required testids.
 *
 * Safety: read-only. We FILL inputs but never click submit — submitting on
 * prod would send a real magic link to whatever address we typed.
 */

import { test, expect } from "@playwright/test";

test.describe("/login", () => {
  test("renders magic-link login form and OAuth providers", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("login-form")).toBeVisible();
    await expect(page.getByTestId("login-email")).toBeVisible();
    await expect(page.getByTestId("login-submit")).toBeVisible();

    // Prod has both Google and GitHub OAuth shipped (April 25 2026). If
    // either of these vanishes from the SSR'd HTML it's almost certainly
    // the build-time-bake regression — /login lost its `force-dynamic`
    // export and Next.js statically generated a build that ran without
    // OAuth env vars. See src/app/login/page.tsx for the long version.
    //
    // If you intentionally turn OAuth off (e.g. AUTH_OAUTH_ENABLED=false
    // for a debug window), relax these to .toHaveCount(0) for the
    // duration. Don't silently weaken to >= 0 — that's how the original
    // bug went unnoticed for a build cycle.
    await expect(page.getByTestId("signin-google")).toBeVisible();
    await expect(page.getByTestId("signin-github")).toBeVisible();
  });

  test("submit button is the magic-link CTA", async ({ page }) => {
    await page.goto("/login");
    const submit = page.getByTestId("login-submit");
    await expect(submit).toBeVisible();
    // The button copy on prod is "Send sign-in link". Match loosely so a
    // future copy tweak ("Send link", "Email me a link", etc.) doesn't break.
    await expect(submit).toHaveText(/sign[- ]?in|sign[- ]?link|magic link|send link/i);
  });

  test("login page links to the create-account flow", async ({ page }) => {
    await page.goto("/login");
    // "First time? Create an account" — the anchor must exist and point at
    // /signup. We don't assert testid because this link isn't pre-registered.
    const createAccount = page.locator('a[href*="/signup"]').first();
    await expect(createAccount).toBeVisible();
  });

  test("typing into email is allowed (no submit)", async ({ page }) => {
    await page.goto("/login");
    const email = page.getByTestId("login-email");
    await email.fill("smoke-test@example.invalid");
    await expect(email).toHaveValue("smoke-test@example.invalid");
    // Intentionally do NOT submit — prod would send a real magic link.
  });
});

test.describe("/signup", () => {
  test("renders signup form", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByTestId("signup-form")).toBeVisible();
    await expect(page.getByTestId("signup-email")).toBeVisible();
    await expect(page.getByTestId("signup-form-submit")).toBeVisible();
  });
});
