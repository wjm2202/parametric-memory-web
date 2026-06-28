/**
 * USD currency-clarity invariants for the pricing derivation layer.
 *
 * Added 2026-06-28 after a customer-facing pass to make the currency explicit
 * everywhere a price is shown (so non-US buyers aren't surprised at checkout).
 * These lock in that the derived marketing strings, pricing-table rows, OG alt
 * text, and JSON-LD all state USD — while STILL carrying the cheapest "$X/mo"
 * price token that the SEO snippet tests (seo-metadata.test.ts,
 * phase1-sso-a11y.test.tsx) match on.
 *
 * Everything is derived from src/config/tiers.ts, so a future price change keeps
 * these assertions valid as long as the helpers stay the source of truth.
 */

import { describe, it, expect } from "vitest";
import { TIERS } from "@/config/tiers";
import {
  PRICE_CURRENCY,
  PRICE_CURRENCY_NOTE,
  formatMonthlyUsd,
  getMarketingPriceLine,
  getMetaPriceHook,
  getPricingTableRows,
  getOgImageAltText,
  getHomeMetaDescription,
  getLayoutMetaDescription,
  getTwitterDescription,
  getOffersJsonLd,
} from "@/lib/pricing";

const CHEAPEST_PUBLIC_PRICE = Math.min(...TIERS.filter((t) => t.publiclySold).map((t) => t.price));
const CHEAPEST_TOKEN = `$${CHEAPEST_PUBLIC_PRICE}/mo`;

describe("pricing — currency constants", () => {
  it("PRICE_CURRENCY is USD", () => {
    expect(PRICE_CURRENCY).toBe("USD");
  });

  it("PRICE_CURRENCY_NOTE is a human-readable USD disclaimer", () => {
    expect(PRICE_CURRENCY_NOTE).toMatch(/US dollars/);
    expect(PRICE_CURRENCY_NOTE).toMatch(/USD/);
  });

  it("formatMonthlyUsd appends an explicit USD qualifier", () => {
    expect(formatMonthlyUsd(5)).toBe("$5/mo USD");
    expect(formatMonthlyUsd(79)).toBe("$79/mo USD");
  });
});

describe("pricing — derived marketing strings state USD", () => {
  it("marketing price line names USD and keeps the cheapest price token", () => {
    const line = getMarketingPriceLine();
    expect(line).toContain("USD");
    expect(line).toContain(CHEAPEST_TOKEN);
  });

  it("meta price hook names USD and keeps the cheapest price token", () => {
    const hook = getMetaPriceHook();
    expect(hook).toContain("USD");
    expect(hook).toContain(CHEAPEST_TOKEN);
  });

  it("OG image alt text states USD and keeps the 'From $X/mo' hook", () => {
    const alt = getOgImageAltText();
    expect(alt).toContain("USD");
    expect(alt).toContain(`From ${CHEAPEST_TOKEN}`);
  });
});

describe("pricing — meta descriptions still fit Google's snippet with USD added", () => {
  it("home description ≤ 160 chars and contains the cheapest price token", () => {
    const desc = getHomeMetaDescription();
    expect(desc.length).toBeLessThanOrEqual(160);
    expect(desc).toContain(CHEAPEST_TOKEN);
    expect(desc).toContain("USD");
  });

  it("layout description ≤ 160 chars and contains USD", () => {
    const desc = getLayoutMetaDescription();
    expect(desc.length).toBeLessThanOrEqual(160);
    expect(desc).toContain("USD");
  });

  it("twitter description ≤ 200 chars and contains USD", () => {
    const desc = getTwitterDescription();
    expect(desc.length).toBeLessThanOrEqual(200);
    expect(desc).toContain("USD");
  });
});

describe("pricing — table rows + JSON-LD carry USD", () => {
  it("every priced table row label states USD", () => {
    for (const row of getPricingTableRows()) {
      // All current tiers are numerically priced; if a "Custom" row is ever
      // added it won't carry a $ amount, so only assert USD on $-priced rows.
      if (row.priceLabel.includes("$")) {
        expect(row.priceLabel, `${row.name} priceLabel`).toContain("USD");
      }
    }
  });

  it("JSON-LD offers declare priceCurrency USD", () => {
    const offers = getOffersJsonLd({
      baseUrl: "https://parametric-memory.dev",
      imageUrl: "https://parametric-memory.dev/brand/og.png",
      shippingDetails: {},
      returnPolicy: {},
    });
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      expect(o.priceCurrency).toBe("USD");
      expect(o.priceSpecification.priceCurrency).toBe("USD");
    }
  });
});
