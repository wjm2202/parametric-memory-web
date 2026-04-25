/**
 * Playwright configuration for parametric-memory.dev end-to-end tests.
 *
 * Why this file exists
 * --------------------
 * `parametric-memory.dev` is dual-accessibility (humans + AI agents) and the
 * pre-registered `data-testid` registry in `docs/DUAL-ACCESSIBILITY.md` is
 * intentionally Playwright-friendly. This config wires those testids up to a
 * read-only smoke suite that runs against PROD without mutating customer
 * state.
 *
 * Where it runs
 * -------------
 * - Default baseURL is the production site. Override per-run with
 *   `E2E_BASE_URL=http://localhost:3000 npm run e2e` to hit local dev.
 * - Local: headed by default (you watch the agent drive the browser).
 * - CI: headless by default (`CI=1` is detected automatically).
 *
 * Auth model
 * ----------
 * The `setup` project runs `e2e/auth.setup.ts` which opens a HEADED browser
 * to /login. You log in manually, the script saves storage state to
 * `e2e/.auth/user.json` (gitignored), and authed tests reuse that state.
 *
 * - `public` project: no auth. Runs against unauthenticated visitor view.
 * - `authed`  project: depends on `setup`, loads storage state, runs against
 *   the logged-in account view.
 *
 * Safety
 * ------
 * Tests in `e2e/smoke/` and `e2e/authed/` are READ-ONLY. They never click a
 * submit on signup/login, never confirm a tier change, never trigger Stripe
 * checkout, never rotate an API key. Mutations on prod are out of scope by
 * design — see e2e/README.md.
 */

import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "https://parametric-memory.dev";
const IS_CI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  // NOTE: no top-level `testIgnore`. The `public` and `authed` projects each
  // pin `testDir` to a subdirectory (`e2e/smoke`, `e2e/authed`), so they
  // can't see `e2e/auth.setup.ts` anyway. The `setup` project finds it via
  // its own `testMatch`.

  // Match Playwright's recommended defaults.
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  workers: IS_CI ? 1 : undefined,

  // Reporters: HTML for humans, list for terminal, JUnit for CI.
  reporter: IS_CI
    ? [["list"], ["html", { open: "never" }], ["junit", { outputFile: "test-results/junit.xml" }]]
    : [["list"], ["html", { open: "on-failure" }]],

  // Hard global cap so a hung prod request can't wedge the suite.
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    headless: IS_CI ? true : false,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Sensible action defaults for a public-internet target.
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    // Identify ourselves so prod logs can distinguish bot traffic.
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 ParametricMemory-E2E",
  },

  projects: [
    // Stage 1: capture the user's authenticated session.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      // Unlimited per-test timeout — auth involves human-in-the-loop steps
      // (email delivery, OAuth consent screens, magic-link clicks) that can
      // stretch arbitrarily long. The 30 / 60 minute defaults from the global
      // config would kill the run before the user finishes. The internal
      // expect.poll() in auth.setup.ts has its own bounded timeout.
      timeout: 0,
      use: {
        ...devices["Desktop Chrome"],
        // Auth capture MUST be headed — the user logs in by hand.
        headless: false,
        // Don't enforce action / navigation timeouts here either — the user
        // might leave the window idle for minutes while checking email.
        actionTimeout: 0,
        navigationTimeout: 0,
      },
    },

    // Stage 2a: public smoke — runs against the anonymous visitor view.
    {
      name: "public",
      testDir: "./e2e/smoke",
      use: { ...devices["Desktop Chrome"] },
    },

    // Stage 2b: authenticated flows — reuses storage state from `setup`.
    {
      name: "authed",
      testDir: "./e2e/authed",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
    },
  ],

  outputDir: "test-results/",
});
