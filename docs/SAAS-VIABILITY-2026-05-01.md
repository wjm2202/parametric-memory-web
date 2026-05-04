# SaaS Viability Analysis — Parametric Memory

**Date:** May 1, 2026
**Scope:** Pricing, Stripe integration, advertised /pricing tiers, full cost model on production with 5 dedicated droplets, SEO/AEO state, go-to-market viability.
**Cost model source:** `src/lib/cost-model.ts` (single source of truth, 36 unit tests pinning every number).
**Companion docs:** SEO-AEO-AUDIT-2026-05-01.md · SEO-AEO-AUDIT-2026-05-01-DELTA.md · SEO-AEO-WEB-RESEARCH-2026-05-01.md · SEO-AEO-GSC-FIXES-2026-05-01.md

---

## 1. The bottom line up front

**At today's prices, with the "dedicated instance per customer" promise honoured, the SaaS is not viable below the Team tier.** Starter ($3) and Solo ($9) lose money on every customer. Professional ($29) is technically positive but takes 14 customers to cover platform overhead. Team ($79) is the first tier that makes meaningful money on its own infrastructure. The Enterprise tiers ($299 / $499) are where the unit economics become attractive.

Two paths forward:

1. **Honour the promise, fix the price floor.** Raise Starter to ~$25/mo or kill it; promote Solo→$19. Keep "dedicated instance" as the brand differentiator. Result: smaller funnel, healthy margins.
2. **Tier the promise.** Move Starter and Solo to a shared multi-tenant cluster (10–20 customers per droplet). Keep "dedicated instance" as a **Pro-and-up** feature. Marketing copy changes — "Dedicated from $29/mo, shared from $3/mo." Result: large funnel, mixed margins, more honest.

Either is a real business. The current configuration — dedicated for everyone, $3 minimum — is not.

---

## 2. What's being sold (per `src/config/tiers.ts`)

| Tier | Price/mo | Atoms | Bootstraps/mo | Storage | Spend cap | Notes |
|---|---:|---:|---:|---:|---:|---|
| Free (Basic) | $1 | 500 | 100 | 50 MB | $2 | Post-trial fallback only, **not publicly sold** |
| Starter | $3 | 1,000 | 200 | 100 MB | $5 | 30-day money-back |
| Solo (indie) | $9 | 10,000 | 1,000 | 500 MB | $15 | |
| **Professional (pro)** | **$29** | 100,000 | 10,000 | 2 GB | $50 | Most Popular |
| Team | $79 | 500,000 | unlimited | 10 GB | $120 | Custom domain |
| Enterprise Cloud | $299 | unlimited | unlimited | 100+ GB | — | 99.9% SLA, SSO, SOC 2 (contact-sales) |
| Enterprise Self-Hosted | $499 | — | — | — | — | Commercial license, customer hosts |

All prices marketed as **"dedicated instance, no shared infrastructure"** — currently true at every tier. That's the promise the cost model has to honour.

---

## 3. Stripe integration — readiness for GTM

The website is a BFF: every Stripe operation is proxied to mmpm-compute. The website-side surface is fully wired:

| Endpoint (website) | Compute backend | Status |
|---|---|---|
| `POST /api/checkout` | `POST /api/checkout` | Wired — creates Stripe Checkout Session |
| `POST /api/billing/portal` | `POST /api/v1/billing/portal` | Wired — Customer Portal handover |
| `GET /api/billing/status` | `GET /api/v1/billing/status` | Wired — billing snapshot for dashboard |
| `POST /api/billing/upgrade` | `POST /api/v1/billing/upgrade` | Wired — Stripe Checkout for upgrades |
| `GET /api/billing/upgrade-options` | `GET /api/v1/billing/upgrade-options` | Wired — proration preview |
| `POST /api/billing/tier-change` | proxied | Wired |
| `POST /api/my-substrate/cancel` | proxied | Wired |
| `POST /api/my-substrate/reactivate` | proxied | Wired |

**Webhook handler lives on `mmpm-compute`** (correct architecture — webhook needs to be the same process that owns subscription state). Website has `src/app/api/webhook/` directory but no `route.ts` yet — that's deliberate, not a gap.

**Verdict:** Stripe is GTM-ready from the website. The lifecycle covers signup → trial → conversion → upgrade → cancel → reactivate. Five env vars per tier (`STRIPE_PRICE_*`, `STRIPE_PRODUCT_*`) need to be set on the `mmpm-compute` droplet — those are populated from the Stripe dashboard manually.

**One thing worth flagging:** the website's `/api/billing/tier-change` and `/api/billing/upgrade` use idempotency keys forwarded from the body. Confirm that the compute side enforces them — without idempotency, a double-click on "Upgrade" could create two subscriptions. Out of scope for this doc but worth a 30-min audit before public launch.

---

## 4. Cost model — production with 5 dedicated droplets

All numbers from May 2026 retail prices, codified in `src/lib/cost-model.ts` and pinned by 36 unit tests.

### 4.1 Shared overhead (constant; doesn't scale with customers)

| Line item | $/mo | Source |
|---|---:|---|
| Website droplet (mmpm-website Next.js) | $18.00 | DO syd1, 2 vCPU / 2 GiB / 90 GB |
| Compute droplet (mmpm-compute orchestrator) | $18.00 | Same spec |
| Domain (parametric-memory.dev) | $0.87 | Cloudflare at-cost, $10.44/yr |
| GitHub Pro | $4.00 | Solo founder, sufficient CI minutes |
| Docker Hub Pro | $5.00 | Unlimited private repos, no pull limits |
| Anthropic Claude API (ops) | $20.00 | Nightly association agent + weekly evals + light content |
| Resend transactional email | $0.00 | Free tier 3,000/mo (magic-link) |
| Sentry | $0.00 | Free tier 5,000 events/mo |
| Plausible/Umami analytics | $0.00 | Self-hosted on the website droplet |
| **Shared overhead total** | **$65.87** | |

Free tiers are intentionally listed as $0 placeholders. When traffic crosses the threshold, flip them to ~$20/mo each — model and tests handle that change with a single line edit.

### 4.2 Per-customer infrastructure (every paying customer Starter→Team)

| Line item | $/mo |
|---|---:|
| Customer droplet (2 vCPU / 2 GiB / 90 GB syd1) | $18.00 |
| DO Backups (20% surcharge) | $3.60 |
| Snapshot storage (~16 GB @ $0.06/GB/mo) | $1.00 |
| Bandwidth overage (4 TB outbound free) | $0.00 |
| **Per-customer total** | **$22.60** |

### 4.3 Enterprise Cloud add-ons (over the per-customer baseline)

| Line item | $/mo |
|---|---:|
| Managed PostgreSQL (single-node 1 GiB) | $15.00 |
| Snapshot storage extra (~70 GB) | $4.00 |
| Better Stack uptime monitoring | $5.00 |
| **Enterprise Cloud add-on total** | **$24.00** |

Pushes Enterprise Cloud per-customer infra to **$46.60/mo** — justified by the 99.9% SLA and SOC 2 promise.

### 4.4 Stripe fees

`2.9% + $0.30 base + 0.7% Stripe Billing add-on = 3.6% + $0.30 per recurring charge`

### 4.5 Gross margin per customer (the headline finding)

| Tier | Revenue | Stripe fee | Infra | **Gross margin** | Margin % |
|---|---:|---:|---:|---:|---:|
| Starter | $3 | $0.41 | $22.60 | **−$20.01** | **−667%** |
| Solo | $9 | $0.62 | $22.60 | **−$14.22** | **−158%** |
| Professional | $29 | $1.34 | $22.60 | **+$5.06** | +17% |
| Team | $79 | $3.14 | $22.60 | **+$53.26** | +67% |
| Enterprise Cloud | $299 | $11.06 | $46.60 | **+$241.34** | +81% |
| Enterprise Self-Hosted | $499 | $18.26 | $0.00 | **+$480.74** | +96% |

**Starter and Solo are loss-making before the founder has done a single thing.** This is the central finding. The dedicated droplet ($22.60) costs more than what a Starter customer pays ($3) — the unit economics are inverted.

---

## 5. Five-customer scenarios — what happens at scale

| Scenario | Mix | Revenue | Net P&L | Verdict |
|---|---|---:|---:|---|
| A. 5× Starter | 5 customers | $15 | **−$165.91/mo** | Loss accelerates per customer |
| B. 5× Solo | 5 customers | $45 | **−$136.99/mo** | Same — every Solo loses $14 |
| C. 5× Professional | 5 customers | $145 | **−$40.59/mo** | Margin too thin to cover overhead |
| D. 5× Team | 5 customers | $395 | **+$200.41/mo** | First profitable scenario |
| E. Realistic mix (1T + 1Pro + 2Solo + 1Starter) | 5 customers | $129 | **−$56.01/mo** | Headline mix loses money |
| F. 1× Enterprise Cloud (alone) | 1 customer | $299 | **+$175.47/mo** | One enterprise customer >> 5 mixed |

### Break-even (single-tier funnel)

| Tier | Customers needed to cover shared overhead |
|---|---:|
| Starter | ∞ (cannot break even) |
| Solo | ∞ (cannot break even) |
| Professional | **14** customers |
| Team | **2** customers |
| Enterprise Cloud | **1** customer |
| Enterprise Self-Hosted | **1** customer |

---

## 6. Where the money actually is

Plot revenue against cost:

```
$/customer                  REVENUE                    COST                MARGIN
                                                                   
Self-Hosted    │█████████████████████████████│                              $480
Enterprise Cloud │█████████████████████│███│                                $241
Team           │█████│██│                                                   $53
Pro            │██│██│                                                       $5
Solo           │█│██│                                                      −$14
Starter        │▌│██│                                                      −$20
```

**The customer who saves the company is a single Enterprise Cloud subscriber.** One $299 customer covers the entire shared overhead and yields $175/mo in profit. Two Team customers do roughly the same. Forty-five Starters cannot break even — every one you sign costs you another $20.

---

## 7. SEO/AEO state — does the funnel feed the right tiers?

(From the four prior audit docs in `docs/`.)

**Strong points:**
- 17 keywords, evidence-driven (RFC 6962 differentiation against AgentTrace + Mastercard)
- llms.txt + JSON-LD coverage among the strongest in the AI memory space
- robots.txt allows 12+ AI crawlers (including the 4 added this sprint)
- Now also passes the X-Robots-Tag SEO check + has all E-E-A-T meta fields

**Open items that affect viability:**
- **`/faq`, `/blog`, `/about` not indexed** — sitemap exists but was never submitted to GSC. Easy fix (manual UI step) but blocks discovery for the educational top-of-funnel pages.
- **No published LongMemEval score.** Every comparison article in 2026 omits Parametric Memory because there's no number to cite. This is the single biggest credibility lever you don't have.
- **Home page word count thin (~468 words)** vs the 800-1500 needed to rank on "Mem0 alternative" / "Zep alternative" — your highest-leverage commercial-intent terms.
- **Pricing page leads "Dedicated instances from $3/mo"** — accurate but commercially inadvisable given §4.5. Consider rephrasing to "Dedicated instances from $29/mo · trial from $3/mo" or similar.

The SEO funnel today drives visitors to a pricing page that converts them into the loss-making tiers. Until the price floor is fixed, more SEO traffic *makes the unit economics worse, not better.*

---

## 8. Go / no-go per tier

| Tier | Verdict | Reasoning |
|---|---|---|
| Starter ($3) | **DO NOT SHIP at this price + dedicated promise.** | Loss of $20 per customer. Either move to shared cluster or raise to ~$25. |
| Solo ($9) | **DO NOT SHIP at this price + dedicated promise.** | Loss of $14 per customer. Same fix options. |
| Professional ($29) | **Ship cautiously.** | Positive but 14 customers to break even. Realistic if SEO + content work. |
| Team ($79) | **Ship enthusiastically.** | First real margin tier. 2 customers cover all overhead. |
| Enterprise Cloud ($299) | **Lead with this.** | $175/mo profit on a single customer. Cash cow. |
| Enterprise Self-Hosted ($499) | **Lead with this for compliance buyers.** | $480/mo pure margin. Customer hosts the infra. |

---

## 9. Three concrete recommendations

### 9.1 Tiering decision (pick one within 7 days)

**Option A — Premium / dedicated-only.** Drop Starter. Promote Solo to $19, Professional stays $29, Team stays $79. Marketing copy: *"Dedicated AI memory infrastructure. From $19/mo."* Funnel narrows to serious buyers who can afford a real instance. Cleanest unit economics.

**Option B — Tiered promise.** Keep Starter $3 and Solo $9 but on a **shared cluster** (10–20 customers per $18 droplet → per-customer cost drops to ~$1.80). Re-label them as *"Shared starter"* and *"Shared solo."* Pro/Team keep the dedicated promise. Marketing copy: *"Dedicated from $29/mo, shared from $3/mo."* Honest, two-funnel.

**Option C — Hybrid.** Drop Starter, keep Solo $9 on shared, push Pro $29 as the entry point for dedicated. The middle path — fewer SKUs to maintain than B, more accessible than A.

I'd ship **Option A**. It matches the existing brand promise, doesn't require an architectural change to support shared clusters, and the SEO/AEO work already done targets buyers who would not balk at $19. Solo at $19 still loses ~$4/customer but covers Stripe + most droplet — the implicit "marketing budget" is $4/customer/mo, which is reasonable for top-of-funnel acquisition.

### 9.2 Lead with Enterprise

Build a **`/compare/mem0`** and **`/compare/zep`** page (the SEO research already named this). Both pages should funnel directly to *"Talk to founding team"* (Enterprise Cloud lead form) — not to `/signup`. Every Enterprise Cloud customer is worth ~60 Starter customers in absolute margin, and 1.4 Team customers in margin, while costing the same per-customer in support time.

### 9.3 Run LongMemEval before public launch

This is the single biggest credibility lever you don't have. Mem0=49%, Zep=63.8%, Letta=83%, Mastra=94.87%. Even a 60% score puts you in the conversation. A 90%+ score makes you the lead in every comparison article. Run it, publish at `/benchmarks` with `Dataset` JSON-LD, pitch it to Vectorize / Atlan / n1n.ai. Out of scope for this analysis, but the strategic ROI is the highest of anything on this list.

---

## 10. Order of operations to get to GTM

```
Week 1 (decision week)
  □ Pick tiering option (A/B/C above) — 1 founder hour
  □ Update src/config/tiers.ts to match decision
  □ Update PricingCard, llms.txt, JSON-LD offers in layout.tsx
  □ Run vitest — cost-model tests will flag any regression
  □ Submit sitemap.xml in Google Search Console
  □ Fix /pricing merchant-listings (already done in this sprint, just deploy)

Week 2 (credibility)
  □ Run LongMemEval benchmark on a clean substrate
  □ Publish /benchmarks page with Dataset JSON-LD + score
  □ Add a "Why teams switch from Mem0/Zep" section on /
       — pulls home word count from 468 → 800+
  □ Build /compare/mem0 and /compare/zep slugs

Week 3 (launch)
  □ Announce on Hacker News, /r/ClaudeAI, /r/MachineLearning
       — anchor message: "verifiable AI memory with RFC 6962 Merkle proofs"
  □ Pitch round-up authors (Vectorize, Atlan, n1n.ai)
  □ Set up Stripe webhook in production (compute side)
  □ Stripe tax + dunning rules configured

Week 4 (close)
  □ First Enterprise Cloud lead in the door
  □ Re-validate /pricing merchant-listings in GSC (should now pass)
  □ Bing Webmaster Tools sitemap submitted
```

---

## 11. Files added in this analysis

| File | Purpose |
|---|---|
| `src/lib/cost-model.ts` | Single source of truth for the cost math. 195 lines. |
| `src/lib/__tests__/cost-model.test.ts` | 36 invariants pinning every number in this doc. |
| `docs/SAAS-VIABILITY-2026-05-01.md` | This file. |

Run the cost-model tests:
```bash
# Why: pins every number in this doc — fails CI if margins regress.
# Where: repo root.
# Safe: read-only, ~50ms.
cd /Users/glenosborne/Documents/code/mmpm-website
npx vitest run src/lib/__tests__/cost-model.test.ts
```

If you change a tier price in `src/config/tiers.ts`, the cost-model tests will fail until you also update `src/lib/cost-model.ts`. The cost-model is **deliberately a separate module** from `tiers.ts` — they're in different layers of the app. Tests are the contract between them.

---

## 12. What I did NOT do

- ❌ Did not change pricing in `src/config/tiers.ts`. That's a strategic decision for you.
- ❌ Did not change marketing copy on `/pricing`. Same reason.
- ❌ Did not commit anything (per ground rules).
- ❌ Did not touch `.env*`. Stripe price/product ID env vars need to be set on `mmpm-compute` by hand from the Stripe dashboard.
- ❌ Did not run LongMemEval. That's a substrate operation requiring real DO infra and several hours.
- ❌ Did not deploy anything.

---

*Generated 2026-05-01 from a static read of `mmpm-website/` HEAD plus live web research on May 2026 retail prices for DO, Stripe, GitHub, Docker, Cloudflare, Anthropic. All numbers reproducible from `src/lib/cost-model.ts`.*
