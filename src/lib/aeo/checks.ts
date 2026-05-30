/**
 * src/lib/aeo/checks.ts
 *
 * Pure, dependency-free check functions for the AEO / agentic-browsing audit.
 *
 * "Agentic browsing" = can an AI answer engine or browsing agent (GPTBot,
 * ClaudeBot, PerplexityBot, Google AI, etc.) discover, fetch, read, and cite
 * this site WITHOUT executing JavaScript? These functions encode that as a
 * battery of deterministic checks over already-fetched raw text, so they can
 * be unit-tested offline. All HTML parsing is regex-based on purpose — no DOM,
 * no jsdom, so the same code runs under vitest (jsdom env) and under tsx/node
 * in the CLI runner (scripts/aeo-audit.ts).
 *
 * Nothing here does IO. Fetching lives in the runner. That separation is what
 * makes the audit logic testable.
 */

export type Status = "pass" | "warn" | "fail";

export interface CheckResult {
  /** stable id, e.g. "page.title" — used for filtering / CI allow-lists */
  id: string;
  /** group label for reporting */
  category: string;
  /** short human label */
  label: string;
  status: Status;
  /** one-line explanation of the result */
  detail: string;
}

/** Known AI answer-engine / browsing-agent user agents worth an explicit policy. */
export const KNOWN_AI_AGENTS = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "ChatGPT-User",
  "Bingbot",
  "Googlebot",
] as const;

// ── small helpers ───────────────────────────────────────────────────────────

function ok(id: string, category: string, label: string, detail: string): CheckResult {
  return { id, category, label, status: "pass", detail };
}
function warn(id: string, category: string, label: string, detail: string): CheckResult {
  return { id, category, label, status: "warn", detail };
}
function fail(id: string, category: string, label: string, detail: string): CheckResult {
  return { id, category, label, status: "fail", detail };
}

/** Strip <script>/<style> blocks and all tags, collapse whitespace → visible text. */
export function visibleText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, attr: "name" | "property", key: string): string | null {
  // match <meta name="x" content="y"> in either attribute order
  const patterns = [
    new RegExp(`<meta[^>]*\\b${attr}=["']${key}["'][^>]*\\bcontent=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]*\\bcontent=["']([^"']*)["'][^>]*\\b${attr}=["']${key}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return null;
}

// ── robots.txt ───────────────────────────────────────────────────────────────

export function checkRobots(robots: string | null): CheckResult[] {
  const cat = "robots.txt";
  if (!robots || !robots.trim()) {
    return [fail("robots.present", cat, "robots.txt present", "robots.txt is missing or empty — crawlers have no policy to read")];
  }
  const out: CheckResult[] = [ok("robots.present", cat, "robots.txt present", "served and non-empty")];

  if (/^\s*sitemap:\s*https?:\/\//im.test(robots)) {
    out.push(ok("robots.sitemap", cat, "Sitemap reference", "robots.txt points to a sitemap"));
  } else {
    out.push(warn("robots.sitemap", cat, "Sitemap reference", "no `Sitemap:` line — crawlers must guess /sitemap.xml"));
  }

  const addressed = KNOWN_AI_AGENTS.filter((a) =>
    new RegExp(`user-agent:\\s*${a}\\b`, "i").test(robots),
  );
  if (addressed.length >= 4) {
    out.push(ok("robots.ai_agents", cat, "AI crawler policy", `explicit policy for ${addressed.length} AI/search agents (${addressed.slice(0, 4).join(", ")}…)`));
  } else if (addressed.length > 0) {
    out.push(warn("robots.ai_agents", cat, "AI crawler policy", `only ${addressed.length} AI agents addressed (${addressed.join(", ")}) — consider GPTBot, ClaudeBot, PerplexityBot, Google-Extended`));
  } else {
    out.push(warn("robots.ai_agents", cat, "AI crawler policy", "no AI answer-engine user agents addressed explicitly (relying on wildcard)"));
  }

  out.push(
    /llms\.txt/i.test(robots)
      ? ok("robots.llms_ref", cat, "llms.txt discovery", "robots.txt references llms.txt")
      : warn("robots.llms_ref", cat, "llms.txt discovery", "robots.txt does not mention llms.txt"),
  );
  return out;
}

// ── llms.txt (llmstxt.org spec) ──────────────────────────────────────────────

export function checkLlms(llms: string | null): CheckResult[] {
  const cat = "llms.txt";
  if (!llms || !llms.trim()) {
    return [fail("llms.present", cat, "llms.txt present", "llms.txt is missing or empty — agents have no curated entry point")];
  }
  const out: CheckResult[] = [ok("llms.present", cat, "llms.txt present", "served and non-empty")];
  const lines = llms.split(/\r?\n/);
  const firstReal = lines.find((l) => l.trim().length > 0) ?? "";

  out.push(
    /^#\s+\S/.test(firstReal)
      ? ok("llms.h1", cat, "H1 title", "starts with an H1 title per llmstxt.org")
      : warn("llms.h1", cat, "H1 title", "should open with `# <Site name>`"),
  );
  out.push(
    /^>\s+\S/m.test(llms)
      ? ok("llms.summary", cat, "Summary blockquote", "has a `>` one-line summary")
      : warn("llms.summary", cat, "Summary blockquote", "no `>` summary blockquote — agents lack a one-line description"),
  );
  out.push(
    /^##\s+\S/m.test(llms)
      ? ok("llms.sections", cat, "Sections", "has `##` sections")
      : warn("llms.sections", cat, "Sections", "no `##` sections found"),
  );
  const links = (llms.match(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g) || []).length;
  out.push(
    links >= 3
      ? ok("llms.links", cat, "Curated links", `${links} markdown links to key pages`)
      : warn("llms.links", cat, "Curated links", `only ${links} link(s) — list the high-value pages for agents`),
  );
  out.push(
    llms.length >= 300
      ? ok("llms.depth", cat, "Content depth", `${llms.length} chars of context`)
      : warn("llms.depth", cat, "Content depth", `only ${llms.length} chars — looks like a stub`),
  );
  return out;
}

// ── sitemap.xml ──────────────────────────────────────────────────────────────

export function checkSitemap(xml: string | null, expectedHost?: string): CheckResult[] {
  const cat = "sitemap.xml";
  if (!xml || !xml.trim()) {
    return [fail("sitemap.present", cat, "sitemap.xml present", "sitemap.xml is missing or empty")];
  }
  const out: CheckResult[] = [];
  if (/<urlset[\s>]/i.test(xml) || /<sitemapindex[\s>]/i.test(xml)) {
    out.push(ok("sitemap.present", cat, "sitemap.xml present", "valid <urlset>/<sitemapindex> root"));
  } else {
    out.push(fail("sitemap.present", cat, "sitemap.xml present", "served but not a recognisable sitemap (no <urlset>/<sitemapindex>)"));
    return out;
  }
  const locs = (xml.match(/<loc>\s*([^<\s]+)\s*<\/loc>/gi) || []).map((m) =>
    m.replace(/<\/?loc>/gi, "").trim(),
  );
  if (locs.length === 0) {
    out.push(fail("sitemap.urls", cat, "URL entries", "no <loc> URLs found"));
    return out;
  }
  out.push(
    locs.length > 1
      ? ok("sitemap.urls", cat, "URL entries", `${locs.length} URLs listed`)
      : warn("sitemap.urls", cat, "URL entries", "only one URL listed"),
  );
  const insecure = locs.filter((u) => u.startsWith("http://"));
  const offHost = expectedHost ? locs.filter((u) => !u.includes(expectedHost)) : [];
  if (insecure.length === 0 && offHost.length === 0) {
    out.push(ok("sitemap.urls_clean", cat, "URL hygiene", "all URLs are https" + (expectedHost ? ` on ${expectedHost}` : "")));
  } else {
    const bits = [
      insecure.length ? `${insecure.length} http (non-https)` : "",
      offHost.length ? `${offHost.length} off-host` : "",
    ].filter(Boolean);
    out.push(warn("sitemap.urls_clean", cat, "URL hygiene", `${bits.join(", ")} — e.g. ${(insecure[0] || offHost[0])}`));
  }
  return out;
}

// ── HTML page (the core agentic-browsing check) ──────────────────────────────

export interface PageCheckOptions {
  /** request path, used only for labelling, e.g. "/" or "/faq" */
  path: string;
  /** expected canonical host, e.g. "parametric-memory.dev" */
  expectedHost?: string;
  /** minimum visible (no-JS) text length before we suspect a JS-only shell */
  minTextChars?: number;
}

export function checkPageHtml(html: string | null, opts: PageCheckOptions): CheckResult[] {
  const cat = `page ${opts.path}`;
  const minText = opts.minTextChars ?? 500;
  if (!html || !html.trim()) {
    return [fail(`page.fetch:${opts.path}`, cat, "Page fetched", "page returned empty body")];
  }
  const out: CheckResult[] = [];

  // 1. server-rendered text — the single most important agentic signal
  const text = visibleText(html);
  out.push(
    text.length >= minText
      ? ok(`page.ssr_text:${opts.path}`, cat, "Readable without JS", `${text.length} chars of server-rendered text`)
      : fail(`page.ssr_text:${opts.path}`, cat, "Readable without JS", `only ${text.length} chars without JS — agents that don't run JS see an empty shell`),
  );

  // 2. <html lang>
  const lang = html.match(/<html[^>]*\blang=["']([^"']+)["']/i);
  out.push(
    lang
      ? ok(`page.lang:${opts.path}`, cat, "Language declared", `lang="${lang[1]}"`)
      : warn(`page.lang:${opts.path}`, cat, "Language declared", "no <html lang> attribute"),
  );

  // 3. <title>
  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleM ? titleM[1].trim() : "";
  if (!title) {
    out.push(fail(`page.title:${opts.path}`, cat, "Title tag", "missing or empty <title>"));
  } else if (title.length > 65) {
    out.push(warn(`page.title:${opts.path}`, cat, "Title tag", `${title.length} chars (>65 may truncate in results)`));
  } else {
    out.push(ok(`page.title:${opts.path}`, cat, "Title tag", `"${title}"`));
  }

  // 4. meta description
  const desc = metaContent(html, "name", "description");
  if (!desc) {
    out.push(fail(`page.description:${opts.path}`, cat, "Meta description", "missing meta description"));
  } else if (desc.length < 50 || desc.length > 160) {
    out.push(warn(`page.description:${opts.path}`, cat, "Meta description", `${desc.length} chars (aim for 50–160)`));
  } else {
    out.push(ok(`page.description:${opts.path}`, cat, "Meta description", `${desc.length} chars`));
  }

  // 5. canonical
  out.push(
    /<link[^>]*\brel=["']canonical["']/i.test(html)
      ? ok(`page.canonical:${opts.path}`, cat, "Canonical URL", "canonical link present")
      : warn(`page.canonical:${opts.path}`, cat, "Canonical URL", "no rel=canonical link"),
  );

  // 6. Open Graph
  const ogMissing = (["og:title", "og:description", "og:image"] as const).filter(
    (k) => !metaContent(html, "property", k),
  );
  out.push(
    ogMissing.length === 0
      ? ok(`page.opengraph:${opts.path}`, cat, "Open Graph", "og:title, og:description, og:image present")
      : warn(`page.opengraph:${opts.path}`, cat, "Open Graph", `missing: ${ogMissing.join(", ")}`),
  );

  // 7. JSON-LD structured data — primary AEO citation signal
  const ldBlocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  if (ldBlocks.length === 0) {
    out.push(warn(`page.jsonld:${opts.path}`, cat, "Structured data", "no JSON-LD — answer engines can't extract entities"));
  } else {
    const types: string[] = [];
    let bad = 0;
    for (const block of ldBlocks) {
      const inner = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
      try {
        const parsed = JSON.parse(inner);
        const collect = (o: unknown) => {
          if (Array.isArray(o)) o.forEach(collect);
          else if (o && typeof o === "object") {
            const t = (o as Record<string, unknown>)["@type"];
            if (typeof t === "string") types.push(t);
            else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && types.push(x));
          }
        };
        collect(parsed);
      } catch {
        bad++;
      }
    }
    if (bad > 0) {
      out.push(fail(`page.jsonld:${opts.path}`, cat, "Structured data", `${bad} JSON-LD block(s) failed to parse — invalid structured data`));
    } else {
      out.push(ok(`page.jsonld:${opts.path}`, cat, "Structured data", `${ldBlocks.length} block(s): ${[...new Set(types)].join(", ") || "untyped"}`));
    }
  }

  // 8. single <h1>
  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1Count === 1) {
    out.push(ok(`page.h1:${opts.path}`, cat, "Heading structure", "exactly one <h1>"));
  } else if (h1Count === 0) {
    out.push(warn(`page.h1:${opts.path}`, cat, "Heading structure", "no <h1> — weak document outline for agents"));
  } else {
    out.push(warn(`page.h1:${opts.path}`, cat, "Heading structure", `${h1Count} <h1> tags (prefer one)`));
  }

  // 9. accidental noindex on a public page
  const robotsMeta = metaContent(html, "name", "robots");
  if (robotsMeta && /noindex/i.test(robotsMeta)) {
    out.push(fail(`page.noindex:${opts.path}`, cat, "Indexability", `meta robots="${robotsMeta}" blocks indexing on a public page`));
  } else {
    out.push(ok(`page.noindex:${opts.path}`, cat, "Indexability", "not noindex"));
  }

  return out;
}

// ── scoring ──────────────────────────────────────────────────────────────────

export interface Summary {
  pass: number;
  warn: number;
  fail: number;
  total: number;
  /** 0–100 readiness score: pass=1, warn=0.5, fail=0 */
  score: number;
}

export function summarize(results: CheckResult[]): Summary {
  const pass = results.filter((r) => r.status === "pass").length;
  const warn = results.filter((r) => r.status === "warn").length;
  const fail = results.filter((r) => r.status === "fail").length;
  const total = results.length;
  const score = total === 0 ? 0 : Math.round(((pass + warn * 0.5) / total) * 100);
  return { pass, warn, fail, total, score };
}
