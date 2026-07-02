import { SUPPORT_EMAIL } from "./site";
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

export type TierId = "free" | "starter" | "indie" | "pro" | "team";

export interface TierLimits {
  maxAtoms: number; // -1 = unlimited
  maxBootstrapsPerMonth: number; // -1 = unlimited
  maxStorageMB: number; // -1 = unlimited
  /** Maximum monthly spend in cents (platform ceiling). Users cannot exceed this. */
  maxMonthlyCents: number;
  /**
   * Maximum number of live substrates per account.
   *
   * Multi-substrate support (2026-04-13): the compute API now has slug-scoped
   * endpoints at `/api/v1/substrates/:slug/*` for all substrate management
   * operations (cancel, reactivate, rotate-key, claim-key, deprovision, usage).
   * The website dashboard lists all substrates and admin manages individual ones
   * by slug. Each subscription maps to one substrate. Users can purchase
   * multiple subscriptions to have multiple substrates.
   *
   * SM-MULTI-2 (2026-05): caps now mirror compute's authoritative ceilings
   * (DEFAULT_CEILINGS / platform_settings / init.sql): free 1, starter 1,
   * indie 2, pro 3, team 5. tiers.test.ts pins this 1:1 with compute. Buying a
   * second instance of a HIGHER tier than the account currently holds is still
   * gated until SM-MULTI-3 reworks the cap trigger; same-tier adds within the
   * ceiling (e.g. a 2nd Solo on a Solo account) work today.
   */
  maxSubstrates: number;
}

export interface TierFeature {
  name: string;
  included: boolean;
}

/**
 * Infrastructure deployment model for a tier.
 *
 * "shared"    → runs in a multi-tenant cluster (~10-20 customers per droplet).
 *               Lower per-customer cost; lower price ceilings.
 *               Used by Starter and Solo as of 2026-05-01 viability decision.
 * "dedicated" → runs on its own droplet, isolated PostgreSQL + Merkle tree.
 *               Brand promise for Pro/Team/Enterprise tiers.
 *
 * COMPUTE-SIDE NOTE: When this field flips for a tier, mmpm-compute must
 * support the new deployment model before the marketing change goes live.
 * As of 2026-05-01 compute provisions dedicated droplets only — shared
 * cluster support is the gating work for honouring "$5/mo shared" (Starter; price
 * raised from $3 to $5 per D16, S0.4 unit-economics spike).
 */
export type TierDeployment = "shared" | "dedicated";

export interface Tier {
  /** Canonical ID used in compute DB, Stripe metadata, and API. */
  id: TierId;
  /** Marketing display name shown in UI. */
  name: string;
  /** Monthly price in USD (0 for internal expired-subscription state). */
  price: number;
  /** Short description shown under tier name on pricing page. */
  description: string;
  /** Badge label shown on the card (e.g. "Most Popular"), or null. */
  badge: string | null;
  /** Pricing page CTA button label. */
  cta: string;
  /** Whether this tier is publicly purchasable (false hides it from /pricing + JSON-LD). */
  publiclySold: boolean;
  /** Infrastructure deployment model — see TierDeployment. */
  deployment: TierDeployment;
  /** Compute-side resource limits. Must match CONTAINER_LIMITS in mmpm-compute. */
  limits: TierLimits;
  /** Pricing page feature checklist. */
  features: TierFeature[];
  /**
   * env var key for the Stripe monthly price ID: process.env[stripePriceEnvKey]
   * All tiers (including internal expired state) have a Stripe price.
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
    name: "Basic",
    price: 3,
    description: "Post-trial fallback tier. Not publicly sold.",
    badge: null,
    cta: "Get Started",
    publiclySold: false,
    deployment: "shared",
    limits: {
      maxAtoms: 200,
      maxBootstrapsPerMonth: 30,
      maxStorageMB: 10,
      maxMonthlyCents: 200,
      maxSubstrates: 1,
    },
    stripePriceEnvKey: "STRIPE_PRICE_FREE_MONTHLY",
    stripeProductEnvKey: "STRIPE_PRODUCT_FREE",
    features: [
      { name: "200 atoms", included: true },
      { name: "30 bootstraps / month", included: true },
      { name: "10 MB storage", included: true },
      { name: "1 substrate", included: true },
      { name: "$2/mo USD spend cap", included: true },
      { name: "Merkle proofs", included: true },
      { name: "Markov prediction", included: true },
      { name: "MCP native", included: true },
      { name: "Community support", included: true },
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: 5, // was 3 — D16 (S0.4 unit-econ)
    description: "Experience persistent memory. $5/month USD, 7-day money-back guarantee.",
    badge: null,
    cta: "Start Building",
    publiclySold: true,
    deployment: "shared",
    limits: {
      maxAtoms: 1_000,
      maxBootstrapsPerMonth: 200,
      maxStorageMB: 100,
      maxMonthlyCents: 900, // $9 cap — D16 raised sub $3→$5; cap raised proportionally to preserve overage headroom
      maxSubstrates: 1,
    },
    stripePriceEnvKey: "STRIPE_PRICE_STARTER_MONTHLY",
    stripeProductEnvKey: "STRIPE_PRODUCT_STARTER",
    features: [
      { name: "1,000 atoms", included: true },
      { name: "200 bootstraps / month", included: true },
      { name: "100 MB storage", included: true },
      { name: "1 substrate", included: true },
      { name: "$9/mo USD spend cap", included: true },
      { name: "Merkle proofs", included: true },
      { name: "Markov prediction", included: true },
      { name: "Knowledge graph edges", included: true },
      { name: "MCP native", included: true },
      { name: "Community support", included: true },
      { name: "7-day money-back guarantee", included: true },
    ],
  },
  {
    id: "indie",
    name: "Solo",
    price: 9,
    description: "For individual developers building with persistent memory.",
    badge: null,
    cta: "Get Solo",
    publiclySold: true,
    deployment: "shared",
    limits: {
      maxAtoms: 10_000,
      maxBootstrapsPerMonth: 1_000,
      maxStorageMB: 500,
      maxMonthlyCents: 1500,
      maxSubstrates: 2,
    },
    stripePriceEnvKey: "STRIPE_PRICE_INDIE_MONTHLY",
    stripeProductEnvKey: "STRIPE_PRODUCT_INDIE",
    features: [
      { name: "10,000 atoms", included: true },
      { name: "1,000 bootstraps / month", included: true },
      { name: "500 MB storage", included: true },
      { name: "Up to 2 substrates", included: true },
      { name: "$15/mo USD spend cap", included: true },
      { name: "Merkle proofs", included: true },
      { name: "Markov prediction", included: true },
      { name: "Knowledge graph edges", included: true },
      { name: "MCP native", included: true },
      { name: "Email support (48 hr SLA)", included: true },
    ],
  },
  {
    id: "pro",
    name: "Professional",
    price: 29,
    description: "For power users with large knowledge bases.",
    badge: "Most Popular",
    cta: "Get Professional",
    publiclySold: true,
    deployment: "dedicated",
    limits: {
      maxAtoms: 100_000,
      maxBootstrapsPerMonth: 10_000,
      maxStorageMB: 2_048,
      maxMonthlyCents: 5000,
      maxSubstrates: 3,
    },
    stripePriceEnvKey: "STRIPE_PRICE_PRO_MONTHLY",
    stripeProductEnvKey: "STRIPE_PRODUCT_PRO",
    features: [
      { name: "100,000 atoms", included: true },
      { name: "10,000 bootstraps / month", included: true },
      { name: "2 GB storage", included: true },
      { name: "Up to 3 substrates", included: true },
      { name: "$50/mo USD spend cap", included: true },
      { name: "Merkle proofs", included: true },
      { name: "Markov prediction", included: true },
      { name: "MCP native", included: true },
      { name: "Knowledge graph edges", included: true },
      { name: "Priority support (24 hr SLA)", included: true },
    ],
  },
  {
    id: "team",
    name: "Team",
    price: 79,
    description: "For teams that need shared memory across agents.",
    badge: null,
    cta: "Get Team",
    publiclySold: true,
    deployment: "dedicated",
    limits: {
      maxAtoms: 500_000,
      maxBootstrapsPerMonth: 20_000,
      maxStorageMB: 10_240,
      maxMonthlyCents: 12000,
      maxSubstrates: 5,
    },
    stripePriceEnvKey: "STRIPE_PRICE_TEAM_MONTHLY",
    stripeProductEnvKey: "STRIPE_PRODUCT_TEAM",
    features: [
      { name: "500,000 atoms", included: true },
      { name: "20,000 bootstraps / month", included: true },
      { name: "10 GB storage", included: true },
      { name: "Up to 5 substrates", included: true },
      { name: "$120/mo USD spend cap", included: true },
      { name: "Merkle proofs", included: true },
      { name: "Markov prediction", included: true },
      { name: "MCP native", included: true },
      { name: "Knowledge graph edges", included: true },
      { name: "Dedicated support", included: true },
    ],
  },
];

/** Lookup by canonical ID. */
export const TIERS_BY_ID = Object.fromEntries(TIERS.map((t) => [t.id, t])) as Record<TierId, Tier>;

/** All canonical billing tier IDs in upgrade order (cheapest → most expensive). */
export const TIER_ORDER: TierId[] = ["free", "starter", "indie", "pro", "team"];

/**
 * Display name lookup — import this instead of creating local inline objects.
 * @example TIER_LABELS["pro"] → "Professional"
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
    throw new Error(`Unknown tier: "${id}". Must be one of: ${TIER_ORDER.join(", ")}`);
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
 * @example getTierLabel("pro")          → "Professional"
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
    ctaLink: `mailto:${SUPPORT_EMAIL}?subject=Enterprise%20Cloud%20Inquiry`,
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
    ctaLink: `mailto:${SUPPORT_EMAIL}?subject=Enterprise%20Self-Hosted%20Inquiry`,
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
