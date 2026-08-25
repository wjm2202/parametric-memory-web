/**
 * Static-render guard — the CI tripwire for the 2026-08-24 SEO final fix.
 *
 * THE BUG THIS PINS DOWN: every public page used to call `cookies()` from
 * "next/headers" purely to compute an `isLoggedIn` boolean for the navbar.
 * One line per page silently forced dynamic per-request SSR across the whole
 * public site. Googlebot paid full SSR latency on every crawl, and GSC showed
 * 15 sitemap URLs stuck in "Discovered - currently not indexed" — the crawl
 * scheduler declining to spend budget on a slow origin. Login state is now
 * detected client-side (src/lib/use-session.ts) and every public page renders
 * static at build time.
 *
 * The rule: no PUBLIC page/layout may import "next/headers" (cookies() or
 * headers() both force dynamic rendering) or export `dynamic = "force-dynamic"`.
 * Auth-gated surfaces are exempt — they are inherently per-user.
 *
 * If this test fails on a file you just edited: read the session client-side
 * via useSession (navbar/account chrome), or move the per-user logic into a
 * client component. Do NOT add the file to the exempt list unless the page is
 * genuinely auth-gated and noindexed.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const APP_DIR = path.resolve(__dirname, "..");

/**
 * Auth-gated or per-request-by-design surfaces, relative to src/app.
 * Everything else under src/app is public and must be statically renderable.
 */
const EXEMPT_PREFIXES = ["admin", "api", "auth", "billing", "dashboard", "login", "signup"];

/** Collect every page.tsx / layout.tsx under src/app, excluding exempt trees. */
function collectPublicPageFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel = path.relative(APP_DIR, full);
    if (EXEMPT_PREFIXES.some((p) => rel === p || rel.startsWith(p + path.sep))) continue;
    if (statSync(full).isDirectory()) {
      collectPublicPageFiles(full, out);
    } else if (/^(page|layout)\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("static-render guard — public pages must be statically renderable", () => {
  const files = collectPublicPageFiles(APP_DIR);

  it("finds a sane number of public pages (sanity check on the walker)", () => {
    // 17 files carried the cookies() call when this guard was written; the
    // site has more public pages than that. If this collapses to a handful,
    // the walker or the exempt list is broken and the guard is not guarding.
    expect(files.length).toBeGreaterThan(15);
  });

  for (const file of files) {
    const rel = path.relative(APP_DIR, file);

    it(`${rel} does not import next/headers`, () => {
      const src = readFileSync(file, "utf8");
      expect(
        /from ["']next\/headers["']/.test(src),
        `${rel} imports next/headers — this forces per-request SSR on a public ` +
          `page. Use the client-side useSession hook (src/lib/use-session.ts) instead.`,
      ).toBe(false);
    });

    it(`${rel} does not export dynamic = "force-dynamic"`, () => {
      const src = readFileSync(file, "utf8");
      expect(
        /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/.test(src),
        `${rel} force-dynamic on a public page defeats static generation.`,
      ).toBe(false);
    });
  }
});
