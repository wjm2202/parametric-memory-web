/**
 * Every MDX content file must compile — guard against content-induced 500s.
 *
 * Why: on 2026-07-13 the Ahrefs site audit found /docs/subscription/cancel
 * returning HTTP 500 in production. Root cause: `## Refund policy {#refund-policy}`
 * — the `{#custom-id}` heading syntax is not supported by our MDX pipeline
 * (no heading-id remark plugin), so MDX parsed `{...}` as a JavaScript
 * expression and crashed at render time ("Could not parse expression with
 * acorn"). The page had been shipping a 500 while sitting in the sitemap —
 * poison for crawl trust on a domain we're trying to get indexed.
 *
 * This suite compiles EVERY .mdx file under content/ with the same remark
 * pipeline as src/lib/mdx.ts, so a bad expression, unclosed JSX tag, or
 * unsupported syntax fails CI instead of returning a 500 in production.
 *
 * Note: rehype-pretty-code (shiki) is intentionally omitted — parse-stage
 * crashes (the class that causes 500s) happen before rehype runs, and
 * loading shiki per-file makes the suite ~10x slower for no extra safety.
 *
 * Note: headings get their ids from slugify() in
 * src/components/docs/MdxComponents.tsx (lowercase, strip non-alnum,
 * spaces→dashes). If you need a custom anchor, phrase the heading so its
 * slug matches — do NOT use `{#custom-id}` syntax.
 */
import fs from "node:fs";
import path from "node:path";
import { compile } from "@mdx-js/mdx";
import matter from "gray-matter";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";

const CONTENT_ROOT = path.join(process.cwd(), "content");

/** Recursively collect all .mdx files under a directory. */
function collectMdxFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectMdxFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".mdx")) out.push(full);
  }
  return out;
}

const files = collectMdxFiles(CONTENT_ROOT);

describe("MDX content compiles (500-guard)", () => {
  it("finds content files to check (sanity)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [path.relative(CONTENT_ROOT, f), f]))(
    "compiles content/%s",
    async (_rel, absolute) => {
      const source = matter(fs.readFileSync(absolute, "utf-8")).content;
      await expect(compile(source, { remarkPlugins: [remarkGfm] })).resolves.toBeDefined();
    },
  );

  it("no file uses the unsupported {#custom-id} heading syntax", () => {
    const offenders = files.filter((f) =>
      /^#{1,6}\s.*\{#[\w-]+\}\s*$/m.test(fs.readFileSync(f, "utf-8")),
    );
    expect(
      offenders.map((f) => path.relative(CONTENT_ROOT, f)),
      "use a heading whose slugify() output is the anchor you need instead",
    ).toEqual([]);
  });
});
