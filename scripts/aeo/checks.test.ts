/**
 * scripts/aeo/checks.test.ts
 *
 * Unit tests for the AEO audit logic. Run them ON DEMAND via:
 *
 *     npm run test:aeo
 *
 * They are deliberately NOT collected by the default `npm test` / `preflight`
 * (vitest's main include is `src/**`, and this folder is excluded from
 * tsconfig). This keeps the agentic-browsing audit out of CI/CD entirely while
 * still being fully tested when you choose to run it.
 */

import { describe, it, expect } from "vitest";
import {
  checkRobots,
  checkLlms,
  checkSitemap,
  checkPageHtml,
  sitemapPaths,
  visibleText,
  summarize,
  type CheckResult,
} from "./checks.ts";

const statusOf = (rs: CheckResult[], id: string) => rs.find((r) => r.id === id)?.status;

// ── fixtures ──────────────────────────────────────────────────────────────

const GOOD_ROBOTS = `User-agent: *
Allow: /
Sitemap: https://parametric-memory.dev/sitemap.xml
# llms.txt: https://parametric-memory.dev/llms.txt
User-agent: GPTBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /`;

const GOOD_LLMS = `# Parametric Memory

> Your AI's second brain. Persistent, verifiable memory.

## Pages

- [Home](https://parametric-memory.dev): overview
- [Pricing](https://parametric-memory.dev/pricing): tiers
- [FAQ](https://parametric-memory.dev/faq): comparisons

## Product

${"Long-form product description. ".repeat(20)}`;

const GOOD_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://parametric-memory.dev</loc></url>
  <url><loc>https://parametric-memory.dev/pricing</loc></url>
  <url><loc>https://parametric-memory.dev/faq</loc></url>
</urlset>`;

const GOOD_PAGE = `<!doctype html><html lang="en"><head>
<title>Parametric Memory — verifiable AI memory</title>
<meta name="description" content="Persistent, verifiable memory for AI agents with Merkle proofs and Markov prediction, MCP-native.">
<link rel="canonical" href="https://parametric-memory.dev/">
<meta property="og:title" content="Parametric Memory">
<meta property="og:description" content="Verifiable AI memory">
<meta property="og:image" content="https://parametric-memory.dev/og.png">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Parametric Memory"}</script>
</head><body><h1>Parametric Memory</h1>
<p>${"Real server-rendered prose that an agent can read without JavaScript. ".repeat(15)}</p>
</body></html>`;

// ── robots.txt ──────────────────────────────────────────────────────────────

describe("checkRobots", () => {
  it("passes a complete robots.txt", () => {
    const rs = checkRobots(GOOD_ROBOTS);
    expect(statusOf(rs, "robots.present")).toBe("pass");
    expect(statusOf(rs, "robots.sitemap")).toBe("pass");
    expect(statusOf(rs, "robots.ai_agents")).toBe("pass");
    expect(statusOf(rs, "robots.llms_ref")).toBe("pass");
  });
  it("fails when missing", () => {
    expect(statusOf(checkRobots(null), "robots.present")).toBe("fail");
    expect(statusOf(checkRobots("   "), "robots.present")).toBe("fail");
  });
  it("warns when no sitemap, no AI agents, no llms reference", () => {
    const rs = checkRobots("User-agent: *\nAllow: /");
    expect(statusOf(rs, "robots.sitemap")).toBe("warn");
    expect(statusOf(rs, "robots.ai_agents")).toBe("warn");
    expect(statusOf(rs, "robots.llms_ref")).toBe("warn");
  });
  it("warns when only a couple of AI agents are addressed", () => {
    const rs = checkRobots("User-agent: GPTBot\nAllow: /\nUser-agent: ClaudeBot\nAllow: /");
    expect(statusOf(rs, "robots.ai_agents")).toBe("warn");
  });
});

// ── llms.txt ──────────────────────────────────────────────────────────────

describe("checkLlms", () => {
  it("passes a spec-compliant llms.txt", () => {
    const rs = checkLlms(GOOD_LLMS);
    for (const id of ["llms.present", "llms.h1", "llms.summary", "llms.sections", "llms.links", "llms.depth"]) {
      expect(statusOf(rs, id)).toBe("pass");
    }
  });
  it("fails when missing", () => {
    expect(statusOf(checkLlms(""), "llms.present")).toBe("fail");
  });
  it("warns on a stub without structure", () => {
    const rs = checkLlms("just some text with no heading");
    expect(statusOf(rs, "llms.h1")).toBe("warn");
    expect(statusOf(rs, "llms.summary")).toBe("warn");
    expect(statusOf(rs, "llms.sections")).toBe("warn");
    expect(statusOf(rs, "llms.links")).toBe("warn");
    expect(statusOf(rs, "llms.depth")).toBe("warn");
  });
});

// ── sitemap.xml ─────────────────────────────────────────────────────────────

describe("checkSitemap", () => {
  it("passes a multi-URL https sitemap", () => {
    const rs = checkSitemap(GOOD_SITEMAP, "parametric-memory.dev");
    expect(statusOf(rs, "sitemap.present")).toBe("pass");
    expect(statusOf(rs, "sitemap.urls")).toBe("pass");
    expect(statusOf(rs, "sitemap.urls_clean")).toBe("pass");
  });
  it("fails on non-sitemap content", () => {
    expect(statusOf(checkSitemap("<html>nope</html>"), "sitemap.present")).toBe("fail");
  });
  it("fails when no <loc> entries", () => {
    expect(statusOf(checkSitemap("<urlset></urlset>"), "sitemap.urls")).toBe("fail");
  });
  it("warns on http or off-host URLs", () => {
    const xml = `<urlset><url><loc>http://parametric-memory.dev/a</loc></url><url><loc>https://evil.com/b</loc></url></urlset>`;
    expect(statusOf(checkSitemap(xml, "parametric-memory.dev"), "sitemap.urls_clean")).toBe("warn");
  });
});

// ── sitemapPaths ────────────────────────────────────────────────────────────

describe("sitemapPaths", () => {
  it("extracts on-host paths, de-duplicates, strips trailing slash", () => {
    const xml = `<urlset>
      <url><loc>https://parametric-memory.dev/</loc></url>
      <url><loc>https://parametric-memory.dev/faq</loc></url>
      <url><loc>https://parametric-memory.dev/faq</loc></url>
      <url><loc>https://parametric-memory.dev/docs/intro</loc></url>
    </urlset>`;
    expect(sitemapPaths(xml, "https://parametric-memory.dev")).toEqual(["/", "/faq", "/docs/intro"]);
  });
  it("drops off-host URLs", () => {
    const xml = `<urlset><url><loc>https://evil.com/a</loc></url><url><loc>https://parametric-memory.dev/ok</loc></url></urlset>`;
    expect(sitemapPaths(xml, "https://parametric-memory.dev")).toEqual(["/ok"]);
  });
  it("returns [] for empty/missing sitemap", () => {
    expect(sitemapPaths(null, "https://x.dev")).toEqual([]);
    expect(sitemapPaths("<urlset></urlset>", "https://x.dev")).toEqual([]);
  });
});

// ── page HTML ───────────────────────────────────────────────────────────────

describe("checkPageHtml", () => {
  it("passes a well-formed SSR page", () => {
    const rs = checkPageHtml(GOOD_PAGE, { path: "/", expectedHost: "parametric-memory.dev" });
    expect(statusOf(rs, "page.ssr_text:/")).toBe("pass");
    expect(statusOf(rs, "page.lang:/")).toBe("pass");
    expect(statusOf(rs, "page.title:/")).toBe("pass");
    expect(statusOf(rs, "page.description:/")).toBe("pass");
    expect(statusOf(rs, "page.canonical:/")).toBe("pass");
    expect(statusOf(rs, "page.opengraph:/")).toBe("pass");
    expect(statusOf(rs, "page.jsonld:/")).toBe("pass");
    expect(statusOf(rs, "page.h1:/")).toBe("pass");
    expect(statusOf(rs, "page.noindex:/")).toBe("pass");
  });
  it("fails an empty JS-only shell on the no-JS readability check", () => {
    const shell = `<!doctype html><html><head><title>App</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
    const rs = checkPageHtml(shell, { path: "/" });
    expect(statusOf(rs, "page.ssr_text:/")).toBe("fail");
  });
  it("fails invalid JSON-LD", () => {
    const html = GOOD_PAGE.replace(
      /<script type="application\/ld\+json">[^<]*<\/script>/,
      `<script type="application/ld+json">{ broken json ,}</script>`,
    );
    expect(statusOf(checkPageHtml(html, { path: "/" }), "page.jsonld:/")).toBe("fail");
  });
  it("fails a noindex public page and missing title/description", () => {
    const html = `<!doctype html><html lang="en"><head><meta name="robots" content="noindex,nofollow"></head><body>${"text ".repeat(200)}</body></html>`;
    const rs = checkPageHtml(html, { path: "/secret" });
    expect(statusOf(rs, "page.noindex:/secret")).toBe("fail");
    expect(statusOf(rs, "page.title:/secret")).toBe("fail");
    expect(statusOf(rs, "page.description:/secret")).toBe("fail");
  });
  it("warns on multiple h1 and short description", () => {
    const html = `<!doctype html><html lang="en"><head><title>ok</title>
      <meta name="description" content="too short"></head>
      <body><h1>a</h1><h1>b</h1>${"text ".repeat(200)}</body></html>`;
    const rs = checkPageHtml(html, { path: "/" });
    expect(statusOf(rs, "page.h1:/")).toBe("warn");
    expect(statusOf(rs, "page.description:/")).toBe("warn");
  });
  it("returns a single fetch-fail result for empty body", () => {
    const rs = checkPageHtml("", { path: "/" });
    expect(rs).toHaveLength(1);
    expect(rs[0].status).toBe("fail");
  });
});

// ── helpers / scoring ─────────────────────────────────────────────────────────

describe("visibleText", () => {
  it("strips scripts, styles and tags", () => {
    const t = visibleText(`<style>.x{}</style><script>var a=1</script><p>Hello <b>world</b></p>`);
    expect(t).toBe("Hello world");
  });
});

describe("summarize", () => {
  it("scores pass=1, warn=0.5, fail=0", () => {
    const rs: CheckResult[] = [
      { id: "a", category: "c", label: "a", status: "pass", detail: "" },
      { id: "b", category: "c", label: "b", status: "warn", detail: "" },
      { id: "d", category: "c", label: "d", status: "fail", detail: "" },
      { id: "e", category: "c", label: "e", status: "pass", detail: "" },
    ];
    const s = summarize(rs);
    expect(s).toMatchObject({ pass: 2, warn: 1, fail: 1, total: 4 });
    expect(s.score).toBe(Math.round(((2 + 0.5) / 4) * 100)); // 63
  });
  it("handles an empty result set", () => {
    expect(summarize([]).score).toBe(0);
  });
});
