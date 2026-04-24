/**
 * Phase 1 — SSO/ASO bug-fix + a11y floor regression guard.
 *
 * Scope:
 *   1. Pricing consistency — no surface emits "$9/mo" or JSON-LD lowPrice "9".
 *   2. Focus-visible rings on OAuth links and submit buttons (LoginClient + SignupClient).
 *   3. Email inputs render text-base (>=16px) to prevent iOS Safari zoom on focus.
 *   4. Login outer wrapper carries overflow-x-hidden (parity with signup/admin/dashboard).
 *
 * These are source-file assertions (same rationale as mobile-typography.test.tsx):
 * HomePage / LoginClient / SignupClient are complex to render in jsdom (server
 * components, Next.js hooks, next/font); the className contract is the precise
 * surface we care about guarding against regression.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8");

const pageSrc = read("src/app/page.tsx");
const layoutSrc = read("src/app/layout.tsx");
const loginSrc = read("src/app/login/LoginClient.tsx");
const signupSrc = read("src/app/signup/SignupClient.tsx");

// The canonical focus-visible ring token Phase 1 applies to OAuth links and
// submit buttons. If this changes, keep the assertions below in sync.
const FOCUS_RING = [
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-indigo-400",
  "focus-visible:ring-offset-2",
  "focus-visible:ring-offset-[#030712]",
];

describe("Phase 1 — pricing consistency (no more $9/mo contradictions)", () => {
  it('landing page JSON-LD has lowPrice "3" and offerCount "6"', () => {
    expect(pageSrc).toMatch(/lowPrice: "3"/);
    expect(pageSrc).toMatch(/offerCount: "6"/);
    // Regressions:
    expect(pageSrc).not.toMatch(/lowPrice: "9"/);
    expect(pageSrc).not.toMatch(/offerCount: "5"/);
  });

  it('stats bar does not render "$9/mo" as starting price', () => {
    expect(pageSrc).not.toMatch(/"\$9\/mo"/);
    // Positive: the correct value is surfaced.
    expect(pageSrc).toMatch(/"\$3\/mo"/);
  });

  it('OG image alt text in layout.tsx says "From $3/mo"', () => {
    expect(layoutSrc).toMatch(/From \$3\/mo/);
    expect(layoutSrc).not.toMatch(/From \$9\/mo/);
  });
});

describe("Phase 1 — focus-visible rings on SSO + submit buttons", () => {
  it("OAuth <a> buttons in LoginClient carry the full focus-visible ring token", () => {
    // Anchor on the data-testid pattern unique to the OAuth button block.
    // Phase 2 renamed this from `oauth-button-${id}` to `signin-${id}` —
    // keep the anchor aligned with the DUAL-ACCESSIBILITY.md registry.
    const idx = loginSrc.indexOf("data-testid={`signin-${id}`}");
    expect(idx).toBeGreaterThan(-1);
    const block = loginSrc.slice(idx, idx + 500);
    for (const cls of FOCUS_RING) {
      expect(block).toContain(cls);
    }
  });

  it("LoginClient submit button carries the focus-visible ring token", () => {
    // Anchor on "Send sign-in link" — the unique submit text.
    const idx = loginSrc.indexOf("Send sign-in link");
    expect(idx).toBeGreaterThan(-1);
    // The className is 200–300 chars upstream of the label text.
    const block = loginSrc.slice(Math.max(0, idx - 600), idx);
    for (const cls of FOCUS_RING) {
      expect(block).toContain(cls);
    }
  });

  it("SignupClient submit button carries the focus-visible ring token", () => {
    // Anchor on "Continue" — the signup submit label. There are multiple
    // "Continue" occurrences (CheckEmailView CTA), but the form submit
    // button is specifically paired with disabled={loading || !email.trim() || !agreedToTerms}.
    const idx = signupSrc.indexOf("disabled={loading || !email.trim() || !agreedToTerms}");
    expect(idx).toBeGreaterThan(-1);
    const block = signupSrc.slice(idx, idx + 800);
    for (const cls of FOCUS_RING) {
      expect(block).toContain(cls);
    }
  });
});

describe("Phase 1 — iOS Safari zoom guard on login + signup email inputs", () => {
  it("LoginClient email input renders text-base (>=16px), not text-sm", () => {
    // Slice only the <input> element itself — from the placeholder anchor
    // to its closing "/>". A wider window leaks into the neighbouring error
    // banner, which legitimately uses text-sm.
    const idx = loginSrc.indexOf('placeholder="you@example.com"');
    expect(idx).toBeGreaterThan(-1);
    const end = loginSrc.indexOf("/>", idx);
    expect(end).toBeGreaterThan(idx);
    const block = loginSrc.slice(idx, end);
    expect(block).toMatch(/\btext-base\b/);
    expect(block).not.toMatch(/\btext-sm\b/);
  });

  it("SignupClient email input renders text-base (>=16px), not text-sm", () => {
    const idx = signupSrc.indexOf('placeholder="you@example.com"');
    expect(idx).toBeGreaterThan(-1);
    const end = signupSrc.indexOf("/>", idx);
    expect(end).toBeGreaterThan(idx);
    const block = signupSrc.slice(idx, end);
    expect(block).toMatch(/\btext-base\b/);
    expect(block).not.toMatch(/\btext-sm\b/);
  });
});

describe("Phase 1 — login outer wrapper overflow-x-hidden", () => {
  it("LoginClient root wrapper includes overflow-x-hidden (parity with signup/admin/dashboard M7 guard)", () => {
    // The outer wrapper is the first top-level <div> returned by LoginClient.
    // Phase 3 swapped `min-h-screen` for `min-h-[100dvh]` (iOS Safari dynamic
    // viewport). Anchor on the new token + bg-[#030712] pair.
    const match = loginSrc.match(
      /<div className="([^"]*min-h-\[100dvh\][^"]*bg-\[#030712\][^"]*)">/,
    );
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/\boverflow-x-hidden\b/);
  });
});
