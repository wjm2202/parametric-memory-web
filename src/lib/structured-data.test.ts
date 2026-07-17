/**
 * Tests for the JSON-LD builders (2026-07-08 SEO fix).
 *
 * Docs pages previously shipped zero JSON-LD; blog posts lacked breadcrumbs.
 * These lock the schema shapes so a refactor can't silently drop fields that
 * Google's Rich Results / AI answer engines key on.
 */

import { describe, it, expect } from "vitest";
import { buildDocsTechArticle, buildDocsBreadcrumb, buildBlogBreadcrumb } from "./structured-data";

const input = {
  slug: "concepts/merkle-proofs",
  title: "Merkle Proofs",
  description:
    "How Parametric Memory uses RFC 6962 Merkle trees to make every recalled atom cryptographically verifiable.",
  section: "Concepts",
  sectionFirstSlug: "concepts/memory-atoms",
};

describe("buildDocsTechArticle", () => {
  const schema = buildDocsTechArticle(input);

  it("is a TechArticle with schema.org context", () => {
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("TechArticle");
  });

  it("uses the canonical docs URL", () => {
    expect(schema.url).toBe("https://parametric-memory.dev/docs/concepts/merkle-proofs");
    expect(schema.mainEntityOfPage["@id"]).toBe(schema.url);
    expect(schema["@id"]).toBe(`${schema.url}#article`);
  });

  it("carries headline + description from frontmatter", () => {
    expect(schema.headline).toBe(input.title);
    expect(schema.description).toBe(input.description);
  });

  it("attributes author/publisher to the site Organization @id (entity graph)", () => {
    // Must reference the Organization node declared in layout.tsx so the
    // entity graph stays connected (see entity-disambiguation.test.ts).
    expect(schema.author["@id"]).toBe("https://parametric-memory.dev/#organization");
    expect(schema.publisher["@id"]).toBe("https://parametric-memory.dev/#organization");
  });
});

describe("buildDocsBreadcrumb", () => {
  it("builds Home → Docs → Section → Page with 1-based positions", () => {
    const schema = buildDocsBreadcrumb(input);
    expect(schema["@type"]).toBe("BreadcrumbList");
    const items = schema.itemListElement;
    expect(items.map((i: { name: string }) => i.name)).toEqual([
      "Home",
      "Docs",
      "Concepts",
      "Merkle Proofs",
    ]);
    expect(items.map((i: { position: number }) => i.position)).toEqual([1, 2, 3, 4]);
  });

  it("omits the section crumb when the slug is unlisted", () => {
    const schema = buildDocsBreadcrumb({
      ...input,
      section: undefined,
      sectionFirstSlug: undefined,
    });
    expect(schema.itemListElement.map((i: { name: string }) => i.name)).toEqual([
      "Home",
      "Docs",
      "Merkle Proofs",
    ]);
  });

  it("points the section crumb at the section's first page (Google: every non-final crumb needs item)", () => {
    // GSC 2026-07-17: "Breadcrumbs — 1 invalid item detected" on every
    // sectioned docs page, because the section crumb shipped without item.
    const schema = buildDocsBreadcrumb(input);
    const sectionCrumb = schema.itemListElement.find(
      (i: { name: string }) => i.name === "Concepts",
    ) as { item?: string };
    expect(sectionCrumb.item).toBe("https://parametric-memory.dev/docs/concepts/memory-atoms");
  });

  it("drops the section crumb when the current page IS the section's first page (no self-reference)", () => {
    const schema = buildDocsBreadcrumb({
      ...input,
      slug: "concepts/memory-atoms",
      title: "Memory Atoms",
    });
    expect(schema.itemListElement.map((i: { name: string }) => i.name)).toEqual([
      "Home",
      "Docs",
      "Memory Atoms",
    ]);
  });

  it("every crumb except the last carries an item URL (Google BreadcrumbList requirement)", () => {
    const cases = [
      buildDocsBreadcrumb(input),
      buildDocsBreadcrumb({ ...input, section: undefined, sectionFirstSlug: undefined }),
      buildDocsBreadcrumb({ ...input, slug: "concepts/memory-atoms", title: "Memory Atoms" }),
      buildBlogBreadcrumb("Memory That Compounds"),
    ];
    for (const schema of cases) {
      const items = schema.itemListElement as Array<{ name: string; item?: string }>;
      items.forEach((crumb, i) => {
        if (i < items.length - 1) {
          expect(crumb.item, `non-final crumb "${crumb.name}" must have item`).toBeDefined();
        }
      });
    }
  });

  it("points the Docs crumb at /docs/introduction (never the redirecting /docs)", () => {
    const schema = buildDocsBreadcrumb(input);
    const docsCrumb = schema.itemListElement.find((i: { name: string }) => i.name === "Docs") as {
      item?: string;
    };
    expect(docsCrumb.item).toBe("https://parametric-memory.dev/docs/introduction");
  });

  it("final crumb has no item URL (current page, per Google guidance)", () => {
    const schema = buildDocsBreadcrumb(input);
    const last = schema.itemListElement.at(-1) as { item?: string };
    expect(last.item).toBeUndefined();
  });
});

describe("buildBlogBreadcrumb", () => {
  it("builds Home → Blog → Post", () => {
    const schema = buildBlogBreadcrumb("Memory That Compounds");
    expect(schema["@type"]).toBe("BreadcrumbList");
    expect(schema.itemListElement.map((i: { name: string }) => i.name)).toEqual([
      "Home",
      "Blog",
      "Memory That Compounds",
    ]);
    const blogCrumb = schema.itemListElement[1] as { item?: string };
    expect(blogCrumb.item).toBe("https://parametric-memory.dev/blog");
  });
});
