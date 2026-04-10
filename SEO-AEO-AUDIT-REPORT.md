# SEO/AEO/JSON-LD Audit Report — Parametric Memory
**Date**: 11 April 2026  
**Scope**: Exhaustive audit as if Google is evaluating the entire site for make-or-break indexing

---

## EXECUTIVE SUMMARY

**Overall Grade**: B+ (Good foundation, critical gaps identified)

The site has **excellent JSON-LD structured data** (Organization, SoftwareApplication, FAQPage), **comprehensive robots.txt and llms.txt for AEO**, and proper canonical tags. However, there are **critical OpenGraph omissions** on key pages and **one pricing inconsistency** in JSON-LD that could confuse AI answer engines.

---

## ✅ STRENGTHS (What's Working)

### 1. **JSON-LD Structured Data** — Excellent
- ✅ Organization schema in root layout
- ✅ SoftwareApplication with all 6 pricing tiers (Starter through Enterprise Self-Hosted)
- ✅ FAQPage schema on /faq with 25+ Q&A pairs
- ✅ BlogPosting schema on all blog posts
- ✅ BreadcrumbList on pricing, FAQ, visualise, knowledge
- ✅ AboutPage schema on /about

### 2. **AEO (Answer Engine Optimization)** — Excellent
- ✅ llms.txt comprehensive (298 lines, covers product, pricing, MCP tools, FAQ)
- ✅ robots.txt allows all AI crawlers (ClaudeBot, ChatGPT-User, PerplexityBot, etc.)
- ✅ FAQ page optimized for AI citation with natural language Q&A
- ✅ Meta tag: ai-content-declaration="human-authored"

### 3. **Technical SEO** — Very Good
- ✅ Canonical tags on all indexable pages
- ✅ Noindex on protected pages (dashboard, admin, billing/*)
- ✅ Sitemap includes all pages with correct priorities (FAQ = 0.9 for AEO)
- ✅ Proper robots meta (max-snippet: -1, max-image-preview: large)
- ✅ All images have alt text
- ✅ Mobile-friendly viewport
- ✅ HTTPS enforced
- ✅ Semantic HTML structure

---

## 🚨 CRITICAL ISSUES (Must Fix)

### 1. **Pricing Inconsistency in JSON-LD**
**Location**: `/src/app/layout.tsx` line 129  
**Issue**: WebApplication schema says `lowPrice: "9"` but Starter tier is actually **$3/mo**  
**Impact**: AI answer engines (ChatGPT, Perplexity, Google AI Mode) will surface incorrect pricing  
**Fix**: Change `lowPrice: "9"` to `lowPrice: "3"`

```typescript
// INCORRECT:
offers: {
  "@type": "AggregateOffer",
  lowPrice: "9",  // ❌ Wrong

// CORRECT:
offers: {
  "@type": "AggregateOffer",
  lowPrice: "3",  // ✅ Starter is $3
```

---

### 2. **Missing OpenGraph Tags on Key Pages**

OpenGraph tags are critical for social shares (LinkedIn, Twitter, Slack) and AI preview cards. Missing on:

#### **Home Page** (`/src/app/page.tsx`)
- ❌ No OpenGraph tags
- Current: Only has title + description in metadata
- **Impact**: Broken social preview cards when shared on LinkedIn/Twitter

#### **Blog Index** (`/src/app/blog/page.tsx`)
- ❌ No OpenGraph tags
- ❌ No keywords metadata

#### **Blog Posts** (`/src/app/blog/[slug]/page.tsx`)
- ❌ No OpenGraph images, types, or URLs
- Note: Has BlogPosting JSON-LD ✅ but missing OG tags

#### **Docs Pages** (`/src/app/docs/[...slug]/page.tsx`)
- ❌ No OpenGraph tags
- ❌ No keywords metadata

#### **Visualise** (`/src/app/visualise/page.tsx`)
- ❌ No OpenGraph tags
- ❌ No keywords

#### **Knowledge** (`/src/app/knowledge/page.tsx`)
- ❌ No OpenGraph tags
- ❌ No keywords

#### **Legal Pages** (`/terms`, `/privacy`, `/dpa`, `/aup`)
- ❌ No OpenGraph tags
- **Why it matters**: B2B buyers share legal pages for compliance review

---

### 3. **Missing Keywords Metadata**

Keywords help AI answer engines understand page topics. Missing on:
- Home page
- Pricing page (has OG, not keywords)
- About page (has OG, not keywords)
- Blog index
- Blog posts (keywords only in JSON-LD, not metadata)
- Docs pages
- Visualise
- Knowledge

---

## ⚠️ MODERATE ISSUES (Should Fix)

### 1. **No Twitter Handle References**
- Have Twitter card metadata ✅
- Missing: `twitter:site` and `twitter:creator` handles
- **Impact**: Twitter can't attribute shares to your account

### 2. **Blog Posts: Keywords Duplication**
- Keywords exist in BlogPosting JSON-LD
- Not in `metadata.keywords` field
- **Fix**: Add both for maximum compatibility

### 3. **Docs Pages: Minimal Metadata**
- Only title + description + canonical
- No OG, no keywords, no article metadata

---

## 📋 DETAILED FIXES REQUIRED

### Fix #1: Update WebApplication lowPrice
**File**: `src/app/layout.tsx`  
**Line**: ~129  
**Change**: `lowPrice: "9"` → `lowPrice: "3"`

---

### Fix #2: Add OpenGraph to Home Page
**File**: `src/app/page.tsx`  
**Add to metadata**:
```typescript
openGraph: {
  title: "Parametric Memory — Persistent, Verifiable Memory for AI",
  description: "Stop re-explaining. Cryptographic Merkle proofs, Markov prediction, sub-millisecond recall. Dedicated instances from $3/mo.",
  url: "https://parametric-memory.dev",
  siteName: "Parametric Memory",
  images: [
    {
      url: "https://parametric-memory.dev/brand/og.png",
      width: 1200,
      height: 630,
      alt: "Parametric Memory",
    },
  ],
  type: "website",
},
```

---

### Fix #3: Add Keywords to All Major Pages

**Home** (`/src/app/page.tsx`):
```typescript
keywords: [
  "AI memory",
  "persistent AI memory",
  "Merkle proof memory",
  "AI agent memory",
  "Claude memory",
  "MCP memory server",
  "verifiable AI memory",
  "parametric memory",
  "MMPM",
  "Markov prediction",
  "AI memory substrate",
],
```

**Pricing** (`/src/app/pricing/page.tsx`):
```typescript
keywords: [
  "AI memory pricing",
  "persistent memory cost",
  "Merkle proof pricing",
  "AI memory plans",
  "Claude memory pricing",
  "MCP server pricing",
],
```

**About** (`/src/app/about/page.tsx`):
```typescript
keywords: [
  "Parametric Memory team",
  "AI memory company",
  "Merkle proof technology",
  "AI-first development",
],
```

**Blog Index** (`/src/app/blog/page.tsx`):
```typescript
keywords: [
  "AI memory blog",
  "Merkle proof articles",
  "AI agent memory",
  "persistent memory insights",
],
```

**Visualise** (`/src/app/visualise/page.tsx`):
```typescript
keywords: [
  "Merkle tree visualization",
  "AI memory visualization",
  "memory substrate viewer",
  "3D Merkle tree",
],
```

**Knowledge** (`/src/app/knowledge/page.tsx`):
```typescript
keywords: [
  "knowledge graph",
  "AI memory graph",
  "semantic memory",
  "memory connections",
],
```

---

### Fix #4: Add OpenGraph to All Legal Pages

**Terms** (`/src/app/terms/page.tsx`):
```typescript
openGraph: {
  title: "Terms of Service | Parametric Memory",
  description: "Terms of Service for Parametric Memory — subscription terms, AI disclaimers, liability limits.",
  url: "https://parametric-memory.dev/terms",
},
```

**(Repeat pattern for /privacy, /dpa, /aup)**

---

### Fix #5: Add OpenGraph to Blog Posts
**File**: `src/app/blog/[slug]/page.tsx`  
**Add to generateMetadata**:
```typescript
openGraph: {
  title: frontmatter.title,
  description: frontmatter.excerpt,
  url: `https://parametric-memory.dev/blog/${slug}`,
  type: "article",
  publishedTime: frontmatter.date,
  authors: [frontmatter.author ?? "Entity One"],
  images: frontmatter.coverImage
    ? [{
        url: `https://parametric-memory.dev${frontmatter.coverImage}`,
        width: 1200,
        height: 630,
        alt: frontmatter.title,
      }]
    : [{
        url: "https://parametric-memory.dev/brand/og.png",
        width: 1200,
        height: 630,
        alt: frontmatter.title,
      }],
},
```

---

### Fix #6: Add OpenGraph to Docs Pages
**File**: `src/app/docs/[...slug]/page.tsx`  
**Add to generateMetadata**:
```typescript
openGraph: {
  title: `${frontmatter.title} | Parametric Memory Docs`,
  description: frontmatter.description,
  url: `https://parametric-memory.dev/docs/${slugStr}`,
  type: "article",
},
```

---

### Fix #7: Add Twitter Handles (Optional but Recommended)
**File**: `src/app/layout.tsx`  
**Add to root metadata**:
```typescript
twitter: {
  card: "summary_large_image",
  site: "@parametricmem",  // Add when you have a Twitter account
  creator: "@parametricmem",
  title: "Parametric Memory — Persistent, Verifiable Memory for AI",
  description: "Enterprise-grade AI memory with cryptographic Merkle proofs. Dedicated instances from $3/mo.",
  images: ["https://parametric-memory.dev/brand/og.png"],
},
```

---

## 📊 PRIORITY MATRIX

| Issue | Severity | Impact on SEO | Impact on AEO | Effort |
|-------|----------|---------------|---------------|--------|
| Pricing inconsistency in JSON-LD | 🔴 Critical | High | **Critical** | 1 min |
| Missing OG on home page | 🔴 Critical | **Critical** | Medium | 2 min |
| Missing OG on blog posts | 🟠 High | High | Medium | 5 min |
| Missing keywords everywhere | 🟠 High | Medium | High | 10 min |
| Missing OG on docs | 🟡 Medium | Medium | Medium | 5 min |
| Missing OG on legal pages | 🟡 Medium | Low | Low | 3 min |
| Missing Twitter handles | 🟢 Low | Low | Low | 1 min |

---

## 🎯 RECOMMENDED IMPLEMENTATION ORDER

1. **Fix pricing in layout.tsx** (1 min) — Critical for AI answer engines
2. **Add OG to home page** (2 min) — Critical for social shares
3. **Add keywords to all pages** (10-15 min) — Batch operation
4. **Add OG to blog posts** (5 min) — High visibility pages
5. **Add OG to docs, visualise, knowledge** (5 min)
6. **Add OG to legal pages** (3 min)
7. **Add Twitter handles** (1 min) — When account exists

**Total implementation time**: ~30 minutes

---

## 🧪 VALIDATION CHECKLIST

After fixes, validate with:
- ✅ Google Rich Results Test: https://search.google.com/test/rich-results
- ✅ Facebook Sharing Debugger: https://developers.facebook.com/tools/debug/
- ✅ Twitter Card Validator: https://cards-dev.twitter.com/validator
- ✅ LinkedIn Post Inspector: https://www.linkedin.com/post-inspector/
- ✅ Schema.org Validator: https://validator.schema.org/
- ✅ Google Search Console: Check "Enhancements" for errors
- ✅ Test llms.txt: curl https://parametric-memory.dev/llms.txt
- ✅ Test sitemap: curl https://parametric-memory.dev/sitemap.xml

---

## 📌 NOTES FOR FUTURE

### When Adding New Pages:
- Always add OpenGraph tags (even on legal/utility pages)
- Always add keywords (5-10 relevant terms)
- Always add canonical URL
- Consider BreadcrumbList JSON-LD for navigation context
- For blog posts: add keywords to both metadata.keywords AND JSON-LD

### When Changing Pricing:
- Update THREE places:
  1. WebApplication schema (layout.tsx line ~129)
  2. SoftwareApplication offers array (layout.tsx line ~189)
  3. Pricing page copy (pricing/page.tsx)

### AEO Best Practices:
- Keep llms.txt updated when adding new pages/features
- FAQ page is your #1 AEO asset — keep expanding it
- AI answer engines prioritize: FAQPage > SoftwareApplication > Organization
- Write FAQ answers as if ChatGPT will quote them verbatim

---

## FINAL VERDICT

**This site is 85% ready for launch.**

The core infrastructure (JSON-LD, canonicals, robots.txt, llms.txt) is **excellent**. The gaps are tactical — missing OpenGraph tags and keywords. These are quick wins that will dramatically improve social sharing and AI answer engine visibility.

**Critical Path**: Fix the pricing inconsistency FIRST (it will confuse AI engines), then add OpenGraph to the home page (affects ALL social shares).

**Launch Blocker?**: No, but the home page OpenGraph is close. Fix that before any marketing push.
