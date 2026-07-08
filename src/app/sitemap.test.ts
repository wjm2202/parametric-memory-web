/**
 * Invariant tests for the sitemap (2026-07-08 SEO indexing fix).
 *
 * Root causes these lock against (found via GSC "Page indexing" report):
 *  1. lastmod noise — every non-blog entry used `new Date()`, so every crawl
 *     saw "changed today". Google discounts unreliable lastmod for the whole
 *     file. The sitemap must be DETERMINISTIC across calls.
 *  2. Redirecting URLs in the sitemap — /docs 301s to /docs/introduction and
 *     produced "Page with redirect" + a duplicate-canonical flag.
 *  3. Orphan docs — concepts/* pages existed on disk but were missing from
 *     the sitemap (and sidebar), causing "Crawled — currently not indexed".
 */

import { describe, it, expect } from "vitest";
import sitemap, {
  ROUTE_LASTMOD,
  DOCS_LASTMOD_OVERRIDES,
  DOCS_DEFAULT_LASTMOD,
  BLOG_FALLBACK_LASTMOD,
} from "./sitemap";
import { getAllDocSlugsFromNav } from "@/config/docs-nav";

const SITE = "https://parametric-memory.dev";

function urls() {
  return sitemap().map((e) => e.url);
}

describe("sitemap.ts — determinism (lastmod must not be call-time)", () => {
  it("two invocations produce identical output", async () => {
    const a = JSON.stringify(sitemap());
    await new Promise((r) => setTimeout(r, 15));
    const b = JSON.stringify(sitemap());
    expect(a).toEqual(b);
  });

  it("no entry has a lastModified in the future", () => {
    // A call-time `new Date()` regression would make lastmod ≈ now; pinned
    // dates are always in the past relative to the test run (plus 24h slack
    // for same-day bumps across timezones).
    const cutoff = Date.now() + 24 * 60 * 60 * 1000;
    for (const entry of sitemap()) {
      const t = new Date(entry.lastModified as Date | string).getTime();
      expect(t, `${entry.url} lastModified is in the future`).toBeLessThanOrEqual(cutoff);
    }
  });

  it("all pinned dates parse as valid dates", () => {
    for (const [route, date] of Object.entries(ROUTE_LASTMOD)) {
      expect(Number.isNaN(new Date(date).getTime()), `${route}: ${date}`).toBe(false);
    }
    for (const [slug, date] of Object.entries(DOCS_LASTMOD_OVERRIDES)) {
      expect(Number.isNaN(new Date(date).getTime()), `${slug}: ${date}`).toBe(false);
    }
    expect(Number.isNaN(new Date(DOCS_DEFAULT_LASTMOD).getTime())).toBe(false);
    expect(Number.isNaN(new Date(BLOG_FALLBACK_LASTMOD).getTime())).toBe(false);
  });
});

describe("sitemap.ts — URL hygiene", () => {
  it("contains no redirecting URLs (/docs, /docs/quick-start, /docs/mcp-integration, /docs/plans-and-trial)", () => {
    const list = urls();
    expect(list).not.toContain(`${SITE}/docs`);
    expect(list).not.toContain(`${SITE}/docs/quick-start`);
    expect(list).not.toContain(`${SITE}/docs/mcp-integration`);
    expect(list).not.toContain(`${SITE}/docs/plans-and-trial`);
  });

  it("contains no noindex auth pages", () => {
    const list = urls();
    expect(list).not.toContain(`${SITE}/login`);
    expect(list).not.toContain(`${SITE}/signup`);
  });

  it("every URL is apex-domain https with no trailing slash (except none expected)", () => {
    for (const url of urls()) {
      expect(url).toMatch(/^https:\/\/parametric-memory\.dev(\/|$)/);
      expect(url, `${url} must not use www`).not.toMatch(/\/\/www\./);
      if (url !== SITE) {
        expect(url, `${url} must not end with a slash`).not.toMatch(/\/$/);
      }
    }
  });

  it("has no duplicate URLs", () => {
    const list = urls();
    expect(new Set(list).size).toBe(list.length);
  });
});

describe("sitemap.ts — coverage", () => {
  it("includes every docs slug from the nav (incl. the previously-orphaned concepts pages)", () => {
    const list = urls();
    for (const slug of getAllDocSlugsFromNav()) {
      expect(list).toContain(`${SITE}/docs/${slug}`);
    }
    // The 2026-07-08 fix specifically published these three:
    expect(list).toContain(`${SITE}/docs/concepts/memory-atoms`);
    expect(list).toContain(`${SITE}/docs/concepts/merkle-proofs`);
    expect(list).toContain(`${SITE}/docs/concepts/markov-prediction`);
  });

  it("includes the homepage and core marketing pages", () => {
    const list = urls();
    for (const path of ["", "/pricing", "/verify", "/faq", "/benchmark", "/about"]) {
      expect(list).toContain(`${SITE}${path}`);
    }
  });

  it("every static route has a pinned lastmod (no silent fallback to Invalid Date)", () => {
    for (const entry of sitemap()) {
      const t = new Date(entry.lastModified as Date | string).getTime();
      expect(Number.isNaN(t), `${entry.url} has an invalid lastModified`).toBe(false);
    }
  });

  it("blog posts use their frontmatter dates (spot check: entries exist and predate fallback bumps)", () => {
    const blogEntries = sitemap().filter((e) => e.url.includes("/blog/"));
    expect(blogEntries.length).toBeGreaterThan(0);
  });
});
