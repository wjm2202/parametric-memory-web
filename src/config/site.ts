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
 * A Proton Mail alias on the company domain (set up 2026-10-07 — see
 * docs/RUNBOOK-CORPORATE-EMAIL-PROTON.md). Every alias on the domain lands in
 * the same Proton inbox, so this is safe to publish anywhere.
 *
 * NEVER point this at a personal mailbox again: src/no-personal-email.test.ts
 * fails CI if a personal address appears in src/ or public/.
 *
 * Referenced from:
 *   - src/app/layout.tsx (Organization JSON-LD ContactPoint × 2)
 *   - src/app/contact/page.tsx (contact cards + JSON-LD)
 *   - src/config/tiers.ts (ENTERPRISE_TIERS ctaLink × 2)
 *   - src/app/pricing/PricingCTA.tsx (Enterprise contact buttons)
 *   - src/app/admin/AdminClient.tsx (key-rotation help link)
 *   - src/app/dashboard/DashboardClient.tsx (account-help link)
 *   - src/app/api/waitlist/route.ts (signup alert recipient + reply-to)
 *   - src/app/api/capacity-inquiry/handler.ts (inquiry alert recipient)
 *   - src/components/ui/SubstrateStateBanner.tsx (DEFAULT_SUPPORT_EMAIL)
 *   - scripts/build-llms-txt.ts (Contact section in public/llms.txt)
 *
 * Tests assert the same constant by importing from here, not by hardcoding
 * the literal — see SubstrateStateBanner.test.tsx.
 */
export const SUPPORT_EMAIL = "support@parametric-memory.dev";

/**
 * Legal notices — copyright / DMCA takedowns (src/app/copyright/page.tsx).
 * Terms, DPA and AUP pages also publish this address as literal text.
 */
export const LEGAL_EMAIL = "legal@parametric-memory.dev";

/**
 * Sender for all automated mail the website sends via Resend.
 *
 * `send.parametric-memory.dev` is Resend's sending subdomain (its SPF/MX live
 * there; DKIM is `resend._domainkey` on the root). It has NO inbox — replies
 * to it hit Amazon SES's bounce handler and are lost — so every send MUST set
 * `replyTo` to a real Proton address. Human mail (Proton) uses the root
 * domain; the two never share DNS records.
 */
export const TRANSACTIONAL_FROM = "Parametric Memory <noreply@send.parametric-memory.dev>";

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
