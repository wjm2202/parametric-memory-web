import type { MetadataRoute } from "next";
import { getAllPostSlugs, getPostBySlug } from "@/lib/blog";
import { getAllDocSlugsFromNav } from "@/config/docs-nav";
import { getAllVideos, youtubeEmbedUrl, youtubeThumbnailUrl } from "@/lib/videos";

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
  // 2026-07-12: claims realignment. Home, /benchmark and /faq gained the
  // verified LongMemEval results (76.6% zero-setup / 83.0% typed, official
  // judge, sealed bundles) and every advertised latency figure was corrected
  // to the re-measured values. /pricing and /about had absolute competitor
  // claims replaced with dated, attributed ones. These are meaningful content
  // changes, so the dates move — that is the whole point of the pinned-lastmod
  // scheme.
  "": "2026-07-12",
  "/pricing": "2026-07-13",
  "/enterprise": "2026-07-13",
  "/benchmark": "2026-07-13",
  "/about": "2026-07-13",
  "/contact": "2026-07-13",
  "/verify": "2026-07-08",
  "/faq": "2026-07-13",
  "/visualise": "2026-07-13",
  "/knowledge": "2026-07-13",
  "/blog": "2026-07-13",
  // 2026-08-09: /videos section created. GSC reported "Discovered videos: 0"
  // on the sitemap because the site published no video markup at all, while
  // three demos sat on YouTube earning Search impressions the site could not
  // claim. Video results are a far less contested SERP than web results.
  "/videos": "2026-08-09",
  "/terms": "2026-07-13",
  // 2026-07-13: privacy policy revision — OAuth SSO disclosure, full cookie
  // table (mmpm_oauth_state, mmpm_pending_token), 2FA + waitlist sections.
  "/privacy": "2026-07-13",
  "/aup": "2026-07-13",
  "/copyright": "2026-07-13",
  "/dpa": "2026-07-13",
};

/**
 * Docs pages: default = last docs-wide content pass. Override per slug when
 * a single page changes.
 *
 * 2026-07-17: breadcrumb JSON-LD fix (GSC "Breadcrumbs — 1 invalid item
 * detected") changed the markup of EVERY docs page, so the docs-wide default
 * moves to 2026-07-17. The 2026-07-13 per-slug overrides (MDX crash fix +
 * SEO metadata pass) are removed because they now predate the default —
 * keeping them would pin those pages BEHIND their actual last change.
 */
export const DOCS_DEFAULT_LASTMOD = "2026-07-17";
export const DOCS_LASTMOD_OVERRIDES: Record<string, string> = {};

/** Fallback for a blog post with unparseable frontmatter — pinned, not now(). */
export const BLOG_FALLBACK_LASTMOD = "2026-07-08";

/**
 * Video detail pages. Keyed by slug (see src/lib/videos.ts).
 *
 * Deliberately NOT derived from the video's `uploadDate`: lastmod describes
 * when the PAGE last changed, not when the video was published. A page written
 * today about a video published in July has a lastmod of today. Bump the entry
 * when you edit the summary, takeaways or chapters.
 *
 * A missing entry falls back to VIDEO_DEFAULT_LASTMOD rather than now() —
 * same discipline as the rest of this file. Locked by sitemap.test.ts.
 */
export const VIDEO_DEFAULT_LASTMOD = "2026-08-09";
export const VIDEO_LASTMOD: Record<string, string> = {
  "cve-memory-for-ai-agents": "2026-08-09",
  "ai-memory-over-mcp": "2026-08-09",
  "typescript-expert-memory-l2-cache": "2026-08-09",
};

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
  // /videos hub — an ItemList index, not itself a video result. Its job is to
  // hand Google the three detail URLs and give the section internal links.
  { path: "/videos", changeFrequency: "monthly", priority: 0.7 },
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

  // Video detail pages, each carrying a <video:video> extension. This is what
  // populates the "Discovered videos" column in GSC's sitemap report — it read
  // 0 before this section existed. thumbnail_loc, title and description are
  // the three fields Google requires; player_loc must be the same player URL
  // the page's iframe loads, or the extension and the markup disagree.
  const videoEntries: MetadataRoute.Sitemap = getAllVideos().map((video) => ({
    url: `${SITE}/videos/${video.slug}`,
    lastModified: new Date(VIDEO_LASTMOD[video.slug] ?? VIDEO_DEFAULT_LASTMOD),
    changeFrequency: "monthly" as const,
    priority: 0.7,
    videos: [
      {
        title: video.title,
        thumbnail_loc: youtubeThumbnailUrl(video.youtubeId),
        description: video.description,
        player_loc: youtubeEmbedUrl(video.youtubeId),
        duration: video.durationSeconds,
        publication_date: video.uploadDate,
        family_friendly: "yes" as const,
      },
    ],
  }));

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${SITE}${route.path}`,
    lastModified: new Date(ROUTE_LASTMOD[route.path]),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  return [...staticEntries, ...docEntries, ...blogEntries, ...videoEntries];
}
