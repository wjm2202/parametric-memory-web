/**
 * Pricing helpers — single derivation layer over src/config/tiers.ts.
 *
 * Every consumer that needs a price string, a JSON-LD offer, a marketing
 * description, or a pricing table row imports from here instead of
 * hardcoding numbers. When `tiers.ts` changes, every layer updates.
 *
 * Layers that consume this module:
 *   - src/app/layout.tsx    — JSON-LD softwareApplicationJsonLd.offers
 *                             + meta description, Twitter description
 *   - src/app/page.tsx      — home page meta description
 *   - src/app/terms/page.tsx — pricing table rows
 *   - src/app/faq/page.tsx  — pricing stat values
 *   - scripts/build-llms-txt.ts — codegen for public/llms.txt
 *
 * Test coverage: src/lib/pricing/__tests__/pricing.test.ts pins the
 * derived strings + structures to the canonical tier registry.
 */

import {
  TIERS,
  ENTERPRISE_TIERS,
  type Tier,
  type EnterpriseTier,
  type TierDeployment,
} from "@/config/tiers";

// ── Currency ───────────────────────────────────────────────────────────────

/**
 * The single currency all published prices are denominated in. Every price the
 * site shows a human is in USD; making that explicit avoids surprising
 * customers in other countries at checkout. JSON-LD already carries
 * priceCurrency: "USD" — these constants make the same fact visible in copy.
 */
export const PRICE_CURRENCY = "USD" as const;

/**
 * Reusable, human-readable currency disclaimer. Drop this next to any price
 * surface (pricing cards, checkout, dashboard, admin, docs, terms) so the
 * currency is unambiguous at the point of decision.
 */
export const PRICE_CURRENCY_NOTE = "All prices are in US dollars (USD).";

/** Format a monthly price with an explicit USD qualifier, e.g. "$5/mo USD". */
export function formatMonthlyUsd(price: number): string {
  return `$${price}/mo ${PRICE_CURRENCY}`;
}

// ── Tier filtering ─────────────────────────────────────────────────────────

/** All publicly-sold billing tiers (excludes the post-trial "free" fallback). */
export function getPublicBillingTiers(): Tier[] {
  return TIERS.filter((t) => t.publiclySold);
}

/** All publicly-sold tiers, including enterprise. Used by JSON-LD offers + llms.txt. */
export function getAllPublicTiers(): (Tier | EnterpriseTier)[] {
  return [...getPublicBillingTiers(), ...ENTERPRISE_TIERS];
}

/** Tiers with shared infrastructure (Starter, Solo as of 2026-05-01). */
export function getSharedTiers(): Tier[] {
  return getPublicBillingTiers().filter((t) => t.deployment === "shared");
}

/** Tiers with dedicated infrastructure (Pro, Team — Enterprise is dedicated by definition). */
export function getDedicatedTiers(): Tier[] {
  return getPublicBillingTiers().filter((t) => t.deployment === "dedicated");
}

// ── Price extraction ───────────────────────────────────────────────────────

/** Cheapest publicly-sold tier (any deployment). Used for "from $X/mo" copy. */
export function getCheapestPublicPrice(): number {
  const tiers = getPublicBillingTiers();
  if (tiers.length === 0) {
    throw new Error("No publicly-sold tiers configured");
  }
  return Math.min(...tiers.map((t) => t.price));
}

/** Cheapest tier with shared deployment, or null if no shared tiers exist. */
export function getCheapestSharedPrice(): number | null {
  const tiers = getSharedTiers();
  if (tiers.length === 0) return null;
  return Math.min(...tiers.map((t) => t.price));
}

/** Cheapest tier with dedicated deployment, or null if no dedicated tiers exist. */
export function getCheapestDedicatedPrice(): number | null {
  const tiers = getDedicatedTiers();
  if (tiers.length === 0) return null;
  return Math.min(...tiers.map((t) => t.price));
}

/** Highest publicly-sold tier price (excluding self-hosted, which is contact-sales). */
export function getHighestPublicPrice(): number {
  return Math.max(...getAllPublicTiers().map((t) => t.price));
}

// ── Marketing strings ──────────────────────────────────────────────────────

/**
 * Headline marketing line that adapts to the current tiering model.
 *
 * Examples:
 *   - shared+dedicated:  "Dedicated from $29/mo, shared from $5/mo USD"
 *   - dedicated only:    "Dedicated instances from $29/mo USD"
 *   - shared only:       "From $5/mo USD"
 */
export function getMarketingPriceLine(): string {
  const dedicated = getCheapestDedicatedPrice();
  const shared = getCheapestSharedPrice();
  if (dedicated !== null && shared !== null && dedicated !== shared) {
    return `Dedicated from $${dedicated}/mo, shared from $${shared}/mo ${PRICE_CURRENCY}`;
  }
  if (dedicated !== null) return `Dedicated instances from $${dedicated}/mo ${PRICE_CURRENCY}`;
  if (shared !== null) return `From $${shared}/mo ${PRICE_CURRENCY}`;
  throw new Error("No public tiers configured");
}

/**
 * Short price hook for meta descriptions — fits the Google 160-char snippet.
 *
 * Always references the cheapest publicly-sold tier with the deployment
 * model qualifier so SEO copy doesn't mislead.
 */
export function getMetaPriceHook(): string {
  const cheapest = getCheapestPublicPrice();
  const tier = getPublicBillingTiers().find((t) => t.price === cheapest)!;
  return tier.deployment === "dedicated"
    ? `Dedicated instances from $${cheapest}/mo ${PRICE_CURRENCY}`
    : `From $${cheapest}/mo (shared) — dedicated from $${getCheapestDedicatedPrice() ?? "?"}/mo ${PRICE_CURRENCY}`;
}

/**
 * Compose the full home-page meta description with the price hook.
 *
 * Format: "<hook>. Merkle proofs, Markov prediction, sub-ms recall.
 *          <price line>."
 *
 * Length-bounded by Google's 160-char snippet — see the
 * seo-metadata.test.ts assertion `MAX_DESC = 160`.
 */
export function getHomeMetaDescription(): string {
  const priceLine = getMarketingPriceLine();
  return `The L2 cache for AI agents: predictive, verifiable memory — Merkle proofs, Markov prefetch, sub-ms recall. ${priceLine}.`;
}

/** Layout-level fallback description (used when a page doesn't override). */
export function getLayoutMetaDescription(): string {
  const priceLine = getMarketingPriceLine();
  return `The L2 cache for AI agents — predictive, verifiable memory. Merkle proofs, Markov prefetch, MCP-native. ${priceLine}.`;
}

/** Twitter-card description — same shape as home meta but trimmed. */
export function getTwitterDescription(): string {
  const priceLine = getMarketingPriceLine();
  return `The L2 cache for AI agents — predictive, verifiable memory that keeps context warm before your agent asks. ${priceLine}.`;
}

// ── JSON-LD offers (used by layout.tsx softwareApplicationJsonLd) ──────────

export interface OfferJsonLd {
  "@type": "Offer";
  name: string;
  description: string;
  price: string;
  priceCurrency: "USD";
  priceSpecification: {
    "@type": "UnitPriceSpecification";
    price: string;
    priceCurrency: "USD";
    billingDuration: "P1M";
    unitCode: "MON";
  };
  availability: "https://schema.org/InStock";
  url: string;
  priceValidUntil: string;
  image: string;
  shippingDetails: unknown; // structurally typed at the consumer
  hasMerchantReturnPolicy: unknown;
}

export interface OfferJsonLdInputs {
  baseUrl: string;
  imageUrl: string;
  shippingDetails: unknown;
  returnPolicy: unknown;
  /** ISO date — Google rejects past dates. Default: today + 365 days. */
  priceValidUntil?: string;
}

/** Default priceValidUntil = today + 365 days (ISO YYYY-MM-DD). */
export function defaultPriceValidUntil(): string {
  const d = new Date();
  d.setDate(d.getDate() + 365);
  return d.toISOString().slice(0, 10);
}

/**
 * Build the JSON-LD offers array from the canonical tier registry. Used by
 * layout.tsx — replaces the previous hardcoded 6-offer block.
 */
export function getOffersJsonLd(inputs: OfferJsonLdInputs): OfferJsonLd[] {
  const validUntil = inputs.priceValidUntil ?? defaultPriceValidUntil();
  return getAllPublicTiers().map((t) => {
    const slug = "id" in t ? slugForUrl(t.id) : "";
    const url = slug ? `${inputs.baseUrl}/pricing#${slug}` : `${inputs.baseUrl}/pricing`;
    return {
      "@type": "Offer" as const,
      name: t.name,
      description: t.description,
      price: String(t.price),
      priceCurrency: "USD" as const,
      priceSpecification: {
        "@type": "UnitPriceSpecification" as const,
        price: String(t.price),
        priceCurrency: "USD" as const,
        billingDuration: "P1M" as const,
        unitCode: "MON" as const,
      },
      availability: "https://schema.org/InStock" as const,
      url,
      priceValidUntil: validUntil,
      image: inputs.imageUrl,
      shippingDetails: inputs.shippingDetails,
      hasMerchantReturnPolicy: inputs.returnPolicy,
    };
  });
}

// ── Pricing table rows (used by terms.tsx + future pricing-table widgets) ──

export interface PricingTableRow {
  name: string;
  priceLabel: string; // "$5/mo USD" or "Custom"
  atomsLabel: string; // "1,000" or "Unlimited"
  retentionLabel: string; // "12 months", "36 months", "Unlimited"
  deployment: TierDeployment | "self-hosted";
}

/**
 * Retention is a marketing-tier mapping — the actual data retention is
 * enforced at the substrate level. This is a presentational helper.
 */
const RETENTION_BY_TIER_ID: Record<string, string> = {
  starter: "12 months",
  indie: "12 months",
  pro: "24 months",
  team: "36 months",
  "enterprise-cloud": "36 months",
  "enterprise-self-hosted": "Unlimited",
};

export function getPricingTableRows(): PricingTableRow[] {
  return getAllPublicTiers().map((t) => {
    const isEnterprise = !("limits" in t);
    const isSelfHosted = "id" in t && t.id === "enterprise-self-hosted";
    const atomsLabel = isEnterprise
      ? "Unlimited"
      : (t as Tier).limits.maxAtoms === -1
        ? "Unlimited"
        : (t as Tier).limits.maxAtoms.toLocaleString();
    const deployment: PricingTableRow["deployment"] = isSelfHosted
      ? "self-hosted"
      : isEnterprise
        ? "dedicated"
        : (t as Tier).deployment;
    return {
      name: t.name,
      priceLabel: `$${t.price}/mo ${PRICE_CURRENCY}`,
      atomsLabel,
      retentionLabel: RETENTION_BY_TIER_ID[t.id] ?? "—",
      deployment,
    };
  });
}

// ── Internal: id → URL slug mapping ────────────────────────────────────────

function slugForUrl(id: string): string {
  // Marketing slugs differ from canonical tier IDs:
  //   indie → solo (was the public name as of 2026-05-01)
  //   id-with-dashes → kept as-is (enterprise-cloud, enterprise-self-hosted)
  if (id === "indie") return "solo";
  return id;
}

// ── AggregateOffer + OG alt text helpers ───────────────────────────────────

export interface AggregateOfferData {
  /** Cheapest publicly-sold tier, as a string (Schema.org expects strings). */
  lowPrice: string;
  /** Highest publicly-sold tier (excludes self-hosted self-pay edge cases). */
  highPrice: string;
  /** Number of public offers. Used by SoftwareApplication aggregateOffer. */
  offerCount: string;
  priceCurrency: "USD";
}

/**
 * Aggregate-offer JSON-LD shape used on the landing page. Replaces the
 * previous hardcoded `{ lowPrice: "3", highPrice: "499", offerCount: "6" }`.
 */
export function getAggregateOfferData(): AggregateOfferData {
  const all = getAllPublicTiers();
  const prices = all.map((t) => t.price);
  return {
    lowPrice: String(Math.min(...prices)),
    highPrice: String(Math.max(...prices)),
    offerCount: String(all.length),
    priceCurrency: "USD",
  };
}

/**
 * OG image alt text — derived so it tracks the cheapest public price.
 * Used by layout.tsx openGraph.images[].alt.
 */
export function getOgImageAltText(): string {
  return `Parametric Memory — Persistent, verifiable AI memory. 0.045ms recall · 64% Markov hit rate · From $${getCheapestPublicPrice()}/mo ${PRICE_CURRENCY}.`;
}
