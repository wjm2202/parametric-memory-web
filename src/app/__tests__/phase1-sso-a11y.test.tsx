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

// ── Derived from the canonical tier registry so price changes don't break
// the test. If you change a tier price in src/config/tiers.ts, these values
// recompute and the assertions still hold — provided the source kept
// referencing the helpers (getAggregateOfferData, getCheapestPublicPrice).
import { TIERS, ENTERPRISE_TIERS } from "@/config/tiers";
const PUBLIC_TIERS = [...TIERS.filter((t) => t.publiclySold), ...ENTERPRISE_TIERS];
const CHEAPEST_PRICE = Math.min(...PUBLIC_TIERS.map((t) => t.price));
const HIGHEST_PRICE = Math.max(...PUBLIC_TIERS.map((t) => t.price));
const PUBLIC_OFFER_COUNT = PUBLIC_TIERS.length;
// Any other publicly-sold tier price that is NOT the cheapest — used to assert
// "the second-cheapest price isn't accidentally exposed as the starting price".
const SECOND_CHEAPEST = [...new Set(PUBLIC_TIERS.map((t) => t.price))].sort((a, b) => a - b)[1];
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
  it("landing page JSON-LD AggregateOffer derives from canonical tier registry", async () => {
    // Source must use the helper, not a literal — proves the AggregateOffer
    // is single-sourced from src/config/tiers.ts.
    expect(pageSrc).toMatch(/getAggregateOfferData\(\)/);
    // Runtime assertion against the helper output — guards the actual values
    // GSC will see in the rendered JSON-LD.
    const { getAggregateOfferData } = await import("@/lib/pricing");
    const agg = getAggregateOfferData();
    expect(agg.lowPrice).toBe(String(CHEAPEST_PRICE));
    expect(agg.highPrice).toBe(String(HIGHEST_PRICE));
    expect(agg.offerCount).toBe(String(PUBLIC_OFFER_COUNT));
  });

  it("proof band does not surface a non-cheapest tier as the starting price", () => {
    // 2026-07-01 redesign: the old `stats` array is now `proofBand` and no
    // longer surfaces a tier PRICE at all — it shows performance metrics
    // ("0.045ms", "64%", …) and "Your own / isolated substrate". The starting
    // price now lives in the hero CTA and the pricing preview. The guard's
    // intent survives: the proof band must not advertise a NON-cheapest tier
    // price as the "starting" number. Anchor on the array literal directly.
    const bandMatch = pageSrc.match(/const proofBand\s*=\s*\[([\s\S]*?)\];/);
    expect(
      bandMatch,
      "Could not locate `const proofBand = [...]` in page.tsx — has it been renamed or restructured? Update this test's anchor.",
    ).not.toBeNull();
    const bandBlock = bandMatch![1];

    // The second-cheapest price must NOT appear in the proof band — that would
    // mean it's advertising a pricier tier as the starting number. Prices
    // legitimately appear elsewhere (hero CTA, pricing preview, JSON-LD).
    if (CHEAPEST_PRICE !== SECOND_CHEAPEST) {
      const secondCheapestRegex = new RegExp(`"\\$${SECOND_CHEAPEST}\\/mo"`);
      expect(bandBlock).not.toMatch(secondCheapestRegex);
    }
  });

  it("OG image alt text in layout.tsx surfaces the cheapest public price", async () => {
    // Source must invoke the helper — proves the alt text is derived.
    expect(layoutSrc).toMatch(/getOgImageAltText\(\)/);
    const { getOgImageAltText } = await import("@/lib/pricing");
    const alt = getOgImageAltText();
    expect(alt).toContain(`From $${CHEAPEST_PRICE}/mo`);
    if (CHEAPEST_PRICE !== SECOND_CHEAPEST) {
      expect(alt).not.toContain(`From $${SECOND_CHEAPEST}/mo`);
    }
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
