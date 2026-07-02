import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 5 — ASO (Agent-Schema Optimisation) polish.
 *
 * Four invariants this suite guards:
 *   1. sitemap.ts enumerates every public page, including the auth/legal
 *      pages previously missing (/login, /aup, /dpa).
 *   2. robots.txt mirrors the three-agent stance declared in llms.txt —
 *      ClaudeBot + PerplexityBot + Googlebot + Bingbot all explicitly
 *      allowed (as well as the existing AI-content-training crawlers).
 *   3. FAQPage JSON-LD exists in three legitimate places (landing, pricing,
 *      /faq) and each has a distinct stable @id IRI. This dedupes the
 *      knowledge graph without content surgery — each FAQPage is a distinct
 *      identity scoped to its URL, not a duplicate.
 *   4. Each of the four primary marketing surfaces (/, /pricing, /docs, /faq)
 *      has openGraph.images wired at 1200x630 — regression guard so the
 *      route-specific OG images (Phase 5b) don't silently drop this.
 *
 * Pattern: source-contract. We read files as text and assert literals rather
 * than rendering. Rendered HTML is covered by future e2e suites.
 */

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

describe("Phase 5: sitemap.ts covers all public pages", () => {
  const src = read("src/app/sitemap.ts");

  it("omits /login and /signup (noindex auth pages must not be in the sitemap)", () => {
    // 2026-07-01: /login and /signup are robots `noindex` (low-value auth
    // pages), and noindex URLs must not appear in the sitemap — they were
    // removed from sitemap.ts.
    expect(src).not.toContain('parametric-memory.dev/login"');
    expect(src).not.toContain('parametric-memory.dev/signup"');
  });

  it("includes /enterprise and /copyright", () => {
    expect(src).toContain('url: "https://parametric-memory.dev/enterprise"');
    expect(src).toContain('url: "https://parametric-memory.dev/copyright"');
  });

  it("includes /aup with yearly changeFrequency and priority 0.3", () => {
    expect(src).toMatch(
      /url:\s*"https:\/\/parametric-memory\.dev\/aup"[\s\S]{0,200}changeFrequency:\s*"yearly"[\s\S]{0,100}priority:\s*0\.3/,
    );
  });

  it("includes /dpa with yearly changeFrequency and priority 0.3", () => {
    expect(src).toMatch(
      /url:\s*"https:\/\/parametric-memory\.dev\/dpa"[\s\S]{0,200}changeFrequency:\s*"yearly"[\s\S]{0,100}priority:\s*0\.3/,
    );
  });

  it("retains the existing canonical surfaces (/, /pricing, /faq, /docs)", () => {
    // Paranoia guard — a future refactor must not drop these.
    expect(src).toContain('url: "https://parametric-memory.dev"');
    expect(src).toContain('url: "https://parametric-memory.dev/pricing"');
    expect(src).toContain('url: "https://parametric-memory.dev/faq"');
    expect(src).toContain('url: "https://parametric-memory.dev/docs"');
  });
});

describe("Phase 5: robots.txt declares explicit search-engine allows", () => {
  const robots = read("public/robots.txt");

  it("has a Googlebot User-agent block with Allow: /", () => {
    expect(robots).toMatch(/User-agent:\s*Googlebot\s*\nAllow:\s*\//);
  });

  it("has a Bingbot User-agent block with Allow: /", () => {
    expect(robots).toMatch(/User-agent:\s*Bingbot\s*\nAllow:\s*\//);
  });

  it("retains the AI answer-engine allows (ClaudeBot + PerplexityBot)", () => {
    expect(robots).toMatch(/User-agent:\s*ClaudeBot\s*\nAllow:\s*\//);
    expect(robots).toMatch(/User-agent:\s*PerplexityBot\s*\nAllow:\s*\//);
  });

  it("retains the bulk-training blocks (CCBot + CommonCrawlBot)", () => {
    expect(robots).toMatch(/User-agent:\s*CCBot\s*\nDisallow:\s*\//);
    expect(robots).toMatch(/User-agent:\s*CommonCrawlBot\s*\nDisallow:\s*\//);
  });
});

describe("Phase 5: FAQPage @id dedupe across three legitimate surfaces", () => {
  const landing = read("src/app/page.tsx");
  const pricing = read("src/app/pricing/page.tsx");
  const faq = read("src/app/faq/page.tsx");

  it("landing FAQPage carries @id #faq-home", () => {
    expect(landing).toContain('"@id": "https://parametric-memory.dev/#faq-home"');
    // Must be on the FAQPage block specifically (Phase 4 invariant, reasserted).
    expect(landing).toMatch(
      /"@type":\s*"FAQPage"[\s\S]{0,60}"@id":\s*"https:\/\/parametric-memory\.dev\/#faq-home"/,
    );
  });

  it("pricing FAQPage carries @id #faq-pricing", () => {
    expect(pricing).toContain('"@id": "https://parametric-memory.dev/#faq-pricing"');
    expect(pricing).toMatch(
      /"@type":\s*"FAQPage"[\s\S]{0,60}"@id":\s*"https:\/\/parametric-memory\.dev\/#faq-pricing"/,
    );
  });

  it("/faq FAQPage carries @id #faq-page (canonical long-form surface)", () => {
    expect(faq).toContain('"@id": "https://parametric-memory.dev/#faq-page"');
    expect(faq).toMatch(
      /"@type":\s*"FAQPage"[\s\S]{0,60}"@id":\s*"https:\/\/parametric-memory\.dev\/#faq-page"/,
    );
  });

  it("all three FAQPage @ids are distinct fragments of parametric-memory.dev", () => {
    const ids = new Set<string>();
    for (const src of [landing, pricing, faq]) {
      const matches = src.matchAll(/"@id":\s*"(https:\/\/parametric-memory\.dev\/#faq-[a-z-]+)"/g);
      for (const m of matches) ids.add(m[1]);
    }
    expect(ids.size).toBeGreaterThanOrEqual(3);
    expect(ids.has("https://parametric-memory.dev/#faq-home")).toBe(true);
    expect(ids.has("https://parametric-memory.dev/#faq-pricing")).toBe(true);
    expect(ids.has("https://parametric-memory.dev/#faq-page")).toBe(true);
  });
});

describe("Phase 5: openGraph.images regression guard on primary surfaces", () => {
  // Each of these four routes is a critical marketing surface — losing OG
  // images silently would tank social preview cards and AI answer-engine
  // embeds. Phase 5b will add route-specific dynamic OG images; until then
  // we pin the 1200x630 sizing through /brand/og.png.
  const surfaces: Array<{ name: string; path: string }> = [
    { name: "layout (site default)", path: "src/app/layout.tsx" },
    { name: "landing /", path: "src/app/page.tsx" },
    { name: "/pricing", path: "src/app/pricing/page.tsx" },
    { name: "/faq", path: "src/app/faq/page.tsx" },
  ];

  for (const { name, path: rel } of surfaces) {
    it(`${name} declares openGraph.images with 1200x630 sizing`, () => {
      const src = read(rel);
      expect(src).toContain("openGraph:");
      expect(src).toMatch(/url:\s*"https:\/\/parametric-memory\.dev\/brand\/og\.png"/);
      expect(src).toMatch(/width:\s*1200/);
      expect(src).toMatch(/height:\s*630/);
    });
  }
});
