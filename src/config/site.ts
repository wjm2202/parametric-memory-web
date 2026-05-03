/**
 * Site-wide configuration constants.
 *
 * Single source of truth for values that need to appear in many places
 * (mailto: links, JSON-LD contact points, tests, codegen). Update here
 * to roll a change through the whole codebase.
 */

/**
 * Public-facing support / contact email.
 *
 * Currently the founder's personal Gmail. When you stand up a hello@ or
 * support@parametric-memory.dev alias, change this constant only — every
 * mailto link, JSON-LD ContactPoint, llms.txt Contact line, and waitlist
 * notification target will pick up the new address on next deploy.
 *
 * Referenced from:
 *   - src/app/layout.tsx (Organization JSON-LD ContactPoint × 2)
 *   - src/config/tiers.ts (ENTERPRISE_TIERS ctaLink × 2)
 *   - src/app/pricing/PricingCTA.tsx (Enterprise contact buttons)
 *   - src/app/admin/AdminClient.tsx (key-rotation help link)
 *   - src/app/dashboard/DashboardClient.tsx (account-help link)
 *   - src/app/copyright/page.tsx (DMCA + footer contact)
 *   - src/app/api/waitlist/route.ts (signup notification recipient)
 *   - src/components/ui/SubstrateStateBanner.tsx (DEFAULT_SUPPORT_EMAIL)
 *   - scripts/build-llms-txt.ts (Contact section in public/llms.txt)
 *
 * Tests assert the same constant by importing from here, not by hardcoding
 * the literal — see SubstrateStateBanner.test.tsx.
 */
export const SUPPORT_EMAIL = "entityone22@gmail.com";

/**
 * Support email rendered as a mailto: URL with optional subject.
 * Helper to keep mailto encoding consistent across the app.
 */
export function mailto(subject?: string): string {
  const base = `mailto:${SUPPORT_EMAIL}`;
  if (!subject) return base;
  return `${base}?subject=${encodeURIComponent(subject)}`;
}

/** Public website origin. Used in JSON-LD, OG images, canonical URLs. */
export const SITE_ORIGIN = "https://parametric-memory.dev" as const;
