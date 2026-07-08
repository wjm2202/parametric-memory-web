/**
 * Docs navigation — single source of truth for sidebar order and grouping.
 *
 * To add a doc:
 *   1. Create `content/docs/<slug>.mdx` (nested ok: `subscription/upgrade`)
 *   2. Add an entry here with the matching slug
 *
 * `slug` must exactly match the MDX file path under content/docs/ (no extension).
 */

export interface DocNavItem {
  title: string;
  /** Matches content/docs/<slug>.mdx — nested slugs use forward slash */
  slug: string;
  badge?: "new" | "beta" | "soon";
}

export interface DocNavSection {
  title: string;
  items: DocNavItem[];
}

export const docsNav: DocNavSection[] = [
  {
    title: "Getting Started",
    items: [
      { title: "What is Parametric Memory?", slug: "introduction" },
      { title: "Plans", slug: "plans" },
      { title: "Your Instance & API Key", slug: "your-instance" },
      { title: "Customer Lifecycle", slug: "customer-lifecycle" },
      {
        title: "Self-Service Operations",
        slug: "self-service-guide",
        badge: "new",
      },
    ],
  },
  {
    // Core concept explainers — high AEO value (Merkle proofs, Markov
    // prediction, atoms). These were orphaned on disk from 2026-04-19 to
    // 2026-07-08: live at their URLs but absent from the sidebar AND the
    // sitemap, with ~zero internal links — a direct cause of Google's
    // "Crawled — currently not indexed" exclusions. Listing them here wires
    // them into both (docs-nav feeds sitemap.ts via getAllDocSlugsFromNav).
    title: "Concepts",
    items: [
      { title: "Memory Atoms", slug: "concepts/memory-atoms" },
      { title: "Merkle Proofs", slug: "concepts/merkle-proofs" },
      { title: "Markov Prediction", slug: "concepts/markov-prediction" },
    ],
  },
  {
    title: "MCP Integration",
    items: [
      { title: "Claude Desktop & Cowork", slug: "mcp/claude" },
      { title: "Other AI Clients", slug: "mcp/other-clients" },
      { title: "MCP Tool Reference", slug: "mcp/tools" },
    ],
  },
  {
    title: "Subscription Management",
    items: [
      { title: "Upgrade Plan", slug: "subscription/upgrade" },
      { title: "Downgrade Plan", slug: "subscription/downgrade" },
      { title: "Cancel Subscription", slug: "subscription/cancel" },
    ],
  },
  {
    title: "Limits & Behaviour",
    items: [
      { title: "Tier Limits & Caps", slug: "limits" },
      { title: "Spend Caps", slug: "spend-caps" },
      { title: "Payment Failures", slug: "payment-failures" },
    ],
  },
  {
    title: "API Reference",
    items: [
      { title: "Authentication", slug: "api/authentication" },
      { title: "Atoms API", slug: "api/atoms" },
      { title: "Recall API", slug: "api/recall" },
      { title: "Atom Safety & Blocking", slug: "api/atom-safety", badge: "new" },
    ],
  },
];

/** Flat list of all slugs — used by generateStaticParams */
export function getAllDocSlugsFromNav(): string[] {
  return docsNav.flatMap((section) => section.items.map((item) => item.slug));
}

/** The first doc slug in the nav — used by the /docs index redirect */
export const firstDocSlug = docsNav[0].items[0].slug;

/** Sidebar section title for a slug, or undefined if the slug is unlisted. */
export function getDocSectionTitle(slug: string): string | undefined {
  return docsNav.find((section) => section.items.some((item) => item.slug === slug))?.title;
}
