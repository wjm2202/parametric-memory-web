/**
 * Structured-data (JSON-LD) builders for docs and blog pages.
 *
 * Pure functions so the exact schema output is unit-testable
 * (see structured-data.test.ts). Rendered into <script type="application/ld+json">
 * by the page components.
 *
 * Why:
 *  - Docs pages previously shipped NO JSON-LD — TechArticle + BreadcrumbList
 *    strengthen AEO citations (Google AI Mode, Perplexity, ChatGPT Search).
 *  - Blog posts had BlogPosting but no BreadcrumbList; breadcrumbs help Google
 *    understand site hierarchy and render breadcrumb rich results.
 */

const SITE = "https://parametric-memory.dev";
const ORG_ID = `${SITE}/#organization`;

export interface DocsJsonLdInput {
  /** Full slug, e.g. "concepts/merkle-proofs" */
  slug: string;
  title: string;
  description: string;
  /** Sidebar section title, e.g. "Concepts" — optional middle breadcrumb */
  section?: string;
  /**
   * Slug of the section's first page — target URL for the section crumb.
   * Sections have no landing pages, and Google requires `item` on every
   * BreadcrumbList crumb except the last, so the crumb points at the
   * section's first doc page (GSC "1 invalid item detected", 2026-07-17).
   */
  sectionFirstSlug?: string;
}

export interface BreadcrumbItem {
  name: string;
  /** Absolute URL. Omit for the final (current-page) crumb per Google guidance. */
  item?: string;
}

function breadcrumbList(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      ...(crumb.item ? { item: crumb.item } : {}),
    })),
  };
}

/** TechArticle schema for a docs page. */
export function buildDocsTechArticle(input: DocsJsonLdInput) {
  const url = `${SITE}/docs/${input.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "@id": `${url}#article`,
    headline: input.title,
    description: input.description,
    url,
    inLanguage: "en",
    isPartOf: {
      "@type": "WebSite",
      name: "Parametric Memory Documentation",
      url: `${SITE}/docs`,
    },
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };
}

/**
 * BreadcrumbList for a docs page: Home → Docs → [Section] → Page.
 *
 * Google requires an `item` URL on every crumb except the last (the current
 * page). A bare `{ name: section }` middle crumb is therefore invalid — GSC
 * flagged every sectioned docs page with "Breadcrumbs: 1 invalid item
 * detected" (2026-07-17). The section crumb now points at the section's
 * first doc page; when the current page IS that first page the crumb would
 * self-reference, so it is dropped and the trail is Home → Docs → Page.
 */
export function buildDocsBreadcrumb(input: DocsJsonLdInput) {
  const items: BreadcrumbItem[] = [
    { name: "Home", item: SITE },
    { name: "Docs", item: `${SITE}/docs/introduction` },
  ];
  if (input.section && input.sectionFirstSlug && input.sectionFirstSlug !== input.slug) {
    items.push({ name: input.section, item: `${SITE}/docs/${input.sectionFirstSlug}` });
  }
  items.push({ name: input.title });
  return breadcrumbList(items);
}

/** BreadcrumbList for a blog post: Home → Blog → Post. */
export function buildBlogBreadcrumb(title: string) {
  return breadcrumbList([
    { name: "Home", item: SITE },
    { name: "Blog", item: `${SITE}/blog` },
    { name: title },
  ]);
}

// ── Video ────────────────────────────────────────────────────────────────────
//
// Added 2026-08-09 after the GSC audit found the site averaging position 11.6
// with zero video markup anywhere and "Discovered videos: 0" on the sitemap.
// Video results are a far less contested SERP than web results, and Google
// only awards them to pages where the video is the main content — hence one
// page per video rather than a single gallery.
//
// Required by Google for VideoObject rich results: name, description,
// thumbnailUrl, uploadDate. `duration` and `embedUrl` are strongly recommended
// and cheap to supply, so they are always emitted.

/** Real chapter marker on the source video. Offsets must match the video. */
export interface VideoClipInput {
  startSeconds: number;
  title: string;
}

export interface VideoJsonLdInput {
  /** URL segment under /videos/ */
  slug: string;
  title: string;
  description: string;
  /** YYYY-MM-DD. Google accepts a date-only ISO 8601 value. */
  uploadDate: string;
  /** ISO-8601 duration, e.g. "PT13M10S" — see toIso8601Duration(). */
  duration: string;
  thumbnailUrl: string;
  /** Player URL — must be the same URL the on-page iframe loads. */
  embedUrl: string;
  keywords?: string[];
  /** Omit entirely when the video has no real chapter markers. */
  chapters?: VideoClipInput[];
  /** Total runtime in seconds — needed to bound the final Clip. */
  durationSeconds: number;
}

/**
 * VideoObject for a single video page.
 *
 * `hasPart` Clip entries are emitted only when real chapters exist. Each clip
 * is bounded by the next chapter's start (or the video's end), because Google
 * requires both startOffset and endOffset to render key moments, and a clip
 * that runs past the end of the video is invalid.
 */
export function buildVideoObject(input: VideoJsonLdInput) {
  const url = `${SITE}/videos/${input.slug}`;
  const chapters = input.chapters ?? [];

  const hasPart = chapters.map((chapter, i) => {
    const endOffset = chapters[i + 1]?.startSeconds ?? input.durationSeconds;
    return {
      "@type": "Clip",
      name: chapter.title,
      startOffset: chapter.startSeconds,
      endOffset,
      url: `${url}?t=${chapter.startSeconds}`,
    };
  });

  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "@id": `${url}#video`,
    name: input.title,
    description: input.description,
    thumbnailUrl: [input.thumbnailUrl],
    uploadDate: input.uploadDate,
    duration: input.duration,
    embedUrl: input.embedUrl,
    url,
    inLanguage: "en",
    isFamilyFriendly: true,
    publisher: { "@id": ORG_ID },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    ...(input.keywords?.length ? { keywords: input.keywords.join(", ") } : {}),
    ...(hasPart.length ? { hasPart } : {}),
  };
}

/** BreadcrumbList for a video page: Home → Videos → Video. */
export function buildVideoBreadcrumb(title: string) {
  return breadcrumbList([
    { name: "Home", item: SITE },
    { name: "Videos", item: `${SITE}/videos` },
    { name: title },
  ]);
}

/**
 * ItemList for the /videos hub.
 *
 * The hub itself is not eligible for a video rich result — that belongs to the
 * individual pages. ItemList is the correct schema for a listing: it tells
 * Google the page is an index and hands it the ordered set of detail URLs to
 * follow, which is exactly the crawl signal a new section needs.
 */
export function buildVideoItemList(videos: Array<{ slug: string; title: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${SITE}/videos#list`,
    name: "Parametric Memory videos",
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: videos.length,
    itemListElement: videos.map((video, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: video.title,
      url: `${SITE}/videos/${video.slug}`,
    })),
  };
}
