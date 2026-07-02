/**
 * /contact page tests.
 *
 * Why: this page exists to fix a Google Search Console "Not found (404)"
 * on https://parametric-memory.dev/contact — two blog posts link to
 * /contact (content/blog/2026-04-03-… and 2026-04-26-…) but the route
 * had no page. These assertions lock in the things that make the page
 * actually resolve the SEO issue:
 *   - a canonical tag pointing at the bare (non-www) /contact URL
 *   - the page being present in the sitemap
 *   - the support email coming from the @/config/site single source of
 *     truth (not a hardcoded literal that can drift)
 *
 * The page is a Server Component (uses next/headers cookies()), so we
 * read the source files as text and assert against them — same approach
 * as src/app/copyright/__tests__ and src/app/__tests__/legal-clauses.test.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SUPPORT_EMAIL } from "@/config/site";

const PAGE_PATH = path.join(process.cwd(), "src", "app", "contact", "page.tsx");
const SITEMAP_PATH = path.join(process.cwd(), "src", "app", "sitemap.ts");

const pageSrc = fs.readFileSync(PAGE_PATH, "utf-8");
const sitemapSrc = fs.readFileSync(SITEMAP_PATH, "utf-8");

const CANONICAL = "https://parametric-memory.dev/contact";

describe("/contact page — exists and is indexable", () => {
  it("exports Next metadata", () => {
    expect(pageSrc).toMatch(/export const metadata/);
  });

  it("sets the canonical to the bare (non-www) /contact URL", () => {
    // The www→non-www 301 lives in nginx.conf; the canonical must agree so
    // Google consolidates signals on the bare host.
    expect(pageSrc).toContain("/contact");
    expect(pageSrc).toMatch(/canonical:\s*`\$\{SITE_ORIGIN\}\/contact`/);
  });

  it("default-exports a page component", () => {
    expect(pageSrc).toMatch(/export default async function ContactPage/);
  });

  it("renders the site navbar (consistent header, internal links for crawlers)", () => {
    expect(pageSrc).toContain("SiteNavbar");
  });
});

describe("/contact page — contact details come from the single source of truth", () => {
  it("imports SUPPORT_EMAIL + mailto from @/config/site (no hardcoded address)", () => {
    expect(pageSrc).toMatch(/from "@\/config\/site"/);
    expect(pageSrc).toContain("SUPPORT_EMAIL");
    expect(pageSrc).toContain("mailto(");
  });

  it("does not hardcode the email literal in the page source", () => {
    // Guards against drift if SUPPORT_EMAIL changes in config.
    expect(pageSrc).not.toContain(SUPPORT_EMAIL);
  });

  it("emits ContactPage JSON-LD for search + AI answer engines", () => {
    expect(pageSrc).toContain('"@type": "ContactPage"');
    expect(pageSrc).toContain("application/ld+json");
  });
});

describe("/contact page — discoverability", () => {
  it("is listed in the sitemap", () => {
    expect(sitemapSrc).toContain(CANONICAL);
  });
});
