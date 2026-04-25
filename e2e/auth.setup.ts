/**
 * One-time auth capture.
 *
 * Run with: `npm run e2e:auth`
 *
 * What it does
 * ------------
 * 1. Opens a HEADED Chromium window to {baseURL}/login.
 * 2. Injects a small "Auth helper" toolbar at the top of every page so you
 *    can paste a magic-link URL into the Playwright window even when your
 *    email client opens the link in your default browser instead. (See
 *    README "Magic-link flow" for the full why.)
 * 3. Polls — without any per-test timeout — for one of the post-login
 *    testids to appear. When it does, saves cookies + localStorage +
 *    IndexedDB to `e2e/.auth/user.json` and closes.
 *
 * Three ways to complete login (any of them works — the polling doesn't
 * care which path you took):
 *
 *   A) OAuth (only if AUTH_OAUTH_ENABLED=true on prod): click
 *      "Sign in with Google" / "Sign in with GitHub" in the Playwright
 *      window, complete consent, get redirected back. All inside the
 *      Playwright window — this Just Works.
 *
 *   B) Magic link (clean path): type your email in the Playwright window
 *      → click "Send sign-in link" → open the email → COPY the magic-link
 *      URL → paste into the Playwright window's "Auth helper" toolbar →
 *      click Go. The window navigates and the cookie lands in the right
 *      browser context.
 *
 *   C) Magic link (lazy path): click the link in your email. If your
 *      default browser opens, the cookie ends up in the wrong place. Come
 *      back to the Playwright window, paste the URL into the toolbar, click
 *      Go.
 *
 * The saved file is your live session token. It's gitignored. Treat it
 * like a password — don't paste it into chat, don't commit it. Regenerate
 * it (`npm run e2e:auth`) whenever you log out or your session expires.
 *
 * Re-run scenarios
 * ----------------
 * - First time setting up the suite.
 * - After logging out anywhere.
 * - When tests start failing with redirects to /login (storageState expired).
 */

import { test as setup, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const AUTH_FILE = path.resolve(__dirname, ".auth", "user.json");

setup("authenticate the user (magic-link or OAuth)", async ({ page, context }) => {
  await mkdir(path.dirname(AUTH_FILE), { recursive: true });

  // Inject the "Auth helper" toolbar before the first navigation so it's
  // present from the very first page render. addInitScript runs on every
  // navigation in this context, including OAuth redirects, so the toolbar
  // is always there if the user needs it.
  await page.addInitScript(() => {
    function injectToolbar() {
      if (document.getElementById("__pw_auth_helper")) return;
      if (!document.body) return; // not ready yet
      const root = document.createElement("div");
      root.id = "__pw_auth_helper";
      root.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:2147483647;" +
        "background:#1e1b4b;color:#e0e7ff;padding:8px 12px;" +
        "font:12px/1.4 system-ui,-apple-system,sans-serif;" +
        "display:flex;gap:8px;align-items:center;" +
        "border-bottom:2px solid #6366f1;box-shadow:0 2px 8px rgba(0,0,0,0.4)";
      root.innerHTML = `
        <span style="font-weight:600;white-space:nowrap">🔐 Auth helper:</span>
        <span style="white-space:nowrap;color:#c7d2fe">Paste magic-link URL →</span>
        <input id="__pw_url" type="text" autocomplete="off"
               style="flex:1;min-width:300px;padding:6px 10px;border:1px solid #4338ca;
                      background:#312e81;color:#fff;border-radius:4px;font:12px/1.4 monospace"
               placeholder="https://parametric-memory.dev/api/auth/callback?token=..." />
        <button id="__pw_go" type="button"
                style="padding:6px 16px;background:#6366f1;color:#fff;border:0;
                       border-radius:4px;cursor:pointer;font-weight:600;font:12px/1.4 system-ui">
          Go
        </button>
      `;
      document.body.insertBefore(root, document.body.firstChild);
      const input = document.getElementById("__pw_url") as HTMLInputElement;
      const go = () => {
        const url = input.value.trim();
        if (url) (window as Window).location.href = url;
      };
      document.getElementById("__pw_go")!.addEventListener("click", go);
      input.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key === "Enter") go();
      });
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", injectToolbar);
    } else {
      injectToolbar();
    }
    // Re-inject on SPA-style route changes that don't fire DOMContentLoaded.
    setInterval(injectToolbar, 500);
  });

  console.log("\n=== Auth capture ===");
  console.log("A Chromium window has opened at /login.\n");
  console.log("Magic-link flow (the only option on prod right now — OAuth code");
  console.log("is shipped but feature-flagged off until AUTH_OAUTH_ENABLED=true");
  console.log("is set in .env.prod):\n");
  console.log("  1. In the Playwright window, type your email and click");
  console.log("     'Send sign-in link'.");
  console.log("  2. Open your inbox in any browser.");
  console.log("  3. RIGHT-CLICK the magic link → 'Copy Link Address'.");
  console.log("     (Do not left-click — that opens your default browser and");
  console.log("     the session cookie lands in the wrong place.)");
  console.log("  4. Paste the URL into the 'Auth helper' toolbar at the TOP");
  console.log("     of the Playwright window.");
  console.log("  5. Click 'Go' (or press Enter). The Playwright window");
  console.log("     navigates to the callback, your session is captured,");
  console.log("     and the window closes itself.\n");
  console.log("If you accidentally clicked the link and it opened your default");
  console.log("browser: copy the URL from that browser's address bar and paste");
  console.log("it into the Auth helper toolbar — recovery works the same way.\n");
  console.log("There is NO per-test timeout — take as long as you need.\n");

  await page.goto("/login");

  // Poll forever (the project-level timeout:0 in playwright.config.ts means
  // we're never killed). Generous expect.poll timeout so it doesn't itself
  // become the bottleneck.
  await expect
    .poll(
      async () => {
        const url = page.url();
        // Still on a login/auth page → keep waiting.
        if (url.includes("/login") || url.includes("/auth/")) return false;
        // Look for any of the post-login testid landmarks.
        const candidates = [
          "[data-testid='nav-auth-dashboard']",
          "[data-testid='admin-substrate-header']",
          "[data-testid='dashboard-substrate-list']",
          "[data-testid='change-plan-button']",
          "[data-testid='billing-widget']",
        ];
        for (const sel of candidates) {
          if ((await page.locator(sel).count()) > 0) return true;
        }
        return false;
      },
      {
        // 60-min upper bound — well past any realistic email delivery /
        // consent-flow / "I went to make tea" duration. The project-level
        // timeout:0 means this is the only ceiling.
        timeout: 60 * 60 * 1000,
        intervals: [1000, 2000, 5000],
        message:
          "Timed out after 60 minutes waiting for login. If you finished " +
          "logging in but the script didn't notice, the post-login page might " +
          "not have a known authenticated testid yet — check e2e/auth.setup.ts " +
          "and add the right selector to the candidates list.",
      },
    )
    .toBe(true);

  // Persist cookies + local/session storage + IndexedDB.
  await context.storageState({ path: AUTH_FILE, indexedDB: true });

  console.log(`\n✔ Session saved to ${AUTH_FILE}`);
  console.log("You can now run `npm run e2e` to execute the full suite.\n");
});
