/**
 * scripts/aeo/aeo-audit.ts
 *
 * Repeatable AEO / agentic-browsing audit for a deployed site. This is the
 * "agentic-browsing" check that Lighthouse does NOT provide: it asks whether AI
 * answer engines and browsing agents can discover, fetch, read, and cite the
 * site without running JavaScript.
 *
 * It is the network runner only — all judgement lives in ./checks.ts (pure,
 * unit-tested). This file fetches robots.txt, sitemap.xml, llms.txt and a set
 * of pages, then prints a scored report.
 *
 * ─ Why ────────────────────────────────────────────────────────────────────
 *   Lighthouse has no "agentic-browsing" category (only performance,
 *   accessibility, best-practices, seo). This fills that gap with AEO-specific
 *   signals: AI-crawler robots policy, llms.txt quality, structured data, and
 *   no-JS readability.
 *
 * ─ Where ───────────────────────────────────────────────────────────────────
 *   Run it from anywhere with network access to the target (your Mac, or CI you
 *   opt into). It is intentionally NOT wired into `preflight` / `guard:all` /
 *   `npm test`, because it talks to a live, external URL.
 *
 * ─ Safety ──────────────────────────────────────────────────────────────────
 *   Read-only. Plain HTTP GETs against public URLs. No writes, no auth, no env
 *   access, no git. Worst case it prints warnings.
 *
 * ─ Usage ───────────────────────────────────────────────────────────────────
 *   npx tsx scripts/aeo/aeo-audit.ts                         # audits prod
 *   npx tsx scripts/aeo/aeo-audit.ts https://staging.example # custom base URL
 *   npx tsx scripts/aeo/aeo-audit.ts --pages=/,/faq,/pricing
 *   npx tsx scripts/aeo/aeo-audit.ts --strict                # warnings fail too
 *   npx tsx scripts/aeo/aeo-audit.ts --json                  # machine output
 *   npx tsx scripts/aeo/aeo-audit.ts --timeout=20000
 *
 *   Or via the package scripts:  npm run audit:aeo  [-- <args>]
 *
 * ─ Exit codes ───────────────────────────────────────────────────────────────
 *   0  no failures (warnings allowed, unless --strict)
 *   1  one or more failing checks (or any warning under --strict)
 *   2  could not reach the target at all
 */

import {
  checkRobots,
  checkLlms,
  checkSitemap,
  checkPageHtml,
  sitemapPaths,
  summarize,
  type CheckResult,
} from "./checks.ts";

const DEFAULT_BASE = "https://parametric-memory.dev";
// All public content/marketing pages that need AEO. Auth (/login, /signup) and
// private (/admin, /dashboard) routes are excluded; use --sitemap for the full
// set including blog posts, docs, and legal pages.
const DEFAULT_PAGES = [
  "/",
  "/pricing",
  "/about",
  "/faq",
  "/verify",
  "/visualise",
  "/knowledge",
  "/blog",
  "/docs",
];

interface Args {
  base: string;
  pages: string[] | null; // null = derive from sitemap (--sitemap)
  strict: boolean;
  json: boolean;
  timeout: number;
}

function parseArgs(argv: string[]): Args {
  let base = DEFAULT_BASE;
  let pages: string[] | null = DEFAULT_PAGES;
  let strict = false;
  let json = false;
  let timeout = 15000;
  for (const a of argv) {
    if (a === "--strict") strict = true;
    else if (a === "--json") json = true;
    else if (a === "--sitemap") pages = null;
    else if (a.startsWith("--pages=")) pages = a.slice(8).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--timeout=")) timeout = Number(a.slice(10)) || timeout;
    else if (!a.startsWith("--")) base = a;
  }
  return { base: base.replace(/\/$/, ""), pages, strict, json, timeout };
}

interface Fetched {
  ok: boolean;
  status: number;
  text: string | null;
  error?: string;
}

async function get(url: string, timeout: number): Promise<Fetched> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        // identify as a real answer-engine UA so we exercise the AI-crawler path
        "user-agent": "MMPM-AEO-Audit/1.0 (+agentic-browsing readiness check; ClaudeBot-like)",
        accept: "text/html,application/xhtml+xml,application/xml,text/plain,*/*",
      },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (e) {
    return { ok: false, status: 0, text: null, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m",
};
const ICON = { pass: `${C.green}✓${C.reset}`, warn: `${C.yellow}▲${C.reset}`, fail: `${C.red}✗${C.reset}` };

function hostOf(base: string): string {
  try { return new URL(base).host; } catch { return base; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const host = hostOf(args.base);
  const results: CheckResult[] = [];

  // sitewide resources
  const [robots, sitemap, llms] = await Promise.all([
    get(`${args.base}/robots.txt`, args.timeout),
    get(`${args.base}/sitemap.xml`, args.timeout),
    get(`${args.base}/llms.txt`, args.timeout),
  ]);

  // bail only if literally nothing responded (e.g. wrong host / network blocked)
  if (!robots.text && !sitemap.text && !llms.text) {
    const msg = `Could not reach ${args.base} (robots/sitemap/llms all failed${robots.error ? `: ${robots.error}` : ""}).`;
    if (args.json) console.log(JSON.stringify({ error: msg }, null, 2));
    else console.error(`${C.red}${msg}${C.reset}`);
    process.exit(2);
  }

  results.push(...checkRobots(robots.text));
  results.push(...checkSitemap(sitemap.text, host));
  results.push(...checkLlms(llms.text));

  // Resolve the page list: explicit/default list, or every URL in the sitemap.
  const pages = args.pages ?? sitemapPaths(sitemap.text, args.base);
  if (pages.length === 0) {
    results.push({
      id: "pages.none", category: "pages", label: "Pages to audit",
      status: "fail", detail: "--sitemap requested but no on-host URLs were found in sitemap.xml",
    });
  }

  for (const path of pages) {
    const page = await get(`${args.base}${path}`, args.timeout);
    if (!page.ok && !page.text) {
      results.push({
        id: `page.fetch:${path}`, category: `page ${path}`, label: "Page fetched",
        status: "fail", detail: `HTTP ${page.status || "error"}${page.error ? ` (${page.error})` : ""}`,
      });
      continue;
    }
    results.push(...checkPageHtml(page.text, { path, expectedHost: host }));
  }

  const summary = summarize(results);

  if (args.json) {
    console.log(JSON.stringify({ base: args.base, summary, results }, null, 2));
  } else {
    console.log(`\n${C.bold}AEO / Agentic-Browsing Audit${C.reset}  ${C.dim}${args.base}${C.reset}\n`);
    let cat = "";
    for (const r of results) {
      if (r.category !== cat) { cat = r.category; console.log(`${C.cyan}${cat}${C.reset}`); }
      console.log(`  ${ICON[r.status]} ${r.label.padEnd(22)} ${C.dim}${r.detail}${C.reset}`);
    }
    const bar = `${C.green}${summary.pass} pass${C.reset}  ${C.yellow}${summary.warn} warn${C.reset}  ${C.red}${summary.fail} fail${C.reset}`;
    console.log(`\n${C.bold}Score ${summary.score}/100${C.reset}   ${bar}   ${C.dim}(${summary.total} checks)${C.reset}\n`);
  }

  const failed = summary.fail > 0 || (args.strict && summary.warn > 0);
  process.exit(failed ? 1 : 0);
}

main();
