# AEO / Agentic-Browsing Audit

A repeatable check for whether AI answer engines and browsing agents (GPTBot,
ClaudeBot, PerplexityBot, Google AI, etc.) can **discover, fetch, read, and
cite** the site — the "agentic-browsing" angle that Lighthouse does **not**
cover (Lighthouse only does `performance`, `accessibility`, `best-practices`,
`seo`).

## Not part of CI/CD — by design

This folder is intentionally isolated from the build pipeline:

- `vitest.config.ts` (repo root) only includes `src/**`, so `npm test` never collects these tests.
- `scripts/aeo` is in `tsconfig.json`'s `exclude`, so `npm run typecheck` ignores it.
- It is **not** referenced by `guard:all` or `preflight`.

It only runs when you explicitly invoke `npm run test:aeo` or `npm run audit:aeo`.

## Run the audit (against a live site)

```bash
npm run audit:aeo                                  # all public content pages (default list)
npm run audit:aeo -- --sitemap                     # EVERY url in sitemap.xml (blog, docs, legal)
npm run audit:aeo -- https://staging.example.com   # custom base URL
npm run audit:aeo -- --pages=/,/faq,/pricing       # choose specific pages
npm run audit:aeo -- --strict                       # warnings fail too (exit 1)
npm run audit:aeo -- --json                         # machine-readable output
```

The default page list covers the public content/marketing routes that need AEO:
`/`, `/pricing`, `/about`, `/faq`, `/verify`, `/visualise`, `/knowledge`,
`/blog`, `/docs`. Auth routes (`/login`, `/signup`) and private routes
(`/admin`, `/dashboard`) are excluded. Use `--sitemap` to audit the complete
set — it derives pages from `sitemap.xml`, so coverage stays in sync as pages
are added.

- **Why:** fills the gap Lighthouse leaves — AI-crawler robots policy, `llms.txt`
  quality, structured data (JSON-LD), and no-JavaScript readability.
- **Where:** anywhere with network access to the target (your Mac, or CI you opt
  into). Needs no browser, unlike Lighthouse.
- **Safe:** read-only HTTP GETs against public URLs. No writes, no auth, no env,
  no git.
- **Exit codes:** `0` clean, `1` failing checks (or any warning under `--strict`),
  `2` target unreachable.

## Run the tests (the audit's own logic)

```bash
npm run test:aeo
```

## Layout

| File | Role |
|------|------|
| `checks.ts` | Pure, IO-free check functions. All judgement lives here. |
| `aeo-audit.ts` | Network runner — fetches resources, calls `checks.ts`, prints a scored report. |
| `checks.test.ts` | Unit tests over good/bad fixtures (run via `test:aeo`). |
| `vitest.config.ts` | Standalone config so the tests stay out of the main suite. |

## What it checks

- **robots.txt:** present, references a sitemap, has an explicit AI-crawler policy, mentions `llms.txt`.
- **llms.txt:** present, llmstxt.org structure (H1, `>` summary, `##` sections, curated links, real depth).
- **sitemap.xml:** valid root, multiple URLs, all https on the canonical host.
- **each page:** server-rendered text readable **without JS** (the core agentic signal), `<html lang>`, `<title>`, meta description, canonical, Open Graph, valid JSON-LD structured data, single `<h1>`, not accidentally `noindex`.
