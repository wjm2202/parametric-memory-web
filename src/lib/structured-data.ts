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

/** BreadcrumbList for a docs page: Home → Docs → [Section] → Page. */
export function buildDocsBreadcrumb(input: DocsJsonLdInput) {
  const items: BreadcrumbItem[] = [
    { name: "Home", item: SITE },
    { name: "Docs", item: `${SITE}/docs/introduction` },
  ];
  if (input.section) items.push({ name: input.section });
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
