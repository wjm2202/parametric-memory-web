import type { MetadataRoute } from "next";
import { getAllPostSlugs, getPostBySlug } from "@/lib/blog";
import { getAllDocSlugsFromNav } from "@/config/docs-nav";

/**
 * Sitemap — deterministic lastmod dates (2026-07-08 SEO indexing fix).
 *
 * Previously every non-blog entry used `new Date()`, so every crawl saw
 * "changed today" for every page. Google explicitly discounts lastmod when it
 * is observably unreliable, which weakens recrawl scheduling for the whole
 * file. Rules now:
 *
 *  - Blog posts: frontmatter `date` (real publication date).
 *  - Everything else: explicit dates in ROUTE_LASTMOD / DOCS_LASTMOD below.
 *    BUMP THE DATE when a page meaningfully changes. Stale-but-honest beats
 *    fresh-but-fake.
 *
 * Also removed: the `/docs` entry — it 301s to /docs/introduction (which IS
 * listed via docs-nav), and sitemaps must not list redirecting URLs (GSC
 * "Page with redirect" + a duplicate-canonical flag on the target).
 *
 * Determinism is locked by src/app/sitemap.test.ts.
 */

const SITE = "https://parametric-memory.dev";

/** Last meaningful content change per static route. Bump when you edit the page. */
export const ROUTE_LASTMOD: Record<string, string> = {
  "": "2026-07-08",
  "/pricing": "2026-07-08",
  "/enterprise": "2026-07-08",
  "/benchmark": "2026-07-08",
  "/about": "2026-07-08",
  "/contact": "2026-06-20",
  "/verify": "2026-07-08",
  "/faq": "2026-07-08",
  "/visualise": "2026-05-20",
  "/knowledge": "2026-05-20",
  "/blog": "2026-07-08",
  "/terms": "2026-04-05",
  "/privacy": "2026-04-05",
  "/aup": "2026-04-05",
  "/copyright": "2026-04-05",
  "/dpa": "2026-04-05",
};

/**
 * Docs pages: default = last docs-wide content pass (2026-07-06 MCP tools
 * reconciliation). Override per slug when a single page changes.
 */
export const DOCS_DEFAULT_LASTMOD = "2026-07-06";
export const DOCS_LASTMOD_OVERRIDES: Record<string, string> = {
  // Concepts pages published into nav + sitemap on 2026-07-08.
  "concepts/memory-atoms": "2026-07-08",
  "concepts/merkle-proofs": "2026-07-08",
  "concepts/markov-prediction": "2026-07-08",
};

/** Fallback for a blog post with unparseable frontmatter — pinned, not now(). */
export const BLOG_FALLBACK_LASTMOD = "2026-07-08";

type ChangeFrequency = MetadataRoute.Sitemap[number]["changeFrequency"];

const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: ChangeFrequency;
  priority: number;
}> = [
  { path: "", changeFrequency: "weekly", priority: 1 },
  { path: "/pricing", changeFrequency: "weekly", priority: 0.9 },
  { path: "/enterprise", changeFrequency: "weekly", priority: 0.9 },
  // Benchmark / "build vs buy" page — high AEO value. FAQPage JSON-LD +
  // reproducible numbers make it citable by AI answer engines for queries
  // like "MMPM vs RAG", "does agent memory beat a prompt", "build your own
  // vector memory". Internally linked from nav + footer; supports pricing.
  { path: "/benchmark", changeFrequency: "weekly", priority: 0.9 },
  { path: "/about", changeFrequency: "monthly", priority: 0.8 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.6 },
  // Verify page — top-tier for SEO + AEO. Cryptographic-verifier UX is a
  // primary trust differentiator. AI answer engines (ChatGPT, Perplexity,
  // Claude) and Google should surface this when users search for "verify
  // AI memory", "signed AI snapshot", "audit trail AI agent", etc.
  { path: "/verify", changeFrequency: "weekly", priority: 0.95 },
  // FAQ page — high priority for AEO (FAQPage JSON-LD, AI answer citations)
  { path: "/faq", changeFrequency: "monthly", priority: 0.9 },
  { path: "/visualise", changeFrequency: "monthly", priority: 0.7 },
  { path: "/knowledge", changeFrequency: "weekly", priority: 0.6 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.6 },
  // /signup and /login are intentionally omitted — they are noindex
  // (low-value auth pages), and noindex URLs should not appear in the sitemap.
  // /docs is intentionally omitted — it 301s to /docs/introduction.
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/aup", changeFrequency: "yearly", priority: 0.3 },
  { path: "/copyright", changeFrequency: "yearly", priority: 0.3 },
  { path: "/dpa", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  // Individual blog post entries from the content directory
  const blogSlugs = getAllPostSlugs();
  const blogEntries: MetadataRoute.Sitemap = blogSlugs.map((slug) => {
    let lastModified = new Date(BLOG_FALLBACK_LASTMOD);
    try {
      const { frontmatter } = getPostBySlug(slug);
      if (frontmatter.date) lastModified = new Date(frontmatter.date);
    } catch {
      // keep pinned fallback — never new Date()
    }
    return {
      url: `${SITE}/blog/${slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    };
  });

  // Individual docs page entries from the docs nav config (single source of
  // truth for what is published — orphans on disk are NOT listed).
  const docSlugs = getAllDocSlugsFromNav();
  const docEntries: MetadataRoute.Sitemap = docSlugs.map((slug) => ({
    url: `${SITE}/docs/${slug}`,
    lastModified: new Date(DOCS_LASTMOD_OVERRIDES[slug] ?? DOCS_DEFAULT_LASTMOD),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${SITE}${route.path}`,
    lastModified: new Date(ROUTE_LASTMOD[route.path]),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  return [...staticEntries, ...docEntries, ...blogEntries];
}
