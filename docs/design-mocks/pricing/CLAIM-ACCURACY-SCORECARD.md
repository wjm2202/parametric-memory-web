# Pricing Claim Accuracy Scorecard — every claim, every tier

**Date:** 2026-07-01 · **Method:** each website claim cross-referenced to authoritative code.
**Sources of truth:** `parametric-memory-compute` `SUBSTRATE_TIERS` / `platform-ceilings.ts` / `setup-stripe-products.ts` / `billing-advisor.ts`; `mmpm-website` `src/config/tiers.ts`, `src/app/terms/page.tsx §5.4`.

**Legend:** ✅ accurate · ❌ inaccurate (contradicts code/terms) · 🔶 misleading (true-but-omits material context) · ⚠️ unverifiable in code (policy/ops promise).

---

## Authoritative truth (compute)

| Tier | Price | Atoms | Bootstraps/mo | Storage | Spend cap | Instances | Hosting |
|------|------:|------:|------:|------:|------:|:--:|:--|
| Basic (`free`) | **$3** | 200 | 30 | 10 MB | $2 | 1 | shared |
| Starter | $5 | 1,000 | 200 | 100 MB | $9 | 1 | shared |
| Solo (`indie`) | $9 | 10,000 | 1,000 | 500 MB | $15 | 2 | shared |
| Professional (`pro`) | $29 | 100,000 | 10,000 | 2 GB | $50 | 3 | **dedicated** |
| Team | $79 | 500,000 | **20,000** | 10 GB | $120 | 5 | **dedicated** |

Cross-cutting truths: atom limits are **soft** (overage billed **$0.001/atom** up to the spend cap); **Merkle proofs / Markov / MCP / knowledge-graph edges are available on every tier** (not gated); money-back = **7-day full refund** then pro-rata (Terms §5.4); dedicated upgrades carry a **non-refundable ⅓-of-first-period provisioning fee** (Terms §5.4 + `billing-advisor.ts`).

---

## Cross-cutting claims (apply site-wide)

| Claim | Verdict | Truth |
|------|:--:|------|
| Prices $5 / $9 / $29 / $79 | ✅ | `amountCents` 500/900/2900/7900 |
| "30-day money-back guarantee" | ❌ | Terms §5.4 = **7-day** full refund (then pro-rata). The "30 days" is the read-only wind-down, not a refund window. |
| "Dedicated / your own instance / never a shared row" (universal) | ❌ | Only **Pro/Team** dedicated; Starter/Solo **shared** |
| "Zero shared infrastructure" | ❌ | False for Starter/Solo |
| Atom counts presented as hard limits | 🔶 | Soft — over-limit billed $0.001/atom to the cap |
| Merkle proofs / Markov / MCP (all tiers) | ✅ | Core substrate features, not gated |
| "Knowledge graph edges included at every tier" | ✅ | Not gated in compute (but pricing table omits it from Solo/Basic — inconsistent) |
| Spend caps $2/9/15/50/120 | ✅ | `DEFAULT_CEILINGS` exact |
| Instance ceilings 1/1/2/3/5 | ✅ | exact |

---

## Per-tier scorecards

### Basic — `free`, $1 advertised *(NOT publicly sold — `publiclySold:false`)*
| Claim | Verdict | Truth |
|---|:--:|---|
| $1/mo | ❌ | compute $3 (`amountCents:300`) |
| 500 atoms | ❌ | 200 |
| 100 bootstraps/mo | ❌ | 30 |
| 50 MB storage | ❌ | 10 MB |
| 1 substrate · $2 cap | ✅ | match |
| Merkle · Markov · MCP | ✅ | — |
| Community support | ⚠️ | policy |
**Score: 2 ✅ / 4 ❌ / 1 ⚠️** — worst tier, but hidden from sale. Recommend aligning `tiers.ts` to compute (or leave, since unsold).

### Starter — $5, shared
| Claim | Verdict | Truth |
|---|:--:|---|
| $5/mo | ✅ | 500¢ |
| 1,000 atoms | ✅ (🔶 soft) | limit correct; overage billable |
| 200 bootstraps/mo | ✅ | — |
| 100 MB · 1 substrate · $9 cap | ✅ | — |
| Merkle · Markov · MCP · KG edges | ✅ | — |
| Community support | ⚠️ | policy |
| **30-day money-back guarantee** | ❌ | Terms = **7-day** |
**Score: 8 ✅ / 1 ❌ / 1 ⚠️ (+soft-limit caveat).** Fix money-back; add overage note.

### Solo — `indie`, $9, shared
| Claim | Verdict | Truth |
|---|:--:|---|
| $9/mo | ✅ | 900¢ |
| 10,000 atoms | ✅ (🔶 soft) | — |
| 1,000 bootstraps/mo · 500 MB · 2 substrates · $15 cap | ✅ | — |
| Merkle · Markov · MCP | ✅ | — |
| (KG edges not listed) | 🔶 | available but omitted — understated |
| Email support (48 hr SLA) | ⚠️ | policy |
**Score: 7 ✅ / 0 ❌ / 1 ⚠️ (+soft-limit; KG omission).** Cleanest paid tier; add KG edges + overage note.

### Professional — `pro`, $29, dedicated · "Most Popular"
| Claim | Verdict | Truth |
|---|:--:|---|
| $29/mo | ✅ | 2900¢ |
| 100,000 atoms | ✅ (🔶 soft) | — |
| 10,000 bootstraps/mo · 2 GB · 3 substrates · $50 cap | ✅ | — |
| Merkle · Markov · MCP · KG edges | ✅ | — |
| Dedicated hosting | ✅ | `hostingModel:dedicated` |
| Priority support (24 hr SLA) | ⚠️ | policy |
| *(upgrade provisioning fee not shown)* | 🔶 | ⅓ first period on upgrade to Pro (Terms §5.4) |
**Score: 9 ✅ / 0 ❌ / 1 ⚠️.** Add overage + upgrade-fee note.

### Team — $79, dedicated
| Claim | Verdict | Truth |
|---|:--:|---|
| $79/mo | ✅ | 7900¢ |
| 500,000 atoms | ✅ (🔶 soft) | — |
| **Unlimited bootstraps** | ❌ | capped **20,000/mo** (667/day) |
| 10 GB · 5 substrates · $120 cap | ✅ | — |
| Merkle · Markov · MCP · KG edges · dedicated | ✅ | — |
| Dedicated support | ⚠️ | policy |
| **Custom domain** | ⚠️❌ | **no custom-domain feature found in compute** — unsubstantiated |
**Score: 8 ✅ / 1 ❌ / 2 ⚠️.** Fix "Unlimited" → 20,000/mo; verify/remove "Custom domain".

### Enterprise Cloud ($299) & Self-Hosted ($499) — contact-sales, not in billing
All claims (unlimited atoms/bootstraps/storage, 99.9% SLA, SSO/SAML, SOC 2, source license, architecture review) are **⚠️ unverifiable in code** — sales-negotiated, no code backing. Not false, but nothing here is enforced by the platform. Ensure sales can actually deliver each before publishing.

---

## Must-fix before the pricing page ships (ranked)

1. **❌ "30-day money-back guarantee" → "7-day"** (site-wide: homepage final CTA + pricing preview, `tiers.ts` Starter feature, any FAQ). Advertising a 30-day guarantee the Terms don't grant is an advertising-law liability.
2. **❌ Team "Unlimited bootstraps" → "20,000/month (~667/day)"** (`tiers.ts` + copy).
3. **❌ Hosting: scope "dedicated" to Pro/Team**; Starter/Solo = isolated shared. (Homepage done; pricing page + `layout.tsx` JSON-LD still to do.)
4. **⚠️ Team "Custom domain"** — confirm a real capability exists or remove it.
5. **🔶 Disclose the overage model** ("included atoms, then $0.001/atom to your $Y cap") so atom counts aren't read as hard walls.
6. **🔶 Disclose the dedicated-upgrade provisioning fee** on pricing (already in Terms §5.4).
7. **🔶 Solo KG-edges omission** — add it (it's included) for consistency.
8. **Basic tier drift** (unsold) — align `tiers.ts` to compute or leave documented.

**Tally (publicly-sold tiers, verifiable claims):** Starter/Solo/Pro/Team = 32 ✅ · 2 ❌ (money-back, Team unlimited) · 1 ⚠️❌ (custom domain) · plus the cross-cutting hosting ❌ and soft-limit 🔶 that touch multiple tiers.
