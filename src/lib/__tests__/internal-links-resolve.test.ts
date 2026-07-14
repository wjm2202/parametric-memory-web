/**
 * Every internal link in the site must resolve to a real route — directly.
 *
 * Why: the 2026-07-13 Ahrefs audit found 53 internal links pointing at
 * redirecting URLs (mostly /docs → /docs/introduction via the nav + footer)
 * and, separately, GSC has flagged crawl-signal waste on a domain we're
 * fighting to get indexed. Links to redirects work for humans but leak
 * crawl budget and dilute link signals; broken links are worse. This suite
 * makes both regressions impossible to ship silently.
 *
 * Ground truth is built from the filesystem — the same way Next.js routes:
 *   - src/app/** page.tsx / route.ts   → static + dynamic routes
 *   - content/docs/**.mdx              → /docs/<path>   (the [...slug] catch-all)
 *   - content/blog/*.mdx               → /blog/<filename>
 *   - public/**                        → static assets
 *   - next.config.ts redirects() + /docs (app/docs/page.tsx redirect())
 *     → FORBIDDEN as internal link targets (they redirect)
 *
 * Checked sources: every non-test .ts/.tsx under src/ and every .mdx under
 * content/ — literal href="...", href: "...", redirect("..."), and markdown
 * [text](target) links. Template-literal hrefs (e.g. `/docs/${firstDocSlug}`)
 * are covered indirectly: their inputs come from docs-nav, which docs-nav
 * tests keep in sync with real content files.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO = process.cwd();
const read = (p: string) => fs.readFileSync(p, "utf-8");

function walk(dir: string, pred: (f: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", ".next"].includes(e.name) || e.name.startsWith(".git")) continue;
      out.push(...walk(full, pred));
    } else if (pred(full)) out.push(full);
  }
  return out;
}

/* ── Route inventory (ground truth) ─────────────────────────────────────── */
const appDir = path.join(REPO, "src", "app");
const staticRoutes = new Set<string>();
const dynamicPrefixes: string[] = [];

for (const p of walk(appDir, (f) => /[/\\](page\.tsx|route\.ts)$/.test(f))) {
  const segs = path
    .relative(appDir, path.dirname(p))
    .split(path.sep)
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")) && s !== "");
  const dynIdx = segs.findIndex((s) => s.startsWith("["));
  if (dynIdx >= 0) dynamicPrefixes.push("/" + segs.slice(0, dynIdx).join("/"));
  else staticRoutes.add("/" + segs.join("/"));
}

const docsDir = path.join(REPO, "content", "docs");
const docsSlugs = new Set(
  walk(docsDir, (f) => f.endsWith(".mdx")).map((f) =>
    path
      .relative(docsDir, f)
      .replace(/\.mdx$/, "")
      .split(path.sep)
      .join("/"),
  ),
);
const blogSlugs = new Set(
  walk(path.join(REPO, "content", "blog"), (f) => f.endsWith(".mdx")).map((f) =>
    path.basename(f, ".mdx"),
  ),
);
const publicFiles = new Set(
  walk(path.join(REPO, "public"), () => true).map(
    (f) => "/" + path.relative(path.join(REPO, "public"), f).split(path.sep).join("/"),
  ),
);

// Redirect sources are forbidden internal-link targets.
// IMPORTANT: scope the parse to the redirects() block — `source:` also
// appears in headers() (e.g. /.well-known/jwks.json CORS headers) and those
// are perfectly valid link targets. The unscoped version of this parse
// false-positived on the verify page's JWKS link (caught on first full
// vitest run, 2026-07-13).
const redirectSources = new Set<string>(["/docs"]); // app/docs/page.tsx redirect()
const nextConfigSrc = read(path.join(REPO, "next.config.ts"));
const redirectsBlock = /redirects:\s*(?:async\s*)?\(\)\s*=>\s*\[([\s\S]*?)\n  \]/.exec(
  nextConfigSrc,
);
if (!redirectsBlock) throw new Error("redirects() block not found in next.config.ts");
for (const m of redirectsBlock[1].matchAll(/source:\s*"([^"]+)"/g)) {
  if (!m[1].includes(":") && !m[1].includes("*")) redirectSources.add(m[1]);
}

function resolves(route: string): boolean {
  const clean = route.replace(/\/$/, "") || "/";
  if (clean === "/") return true;
  if (staticRoutes.has(clean)) return true;
  if (clean.startsWith("/docs/") && docsSlugs.has(clean.slice(6))) return true;
  if (clean.startsWith("/blog/") && blogSlugs.has(clean.slice(6))) return true;
  if (publicFiles.has(clean)) return true;
  return dynamicPrefixes.some((p) => p !== "/docs" && p !== "/blog" && clean.startsWith(p + "/"));
}

/* ── Link extraction ────────────────────────────────────────────────────── */
interface FoundLink {
  file: string;
  line: number;
  target: string;
}

function extractLinks(): FoundLink[] {
  const files = [
    ...walk(path.join(REPO, "src"), (f) => /\.(tsx|ts)$/.test(f) && !/\.(test|spec)\./.test(f)),
    ...walk(path.join(REPO, "content"), (f) => f.endsWith(".mdx")),
  ];
  const found: FoundLink[] = [];
  for (const f of files) {
    const isMdx = f.endsWith(".mdx");
    read(f)
      .split("\n")
      .forEach((lineText, i) => {
        const pats = [
          /href=\{?["']([^"'}]+)["']\}?/g,
          /href:\s*["']([^"']+)["']/g,
          /redirect\(\s*["']([^"']+)["']\s*\)/g,
          ...(isMdx ? [/\]\(([^)\s]+)\)/g] : []),
        ];
        for (const re of pats) {
          for (const m of lineText.matchAll(re)) {
            found.push({ file: path.relative(REPO, f), line: i + 1, target: m[1] });
          }
        }
      });
  }
  return found;
}

/** Normalize to a site-internal path, or null if not an internal page link. */
function internalPath(target: string): string | null {
  let t = target.trim();
  if (t.includes("${")) return null; // template literal — covered by docs-nav tests
  if (/^(mailto:|tel:|#)/.test(t)) return null;
  if (/^https?:\/\//.test(t)) {
    if (!/^https:\/\/(www\.)?parametric-memory\.dev(\/|$)/.test(t)) return null;
    t = t.replace(/^https:\/\/(www\.)?parametric-memory\.dev/, "") || "/";
  }
  if (!t.startsWith("/")) return null;
  return t.split("#")[0].split("?")[0];
}

const links = extractLinks();

describe("internal links resolve (crawl-signal guard, 2026-07-13)", () => {
  it("sanity: inventories are non-trivial", () => {
    expect(staticRoutes.size).toBeGreaterThan(10);
    expect(docsSlugs.size).toBeGreaterThan(10);
    expect(blogSlugs.size).toBeGreaterThan(5);
    expect(links.length).toBeGreaterThan(100);
  });

  it("sanity: redirect-source parse is scoped to redirects() (not headers/rewrites)", () => {
    // The three known redirect stubs must be in; headers() sources must not be.
    expect(redirectSources.has("/docs/quick-start")).toBe(true);
    expect(redirectSources.has("/docs/mcp-integration")).toBe(true);
    expect(redirectSources.has("/docs/plans-and-trial")).toBe(true);
    expect(redirectSources.has("/.well-known/jwks.json")).toBe(false);
  });

  it("no internal link is broken (target route/file must exist)", () => {
    const broken = links
      .map((l) => ({ ...l, path: internalPath(l.target) }))
      .filter((l): l is FoundLink & { path: string } => l.path !== null)
      .filter((l) => !redirectSources.has(l.path.replace(/\/$/, "") || "/"))
      .filter((l) => !resolves(l.path))
      .map((l) => `${l.file}:${l.line} → ${l.target}`);
    expect(broken).toEqual([]);
  });

  it("no internal link points at a redirect source (link the destination instead)", () => {
    const viaRedirect = links
      .map((l) => ({ ...l, path: internalPath(l.target) }))
      .filter((l): l is FoundLink & { path: string } => l.path !== null)
      .filter((l) => redirectSources.has(l.path.replace(/\/$/, "") || "/"))
      // app/docs/page.tsx IS the redirect — its own redirect() call is exempt.
      .filter((l) => !(l.file === path.join("src", "app", "docs", "page.tsx")))
      .map((l) => `${l.file}:${l.line} → ${l.target}`);
    expect(viaRedirect).toEqual([]);
  });

  it("MDX same-file anchors match a slugified heading", () => {
    const slugify = (t: string) =>
      t
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-");
    const bad: string[] = [];
    for (const f of walk(path.join(REPO, "content"), (x) => x.endsWith(".mdx"))) {
      const src = read(f);
      const anchors = new Set(
        [...src.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => slugify(m[1].trim())),
      );
      for (const m of src.matchAll(/\]\(#([^)\s]+)\)/g)) {
        if (!anchors.has(m[1])) bad.push(`${path.relative(REPO, f)} → #${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
