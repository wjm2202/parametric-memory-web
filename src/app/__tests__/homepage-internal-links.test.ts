/**
 * Homepage internal-link section guard ("Go deeper") — 2026-08-24 SEO final fix.
 *
 * THE BUG THIS PINS DOWN: GSC's page-indexing report (2026-08-24) showed 15
 * sitemap URLs stuck in "Discovered - currently not indexed" with Last crawl
 * N/A — 11 docs pages, both video detail pages, /privacy and /aup. They were
 * in the sitemap but had no crawl path from the homepage, the single
 * highest-authority page on the site, so Google's scheduler never spent the
 * budget. The "Go deeper" section gives the front door direct links into the
 * deep content. If someone deletes or prunes it in a redesign, this test
 * fails instead of the pages silently sliding back out of the index.
 *
 * Source-level string test (no rendering) — same pattern as
 * homepage-holistic-redesign.test.ts.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");

describe("Homepage 'Go deeper' internal-link section", () => {
  it("renders the section with its registered testid", () => {
    expect(src).toContain('data-testid="landing-section-go-deeper"');
  });

  it("links the docs pages GSC reported as discovered-but-never-crawled", () => {
    for (const href of [
      "/docs/concepts/memory-atoms",
      "/docs/concepts/merkle-proofs",
      "/docs/concepts/markov-prediction",
      "/docs/mcp/tools",
      "/docs/api/authentication",
      "/docs/your-instance",
    ]) {
      expect(src, `homepage lost its crawl-path link to ${href}`).toContain(`"${href}"`);
    }
  });

  it("links all three video detail pages (never crawled as of 2026-08-24)", () => {
    for (const href of [
      "/videos/ai-memory-over-mcp",
      "/videos/cve-memory-for-ai-agents",
      "/videos/typescript-expert-memory-l2-cache",
    ]) {
      expect(src, `homepage lost its crawl-path link to ${href}`).toContain(`"${href}"`);
    }
  });

  it("links /research (the DOI-registered whitepapers)", () => {
    expect(src).toContain('href="/research"');
  });
});
