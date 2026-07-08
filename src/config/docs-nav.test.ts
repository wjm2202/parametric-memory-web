/**
 * Invariant tests for the docs sidebar navigation.
 *
 * Guarantees:
 *  - Every slug listed in docsNav has a corresponding MDX file under content/docs/
 *  - Every MDX file under content/docs/ is either reachable from docsNav OR
 *    explicitly excluded below (e.g. legacy redirect stubs)
 *  - No slug is duplicated across sections
 *
 * These tests caught the pre-2026-W17 state where content/docs/api/atoms.mdx,
 * authentication.mdx, and recall.mdx existed on disk but were orphaned from
 * the sidebar. If someone adds an MDX file without wiring it up (or removes
 * an MDX file without cleaning the nav), this test tells them.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { docsNav, getAllDocSlugsFromNav } from "./docs-nav";

const DOCS_ROOT = path.resolve(__dirname, "../../content/docs");

/**
 * Slugs that intentionally exist on disk but are hidden from the sidebar.
 * Keep this list empty unless there is a concrete reason (e.g. unpublished
 * draft, redirect stub). Every entry here is a latent TODO.
 *
 * 2026-07-08 (SEO indexing fix): the three concepts/* orphans were published
 * into a new "Concepts" nav section. The two remaining entries are legacy
 * "moved" stubs that now 301 via next.config.ts redirects (quick-start →
 * your-instance, mcp-integration → mcp/claude); the MDX files stay on disk
 * only as documentation of the old URLs. Do not grow this list.
 */
const INTENTIONAL_UNLISTED_SLUGS: readonly string[] = [
  "mcp-integration",
  "quick-start",
];

/**
 * Walk content/docs/ and return every slug (file path minus the .mdx extension,
 * relative to DOCS_ROOT, with forward slashes).
 */
function collectDiskSlugs(dir: string, prefix = ""): string[] {
  const slugs: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      slugs.push(...collectDiskSlugs(abs, prefix ? `${prefix}/${entry.name}` : entry.name));
    } else if (entry.isFile() && entry.name.endsWith(".mdx")) {
      const base = entry.name.replace(/\.mdx$/, "");
      slugs.push(prefix ? `${prefix}/${base}` : base);
    }
  }
  return slugs.sort();
}

describe("docs-nav.ts — sidebar ↔ disk invariants", () => {
  it("every slug listed in docsNav has a matching MDX file on disk", () => {
    const diskSlugs = new Set(collectDiskSlugs(DOCS_ROOT));
    const missing: string[] = [];
    for (const slug of getAllDocSlugsFromNav()) {
      if (!diskSlugs.has(slug)) missing.push(slug);
    }
    expect(
      missing,
      `docs-nav.ts lists slugs with no matching content/docs/<slug>.mdx file: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("every MDX file on disk is reachable from docsNav (or explicitly unlisted)", () => {
    const navSlugs = new Set(getAllDocSlugsFromNav());
    const orphans: string[] = [];
    for (const slug of collectDiskSlugs(DOCS_ROOT)) {
      if (!navSlugs.has(slug) && !INTENTIONAL_UNLISTED_SLUGS.includes(slug)) {
        orphans.push(slug);
      }
    }
    expect(
      orphans,
      `these MDX files exist but are not in docs-nav.ts — wire them up or add to INTENTIONAL_UNLISTED_SLUGS: ${orphans.join(", ")}`,
    ).toEqual([]);
  });

  it("no slug is duplicated across sections", () => {
    const all = getAllDocSlugsFromNav();
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const slug of all) {
      if (seen.has(slug)) dupes.push(slug);
      seen.add(slug);
    }
    expect(dupes, `duplicate slugs in docs-nav.ts: ${dupes.join(", ")}`).toEqual([]);
  });

  it("every section has at least one item", () => {
    for (const section of docsNav) {
      expect(section.items.length, `section "${section.title}" is empty`).toBeGreaterThan(0);
    }
  });

  it("slugs use forward-slash nesting, not backslashes", () => {
    for (const slug of getAllDocSlugsFromNav()) {
      expect(slug, `slug "${slug}" must not contain backslashes`).not.toMatch(/\\/);
      expect(slug, `slug "${slug}" must not start with a slash`).not.toMatch(/^\//);
      expect(slug, `slug "${slug}" must not end with .mdx`).not.toMatch(/\.mdx$/);
    }
  });
});

describe("docs-nav.ts — unlisted stubs must 301 (2026-07-08 SEO fix)", () => {
  it("every intentionally-unlisted slug has a permanent redirect in next.config.ts", async () => {
    const nextConfig = (await import("../../next.config")).default;
    const redirects = await (
      nextConfig.redirects as () => Promise<
        Array<{ source: string; destination: string; permanent: boolean }>
      >
    )();
    for (const slug of INTENTIONAL_UNLISTED_SLUGS) {
      const redirect = redirects.find((r) => r.source === `/docs/${slug}`);
      expect(
        redirect,
        `/docs/${slug} is unlisted but has no next.config redirect — it would render as a thin "page has moved" stub that Google crawls but won't index`,
      ).toBeDefined();
      expect(redirect!.permanent, `/docs/${slug} redirect must be permanent (301)`).toBe(
        true,
      );
    }
  });

  it("every intentionally-unlisted stub documents its target via `redirect:` frontmatter", () => {
    for (const slug of INTENTIONAL_UNLISTED_SLUGS) {
      const body = fs.readFileSync(path.join(DOCS_ROOT, `${slug}.mdx`), "utf8");
      expect(body, `${slug}.mdx should carry redirect: frontmatter`).toMatch(
        /^redirect:\s*\/docs\//m,
      );
    }
  });

  it("concepts pages are published in the nav (regression guard for the 2026-04-19 orphans)", () => {
    const navSlugs = getAllDocSlugsFromNav();
    expect(navSlugs).toContain("concepts/memory-atoms");
    expect(navSlugs).toContain("concepts/merkle-proofs");
    expect(navSlugs).toContain("concepts/markov-prediction");
  });
});

describe("docs-nav.ts — atom-safety page wiring (2026-W17)", () => {
  it("API Reference section exists and contains atom-safety", () => {
    const apiSection = docsNav.find((s) => s.title === "API Reference");
    expect(apiSection, "API Reference section is missing from docsNav").toBeDefined();
    const slugs = apiSection!.items.map((i) => i.slug);
    expect(slugs).toContain("api/atom-safety");
  });

  it("atom-safety page explains 422 behaviour", () => {
    const body = fs.readFileSync(path.join(DOCS_ROOT, "api/atom-safety.mdx"), "utf8");
    expect(body).toMatch(/422/);
    expect(body).toMatch(/sensitive_content_rejected/);
  });

  it("atoms.mdx error table links to atom-safety page", () => {
    const body = fs.readFileSync(path.join(DOCS_ROOT, "api/atoms.mdx"), "utf8");
    expect(body).toMatch(/`422`/);
    expect(body).toMatch(/\/docs\/api\/atom-safety/);
  });
});
