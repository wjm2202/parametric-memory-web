# Google Search Console — Fixes Applied

**Date:** 2026-05-01
**Source of issues:** Live read of GSC URL inspection (Claude in Chrome).
**Predecessors:** SEO-AEO-AUDIT-2026-05-01.md, SEO-AEO-AUDIT-2026-05-01-DELTA.md, SEO-AEO-WEB-RESEARCH-2026-05-01.md

---

## Two distinct GSC problems

| Problem | Pages affected | Fix scope |
|---|---|---|
| **5 invalid merchant listings** (rich-results errors) | `/pricing` | Code — applied below |
| **3 pages "URL is unknown to Google"** (not indexed at all) | `/faq`, `/blog`, `/about` | Manual GSC sitemap submission — instructions below |

---

## 1. Merchant listings: 5 invalid items on /pricing

### What GSC reported (read live on 2026-05-01)

For each of the 5 detected pricing tiers (Team $79, Enterprise Cloud $299, Enterprise Self-Hosted $499, Starter $9, Solo $29):

| Severity | Field | Effect |
|---|---|---|
| **Critical** | `Missing field "image"` | Item not eligible for rich results; no image preview in SERP |
| Warning | `Missing field "shippingDetails"` (optional) | Lower confidence in Merchant snippet |
| Warning | `Missing field "hasMerchantReturnPolicy"` (optional) | Same |

The schema source is `softwareApplicationJsonLd.offers` in `src/app/layout.tsx`. The actual array has **6 offers** including Professional ($29) — GSC's snapshot was Mar 23 and only had 5 tiers, but the same 3 fields were missing on every tier.

### What I changed in `src/app/layout.tsx`

1. **Hoisted three constants** at the top of the schema block — single source of truth, easy to audit:
   - `PRODUCT_IMAGE_URL = "https://parametric-memory.dev/brand/og.png"`
   - `DIGITAL_SHIPPING_DETAILS` — `OfferShippingDetails` with $0 cost, 0-day handling, 0-day transit, worldwide. Correct schema for digital SaaS.
   - `FREE_TRIAL_RETURN_POLICY` — `MerchantReturnPolicy` with `MerchantReturnFiniteReturnWindow`, 14-day window matching your free trial, free returns.

2. **Added `image: PRODUCT_IMAGE_URL`** at the SoftwareApplication root.

3. **Added 4 fields to every Offer** (6 offers × 4 fields = 24 net additions):
   ```ts
   priceValidUntil: "2027-05-01",        // 12 months from today, ISO date
   image: PRODUCT_IMAGE_URL,
   shippingDetails: DIGITAL_SHIPPING_DETAILS,
   hasMerchantReturnPolicy: FREE_TRIAL_RETURN_POLICY,
   ```

The constants get inlined into JSON when `JSON.stringify(softwareApplicationJsonLd)` runs in the `<script type="application/ld+json">` block, so Google sees fully expanded schema.

### Test coverage

`src/app/__tests__/seo-merchant-listings.test.ts` — 13 assertions:
- Constants exist with correct shapes (image URL, return-window category, 14-day window, free returns, zero shipping)
- SoftwareApplication root has `image`
- Every one of the 6 Offers references `image`, `shippingDetails`, `hasMerchantReturnPolicy`
- Every Offer has a `priceValidUntil` that is **in the future** (catches the date going stale)
- Offer count matches expected count (catches drift if a tier is added/removed without updating constants)
- Each Offer has price + priceCurrency + InStock availability (regression guard)

Run locally:
```bash
# Why: confirms the merchant-listing fix and locks invariants in.
# Where: repo root.
# Safe: read-only against the codebase.
cd /Users/glenosborne/Documents/code/mmpm-website
npx vitest run src/app/__tests__/seo-merchant-listings.test.ts
```

### Verify with Google's Rich Results Test after deploy

```bash
# Why: Google's test is the ground truth for whether the fix actually works.
# Where: any browser, after the change deploys to parametric-memory.dev.
# Safe: read-only inspection.
#
# Manual steps:
#   1. https://search.google.com/test/rich-results
#   2. Enter https://parametric-memory.dev/pricing
#   3. Run test
#   4. Expect: "Merchant listings ✓ valid" with 6 detected items, 0 errors, 0 warnings
```

If errors persist, check that the deploy carried `src/app/layout.tsx` and the rendered `<script type="application/ld+json">` blocks include the new fields.

### Then re-request indexing on /pricing

Once the rich-results test passes, hop into Search Console and request a re-crawl:
```
GSC → URL Inspection → https://parametric-memory.dev/pricing → "Request indexing"
```

Google typically re-validates within 1-3 days. The "5 invalid items" warning should drop to 0.

---

## 2. /faq, /blog, /about: not indexed

### What GSC reported

```
URL is not on Google
Page is not indexed: URL is unknown to Google
Discovery
  Sitemaps:       No referring sitemaps detected
  Referring page: None detected
```

This is **not** a code problem. Your `src/app/sitemap.ts` is correct — it generates `/sitemap.xml` covering all 14 main pages plus dynamic blog/docs entries. The issue is upstream: **the sitemap has never been submitted to Search Console**, so Google has no path to discover those URLs.

### Fix — submit the sitemap (manual, you do this)

```
# Why: tells Google "here's the canonical list of URLs on this domain — go crawl them."
# Where: Google Search Console (web UI).
# Safe: standard webmaster operation, no destructive effect.
#
# Steps:
#   1. https://search.google.com/search-console
#   2. Property: parametric-memory.dev
#   3. Left nav → Indexing → Sitemaps
#   4. Add a new sitemap → enter exactly:  sitemap.xml
#   5. Submit
#
# Expected: "Couldn't fetch" → "Success" within 30 seconds.
# Once submitted, Google discovers /faq, /blog, /about plus every blog post and doc page.
```

### Belt-and-braces — request indexing on the 3 named pages

While Google works through the sitemap (can take days), poke the high-priority pages directly:

```
For each of:
  https://parametric-memory.dev/faq
  https://parametric-memory.dev/blog
  https://parametric-memory.dev/about

Steps:
  1. Search Console → URL Inspection → paste URL
  2. Click "Test live URL" first to confirm the page is reachable + valid
  3. Click "Request indexing"
```

Each request triggers a priority crawl ahead of the natural sitemap walk. Daily quota is 10-12 manual requests per property, so do these three first then add /pricing, /docs, and / for good measure.

### Bing Webmaster Tools (often missed, ~10% of search traffic)

```
# Why: Bing powers ChatGPT search, Microsoft Copilot, and parts of DuckDuckGo.
# Where: https://www.bing.com/webmasters
# Safe: ownership verification + sitemap submission only.
#
# Steps:
#   1. https://www.bing.com/webmasters
#   2. Add property parametric-memory.dev
#   3. "Import from Search Console" — saves a verification round-trip
#   4. Sitemaps → Submit a sitemap → enter the full URL:
#      https://parametric-memory.dev/sitemap.xml
```

---

## 3. Final state — files touched in this session (all SEO/AEO work)

| File | Status | Lines changed |
|---|---|---|
| `src/app/page.tsx` | modified | description trim, 17-keyword reset (incl. RFC 6962) |
| `src/app/layout.tsx` | modified | publisher/authors/creator/applicationName/category, Twitter desc align, fallback desc trim, **3 new merchant-listings constants + image at root + 4 fields × 6 Offers** |
| `next.config.ts` | modified | X-Robots-Tag wildcard + per-route noindex for /api, /admin, /dashboard |
| `public/robots.txt` | modified | 4 new AI crawlers (Apple, Mistral, Meta, DDG) |
| `src/app/__tests__/seo-metadata.test.ts` | new | 21 assertions on metadata invariants |
| `src/app/__tests__/seo-headers.test.ts` | new | 15 assertions on next.config + robots.txt |
| `src/app/__tests__/seo-merchant-listings.test.ts` | new | 13 assertions on merchant-listings schema |
| `docs/SEO-AEO-AUDIT-2026-05-01.md` | new | Initial audit |
| `docs/SEO-AEO-AUDIT-2026-05-01-DELTA.md` | new | Post-fix verification |
| `docs/SEO-AEO-WEB-RESEARCH-2026-05-01.md` | new | Competitor SERP research |
| `docs/SEO-AEO-GSC-FIXES-2026-05-01.md` | new | This file |

**49 SEO test assertions** total. Run them all in one shot:
```bash
cd /Users/glenosborne/Documents/code/mmpm-website
npx vitest run src/app/__tests__/seo-metadata.test.ts \
              src/app/__tests__/seo-headers.test.ts \
              src/app/__tests__/seo-merchant-listings.test.ts \
              src/app/layout.test.ts
```

---

## 4. Order of operations to deploy + reindex

Per your hard rules I do not commit. Suggested sequence:

```bash
# 1. Test locally
cd /Users/glenosborne/Documents/code/mmpm-website
npx vitest run src/app/__tests__/seo-metadata.test.ts src/app/__tests__/seo-headers.test.ts src/app/__tests__/seo-merchant-listings.test.ts src/app/layout.test.ts
npm run build

# 2. Eyeball, then commit + push (you, not me)
git add src/app/page.tsx src/app/layout.tsx next.config.ts public/robots.txt \
        src/app/__tests__/seo-metadata.test.ts \
        src/app/__tests__/seo-headers.test.ts \
        src/app/__tests__/seo-merchant-listings.test.ts \
        docs/SEO-AEO-AUDIT-2026-05-01.md \
        docs/SEO-AEO-AUDIT-2026-05-01-DELTA.md \
        docs/SEO-AEO-WEB-RESEARCH-2026-05-01.md \
        docs/SEO-AEO-GSC-FIXES-2026-05-01.md

git status   # eyeball before committing

git commit -m "seo: address SEO/AEO audit + GSC merchant-listings + indexing fixes

Audit fixes:
- page.tsx: description 166→149 chars; reset keywords to 17-term competitor-informed set (incl. RFC 6962 Merkle proof)
- layout.tsx: add publisher/authors/creator/applicationName/category; align Twitter desc
- next.config.ts: emit X-Robots-Tag (index for /, noindex for /api,/admin,/dashboard)
- robots.txt: allow Applebot-Extended, MistralAI-User, Meta-ExternalAgent, DuckAssistBot

GSC merchant-listings (5 invalid items on /pricing):
- layout.tsx: add image, shippingDetails, hasMerchantReturnPolicy, priceValidUntil to all 6 Offers
- 3 hoisted constants (PRODUCT_IMAGE_URL, DIGITAL_SHIPPING_DETAILS, FREE_TRIAL_RETURN_POLICY)
- image at SoftwareApplication root for AI image previews

Tests: 3 new files, 49 invariants pinning the above

Refs: docs/SEO-AEO-AUDIT-2026-05-01.md
      docs/SEO-AEO-AUDIT-2026-05-01-DELTA.md
      docs/SEO-AEO-WEB-RESEARCH-2026-05-01.md
      docs/SEO-AEO-GSC-FIXES-2026-05-01.md"

# 3. After deploy, validate the fix landed
curl -sI https://parametric-memory.dev | grep -i 'x-robots-tag'
curl -sI https://parametric-memory.dev/api/health | grep -i 'x-robots-tag'

# Rich results check (browser)
# https://search.google.com/test/rich-results
# Enter: https://parametric-memory.dev/pricing
# Expect: 6 valid merchant listings, 0 errors

# 4. Re-trigger Google indexing (manual GSC steps)
# - Sitemaps → submit "sitemap.xml"
# - URL Inspection → "Request indexing" for /, /pricing, /faq, /blog, /about, /docs

# 5. Bing (often missed)
# - https://www.bing.com/webmasters → import from GSC → submit sitemap.xml
```

---

## 5. What I did NOT do (per your hard rules)

- ❌ No `git commit` / `git push` / `git tag`
- ❌ No file deletions
- ❌ No `.env*` reads or writes
- ❌ No direct DB operations
- ❌ No GSC submissions on your behalf — those need your Google account permission and are listed as manual steps for you above
- ❌ No `node_modules` reinstall

---

*Generated 2026-05-01 from a static read of `mmpm-website/` HEAD-after-fixes plus a live read of GSC via Claude in Chrome. Files modified: 4. Tests added: 3. Docs added: 4.*
