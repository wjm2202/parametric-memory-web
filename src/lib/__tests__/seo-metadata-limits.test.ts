/**
 * SEO metadata length limits for content frontmatter — CI guard.
 *
 * Why: the 2026-07-13 Ahrefs audit flagged 19 pages with titles over 60
 * chars and 28 pages with meta descriptions outside the 110–160 range.
 * Root cause was structural: blog <title> came straight from the long
 * headline `title` frontmatter, and the layout template appends
 * " | Parametric Memory" (20 chars) on top. The fix added a short
 * `seoTitle` frontmatter field (used only for <title>; the H1 keeps the
 * headline) and rewrote out-of-range excerpts/descriptions.
 *
 * This suite pins those invariants for every current and FUTURE post/doc:
 *   - effective <title> (seoTitle ?? title, + template suffix) ≤ 60 chars
 *   - blog `excerpt` and docs `description` within 110–160 chars
 *     (Google truncates ≈160; under ≈110 Google tends to rewrite it)
 *
 * Static TSX pages were fixed in the same change (enterprise, benchmark,
 * pricing, copyright, blog index) but aren't asserted here — their
 * metadata lives in code exports, changes rarely, and Ahrefs re-crawls
 * weekly. Content frontmatter is where new pages appear routinely.
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";

const SUFFIX = " | Parametric Memory"; // layout.tsx title template
const TITLE_MAX = 60;
const DESC_MIN = 110;
const DESC_MAX = 160;

const repo = process.cwd();

function mdxFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...mdxFiles(full));
    else if (e.name.endsWith(".mdx")) out.push(full);
  }
  return out;
}

describe("blog frontmatter SEO limits", () => {
  const posts = mdxFiles(path.join(repo, "content", "blog"));

  it("finds posts (sanity)", () => {
    expect(posts.length).toBeGreaterThan(5);
  });

  it.each(posts.map((f) => [path.basename(f), f]))(
    "%s: effective <title> ≤ 60 and excerpt 110–160",
    (_name, file) => {
      const fm = matter(fs.readFileSync(file, "utf-8")).data as {
        title: string;
        seoTitle?: string;
        excerpt: string;
      };
      const effectiveTitle = (fm.seoTitle ?? fm.title) + SUFFIX;
      expect(
        effectiveTitle.length,
        `<title> "${effectiveTitle}" is ${effectiveTitle.length} chars — add/shorten seoTitle`,
      ).toBeLessThanOrEqual(TITLE_MAX);
      expect(fm.excerpt.length, `excerpt is ${fm.excerpt.length} chars`).toBeGreaterThanOrEqual(
        DESC_MIN,
      );
      expect(fm.excerpt.length, `excerpt is ${fm.excerpt.length} chars`).toBeLessThanOrEqual(
        DESC_MAX,
      );
    },
  );
});

/**
 * "Page moved" stubs that 301 via next.config.ts redirects — never rendered
 * as pages, so their metadata doesn't reach crawlers. Exempt from limits.
 * (docs-nav.test.ts guards that these actually redirect.)
 */
const REDIRECT_STUBS = new Set(["mcp-integration.mdx", "quick-start.mdx"]);

describe("docs frontmatter SEO limits", () => {
  const docs = mdxFiles(path.join(repo, "content", "docs")).filter(
    (f) => !REDIRECT_STUBS.has(path.basename(f)),
  );

  it("finds docs (sanity)", () => {
    expect(docs.length).toBeGreaterThan(10);
  });

  it.each(docs.map((f) => [path.relative(path.join(repo, "content", "docs"), f), f]))(
    "%s: <title> ≤ 60 and description 110–160",
    (_name, file) => {
      const fm = matter(fs.readFileSync(file, "utf-8")).data as {
        title: string;
        description: string;
      };
      const effectiveTitle = fm.title + SUFFIX;
      expect(
        effectiveTitle.length,
        `<title> "${effectiveTitle}" is ${effectiveTitle.length} chars`,
      ).toBeLessThanOrEqual(TITLE_MAX);
      expect(
        fm.description.length,
        `description is ${fm.description.length} chars`,
      ).toBeGreaterThanOrEqual(DESC_MIN);
      expect(
        fm.description.length,
        `description is ${fm.description.length} chars`,
      ).toBeLessThanOrEqual(DESC_MAX);
    },
  );
});
