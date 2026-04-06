# Sprint: SEO/AEO Fixes → Stripe Live → MCP Directory Launch
**Created:** 5 April 2026
**Status:** Not started
**Estimated total effort:** 2–3 focused days

---

## Objective

Three phases in strict order:
1. Fix all SEO/AEO issues identified in the audit — foundation must be solid before driving traffic
2. Flip Stripe from sandbox to live — the site needs to actually charge before being publicly listed
3. Submit to MCP directories — only after payment works end-to-end

---

## Phase 1 — SEO / AEO Fixes

### P1-1 · Fix pricing page canonical tag 🔴 CRITICAL
**File:** `src/app/pricing/page.tsx`
**Issue:** The `metadata` export has no `alternates.canonical` set, so Next.js falls back to the root layout's default — which is `https://parametric-memory.dev`. Google sees the pricing page as a duplicate of the homepage and may suppress it from ranking.
**Fix:** Add `alternates: { canonical: "https://parametric-memory.dev/pricing" }` to the pricing page metadata.

```ts
// src/app/pricing/page.tsx
export const metadata: Metadata = {
  title: "Parametric Memory Pricing — Plans from $9/mo",  // also fix title duplication
  description: "...",
  alternates: {
    canonical: "https://parametric-memory.dev/pricing",   // ADD THIS
  },
  openGraph: { ... },
};
```

**Effort:** 5 minutes | **Impact:** Critical

---

### P1-2 · Fix pricing page title duplication 🟠 HIGH
**File:** `src/app/pricing/page.tsx`
**Issue:** Current title is `"Pricing — Parametric Memory | Parametric Memory"` because the root layout template appends `| Parametric Memory` to the page title — and the page title already ends with `Parametric Memory`. Double-branded.
**Fix:** Change the pricing page title to just `"Pricing — Plans from $9/mo"` — the layout template appends the brand automatically.

```ts
title: "Pricing — Plans from $9/mo",
```

**Effort:** 2 minutes | **Impact:** High

---

### P1-3 · Add blog post URLs to sitemap 🔴 CRITICAL
**File:** `src/app/sitemap.ts`
**Issue:** The sitemap only lists top-level pages. Individual blog post URLs are never submitted to Google. The existing post and all future posts are invisible to search crawlers unless they happen to follow links.
**Fix:** Import `getAllPostSlugs` from `@/lib/blog` and add each slug as a URL entry.

```ts
// src/app/sitemap.ts
import { getAllPostSlugs } from "@/lib/blog";

export default function sitemap(): MetadataRoute.Sitemap {
  const blogSlugs = getAllPostSlugs();
  const blogEntries = blogSlugs.map((slug) => ({
    url: `https://parametric-memory.dev/blog/${slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [
    // ... existing entries ...
    ...blogEntries,
  ];
}
```

**Effort:** 15 minutes | **Impact:** Critical

---

### P1-4 · Add Article schema to blog posts 🟠 HIGH (AEO)
**File:** `src/app/blog/[slug]/page.tsx`
**Issue:** Blog posts have no `Article` JSON-LD. AI answer engines (Perplexity, ChatGPT, Google AI Overviews) strongly prefer citing structured article content. Without it, the blog post is treated as generic HTML.
**Fix:** Add a `BlogPosting` JSON-LD block using the frontmatter data already available in the page component.

```tsx
// In BlogPostPage, after frontmatter is loaded:
const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  headline: frontmatter.title,
  description: frontmatter.excerpt,
  datePublished: frontmatter.date,
  dateModified: frontmatter.date,
  author: {
    "@type": "Person",
    name: frontmatter.author ?? "Entity One",
    url: "https://parametric-memory.dev/about",
  },
  publisher: {
    "@type": "Organization",
    name: "Parametric Memory",
    url: "https://parametric-memory.dev",
    logo: {
      "@type": "ImageObject",
      url: "https://parametric-memory.dev/brand/favicon-192.png",
    },
  },
  url: `https://parametric-memory.dev/blog/${slug}`,
  mainEntityOfPage: `https://parametric-memory.dev/blog/${slug}`,
  inLanguage: "en-US",
  keywords: frontmatter.tags?.join(", "),
};

// Then in JSX return:
<>
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
  />
  <main>...</main>
</>
```

**Effort:** 30 minutes | **Impact:** High (AEO)

---

### P1-5 · Add FAQ schema to homepage 🟠 HIGH (AEO)
**File:** `src/app/page.tsx`
**Issue:** The homepage has no `FAQPage` JSON-LD despite having FAQ-friendly content. This is the fastest path to People Also Ask inclusion and AI Overview citations.
**Fix:** Add a `FAQPage` JSON-LD block to the homepage — alongside the existing `landingJsonLd` and `homeBreadcrumbJsonLd` scripts.

```ts
// src/app/page.tsx — add alongside existing JSON-LD constants
const homeFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is Parametric Memory?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Parametric Memory (MMPM) is a persistent, cryptographically verifiable memory substrate for AI agents. It stores knowledge as named atoms in a SHA-256 Merkle tree, provides RFC 6962 consistency proofs on every read, and uses a Markov chain prediction layer to pre-fetch context before you ask for it. Dedicated instances from $9/month.",
      },
    },
    {
      "@type": "Question",
      name: "How is Parametric Memory different from Mem0 or Zep?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Parametric Memory provides cryptographic Merkle proofs on every memory read — Mem0 and Zep do not. Every customer gets a dedicated instance (their own PostgreSQL, their own Merkle tree) — Mem0 and Zep use shared infrastructure. Markov-chain prediction pre-fetches context with a 64% hit rate. And knowledge graph edges are included at every tier — not paywalled behind an enterprise plan.",
      },
    },
    {
      "@type": "Question",
      name: "What is a Merkle proof for AI memory?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A Merkle proof is a cryptographic audit path that proves a specific memory atom was stored in the tree at a specific version, without having to read the entire tree. When your AI recalls a fact, it receives both the value and the proof. Verifying the proof takes 0.032ms and proves the memory has not been tampered with or quietly replaced.",
      },
    },
    {
      "@type": "Question",
      name: "Does Parametric Memory work with Claude?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Parametric Memory ships with a Model Context Protocol (MCP) server with 25+ tools. Add one config block to claude_desktop_config.json and Claude gains persistent memory immediately — no SDK required. It also works with Claude Code, Cowork, Cursor, Cline, and any MCP-compatible client.",
      },
    },
    {
      "@type": "Question",
      name: "How much does Parametric Memory cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Three plans: Indie at $9/month (10,000 memories, up to 33 Claude sessions/day), Pro at $29/month (100,000 memories, up to 333 sessions/day), and Team at $79/month (500,000 memories, unlimited sessions). Enterprise Cloud starts at $299/month. All plans include a 14-day free trial. No charge until day 15.",
      },
    },
    {
      "@type": "Question",
      name: "What is the setup time?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Under 60 seconds. Sign up, receive your instance credentials by email, add one config block to your MCP client, and your AI has persistent memory. No Docker, no self-hosting, no infrastructure work required.",
      },
    },
  ],
};
```

Then add to the JSX return:
```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(homeFaqJsonLd) }}
/>
```

**Effort:** 45 minutes | **Impact:** High (AEO — People Also Ask + AI Overviews)

---

### P1-6 · Fix duplicate H2 on homepage 🟡 MEDIUM
**File:** `src/app/page.tsx`
**Issue:** The final CTA section uses `<h2>Your AI's second brain. / Ready in 60 seconds.</h2>` — which is identical to the H1 in the hero. Duplicate headings confuse crawlers and dilute keyword signals.
**Fix:** Change the final CTA `<h2>` to something that closes the journey rather than repeating the opening. Suggested: "Start in 60 seconds." or keep as a styled paragraph rather than a heading.

**Effort:** 5 minutes | **Impact:** Medium

---

### P1-7 · Add descriptive image alt text 🟡 MEDIUM
**File:** `src/app/page.tsx` (and any other pages with `<img>` tags)
**Issue:** All images use generic alt text `"Parametric Memory"`. Non-logo images should have descriptive alts for accessibility and image search.
**Fix:** Update the `Logomark` component alt to stay generic, but ensure any diagram or screenshot images get descriptive alts. Right now only the logo appears to be an image — verify no screenshots were added recently.

**Effort:** 15 minutes | **Impact:** Medium

---

### P1-8 · Add llms.txt FAQ section 🟡 MEDIUM (AEO)
**File:** `public/llms.txt`
**Issue:** The `llms.txt` is excellent but lacks a `## FAQ` section. AI agents parsing it to answer user questions about the product will surface whatever structured Q&A they can find.
**Fix:** Append a `## FAQ` section to `public/llms.txt` reusing the same Q&As from P1-5.

**Effort:** 15 minutes | **Impact:** Medium (AEO)

---

### P1-9 · Create a glossary/definitions page 🟡 MEDIUM (AEO)
**Location:** `src/app/docs/` — add a `glossary.mdx` content file
**Issue:** Definitional content ("What is a memory atom?", "What is a Markov chain in memory context?") is exactly what AI Overview engines cite. No competitor owns these definitions.
**Fix:** Create `/docs/glossary` with clean, citation-ready definitions for: Memory Atom, Merkle Proof, Markov Prediction, Session Bootstrap, JumpHash Sharding, Knowledge Graph Edge, Compact Proofs. Each ~80–120 words, factual, no marketing language.

**Effort:** 1–2 hours | **Impact:** High (AEO long-term)

---

### P1-10 · Reconsider GPTBot blocking on /blog and /docs 🟡 MEDIUM
**File:** `public/robots.txt`
**Issue:** GPTBot is currently blocked from `/blog/` and `/docs/`. This prevents OpenAI's answer engine products from citing your content. Since you're trying to establish topical authority in a nascent category, citation reach > training data protection right now.
**Fix:** Remove the `Disallow: /blog/` and `Disallow: /docs/` lines under the `GPTBot` section. Keep the bulk training crawlers (CCBot, CommonCrawlBot) blocked.

**Effort:** 2 minutes | **Impact:** Medium (AEO)

---

### P1-11 · Publish 6 targeted blog posts 🟠 HIGH (SEO)
**Location:** `content/blog/` (or wherever MDX blog posts live)
**Issue:** One 600-word blog post is insufficient for topical authority. Competitors rank because third-party sites write comparison articles about them.
**Priority order:**

| # | Title | Target keyword | Effort |
|---|---|---|---|
| 1 | "How to Give Claude Persistent Memory in 60 Seconds" | `how to give Claude persistent memory` | 2–3 hrs |
| 2 | "Parametric Memory vs Mem0: A Technical Comparison" | `Mem0 alternative`, `Mem0 vs Parametric Memory` | 3–4 hrs |
| 3 | "What Is a Merkle Proof for AI Memory?" | `Merkle proof AI memory`, `verifiable AI memory` | 2 hrs |
| 4 | "Parametric Memory vs Zep: Dedicated Instances vs Shared Infrastructure" | `Zep alternative` | 3 hrs |
| 5 | "MCP Memory Server Setup Guide for Claude Code" | `MCP memory server Claude Code` | 2–3 hrs |
| 6 | "Why Vector Memory Is Not Enough for AI Agents" | `AI agent memory persistence` | 3 hrs |

**Effort:** ~2–3 days total | **Impact:** Very High (SEO — addresses the biggest gap)

---

## Phase 1.5 — Legal Gate: Terms Acceptance Storage

> Must be completed before Stripe goes live. Clickwrap acceptance must be stored server-side to be legally enforceable.

### Background

The UI gate exists and works — the checkout button is disabled until the user checks "I agree to Terms of Service and Privacy Policy." However, `agreedToTerms` and `termsVersion` were never being forwarded to the compute server. This means no record of acceptance was stored in the database — the legal protection was purely cosmetic.

**Status as of 2026-04-05:** Website fix applied (P1.5-1 below). Compute-side fix (P1.5-2) requires updating `mmpm-compute`.

---

### P1.5-1 · Pass agreedToTerms in checkout request body ✅ DONE
**File:** `src/app/pricing/PricingCTA.tsx`
**Issue:** `handleCheckout()` checked `agreedToTerms` before proceeding but did NOT include it in the `fetch` body sent to `/api/checkout`.
**Fix:** Added `agreedToTerms: true` and `termsVersion: "2026-04-05"` to the request body.

```ts
// Before
body: JSON.stringify({ tier: tierId, ...(trial ? { trial: true } : {}) }),

// After
body: JSON.stringify({
  tier: tierId,
  agreedToTerms: true,
  termsVersion: "2026-04-05",
  ...(trial ? { trial: true } : {}),
}),
```

**Effort:** Done | **Impact:** Critical (legal)

---

### P1.5-2 · Store terms acceptance in compute before creating Stripe session 🔴 CRITICAL
**Repo:** `mmpm-compute`
**File:** `src/routes/checkout.ts` (or wherever `POST /api/checkout` is handled)
**Issue:** The compute checkout endpoint receives the request body but does not validate or store `agreedToTerms`. A Stripe checkout session is created even if no terms acceptance is in the body.

**Required changes to `mmpm-compute`:**

```ts
// POST /api/checkout handler — add BEFORE creating Stripe session

// 1. Validate terms acceptance
if (!body.agreedToTerms) {
  return res.status(422).json({ error: "Terms of Service must be accepted before checkout." });
}

// 2. Store acceptance on the customer/user record
await db.query(
  `UPDATE users
   SET terms_accepted_at = NOW(),
       terms_version = $1
   WHERE id = $2`,
  [body.termsVersion ?? "2026-04-05", session.userId]
);

// 3. Only then create the Stripe session
const stripeSession = await stripe.checkout.sessions.create({ ... });
```

**Also add to the DB schema** (migration required):
```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version      TEXT;
```

**Checklist:**
- [ ] Migration created and applied (use the `migration` skill)
- [ ] Compute endpoint rejects requests where `agreedToTerms` is not `true`
- [ ] `terms_accepted_at` and `terms_version` stored on user record
- [ ] Test: attempt checkout without checkbox → must get 422 error displayed in UI
- [ ] Test: attempt checkout with checkbox → proceeds to Stripe normally

**Effort:** 1–2 hours | **Impact:** Critical (legal compliance, required before Stripe live)

---

## Phase 2 — Stripe: Sandbox → Live

> Complete Phase 1 and Phase 1.5 before starting Phase 2. Terms acceptance must be stored in the DB before real money changes hands.

### P2-1 · Audit current Stripe configuration
**Action:** Review all Stripe-related env vars and confirm which are sandbox vs live keys.
**Files to check:**
- `.env.local` / `.env.production` — `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- `src/config/tiers.ts` — confirm price IDs
- `src/app/api/checkout/route.ts` — confirm checkout flow
- `src/app/api/billing/` — portal and status routes

**Checklist:**
- [ ] `STRIPE_SECRET_KEY` starts with `sk_live_` (not `sk_test_`)
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` starts with `pk_live_` (not `pk_test_`)
- [ ] All price IDs in `tiers.ts` are live-mode prices from the Stripe dashboard
- [ ] Webhook endpoint registered in Stripe Dashboard → live mode → Webhooks
- [ ] `STRIPE_WEBHOOK_SECRET` is the live webhook signing secret (`whsec_...` from live endpoint)
- [ ] Stripe account has completed identity verification and bank account linked

**Effort:** 30 minutes | **Impact:** Blocking for revenue

---

### P2-2 · Create live Stripe products and prices
**Action:** In the live Stripe Dashboard, create products matching the sandbox configuration.
**Products to create:**
- Indie — $9/month recurring
- Pro — $29/month recurring
- Team — $79/month recurring
- Enterprise Cloud — $299/month recurring
- Enterprise Self-Hosted — $499/month (one-time or recurring as appropriate)

**Note:** Copy the live price IDs and update `src/config/tiers.ts` accordingly. Verify each `priceId` field maps to a live-mode price.

**Effort:** 30 minutes | **Impact:** Blocking for revenue

---

### P2-3 · Register live webhook endpoint
**Action:** In Stripe Dashboard → Developers → Webhooks → Add endpoint.
- URL: `https://parametric-memory.dev/api/checkout` (or wherever your webhook handler lives — check `src/app/api/checkout/route.ts`)
- Events to listen for: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- Copy the signing secret and update `STRIPE_WEBHOOK_SECRET` in production env

**Effort:** 15 minutes | **Impact:** Blocking for subscription management

---

### P2-4 · End-to-end payment test in production
**Action:** Use a real card (Stripe's own test card doesn't work in live mode) to purchase the Indie plan and verify:
- [ ] Checkout session creates successfully
- [ ] Payment processes
- [ ] Webhook fires and is received (check Stripe Dashboard → Webhooks → Recent deliveries)
- [ ] User account transitions to `indie` tier in mmpm-compute
- [ ] Customer receives welcome email via Resend
- [ ] Dashboard shows correct tier and memory limits
- [ ] Billing portal accessible and shows correct plan

**Effort:** 30 minutes | **Impact:** Blocking — must pass before directory submission

---

### P2-5 · Verify cancellation and trial flows
**Action:** Confirm:
- [ ] 14-day trial starts correctly on signup
- [ ] Card is not charged before day 15
- [ ] Cancel-before-trial-ends flow works (no charge)
- [ ] Cancellation at end of period works (access until period end)
- [ ] Failed payment handling (what happens to the substrate?)

**Effort:** 1 hour | **Impact:** High — customer trust

---

## Phase 3 — MCP Directory Submissions

> Do not submit to directories until Phase 2 is complete and a real payment has processed successfully. Being listed before payments work is worse than not being listed.

### P3-1 · Submit to Official MCP Registry (feeds PulseMCP automatically)
**URL:** https://registry.modelcontextprotocol.io
**Method:** CLI tool (`mcp-publisher`)
**Why first:** PulseMCP ingests from the official registry weekly. One submission covers both.

**Steps:**
1. Install: `npm install -g @modelcontextprotocol/registry-publisher` (or check current package name at registry.modelcontextprotocol.io)
2. Run `mcp-publisher init` → creates `server.json` template
3. Fill in `server.json`:
```json
{
  "$schema": "https://registry.modelcontextprotocol.io/schema/v0/server.json",
  "name": "com.parametric-memory/mmpm",
  "description": "Persistent, verifiable memory for AI agents. Cryptographic Merkle proofs (RFC 6962), Markov-chain prediction (64% hit rate), sub-millisecond recall (0.045ms p50). 25+ MCP tools. Dedicated instances from $9/mo.",
  "version": "1.0.0",
  "remotes": [
    {
      "transportType": "http",
      "url": "https://your-instance.parametric-memory.dev/mcp"
    }
  ]
}
```
4. Authenticate: `mcp-publisher login dns` (DNS verification for `com.parametric-memory` namespace)
5. Publish: `mcp-publisher publish`

**PulseMCP auto-indexes within 1 week of registry publication.**

**Effort:** 1–2 hours (including DNS verification) | **Impact:** Critical — feeds multiple directories

---

### P3-2 · Submit to mcp.so
**URL:** https://mcp.so/submit
**Method:** Self-serve form — immediate listing
**Fields:**
- Type: `MCP Server`
- Name: `Parametric Memory (MMPM)`
- URL: `https://github.com/wjm2202/Parametric-Memory`
- Server Config (paste this):
```json
{
  "mcpServers": {
    "mmpm": {
      "command": "npx",
      "args": ["-y", "@mmpm/mcp-client"],
      "env": {
        "MMPM_HOST": "https://your-instance.parametric-memory.dev",
        "MMPM_TOKEN": "your-bearer-token"
      }
    }
  }
}
```

**Effort:** 5 minutes | **Impact:** High — immediate listing, no review

---

### P3-3 · Submit to MCPMarket
**URL:** https://mcpmarket.com/submit
**Method:** Submit GitHub repo URL for manual review
**Fields:**
- GitHub repository URL: `https://github.com/wjm2202/Parametric-Memory`

**Note:** MCPMarket also covers Cline agent skills — worth checking whether the MCP toolset qualifies for the Agent Skills section too.

**Effort:** 5 minutes (+ wait for approval) | **Impact:** High

---

### P3-4 · Submit to Glama
**URL:** https://glama.ai/mcp
**Method:** Curated — requires repo setup + `glama.json` + valid LICENSE file
**Steps:**
1. Ensure repo has a `LICENSE` file (required — Glama rejects without it)
2. Add `glama.json` to repo root:
```json
{
  "name": "Parametric Memory (MMPM)",
  "description": "Persistent, verifiable memory substrate for AI agents. Cryptographic Merkle proofs, Markov prediction, MCP-native. Dedicated instances from $9/mo.",
  "homepage": "https://parametric-memory.dev",
  "documentation": "https://parametric-memory.dev/docs",
  "category": "memory",
  "tags": ["memory", "mcp", "merkle", "markov", "persistence", "claude", "ai-agents"]
}
```
3. Contact Glama support via their Discord or contact form to request listing review
4. Glama performs automated security scanning before publishing

**Effort:** 1 hour (setup) + wait | **Impact:** High — Glama has strong developer trust signals

---

### P3-5 · Craft directory listing copy
Use this consistent description across all directories:

**Short (1 line):**
> Persistent, verifiable memory for AI agents — Merkle proofs, Markov prediction, 0.045ms recall. Dedicated instances from $9/mo.

**Medium (2–3 sentences):**
> Parametric Memory gives your AI a second brain that survives between sessions. Every memory atom is cryptographically committed to a SHA-256 Merkle tree — you can verify any recall, client-side, in 0.032ms. Variable-order Markov prediction pre-fetches context with a 64% hit rate. 25+ MCP tools, works with Claude, Claude Code, Cowork, Cursor, and Cline.

**Tags to use consistently:**
`memory` `mcp` `persistent-memory` `merkle-proofs` `markov-prediction` `claude` `ai-agents` `mcp-server` `context` `second-brain`

**Effort:** Already done (use copy above) | **Impact:** Consistency across listings

---

## Summary

| Phase | Tasks | Est. Effort | Gate |
|---|---|---|---|
| **Phase 1 — SEO/AEO** | P1-1 through P1-11 | 1–2 days | Deploy to production |
| **Phase 2 — Stripe Live** | P2-1 through P2-5 | 2–3 hours | Real payment confirmed |
| **Phase 3 — Directories** | P3-1 through P3-5 | 2–3 hours | After P2 complete |

**Quick wins to do right now (< 1 hour total):**
1. P1-1 — Fix pricing canonical (5 min)
2. P1-2 — Fix title duplication (2 min)
3. P1-3 — Add blog posts to sitemap (15 min)
4. P1-6 — Fix duplicate H2 (5 min)
5. P1-10 — Allow GPTBot on /blog and /docs (2 min)

Then deploy, then tackle the larger content and Stripe work.
