/**
 * Entity-disambiguation invariants for the "Parametric Memory" name collision.
 *
 * "Parametric memory" is an established ML term (knowledge stored in a model's
 * weights). These assertions lock in the Organization JSON-LD signals that tell
 * Google's Knowledge Graph + AI answer engines to model our brand as a DISTINCT
 * entity, separate from the concept. If any regress, the collision defence
 * weakens silently — hence a test, not just a comment.
 *
 * Companion strategy: docs/marketing/strategy/PAGERANK-DIFFERENTIATION-STRATEGY.md
 * Sister SEO tests: src/app/__tests__/seo-metadata.test.ts, src/app/layout.test.ts
 */
import { describe, it, expect, vi } from "vitest";

// Same next/font/google stub as the sister SEO tests — required for vitest+jsdom
// because importing ../layout pulls the font setup.
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

import { organizationJsonLd } from "../layout";

describe("Organization entity — name-collision disambiguation", () => {
  it("declares the collision-free alternateName token MMPM", () => {
    const alt = organizationJsonLd.alternateName;
    const list = Array.isArray(alt) ? alt : [alt];
    expect(list).toContain("MMPM");
  });

  it("has a disambiguatingDescription that separates the product from the ML concept", () => {
    const d = organizationJsonLd.disambiguatingDescription;
    expect(d).toBeDefined();
    const lower = String(d).toLowerCase();
    // must explicitly assert distinctness…
    expect(lower).toContain("distinct from");
    // …name the concept it is distinguished from…
    expect(lower).toContain("parametric memory");
    // …and assert its own category (product / company / software)
    expect(lower).toMatch(/product|company|software/);
  });

  it("binds the entity to its subject matter via knowsAbout", () => {
    const topics = organizationJsonLd.knowsAbout;
    expect(Array.isArray(topics)).toBe(true);
    expect(topics.length).toBeGreaterThanOrEqual(4);
    // the term we are trying to own must be present
    expect(topics.join(" ").toLowerCase()).toContain("verifiable");
  });

  it("has a square logo for the Knowledge Panel", () => {
    const logo = organizationJsonLd.logo as { url?: string };
    expect(logo).toBeDefined();
    expect(logo.url).toMatch(/^https:\/\/parametric-memory\.dev\/.+\.(png|svg)$/);
  });

  it("sameAs contains only absolute https URLs we control (no dead/relative entries)", () => {
    const sameAs = organizationJsonLd.sameAs as string[];
    expect(Array.isArray(sameAs)).toBe(true);
    expect(sameAs.length).toBeGreaterThanOrEqual(1);
    for (const url of sameAs) {
      expect(url).toMatch(/^https:\/\//);
    }
    // the live X handle today (rename to @parametricmem pending X's review;
    // swap this assertion when layout.tsx flips to the new handle)
    expect(sameAs).toContain("https://x.com/_EntityOne");
    // YouTube channel, verified live 2026-07-13 (also in the site footer as rel="me")
    expect(sameAs).toContain("https://www.youtube.com/@parametricmemory");
    // Whitepaper concept DOIs (all-versions) — citable works that identify
    // the brand entity. Live: 21213464 (2026-07-06), 21421364 (2026-07-18).
    expect(sameAs).toContain("https://doi.org/10.5281/zenodo.21213464");
    expect(sameAs).toContain("https://doi.org/10.5281/zenodo.21421364");
  });

  it("sameAs has no placeholder or commented URLs leaking into the live array", () => {
    const sameAs = organizationJsonLd.sameAs as string[];
    for (const url of sameAs) {
      expect(url).not.toContain("<"); // template placeholder
      expect(url).not.toMatch(/QXXXXXXX/); // wikidata placeholder
    }
  });
});
