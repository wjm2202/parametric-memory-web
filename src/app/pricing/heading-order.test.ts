/**
 * Heading-order regression test for /pricing.
 *
 * Why this exists. Lighthouse a11y flagged the page for skipping h1 -> h3
 * (no h2 between the hero h1 and the per-tier card h3s). We inserted a
 * visually-hidden <h2 className="sr-only">Pricing plans</h2> inside the
 * pricing-cards <section>. This test guards that the structural ordering
 * (h1 before h2 before h3) stays intact in the source.
 *
 * The pricing page is a Next.js server component that reads cookies() at
 * render time, so we don't render it here — we read the source file and
 * assert structure.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PRICING_PAGE = join(process.cwd(), "src/app/pricing/page.tsx");
const source = readFileSync(PRICING_PAGE, "utf8");

describe("/pricing — heading order (a11y)", () => {
  it("contains exactly one h1 in the pricing hero", () => {
    const h1Matches = source.match(/<h1\b/g) ?? [];
    expect(h1Matches.length).toBe(1);
  });

  it("contains a sr-only h2 'Pricing plans' between the h1 and tier h3s", () => {
    expect(source).toMatch(/<h2\s+className="sr-only">\s*Pricing plans\s*<\/h2>/);
  });

  it("h1 appears before h2 in source order", () => {
    const h1Idx = source.indexOf("<h1");
    const h2Idx = source.indexOf("<h2");
    expect(h1Idx).toBeGreaterThanOrEqual(0);
    expect(h2Idx).toBeGreaterThan(h1Idx);
  });

  it("h2 appears before the first tier-card h3 in source order", () => {
    const h2Idx = source.indexOf("<h2");
    const h3Idx = source.indexOf("<h3");
    expect(h2Idx).toBeGreaterThanOrEqual(0);
    expect(h3Idx).toBeGreaterThan(h2Idx);
  });
});
