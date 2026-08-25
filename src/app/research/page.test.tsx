/**
 * Tests for /research — the crawlable, citable home for the whitepapers.
 *
 * Context (2026-08-24 SEO final fix): an earlier /research page was written on
 * 2026-07-18 but never committed and was lost. These tests pin the rebuilt
 * page so it cannot silently vanish or drift again:
 *   - both papers render with their Zenodo DOIs;
 *   - CollectionPage JSON-LD embeds a ScholarlyArticle per paper, authored
 *     and published by the site's Organization @id (entity disambiguation);
 *   - metadata stays within the site's SEO limits (title ≤60, desc 110–160);
 *   - the page is statically renderable (no next/headers import) — also
 *     enforced globally by static-render-guard.test.ts.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import ResearchPage, { PAPERS, metadata } from "./page";

// Navbar/Footer pull in client-side hooks + next/navigation; they are not
// under test here.
vi.mock("@/components/ui/SiteNavbar", () => ({
  default: () => <nav data-testid="mock-navbar" />,
}));
vi.mock("@/components/ui/SiteFooter", () => ({
  default: () => <footer data-testid="mock-footer" />,
}));

const DOI_SUBSTRATE = "https://doi.org/10.5281/zenodo.21213464";
const DOI_LOOP = "https://doi.org/10.5281/zenodo.21421364";
const ORG_ID = "https://parametric-memory.dev/#organization";

function extractJsonLd(container: HTMLElement): Record<string, unknown>[] {
  return Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map(
    (s) => JSON.parse(s.textContent ?? "{}") as Record<string, unknown>,
  );
}

describe("/research page", () => {
  it("lists exactly the two published papers with their concept DOIs", () => {
    expect(PAPERS).toHaveLength(2);
    expect(PAPERS.map((p) => p.doi)).toEqual([DOI_SUBSTRATE, DOI_LOOP]);
  });

  it("renders both papers with DOI links", () => {
    const { container } = render(<ResearchPage />);
    expect(container.textContent).toContain("Parametric Memory: A Cryptographically Verifiable");
    expect(container.textContent).toContain("The Self-Reinforcing Loop");

    expect(screen.getByTestId("research-doi-substrate-whitepaper")).toHaveAttribute(
      "href",
      DOI_SUBSTRATE,
    );
    expect(screen.getByTestId("research-doi-self-reinforcing-loop")).toHaveAttribute(
      "href",
      DOI_LOOP,
    );
  });

  it("embeds CollectionPage JSON-LD with one ScholarlyArticle per paper", () => {
    const { container } = render(<ResearchPage />);
    const blocks = extractJsonLd(container);
    const collection = blocks.find((b) => b["@type"] === "CollectionPage");
    expect(collection, "CollectionPage JSON-LD missing").toBeDefined();

    const parts = collection!.hasPart as Array<Record<string, unknown>>;
    expect(parts).toHaveLength(2);
    for (const article of parts) {
      expect(article["@type"]).toBe("ScholarlyArticle");
      expect(String(article["@id"])).toMatch(/^https:\/\/doi\.org\/10\.5281\/zenodo\./);
      // Entity disambiguation: author + publisher must reference the site's
      // Organization node, whose sameAs lists both DOIs (layout.tsx).
      expect(article.author).toEqual({ "@id": ORG_ID });
      expect(article.publisher).toEqual({ "@id": ORG_ID });
      expect(article.isAccessibleForFree).toBe(true);
      expect(String(article.abstract).length).toBeGreaterThan(100);
    }
  });

  it("embeds BreadcrumbList JSON-LD", () => {
    const { container } = render(<ResearchPage />);
    const blocks = extractJsonLd(container);
    const crumbs = blocks.find((b) => b["@type"] === "BreadcrumbList");
    expect(crumbs).toBeDefined();
    const items = crumbs!.itemListElement as Array<{ name: string; item: string }>;
    expect(items[items.length - 1].item).toBe("https://parametric-memory.dev/research");
  });

  it("metadata stays within SEO limits and canonicalizes to /research", () => {
    // Title template appends " | Parametric Memory" (19 chars incl. separator)
    const fullTitle = `${String(metadata.title)} | Parametric Memory`;
    expect(fullTitle.length).toBeLessThanOrEqual(60);
    const desc = String(metadata.description);
    expect(desc.length).toBeGreaterThanOrEqual(110);
    expect(desc.length).toBeLessThanOrEqual(160);
    expect(metadata.alternates?.canonical).toBe("https://parametric-memory.dev/research");
  });

  it("is statically renderable — no next/headers usage", () => {
    const src = readFileSync(path.join(__dirname, "page.tsx"), "utf8");
    expect(src).not.toMatch(/next\/headers/);
  });
});
