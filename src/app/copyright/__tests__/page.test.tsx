/**
 * /copyright page tests.
 *
 * Why: this page is the public statement that anchors NZ jurisdiction
 * and human authorship. The legally-loadbearing sentences below are
 * exact-match assertions so a future refactor can't accidentally weaken
 * the wording. If you intend to change the wording, update both this
 * test and src/components/ui/SiteFooter.tsx in lockstep.
 *
 * The page is a Server Component (uses next/headers cookies()), so we
 * read the source file as text and check the legal strings appear
 * verbatim. This mirrors the approach in
 * src/app/__tests__/mobile-typography.test.tsx.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PAGE_PATH = path.join(process.cwd(), "src", "app", "copyright", "page.tsx");

const pageSrc = fs.readFileSync(PAGE_PATH, "utf-8");

/**
 * Collapse runs of whitespace to a single space. Prettier reflows JSX
 * prose at 80/100 columns and the wrap points shift between releases,
 * so any literal multi-line assertion is a flaky test waiting to fail.
 * Same pattern as src/app/__tests__/legal-clauses.test.ts.
 */
const normalize = (s: string) => s.replace(/\s+/g, " ");
const pageFlat = normalize(pageSrc);

describe("/copyright page — load-bearing legal text", () => {
  it("has the canonical short copyright notice", () => {
    expect(pageSrc).toContain(
      "© 2025–2026 G. Osborne. All rights reserved. Authored in New Zealand.",
    );
  });

  it("states Parametric Memory Limited is a licensee, not the owner", () => {
    expect(pageSrc).toContain(
      "Parametric Memory Limited is a licensee of this software, not its owner.",
    );
  });

  it("names G. Osborne as the sole human author", () => {
    expect(pageSrc).toMatch(/sole human author[\s\S]*G\. Osborne/);
  });

  it("contains the human-authorship statement (AI as tool)", () => {
    // Multi-line in source after Prettier reflow — assert against pageFlat.
    expect(pageFlat).toContain(
      "AI-based code generation tools were used as instruments of authorship",
    );
    expect(pageFlat).toContain("no part of the Work was produced autonomously by an AI");
  });

  it("declares New Zealand as place of authorship and first publication", () => {
    expect(pageSrc).toMatch(/first authored and first published in[\s\S]*New Zealand/);
  });

  it("submits disputes to the exclusive jurisdiction of NZ courts", () => {
    // Multi-line in source after Prettier reflow — assert against pageFlat.
    // Note: in the JSX, the phrase is split as
    //   "...exclusive jurisdiction of the courts of New\n             Zealand</strong>..."
    // and may also have HTML entity escapes embedded; tolerate any
    // <em>/<strong> tags between fragments.
    expect(pageFlat).toMatch(/exclusive jurisdiction of the courts of New(?:[^<]|<[^>]+>)*Zealand/);
  });

  it("cites the Copyright Act 1994 (NZ) and Berne Convention", () => {
    expect(pageSrc).toContain("Copyright Act 1994");
    expect(pageSrc).toContain("Berne Convention");
  });

  it("retains all underlying rights with the Author", () => {
    expect(pageSrc).toContain(
      "the Author retains <strong>all underlying rights, title and interest</strong>",
    );
  });

  it("disclaims warranty and liability for use by Parametric Memory Limited", () => {
    expect(pageSrc).toMatch(/no warranty/i);
    expect(pageSrc).toMatch(/no liability/i);
    // Multi-line in source after Prettier reflow ("use by\n             Parametric...")
    // — assert against pageFlat so the line-wrap point doesn't matter.
    expect(pageFlat).toContain("use by Parametric Memory Limited");
  });

  it("preserves NZ Consumer Guarantees Act 1993 carve-out", () => {
    expect(pageSrc).toContain("Consumer Guarantees Act 1993");
  });

  it("provides a licensing contact", () => {
    expect(pageSrc).toContain("entityone22@gmail.com");
  });

  it("declares it is not legal advice", () => {
    expect(pageSrc).toMatch(/not legal advice/i);
  });

  it("exports a Metadata title that includes the page name", () => {
    expect(pageSrc).toContain('"Copyright & Licensing — Parametric Memory"');
  });

  it("is reachable at /copyright canonical URL", () => {
    expect(pageSrc).toContain('canonical: "https://parametric-memory.dev/copyright"');
  });
});
