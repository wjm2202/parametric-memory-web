/**
 * Sprint 2026-W18 — SEO/AEO audit invariants
 *
 * Locks in the SEO fixes from docs/SEO-AEO-AUDIT-2026-05-01.md so they don't
 * silently regress on future copy edits. Each `it` block covers one concrete
 * issue the SEO scanner would flag if the invariant breaks.
 *
 * Companion docs:
 *   - docs/SEO-AEO-AUDIT-2026-05-01.md   (initial audit)
 *   - docs/SEO-AEO-AUDIT-2026-05-01-DELTA.md (post-fix verification)
 *
 * Sister test file:
 *   - src/app/layout.test.ts  (viewport + base metadata regression checks)
 */

import { describe, it, expect, vi } from "vitest";

// Same next/font/google stub as layout.test.ts — required for vitest+jsdom.
vi.mock("next/font/google", () => {
  const stub = (name: string) => () => ({
    variable: `--font-${name}`,
    className: `font-${name}`,
    style: { fontFamily: name },
  });
  return {
    Syne: stub("syne"),
    Outfit: stub("outfit"),
    JetBrains_Mono: stub("jetbrains-mono"),
  };
});

import { metadata as rootMetadata } from "../layout";
import { metadata as homeMetadata } from "../page";
import { TIERS } from "@/config/tiers";

// Cheapest publicly-sold tier price — derived from src/config/tiers.ts so the
// test stays valid through any pricing model change. If you change tier
// prices, this number recomputes and the description assertion still passes
// as long as the description was rebuilt via @/lib/pricing helpers.
const CHEAPEST_PUBLIC_PRICE = Math.min(...TIERS.filter((t) => t.publiclySold).map((t) => t.price));
const PRICE_HOOK_RE = new RegExp(`\\$${CHEAPEST_PUBLIC_PRICE}\\/mo`);

// ── Description length bounds ──────────────────────────────────────────────
// Google truncates at ~160 chars desktop / ~120 mobile. We require all
// descriptions to fit the desktop snippet so the price hook + free-trial CTA
// survive truncation.
const MAX_DESC = 160;
const MIN_DESC = 100; // anything shorter signals weak SEO content

describe("SEO meta — home page (src/app/page.tsx)", () => {
  it("description fits Google's 160-char desktop snippet", () => {
    const desc = homeMetadata.description!;
    expect(desc).toBeDefined();
    expect(desc.length).toBeGreaterThanOrEqual(MIN_DESC);
    expect(desc.length).toBeLessThanOrEqual(MAX_DESC);
  });

  it("OG description matches the meta description (consistency for social embeds)", () => {
    expect(homeMetadata.openGraph?.description).toBe(homeMetadata.description);
  });

  it("description includes the cheapest tier's price hook — survives Google snippet truncation", () => {
    // Pulled from src/config/tiers.ts at test time so the test follows
    // whatever pricing model is active. No literal $3/mo coupling.
    const desc = homeMetadata.description!;
    expect(desc).toMatch(PRICE_HOOK_RE);
  });

  it("description includes the free-trial CTA", () => {
    expect(homeMetadata.description).toMatch(/14-day free trial/i);
  });

  it("keywords contain the hot commercial-intent terms (Mem0 + Zep alternative)", () => {
    const kw = homeMetadata.keywords as string[];
    expect(kw).toContain("Mem0 alternative");
    expect(kw).toContain("Zep alternative");
  });

  it("keywords contain the uncontested differentiator terms", () => {
    const kw = homeMetadata.keywords as string[];
    expect(kw).toContain("verifiable AI memory");
    expect(kw).toContain("Merkle proof memory");
    expect(kw).toContain("RFC 6962 Merkle proof");
    expect(kw).toContain("tamper-evident agent memory");
    expect(kw).toContain("single-tenant AI memory");
    expect(kw).toContain("anticipatory recall");
  });

  it("keywords contain the MCP-native + Claude Code positioning terms", () => {
    const kw = homeMetadata.keywords as string[];
    expect(kw).toContain("MCP memory server");
    expect(kw).toContain("MCP-native memory");
    expect(kw).toContain("AI memory for Claude Code");
  });

  it("keywords no longer contain the dropped low-leverage terms", () => {
    const kw = homeMetadata.keywords as string[];
    // Dropped from competitor research: too generic / saturated / brand-only
    expect(kw).not.toContain("AI memory"); // generic, no buyer-intent
    expect(kw).not.toContain("MMPM"); // brand-only, no SERP volume
    expect(kw).not.toContain("cryptographic memory"); // matches encryption SERPs
  });

  it("keyword set is conservative — between 12 and 18 terms", () => {
    const kw = homeMetadata.keywords as string[];
    expect(kw.length).toBeGreaterThanOrEqual(12);
    expect(kw.length).toBeLessThanOrEqual(18);
  });
});

describe("SEO meta — root layout (src/app/layout.tsx)", () => {
  it("publisher field is set — fixes SEO-extension 'Publisher: Missing' flag", () => {
    expect(rootMetadata.publisher).toBe("Parametric Memory");
  });

  it("authors field is set with name + URL — feeds Google E-E-A-T", () => {
    const authors = rootMetadata.authors as Array<{ name: string; url: string }>;
    expect(authors).toBeDefined();
    expect(authors[0].name).toBe("Parametric Memory");
    expect(authors[0].url).toBe("https://parametric-memory.dev/about");
  });

  it("creator field is set", () => {
    expect(rootMetadata.creator).toBe("Parametric Memory");
  });

  it("applicationName field is set", () => {
    expect(rootMetadata.applicationName).toBe("Parametric Memory");
  });

  it("category field is set for vertical signal", () => {
    expect(rootMetadata.category).toBe("AI Memory Infrastructure");
  });

  it("default description fits Google's 160-char desktop snippet", () => {
    const desc = rootMetadata.description as string;
    expect(desc).toBeDefined();
    expect(desc.length).toBeLessThanOrEqual(MAX_DESC);
  });

  it("Twitter description fits 200-char hard limit and includes the cheapest price hook", () => {
    const tw = rootMetadata.twitter as { description?: string };
    expect(tw.description).toBeDefined();
    expect(tw.description!.length).toBeLessThanOrEqual(200);
    // Derived price — tracks tiers.ts. Doesn't hardcode $3/mo.
    expect(tw.description).toMatch(PRICE_HOOK_RE);
  });

  it("robots.index is true and follow is true (we want to rank)", () => {
    const robots = rootMetadata.robots as { index?: boolean; follow?: boolean };
    expect(robots.index).toBe(true);
    expect(robots.follow).toBe(true);
  });
});
