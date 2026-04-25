/**
 * Login and signup pages render their forms and required testids.
 *
 * Safety: read-only. We FILL inputs but never click submit — submitting on
 * prod would send a real magic link to whatever address we typed.
 */

import { test, expect } from "@playwright/test";

test.describe("/login", () => {
  test("renders magic-link login form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("login-form")).toBeVisible();
    await expect(page.getByTestId("login-email")).toBeVisible();
    await expect(page.getByTestId("login-submit")).toBeVisible();

    // Prod is currently magic-link-only; OAuth provider buttons (signin-google,
    // signin-github) are pre-registered in DUAL-ACCESSIBILITY.md but not yet
    // wired in the UI. We don't require them — but if they ever ship, this
    // test happily co-exists.
    const google = await page.getByTestId("signin-google").count();
    const github = await page.getByTestId("signin-github").count();
    expect(google + github, "OAuth providers may be 0 (magic-link-only) or more").toBeGreaterThanOrEqual(0);
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
