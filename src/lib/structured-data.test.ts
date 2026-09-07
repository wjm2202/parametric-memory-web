/**
 * Tests for the JSON-LD builders (2026-07-08 SEO fix).
 *
 * Docs pages previously shipped zero JSON-LD; blog posts lacked breadcrumbs.
 * These lock the schema shapes so a refactor can't silently drop fields that
 * Google's Rich Results / AI answer engines key on.
 */

import { describe, it, expect } from "vitest";
import {
  buildDocsTechArticle,
  buildDocsBreadcrumb,
  buildBlogBreadcrumb,
  buildVideoObject,
  buildVideoBreadcrumb,
  buildVideoItemList,
  toSchemaDateTime,
} from "./structured-data";

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

// ── Video (2026-08-09) ───────────────────────────────────────────────────────
//
// GSC audit found the site publishing no video markup at all while three demos
// on YouTube earned Search impressions the site could not claim. These lock the
// four properties Google REQUIRES for a VideoObject rich result — drop any one
// and the result silently disappears with no build error.

const videoInput = {
  slug: "ai-memory-over-mcp",
  title: "I asked Claude for its own project history",
  description: "Recall performed over MCP alone, with no context and no RAG pipeline.",
  uploadDate: "2026-07-13",
  duration: "PT13M10S",
  durationSeconds: 790,
  thumbnailUrl: "https://i.ytimg.com/vi/NW-ILHDd9rA/maxresdefault.jpg",
  embedUrl: "https://www.youtube-nocookie.com/embed/NW-ILHDd9rA",
  keywords: ["MCP", "AI memory"],
};

describe("buildVideoObject", () => {
  const schema = buildVideoObject(videoInput);

  it("is a VideoObject with schema.org context", () => {
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("VideoObject");
  });

  it("carries all four properties Google requires", () => {
    expect(schema.name).toBe(videoInput.title);
    expect(schema.description).toBe(videoInput.description);
    expect(schema.thumbnailUrl).toEqual([videoInput.thumbnailUrl]);
    // GSC 2026-09-07: date-only "2026-07-13" was flagged "missing a timezone"
    // + "invalid datetime value". Must be a full ISO 8601 datetime with offset.
    expect(schema.uploadDate).toBe("2026-07-13T00:00:00+12:00");
  });

  it("uploadDate always carries an explicit timezone (GSC rich-result warning guard)", () => {
    expect(schema.uploadDate).toMatch(/T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/);
    expect(Number.isNaN(new Date(schema.uploadDate).getTime())).toBe(false);
  });

  it("passes a full datetime through unchanged and rejects garbage", () => {
    expect(toSchemaDateTime("2026-07-13T09:30:00Z")).toBe("2026-07-13T09:30:00Z");
    expect(toSchemaDateTime("2026-07-13T09:30:00+12:00")).toBe("2026-07-13T09:30:00+12:00");
    expect(() => toSchemaDateTime("13/07/2026")).toThrow();
    expect(() => toSchemaDateTime("2026-7-13")).toThrow();
  });

  it("uses the canonical on-site URL, not the YouTube watch URL", () => {
    // The rich result must point at our page — the whole purpose of hosting
    // the video on-site is to capture the click.
    const url = "https://parametric-memory.dev/videos/ai-memory-over-mcp";
    expect(schema.url).toBe(url);
    expect(schema["@id"]).toBe(`${url}#video`);
    expect(schema.mainEntityOfPage["@id"]).toBe(url);
  });

  it("emits an embedUrl that matches the player the page actually loads", () => {
    // If schema and iframe disagree, Google cannot match the markup to a
    // playable video and withholds the result.
    expect(schema.embedUrl).toBe(videoInput.embedUrl);
  });

  it("attributes the publisher to the site Organization @id (entity graph)", () => {
    expect(schema.publisher["@id"]).toBe("https://parametric-memory.dev/#organization");
  });

  it("omits hasPart entirely when the video has no real chapters", () => {
    // An empty hasPart array is worse than none — it claims key moments exist.
    expect(schema).not.toHaveProperty("hasPart");
  });

  it("bounds each Clip by the next chapter, and the last by the video duration", () => {
    const withChapters = buildVideoObject({
      ...videoInput,
      chapters: [
        { startSeconds: 0, title: "Intro" },
        { startSeconds: 115, title: "The prompt" },
        { startSeconds: 235, title: "What it cannot know" },
      ],
    });
    const parts = withChapters.hasPart as Array<{
      "@type": string;
      name: string;
      startOffset: number;
      endOffset: number;
      url: string;
    }>;

    expect(parts).toHaveLength(3);
    expect(parts.every((p) => p["@type"] === "Clip")).toBe(true);
    expect(parts.map((p) => p.startOffset)).toEqual([0, 115, 235]);
    // Each clip ends where the next begins; the final clip ends at the video's end.
    expect(parts.map((p) => p.endOffset)).toEqual([115, 235, 790]);
    expect(parts[2].url).toBe("https://parametric-memory.dev/videos/ai-memory-over-mcp?t=235");
  });

  it("serialises keywords as a comma-separated string, and omits them when absent", () => {
    expect(schema.keywords).toBe("MCP, AI memory");
    const bare = buildVideoObject({ ...videoInput, keywords: [] });
    expect(bare).not.toHaveProperty("keywords");
  });
});

describe("buildVideoBreadcrumb", () => {
  it("builds Home → Videos → Video with the final crumb unlinked", () => {
    const schema = buildVideoBreadcrumb("AI memory over MCP");
    expect(schema["@type"]).toBe("BreadcrumbList");
    expect(schema.itemListElement.map((i: { name: string }) => i.name)).toEqual([
      "Home",
      "Videos",
      "AI memory over MCP",
    ]);
    const videosCrumb = schema.itemListElement[1] as { item?: string };
    expect(videosCrumb.item).toBe("https://parametric-memory.dev/videos");
    expect((schema.itemListElement.at(-1) as { item?: string }).item).toBeUndefined();
  });
});

describe("buildVideoItemList", () => {
  const schema = buildVideoItemList([
    { slug: "a", title: "Video A" },
    { slug: "b", title: "Video B" },
  ]);

  it("is an ItemList — the hub indexes videos, it is not itself a video", () => {
    expect(schema["@type"]).toBe("ItemList");
    expect(schema.numberOfItems).toBe(2);
  });

  it("lists absolute detail URLs with 1-based positions", () => {
    expect(schema.itemListElement.map((i: { position: number }) => i.position)).toEqual([1, 2]);
    expect(schema.itemListElement[0].url).toBe("https://parametric-memory.dev/videos/a");
  });
});
