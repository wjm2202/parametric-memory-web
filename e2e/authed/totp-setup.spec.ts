/**
 * TOTP enrolment + disable e2e — full round-trip against a running stack.
 *
 * Pre-conditions:
 *   - mmpm-compute running on localhost:3100 with migration 080 applied.
 *   - mmpm-website running on localhost:3000 (this is the dev devctl harness).
 *   - The `e2e/auth.setup.ts` capture has run, so the test starts with an
 *     authenticated session in `e2e/.auth/user.json`.
 *
 * What the test does:
 *
 *   1. Navigate to /admin/security; assert the TOTP card shows "Off".
 *   2. Click "Set up two-factor authentication" → arrive at /admin/security/two-factor.
 *   3. Click "Continue" on the intro → assert the QR SVG renders + the
 *      manual key is exposed.
 *   4. Read the manual key from the DOM, compute the current 6-digit TOTP
 *      via the inline RFC-6238 helper below, and submit it via the
 *      6-digit input. Auto-submit fires when the sixth digit lands.
 *   5. Assert the "Save your backup codes" step renders 10 codes.
 *   6. Tick "I've saved these" + click "Done" → return to /admin/security.
 *   7. Assert the card now shows "On" with backup-codes-remaining = 10.
 *   8. Disable: click Manage → Disable 2FA → enter a fresh code → submit.
 *   9. Assert card flips back to "Off".
 *
 * ## Why we generate TOTP codes inline instead of using otplib
 *
 * RFC-6238 is ~25 lines using node:crypto. Adding @otplib/preset-default as
 * a website devDep just for one e2e test was rejected — the algorithm is
 * stable (HMAC-SHA1, 30s step, 6 digits) and the inline implementation is
 * easy to read for anyone debugging a flaky test.
 *
 * ## Why we read the manual key, not the QR
 *
 * Decoding the QR SVG to recover the OTPAUTH URI would require a QR
 * library and SVG-to-pixel rasterisation. The manual key (the same secret
 * the QR encodes) is exposed inline as `<code data-testid='enrol-manual-key'>`
 * specifically so e2e tests can grab it without a QR decoder.
 */

import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";

// ─── RFC-6238 TOTP generator (inline, no deps) ───────────────────────────────

/**
 * Generate the current TOTP code for a base32 secret.
 *
 * Defaults match every authenticator app on the planet and the
 * compute server's totp-service.ts: 6 digits, 30-second step, SHA-1.
 */
function generateTotp(base32Secret: string, atDate = new Date()): string {
  const key = base32Decode(base32Secret.toUpperCase());
  const counter = Math.floor(atDate.getTime() / 1000 / 30);
  // 8-byte big-endian counter.
  const counterBuf = Buffer.alloc(8);
  // BigInt write so we don't lose precision past 2^32 / 30 seconds (year ~4173).
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(counterBuf).digest();
  // RFC-4226 dynamic truncation.
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

/**
 * Decode an RFC-4648 base32 string (no '=' padding required) to a Buffer.
 * The TOTP secret coming out of compute is `secret` from /setup-init —
 * already base32-encoded by otplib's authenticator.generateSecret().
 */
function base32Decode(input: string): Buffer {
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = input.replace(/=+$/, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of cleaned) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error(`base32: invalid char '${ch}'`);
    buffer = (buffer << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// ─── Type a 6-digit code into the SixDigitInput component ────────────────────

async function typeSixDigits(page: Page, code: string): Promise<void> {
  if (code.length !== 6 || !/^\d{6}$/.test(code)) {
    throw new Error(`typeSixDigits: invalid code '${code}'`);
  }
  for (let i = 0; i < 6; i++) {
    await page.getByTestId(`six-digit-input-${i}`).fill(code[i]);
  }
}

// ─── Production safety guard ─────────────────────────────────────────────────
//
// Every other test in e2e/authed/ is read-only — they navigate, assert, and
// never submit. THIS test deliberately mutates account state (it enrols and
// then disables TOTP). Running it against the prod BASE_URL would corrupt a
// real customer account. The guard below skips the test when BASE_URL points
// at a hostname that isn't localhost or 127.0.0.1.
//
// To run locally: `E2E_BASE_URL=http://localhost:3000 pnpm e2e:authed totp-setup.spec.ts`.
// On the prod CI run (default BASE_URL), this test reports as skipped, which
// is the desired behaviour — there is no production-safe variant.

const baseUrl = process.env.E2E_BASE_URL ?? "https://parametric-memory.dev";
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(baseUrl);

test.skip(!isLocal, "TOTP setup mutates account state — local-only test");

// ─── Test ────────────────────────────────────────────────────────────────────

test.describe("TOTP enrolment + disable", () => {
  test("happy path — enrol with authenticator code, then disable", async ({ page }) => {
    // 1. Land on /admin/security and confirm we start in the not-enrolled state.
    await page.goto("/admin/security");
    await expect(page.getByTestId("two-factor-status-card-not-enrolled")).toBeVisible();
    await page.getByTestId("two-factor-status-card-enable").click();

    // 2. Wizard intro → continue.
    await expect(page).toHaveURL(/\/admin\/security\/two-factor$/);
    await expect(page.getByTestId("enrol-step-intro")).toBeVisible();
    await page.getByTestId("enrol-step-intro-continue").click();

    // 3. QR + manual key visible.
    await expect(page.getByTestId("enrol-step-scan")).toBeVisible();
    await expect(page.getByTestId("enrol-qr-svg")).toBeVisible();
    const secret = (await page.getByTestId("enrol-manual-key").innerText()).trim();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    await page.getByTestId("enrol-step-scan-continue").click();

    // 4. Generate the current TOTP and submit. SixDigitInput auto-submits on
    //    the sixth digit.
    await expect(page.getByTestId("enrol-step-verify")).toBeVisible();
    const code = generateTotp(secret);
    await typeSixDigits(page, code);

    // 5. Backup codes shown.
    await expect(page.getByTestId("enrol-step-codes")).toBeVisible({ timeout: 10_000 });
    const codes = await page.getByTestId(/^enrol-backup-code-\d$/).allTextContents();
    expect(codes).toHaveLength(10);
    for (const c of codes) {
      expect(c).toMatch(/^[a-f0-9]{4}-[a-f0-9]{4}$/);
    }

    // 6. Acknowledge + finish → land on /admin/security.
    await page.getByTestId("enrol-acknowledge").check();
    await page.getByTestId("enrol-step-codes-finish").click();
    await expect(page).toHaveURL(/\/admin\/security$/);

    // 7. Card now shows enrolled.
    await expect(page.getByTestId("two-factor-status-card-enrolled")).toBeVisible();
    await expect(page.getByTestId("two-factor-status-card-backup-count")).toContainText(
      "10 of 10",
    );

    // 8. Disable: click Manage → arrive at the management screen → Disable.
    await page.getByTestId("two-factor-status-card-manage").click();
    await expect(page.getByTestId("manage-step-overview")).toBeVisible();
    await page.getByTestId("manage-go-disable").click();
    await expect(page.getByTestId("manage-step-disable")).toBeVisible();

    // 9. Generate a NEW code (the old one may already be in the consumed
    //    last_used_counter; new() at this moment is at counter+0 or
    //    counter+1, both fresh).
    const disableCode = generateTotp(secret);
    await page.getByTestId("manage-disable-input").fill(disableCode);
    await page.getByTestId("manage-disable-submit").click();

    // 10. Card flips back to off.
    await expect(page).toHaveURL(/\/admin\/security$/);
    await expect(page.getByTestId("two-factor-status-card-not-enrolled")).toBeVisible();
  });
});
