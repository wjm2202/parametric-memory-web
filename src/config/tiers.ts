/**
 * Canonical tier registry — single source of truth for all layers.
 *
 * The compute tier IDs (free / indie / pro / team) are canonical. Every other
 * layer — pricing page, dashboard, admin panel, PricingCTA, Stripe env keys —
 * MUST import from here instead of maintaining its own inline copy.
 *
 * Enterprise Cloud and Enterprise Self-Hosted are contact-sales tiers that are
 * NOT wired into the compute billing system; they live in ENTERPRISE_TIERS below.
 */

// ── Canonical billing tiers ───────────────────────────────────────────────────

export type TierId = "free" | "indie" | "pro" | "team";

export interface TierLimits {
  maxAtoms: number;              // -1 = unlimited
  maxBootstrapsPerMonth: number; // -1 = unlimited
  maxStorageMB: number;          // -1 = unlimited
}

export interface TierFeature {
  name: string;
  included: boolean;
}

export interface Tier {
  /** Canonical ID used in compute DB, Stripe metadata, and API. */
  id: TierId;
  /** Marketing display name shown in UI. */
  name: string;
  /** Monthly price in USD (0 for free tier). */
  price: number;
  /** Short description shown under tier name on pricing page. */
  description: string;
  /** Badge label shown on the card (e.g. "Most Popular"), or null. */
  badge: string | null;
  /** Pricing page CTA button label. */
  cta: string;
  /** Compute-side resource limits. Must match CONTAINER_LIMITS in mmpm-compute. */
  limits: TierLimits;
  /** Pricing page feature checklist. */
  features: TierFeature[];
  /**
   * env var key for the Stripe monthly price ID: process.env[stripePriceEnvKey]
   * All tiers (including free at $1/mo) have a Stripe price.
   */
  stripePriceEnvKey: string;
  /**
   * env var key for the Stripe product ID: process.env[stripeProductEnvKey]
   */
  stripeProductEnvKey: string;
}

export const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    price: 1,
    description: "Get started with Parametric Memory. $1/month, cancel anytime.",
    badge: null,
    cta: "Get Started",
    limits: { maxAtoms: 500, maxBootstrapsPerMonth: 100, maxStorageMB: 50 },
    stripePriceEnvKey: "STRIPE_PRICE_FREE_MONTHLY",
    stripeProductEnvKey: "STRIPE_PRODUCT_FREE",
    features: [
      { name: "500 atoms", included: true },
      { name: "100 bootstraps / month", included: true },
      { name: "50 MB storage", included: true },
      { name: "Merkle proofs", included: true },
      { name: "Markov prediction", included: true },
      { name: "MCP native", included: true },
      { name: "Community support", included: true },
      { name: "Email support", included: false },
      { name: "Priority support", included: false },
    ],
  },
  {
    id: "indie",
    name: "Indie",
    price: 9,
    description: "For individual developers building with persistent memory.",
    badge: null,
    cta: "Get Indie",
    limits: { maxAtoms: 10_000, maxBootstrapsPerMonth: 1_000, maxStorageMB: 500 },
    stripePriceEnvKey: "STRIPE_PRICE_INDIE_MONTHLY",
    stripeProductEnvKey: "STRIPE_PRODUCT_INDIE",
    features: [
      { name: "10,000 atoms", included: true },
      { name: "1,000 bootstraps / month", included: true },
      { name: "500 MB storage", included: true },
      { name: "Merkle proofs", included: true },
      { name: "Markov prediction", included: true },
      { name: "MCP native", included: true },
      { name: "Email support (48 hr SLA)", included: true },
      { name: "Priority support", included: false },
      { name: "Knowledge graph edges", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    description: "For power users with large knowledge bases.",
    badge: "Most Popular",
    cta: "Get Pro",
    limits: { maxAtoms: 100_000, maxBootstrapsPerMonth: 10_000, maxStorageMB: 2_048 },
    stripePriceEnvKey: "STRIPE_PRICE_PRO_MONTHLY",
    stripeProductEnvKey: "STRIPE_PRODUCT_PRO",
    features: [
      { name: "100,000 atoms", included: true },
      { name: "10,000 bootstraps / month", included: true },
      { name: "2 GB storage", included: true },
      { name: "Merkle proofs", included: true },
      { name: "Markov prediction", included: true },
      { name: "MCP native", included: true },
      { name: "Knowledge graph edges", included: true },
      { name: "Priority support (24 hr SLA)", included: true },
      { name: "Custom domain", included: false },
    ],
  },
  {
    id: "team",
    name: "Team",
    price: 79,
    description: "For teams that need shared memory across agents.",
    badge: null,
    cta: "Get Team",
    limits: { maxAtoms: 500_000, maxBootstrapsPerMonth: -1, maxStorageMB: 10_240 },
    stripePriceEnvKey: "STRIPE_PRICE_TEAM_MONTHLY",
    stripeProductEnvKey: "STRIPE_PRODUCT_TEAM",
    features: [
      { name: "500,000 atoms", included: true },
      { name: "Unlimited bootstraps", included: true },
      { name: "10 GB storage", included: true },
      { name: "Merkle proofs", included: true },
      { name: "Markov prediction", included: true },
      { name: "MCP native", included: true },
      { name: "Knowledge graph edges", included: true },
      { name: "Dedicated support", included: true },
      { name: "Custom domain", included: true },
    ],
  },
];

/** Lookup by canonical ID. */
export const TIERS_BY_ID = Object.fromEntries(
  TIERS.map((t) => [t.id, t]),
) as Record<TierId, Tier>;

/** All canonical billing tier IDs in upgrade order (cheapest → most expensive). */
export const TIER_ORDER: TierId[] = ["free", "indie", "pro", "team"];

/**
 * Display name lookup — import this instead of creating local inline objects.
 * @example TIER_LABELS["pro"] → "Pro"
 */
export const TIER_LABELS: Record<TierId, string> = Object.fromEntries(
  TIERS.map((t) => [t.id, t.name]),
) as Record<TierId, string>;

/** Monthly USD price lookup. */
export const TIER_PRICES: Record<TierId, number> = Object.fromEntries(
  TIERS.map((t) => [t.id, t.price]),
) as Record<TierId, number>;

/**
 * Returns a Tier by ID. Throws if the ID is not a known canonical tier.
 * Use this when you need the full Tier object.
 */
export function getTier(id: string): Tier {
  const tier = TIERS_BY_ID[id as TierId];
  if (!tier) {
    throw new Error(
      `Unknown tier: "${id}". Must be one of: ${TIER_ORDER.join(", ")}`,
    );
  }
  return tier;
}

/** Returns true if id is a canonical billing tier ID. */
export function isValidTierId(id: string): id is TierId {
  return TIER_ORDER.includes(id as TierId);
}

/**
 * Returns the display name for a tier ID, falling back to the raw ID string
 * if it isn't recognised. Safe to call with any string from the database.
 *
 * @example getTierLabel("pro")          → "Pro"
 * @example getTierLabel("unknown_tier") → "unknown_tier"
 * @example getTierLabel(null)           → "—"
 */
export function getTierLabel(id: string | null | undefined): string {
  if (!id) return "—";
  return (TIER_LABELS as Record<string, string>)[id] ?? id;
}

/**
 * Returns the monthly price (USD) for a tier ID, or 0 if not recognised.
 */
export function getTierPrice(id: string | null | undefined): number {
  if (!id) return 0;
  return (TIER_PRICES as Record<string, number>)[id] ?? 0;
}

// ── Enterprise tiers (contact-sales only, not in compute billing) ─────────────

export interface EnterpriseTier {
  id: string;
  name: string;
  price: number;
  description: string;
  badge: string | null;
  cta: string;
  ctaLink: string;
  features: TierFeature[];
}

export const ENTERPRISE_TIERS: EnterpriseTier[] = [
  {
    id: "enterprise-cloud",
    name: "Enterprise Cloud",
    price: 299,
    description: "For mission-critical AI systems.",
    badge: null,
    cta: "Contact Sales",
    ctaLink:
      "mailto:entityone22@gmail.com?subject=Enterprise%20Cloud%20Inquiry",
    features: [
      { name: "Unlimited atoms", included: true },
      { name: "Unlimited bootstraps", included: true },
      { name: "100+ GB expandable storage", included: true },
      { name: "Merkle proofs", included: true },
      { name: "Markov prediction", included: true },
      { name: "MCP native", included: true },
      { name: "Knowledge graph edges", included: true },
      { name: "99.9% SLA", included: true },
      { name: "SSO/SAML", included: true },
      { name: "SOC 2 artifacts", included: true },
      { name: "Dedicated support channel", included: true },
    ],
  },
  {
    id: "enterprise-self-hosted",
    name: "Enterprise Self-Hosted",
    price: 499,
    description: "Complete control and sovereignty.",
    badge: null,
    cta: "Contact Sales",
    ctaLink:
      "mailto:entityone22@gmail.com?subject=Enterprise%20Self-Hosted%20Inquiry",
    features: [
      { name: "Full source code + commercial license", included: true },
      { name: "Deploy on your own cloud", included: true },
      { name: "Unlimited atoms, bootstraps, storage", included: true },
      { name: "Merkle proofs", included: true },
      { name: "Markov prediction", included: true },
      { name: "MCP native", included: true },
      { name: "Knowledge graph edges", included: true },
      { name: "Architecture review (2 hr)", included: true },
      { name: "Deployment guide", included: true },
      { name: "Quarterly health reviews", included: true },
    ],
  },
];
