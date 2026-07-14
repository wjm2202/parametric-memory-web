/**
 * Sprint 2026-W18 — Google Search Console merchant-listings invariants
 * (revised 2026-07-13 after the Ahrefs schema.org validation audit)
 *
 * Pins the fixes for the invalid items GSC flagged on /pricing on Mar 23, 2026:
 *   - 1 critical per offer:  Missing field "image"          → fixed (image)
 *   - warning per offer:     Missing "hasMerchantReturnPolicy" → fixed (real
 *     7-day money-back policy)
 *   - warning per offer:     Missing "shippingDetails"      → INTENTIONALLY
 *     NOT fixed. The W18 attempt invented a zero-cost "Worldwide" shipping
 *     block using geoMidpoint on DefinedRegion — an invalid property that
 *     put a schema.org validation error on every page (6 per page, Ahrefs
 *     2026-07-13). Shipping vocabulary is for physical goods; a SaaS has
 *     nothing to ship. The GSC warning is the correct steady state.
 *
 * The schema source moved during the modular pricing refactor (2026-05-01):
 *   - Old: hardcoded `softwareApplicationJsonLd.offers` array in src/app/layout.tsx
 *   - New: `getOffersJsonLd()` in src/lib/pricing/index.ts, called from layout.tsx
 *
 * This test exercises the helper directly. That's a stronger contract — it
 * validates the structure GSC will see, regardless of how the array was built.
 *
 * Sister test files:
 *   - seo-metadata.test.ts   (meta-tag + keyword invariants)
 *   - seo-headers.test.ts    (X-Robots-Tag + robots.txt)
 *   - layout.test.ts         (viewport + base metadata)
 */

import { describe, it, expect } from "vitest";
import {
  getOffersJsonLd,
  getAggregateOfferData,
  defaultPriceValidUntil,
  getAllPublicTiers,
} from "@/lib/pricing";

// Synthetic constants — match the shape of layout.tsx's actual values
// without coupling the test to the layout module's internal exports.
const TEST_INPUTS = {
  baseUrl: "https://parametric-memory.dev",
  imageUrl: "https://parametric-memory.dev/brand/og.png",
  returnPolicy: {
    "@type": "MerchantReturnPolicy",
    merchantReturnDays: 7,
  },
  priceValidUntil: defaultPriceValidUntil(),
};

describe("merchant-listings JSON-LD — getOffersJsonLd() output shape", () => {
  it("emits one Offer per publicly-sold tier (billing + enterprise)", () => {
    const offers = getOffersJsonLd(TEST_INPUTS);
    const expected = getAllPublicTiers().length;
    expect(offers.length).toBe(expected);
    // Sanity: every offer has @type Offer.
    for (const o of offers) {
      expect(o["@type"]).toBe("Offer");
    }
  });

  it("every Offer has the image field set to the inputs.imageUrl", () => {
    const offers = getOffersJsonLd(TEST_INPUTS);
    for (const o of offers) {
      expect(o.image).toBe(TEST_INPUTS.imageUrl);
    }
  });

  it("no Offer carries shippingDetails (digital SaaS — see header comment)", () => {
    const offers = getOffersJsonLd(TEST_INPUTS);
    for (const o of offers) {
      expect(o).not.toHaveProperty("shippingDetails");
    }
    // Belt and braces: the invalid geoMidpoint-on-DefinedRegion hack must
    // never come back anywhere in the offers output.
    expect(JSON.stringify(offers)).not.toContain("geoMidpoint");
  });

  it("every Offer has hasMerchantReturnPolicy referencing the same return-policy object", () => {
    const offers = getOffersJsonLd(TEST_INPUTS);
    for (const o of offers) {
      expect(o.hasMerchantReturnPolicy).toBe(TEST_INPUTS.returnPolicy);
    }
  });

  it("every Offer has a priceValidUntil ISO date in the future", () => {
    const offers = getOffersJsonLd(TEST_INPUTS);
    const today = new Date().toISOString().slice(0, 10);
    for (const o of offers) {
      expect(o.priceValidUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(o.priceValidUntil >= today).toBe(true);
    }
  });

  it("every Offer carries price + priceCurrency = USD + InStock availability", () => {
    const offers = getOffersJsonLd(TEST_INPUTS);
    for (const o of offers) {
      expect(o.price).toMatch(/^\d+$/);
      expect(o.priceCurrency).toBe("USD");
      expect(o.availability).toBe("https://schema.org/InStock");
    }
  });

  it("every Offer URL points to the pricing page", () => {
    const offers = getOffersJsonLd(TEST_INPUTS);
    for (const o of offers) {
      expect(o.url.startsWith(`${TEST_INPUTS.baseUrl}/pricing`)).toBe(true);
    }
  });

  it("priceValidUntil defaults to today + ~365 days when not supplied", () => {
    const offers = getOffersJsonLd({ ...TEST_INPUTS, priceValidUntil: undefined });
    const today = new Date();
    today.setDate(today.getDate() + 365);
    const expected = today.toISOString().slice(0, 10);
    // Allow ±1 day of timezone drift between the helper and the assertion.
    for (const o of offers) {
      const t = new Date(o.priceValidUntil);
      const e = new Date(expected);
      const drift = Math.abs(t.getTime() - e.getTime()) / 86_400_000;
      expect(drift).toBeLessThanOrEqual(1);
    }
  });
});

describe("AggregateOffer — Google Software App rich result contract", () => {
  it("includes price (= lowPrice): required by Google even on AggregateOffer", () => {
    // Google's SoftwareApplication feature fails with "Missing required
    // price property" when an AggregateOffer has only lowPrice/highPrice
    // (Ahrefs rich-results error on the homepage, 2026-07-13).
    const agg = getAggregateOfferData();
    expect(agg.price).toBe(agg.lowPrice);
    expect(agg.price).toMatch(/^\d+$/);
    expect(agg.priceCurrency).toBe("USD");
  });
});

describe("merchant-listings JSON-LD — pricing values follow tiers.ts", () => {
  // Cross-check: the prices in the generated offers must equal the prices in
  // the canonical tier registry. If someone hardcodes a price elsewhere
  // (e.g. via a literal in the helper), this catches it.
  it("Offer prices exactly match the canonical TIERS price field", () => {
    const offers = getOffersJsonLd(TEST_INPUTS);
    const publicTiers = getAllPublicTiers();
    const offerPrices = offers.map((o) => Number(o.price)).sort((a, b) => a - b);
    const tierPrices = publicTiers.map((t) => t.price).sort((a, b) => a - b);
    expect(offerPrices).toEqual(tierPrices);
  });
});
