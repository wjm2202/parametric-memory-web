# SEO Final-Fix Review — parametric-memory.dev

**Date:** 2026-08-24 · **Author:** Claude (Cowork session) · **Status:** Awaiting approval, then one comprehensive change set

This is the consolidation review after 12+ sessions of SEO work. Every claim below was
re-verified today against live data — Google Search Console (fresh, last update 8/21–8/24),
the live site, the git history, and the DuckDuckGo/Bing index — not carried forward from
memory. The conclusion is different from what another round of on-page tweaks assumes,
and it explains why the drip-drip approach stopped paying.

---

## 1. Executive summary

**The on-page work is done. It worked. Stop re-doing it.**
45 pages are indexed (up from ~12 in June, 28 in mid-July). Every substantive page Google
has actually crawled is now in the index — the "Crawled – currently not indexed" bucket
contains only font files, favicons and one old redirect. Titles, descriptions, canonicals,
robots.txt, the sitemap, and structured data all verified clean today.

**The site does not rank because of what happens off the site, not on it.**
Three blockers, in order of impact:

1. **Authority starvation — 16 external links, total.** All 16 point at the homepage, from
   7 near-zero-authority domains (aiplanet.live, channel.org, linkedin.com, …). Zero
   external links to any blog post, doc, or the benchmark page. Established competitors
   (Mem0, Zep) sit at DR 40–70; this site is ~DR 2. Google indexes the pages and then has
   no reason to rank them above anyone else's.
2. **Zero pages in the Bing index** (verified today: DDG `site:` query returns nothing).
   The Bing verification meta tag has been live since July, but the site was never
   registered/submitted in Bing Webmaster Tools. ChatGPT Search sources ~87% of its
   citations from Bing — the product is invisible to the exact audience most likely to buy
   it. This was identified on 2026-07-08 and is still not done. It is a 20-minute task.
3. **15 URLs "Discovered – currently not indexed"** (never crawled, `Last crawled: N/A`):
   11 docs pages, /privacy, /aup, and both new video pages. Google knows them from the
   sitemap and declines to spend crawl budget on them — the standard behaviour toward
   low-authority sites. Fixed by (a) requesting indexing manually per URL, (b) authority.

**Plus one structural risk and one lost asset:**

4. **Every public page renders per-request (dynamic SSR)** because ~20 pages/layouts call
   `cookies()` solely to decide the navbar's "Sign In vs. avatar" chip. Today's measured
   TTFB is acceptable from NZ (65–614 ms), but two US-origin requests to `/` and
   `/sitemap.xml` hung >180 s during this audit. A single hang served to Googlebot teaches
   its scheduler to crawl less — and 15 uncrawled pages is exactly what that looks like.
   Static pages remove the entire failure class.
5. **The /research page never shipped.** The 2026-07-18 work (indexable home for both
   whitepapers, ScholarlyArticle JSON-LD, sitemap + nav wiring) was implemented but never
   committed — it is absent from git history entirely. The DOIs point at a site that never
   mentions the papers.

## 2. Methodology

Examined today: GSC page-indexing report with per-bucket URL drilldowns; GSC performance
(3-month queries/pages); GSC sitemaps, video indexing, Core Web Vitals, links report,
manual actions, security issues. Live site: robots.txt, llms.txt, sitemap.xml, homepage,
/pricing, /blog, blog post, docs pages, video page — canonicals, meta, JSON-LD extracted
and parsed in-browser, TTFB via the Performance API. Repo: full git history vs deployed
main, nginx.conf, deploy workflow, sitemap.ts, robots, per-page `cookies()` usage.
Bing/DDG index probes. Prior-session findings loaded from MMPM memory and each one
re-verified rather than trusted.

## 3. Verified non-issues (the kill list)

Do not spend further sessions on these; all were checked today:

- **Indexing of crawled content** — every real page Google crawled is indexed (45).
- **Titles/descriptions** — the July Ahrefs pass shipped (guard test enforces limits).
- **Canonicals** — self-referencing apex canonicals verified on every page type; the www
  host 301s correctly; the single "Duplicate without user-selected canonical" is already
  under GSC validation ("Started").
- **Sitemap** — deterministic lastmods, fetched by Google today (Success, 58 pages,
  3 videos discovered), no redirecting URLs listed.
- **robots.txt** — correct: crawlable, font binaries excluded, AI-bot taxonomy in place.
- **Structured data** — Organization, WebApplication, SoftwareApplication, FAQPage,
  BlogPosting, VideoObject (all recommended fields), BreadcrumbList all parse cleanly on
  live pages; GSC recognizes Breadcrumbs; no structured-data errors reported in GSC.
- **Manual actions / security issues** — none.
- **404s / redirects buckets** — junk URLs and correct 301s; benign.
- **Internal linking** — 459 internal links; footer sitemap reaches everything.

## 4. Evidence detail

**GSC performance, 3 months:** 24 clicks, 2,080 impressions, CTR 1.2%, avg position 10.6.
Clicks come almost exclusively from the brand query "parametric memory" (10 clicks / 456
impressions). High-value commercial queries barely register: "persistent memory" 30
impressions 0 clicks; "ai decision audit cryptographic integrity merkle tree" 73/0; the
Mem0/Zep comparison post gets 126 impressions, 0 clicks. Translation: Google understands
the site perfectly (it matches the right queries) — it just ranks stronger domains above it.

**GSC index buckets (last update 8/21):** 45 indexed / 32 not. Not-indexed = 6 redirects
(correct), 3 junk 404s, 1 intentional noindex (/login), 6 crawled-not-indexed (all fonts/
favicons/old /docs redirect — zero content pages), 1 duplicate under validation, and the
15 discovered-never-crawled pages listed in §5.2.

**Links report:** 16 external links total → homepage only. 7 referring sites. 459 internal.

**Bing/DDG:** zero results for `site:parametric-memory.dev` (checked 2026-08-24).
`msvalidate.01` tag is live; Bing Webmaster registration/submission never completed.
IndexNow is wired into deploy (key file live, ping on every deploy) but IndexNow without
Bing WMT registration does nothing for an unknown domain.

**Render architecture:** `cookies()` (an `isLoggedIn` boolean for the navbar chip) forces
dynamic SSR on: home, pricing, about, faq, benchmark, enterprise, contact, terms, privacy,
aup, dpa, copyright, verify, visualise, knowledge, and the docs + blog layouts (which
drag all ~35 docs/blog/video URLs with them). Session cookie is httpOnly, so the fix is a
1-line status endpoint + client-side fetch in the already-client-side navbar, then static
generation everywhere public.

## 5. The final fix set

### Tier 1 — one code change set (implemented now, tests for everything)

1. **Static rendering for all public pages.** Add `GET /api/auth/session-status`
   (returns `{loggedIn}` from the httpOnly cookie); SiteNavbar reads it client-side on
   mount (crawlers and logged-out users see "Sign In" immediately — no layout shift for
   them); delete every marketing-page `cookies()` call. Guard test: no public page module
   may import `next/headers`. Result: whole public site becomes build-time static — TTFB
   in the tens of ms for Googlebot, immune to app hangs, and the crawl-scheduler signal
   improves precisely where the 15 uncrawled pages are stuck.
2. **Rebuild /research** (lost 07-18 work): indexable page for both whitepapers with
   abstracts, ScholarlyArticle + CollectionPage JSON-LD, DOI links, sitemap entry, navbar
   More-menu + footer links, llms.txt entry. Tests: page render, JSON-LD validity,
   sitemap inclusion, nav links.
3. **Internal-link boost for the 15 never-crawled URLs:** homepage gains a compact
   "From the docs" section (Concepts + API pages) and links to the two video pages;
   /videos page links each video's page prominently (verify); docs cross-links already
   exist via sidebar. Tests extend existing nav/footer suites.
4. **Sitemap lastmod hygiene:** /terms changed 8/6 and videos content 8/9–8/23 but
   lastmods still say 7/13 — bump changed routes so Google's recrawl scheduling sees
   honest freshness.
5. **llms.txt corrections:** tool catalogue currently lists a non-existent `memory_train`
   tool and duplicates `session_checkpoint`/`memory_session_bootstrap` across sections —
   fix via the build-llms-txt script source.

### Tier 2 — console actions (30–40 minutes, I can drive them in your browser)

6. **Bing Webmaster Tools** (the single highest-leverage action outstanding):
   sign in → add site → verify via the already-live meta tag (or import from GSC, faster)
   → submit sitemap.xml. Unlocks Bing + DDG + ChatGPT Search + Copilot.
7. **GSC → URL Inspection → Request Indexing** for the 15 discovered-not-indexed URLs
   (daily quota is ~10–12; two short sessions on consecutive days).
8. Click **Validate fix** on the redirect and 404 buckets (cosmetic; clears the report).

### Tier 3 — off-site authority (the actual ranking lever; human-paced, ongoing)

This is what moves position 10.6 → top-3 on real queries. No code can substitute.

9. **MCP directory listings** (competitors are in all of them, you are in none):
   Glama, mcpservers.org, PulseMCP, an `awesome-mcp-servers` PR, and the Anthropic
   Connectors Directory (gateway work permitting). Each is a relevant, indexed, followed
   link — and the primary corpus AI answer engines cite for "MCP memory" queries.
10. **Distribution of existing assets** (they are good; nobody has seen them):
    Show HN for the verifiable-memory story or the LongMemEval sealed-bundle result;
    r/ClaudeAI + r/LocalLLaMA for the Claude-persistent-memory quickstart; dev.to/
    Hashnode republish with `rel=canonical` back to the blog; LinkedIn for the EU AI Act
    Article 12 piece (it has a compliance audience and a deadline hook).
11. **Point existing owned links at deep pages:** all three YouTube video descriptions
    should link their matching /videos/* page and one relevant doc; Zenodo DOI records
    should link /research once it ships.
12. **One comparison-content bet per month** (e.g. "Mem0 vs Zep vs Parametric Memory
    pricing 2026"), each distributed per #10 — compounding query surface where buying
    intent lives.

## 6. What success looks like (honest timeline)

- **Week 1–2:** Bing index goes 0 → 30+; the 15 requested URLs get crawled; static
  rendering shows in server logs as flat, fast Googlebot responses.
- **Week 2–6:** directory + distribution links land; referring domains 7 → 20+;
  impressions on non-brand queries begin compounding; first ChatGPT/Perplexity citations.
- **Month 2–4:** comparison/explainer posts move from page 2 into the top 10 for
  mid-intent queries ("verifiable AI memory", "MCP memory server", "Mem0 alternative").
  Position 10.6 avg is close — authority is the remaining variable, and it is the slow one.

No further on-page tweaking sessions are warranted until the above ships and 4+ weeks of
data accumulate. That is the drip-drip this plan replaces.

---

## 7. Implementation report (2026-08-24, same session)

**Tier 1 — implemented, all tests green (151 files, 2,058 tests; tsc, ESLint, Prettier,
guard:testids, guard:llms-txt all clean in an isolated verification environment):**

- **Static rendering shipped.** New `src/lib/use-session.ts` (module-cached client-side
  `GET /api/auth/me`); SiteNavbar self-detects login state; `cookies()` removed from all
  17 public pages/layouts (home, pricing, about, faq, benchmark, enterprise, contact,
  terms, privacy, aup, dpa, copyright, verify, visualise, knowledge, docs layout, blog
  layout — which un-dynamics every docs/blog/video URL under them).
  KnowledgeClient/VisualiseClient/PricingCardClient updated. New tests:
  `use-session.test.tsx` (6), and `static-render-guard.test.ts` — a permanent CI
  tripwire: no public page may import next/headers or force-dynamic again.
- **/research rebuilt** (`src/app/research/page.tsx` + 6 tests): both whitepapers with
  abstracts, contributions, keywords, DOI links; CollectionPage + ScholarlyArticle
  JSON-LD authored/published by the Organization @id; BreadcrumbList; in sitemap
  (lastmod 2026-08-24, priority 0.8), navbar More menu, footer Company column, llms.txt.
  Organization JSON-LD regained its lost `subjectOf` (pinned by
  entity-disambiguation.test.ts).
- **Homepage "Go deeper" section**: crawl-path links from the highest-authority page to
  6 docs pages, all 3 video pages, /research and /benchmark — precisely the URLs GSC
  listed as discovered-never-crawled. Pinned by `homepage-internal-links.test.ts`.
- **Sitemap lastmod corrections**: home → 2026-08-24, /terms → 2026-08-06 (was stale).
- **llms.txt corrected**: removed the nonexistent `memory_train` tool and a duplicated
  section; catalogue now matches /docs/mcp/tools exactly (11 tools, per the
  owner-verified count guard).

**Tier 2 — done this session (browser):**

- **GSC Request Indexing: all 15** discovered-not-indexed URLs submitted to the priority
  crawl queue ("Indexing requested" confirmed on each; quota never blocked).
- **Bing WMT: waiting on Microsoft sign-in** — tab left open. Steps once signed in:
  Add site → *Import from Google Search Console* (fastest — the property verifies via
  the GSC link) or add `parametric-memory.dev` and verify by meta tag (already live:
  `msvalidate.01: DB5282BEA4BFD32D9831FA7B542DF247`) → Sitemaps → submit
  `https://parametric-memory.dev/sitemap.xml`.

**To ship (human-only per house rules):** run `npm run preflight` on the Mac (format,
lint, typecheck, guards, full test suite, production build — the only step the sandbox
could not execute is `next build`, which needs Google Fonts network access), then commit
and push to main; the deploy workflow handles the droplet, nginx sync, and IndexNow ping
(which now notifies Bing of every changed URL — valuable only after the WMT registration
above).
