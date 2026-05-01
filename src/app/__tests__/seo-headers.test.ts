/**
 * Sprint 2026-W18 — SEO/AEO audit invariants (HTTP headers + robots.txt)
 *
 * Verifies the HTTP-header and crawler-discovery side of the SEO audit:
 *   - next.config.ts emits X-Robots-Tag for HTML and noindex for /api, /admin, /dashboard
 *   - public/robots.txt allows the AI answer engines we audited (Apple, Mistral, Meta, DDG)
 *   - robots.txt still disallows the bulk-training crawlers we audited (CCBot)
 *
 * We import the next.config default export and exercise its headers() callback
 * directly. Rendering through `next start` would also catch this but is too
 * heavy for a unit test — the structural shape is enough.
 */

import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import nextConfig from "../../../next.config";

interface HeaderRule {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

describe("X-Robots-Tag — next.config.ts headers", () => {
  it("emits X-Robots-Tag with index/follow on the catch-all route", async () => {
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    const wildcard = rules.find((r) => r.source === "/(.*)");
    expect(wildcard).toBeDefined();

    const tag = wildcard!.headers.find((h) => h.key === "X-Robots-Tag");
    expect(tag).toBeDefined();
    expect(tag!.value).toMatch(/^index, follow/);
    expect(tag!.value).toMatch(/max-snippet:-1/);
    expect(tag!.value).toMatch(/max-image-preview:large/);
  });

  it("emits noindex,nofollow on /api/:path*", async () => {
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    const api = rules.find((r) => r.source === "/api/:path*");
    expect(api).toBeDefined();
    const tag = api!.headers.find((h) => h.key === "X-Robots-Tag");
    expect(tag!.value).toBe("noindex, nofollow");
  });

  it("emits noindex,nofollow on /admin/:path*", async () => {
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    const admin = rules.find((r) => r.source === "/admin/:path*");
    expect(admin).toBeDefined();
    const tag = admin!.headers.find((h) => h.key === "X-Robots-Tag");
    expect(tag!.value).toBe("noindex, nofollow");
  });

  it("emits noindex,nofollow on /dashboard/:path*", async () => {
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    const dash = rules.find((r) => r.source === "/dashboard/:path*");
    expect(dash).toBeDefined();
    const tag = dash!.headers.find((h) => h.key === "X-Robots-Tag");
    expect(tag!.value).toBe("noindex, nofollow");
  });

  it("preserves the existing security headers — no regression", async () => {
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    const wildcard = rules.find((r) => r.source === "/(.*)");
    const keys = wildcard!.headers.map((h) => h.key);
    expect(keys).toContain("X-Content-Type-Options");
    expect(keys).toContain("X-Frame-Options");
    expect(keys).toContain("Referrer-Policy");
    expect(keys).toContain("Permissions-Policy");
  });
});

describe("public/robots.txt — AI answer engine allow-list", () => {
  let robots: string;

  // Read once for all assertions in this block.
  it("loads robots.txt", async () => {
    const repoRoot = path.resolve(__dirname, "../../../");
    robots = await fs.readFile(path.join(repoRoot, "public/robots.txt"), "utf8");
    expect(robots.length).toBeGreaterThan(0);
  });

  // Apple Intelligence powers Siri / Spotlight / Apple News answer surfaces.
  it("allows Applebot-Extended", () => {
    expect(robots).toMatch(/User-agent:\s*Applebot-Extended\s*\nAllow:\s*\//);
  });

  // Mistral / Le Chat — growing EU citation traffic.
  it("allows MistralAI-User", () => {
    expect(robots).toMatch(/User-agent:\s*MistralAI-User\s*\nAllow:\s*\//);
  });

  // Meta AI surfaces in WhatsApp / Instagram / Messenger.
  it("allows Meta-ExternalAgent", () => {
    expect(robots).toMatch(/User-agent:\s*Meta-ExternalAgent\s*\nAllow:\s*\//);
  });

  // DuckDuckGo AI Chat (Duck.ai).
  it("allows DuckAssistBot", () => {
    expect(robots).toMatch(/User-agent:\s*DuckAssistBot\s*\nAllow:\s*\//);
  });

  // Existing high-value AI crawlers — regression guards.
  it("still allows Anthropic + OpenAI + Perplexity + Google AI", () => {
    expect(robots).toMatch(/User-agent:\s*anthropic-ai\s*\nAllow:/);
    expect(robots).toMatch(/User-agent:\s*ClaudeBot\s*\nAllow:/);
    expect(robots).toMatch(/User-agent:\s*PerplexityBot\s*\nAllow:/);
    expect(robots).toMatch(/User-agent:\s*GPTBot\s*\nAllow:/);
    expect(robots).toMatch(/User-agent:\s*Google-Extended\s*\nAllow:/);
  });

  // Bulk-training crawlers — must remain blocked.
  it("still blocks CCBot (Common Crawl bulk training)", () => {
    expect(robots).toMatch(/User-agent:\s*CCBot\s*\nDisallow:\s*\//);
  });

  // Crawl-blocked internal routes — match next.config.ts noindex rules.
  it("disallows /admin, /dashboard, /api/ for the wildcard agent", () => {
    expect(robots).toMatch(/Disallow:\s*\/admin/);
    expect(robots).toMatch(/Disallow:\s*\/dashboard/);
    expect(robots).toMatch(/Disallow:\s*\/api\//);
  });

  it("references the sitemap", () => {
    expect(robots).toMatch(/Sitemap:\s*https:\/\/parametric-memory\.dev\/sitemap\.xml/);
  });
});
