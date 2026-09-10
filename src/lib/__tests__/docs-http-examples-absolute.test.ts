/**
 * Docs HTTP examples must use an absolute instance URL — CI guard (2026-09-07).
 *
 * Why: GSC Page indexing listed https://parametric-memory.dev/recall and
 * /batch-access as "Not found (404)". Nothing links there. Googlebot lifted the
 * paths from ```http fences in content/docs/api/*.mdx ("POST /recall") and
 * resolved them against the marketing site, which has no such routes. Harmless
 * to rankings but it burns crawl budget on a site rationed to ~55 indexed URLs,
 * and it makes the 404 report noisy enough to hide a real one.
 *
 * Fix: request lines carry the example instance host used elsewhere in the
 * docs (https://abc123.parametric-memory.dev), so the extracted URL points at
 * a customer-instance shape, not the marketing origin.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DOCS = path.join(process.cwd(), "content", "docs");

function mdxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...mdxFiles(full));
    else if (e.name.endsWith(".mdx")) out.push(full);
  }
  return out;
}

const RELATIVE_REQUEST_LINE = /^(GET|POST|PUT|PATCH|DELETE)\s+\/(?!\/)/m;

describe("docs ```http examples", () => {
  const files = mdxFiles(DOCS);

  it("finds docs to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => path.relative(process.cwd(), f)))(
    "%s has no root-relative request line (Googlebot resolves it against the marketing site → 404)",
    (rel) => {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      const offenders = src
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => RELATIVE_REQUEST_LINE.test(line))
        .map(({ line, n }) => `${rel}:${n} ${line.trim()}`);
      expect(offenders).toEqual([]);
    },
  );
});
