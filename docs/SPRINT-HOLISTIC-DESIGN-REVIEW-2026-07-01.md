# Holistic Design Review Sprint

**Date:** 2026-07-01
**Author:** Claude (plan + scaffolding this session — no page code shipped yet)
**Status:** Drafted, in progress. Page-by-page, gated on owner sign-off.
**Repos affected:** `mmpm-website` (primary). `parametric-memory-compute` only if the Terms/downgrade decision needs backend work (flagged, not assumed).
**Source of truth:** `docs/design-mocks/` (mocks) + the Holistic Review (`Holistic Review.dc.html`, 19 findings across 6 dimensions, reviewed Jul 1 2026).

---

## TL;DR

The Holistic Review's verdict: *the engineering is ahead of the story.* The code, security, SEO and accessibility are strong; the marketing sells the machinery instead of the outcome, and states beta metrics as proven fact. This sprint fixes the **story and UX findings page by page**, keeping the strong parts untouched.

We work **one page at a time** in a fixed loop:

1. **Mock** — an HTML prototype of the redesigned page (design reference, not production code).
2. **Review** — a written review of the mock against the current codebase (token mapping, copy, structure, testids/aria, which findings it closes).
3. **Pause** — stop for owner sign-off. **No React or tests are written until the mock + review are approved.**
4. **Implement** — recreate the approved mock in the codebase (Next.js 16 App Router + Tailwind v4, dark theme), reusing existing components and tokens. Tests for every change. Preflight green.

Scope is the **review-flagged pages only** — Homepage, Pricing, Signup, Terms — plus two site-wide quick wins. Pages the review did not flag (about, blog, docs, faq, verify, dashboard, etc.) are out of scope for this sprint.

The homepage mock already exists and its direction is chosen (**1a**), so Page 1 starts at the review step.

---

## Locked decisions

Lock these before implementation. If a later question contradicts one, escalate.

| # | Decision | Lock |
|---|---|---|
| D1 | Scope is the four review-flagged pages (Homepage, Pricing, Signup, Terms) + site-wide SEO/contact quick wins. No other pages this sprint. | locked |
| D2 | Per-page loop is **mock → review → pause for sign-off → implement + tests**. No page's code is written before its mock + review are approved. | locked |
| D3 | Mocks are **design references**, not production code to paste. Every page is recreated in the existing design system — no new tokens, fonts, or components introduced. | locked |
| D4 | Mocks' inline hex values map to existing `globals.css` `@theme` tokens (see token map below). We route through tokens, not hardcoded hex (closes D3 in the review). | locked |
| D5 | The review's **praise items (K1–K5) are do-not-regress guardrails**, not debt. Checkout/billing, the CSRF model, AEO/structured data, the type/colour system, and the CI accessibility guards are left intact. | locked |
| D6 | Tests are written for **every** change (unit + e2e where the page has interactive elements). `data-testid` + `aria` conventions from `docs/DUAL-ACCESSIBILITY.md` are preserved on every interactive element. | locked |
| D7 | `git` operations, file deletion, `.env` edits, and direct DB ops are **human-only**. Claude hands over exact commands with reasons; the owner runs them. | locked |
| D8 | Metrics stay honestly framed — every stat carries "measured on our own production substrate — not a customer benchmark" (closes P2). No un-reproducible hard numbers presented as customer benchmarks. | locked |

---

## Pages & findings map

Severity is the review's own (High / Medium / Low). Effort is a rough build estimate.

### Page 1 — Homepage · `src/app/page.tsx`  · mock READY
The homepage handoff (`docs/design-mocks/homepage/`, direction 1a) is the deliverable and the verbatim copy source. It rewrites the page benefit-first and closes:

- **P1 (High)** Sell the outcome, not the mechanism — hero + capabilities rewritten benefit-first; crypto demoted to a proof/credibility layer.
- **P2 (High)** Honest claims — every metric carries the "our own production substrate" qualifier.
- **A1 (High)** Surface the differentiator — new **Agent-operable** section makes dual human/AI accessibility a first-class pillar.
- **P3 (Med)** Self-referential proof — replaced by the **Verify** section ("don't take our word for it, take the proof").
- **P4 (Med)** Pricing preview shows 4 tiers, Professional flagged "Most popular", enterprise collapsed to "Talk to us" (full fix lands on Page 2).
- **D2 (Med)** Section rhythm — give one proof point dominance; let the rest recede.
- **D3 (Low)** Tokenize brand colours — route repeated hex through `@theme`.
- **S1 (Low)** Delete the dead `metadata.keywords` array (`src/app/page.tsx:14`).

**Do NOT touch** `layout.tsx` metadata/JSON-LD except the contact-email quick win. **Do NOT regress** the R3F/video hero fallback decision, checkout flows, CSRF, structured data, or a11y guards.

### Page 2 — Pricing · `src/app/pricing/page.tsx` · `src/config/tiers.ts`
- **P4 (Med)** Six tiers, no anchor. Anchor **Professional** as "Most popular"; collapse Enterprise Cloud + Self-Hosted into a single "Talk to us" row. Keep the homepage pricing preview and this page consistent.
- Guardrail: do not regress the production-grade checkout/billing edge cases (K1) — this is copy + layout on the pricing surface, not a billing change.

### Page 3 — Signup · `src/app/signup/SignupClient.tsx`
- **U2 (Med)** Signup asks for a tier before value is proven (`signup-tier-select` required radio group). Default to Starter (or most-popular) and let the user change it in-app. Every required decision before first value is a drop-off point.

### Page 4 — Terms · `src/app/terms`
- **U1 (Med)** "No downgrades" (Terms 5.5) punishes retention — downgrades are prohibited and enforced in CI via the `terms-no-downgrades` clause guard. Options: allow a downgrade at period end, or at minimum surface the constraint **before** purchase, not in section 5.5.
- **NEEDS-DECISION:** this is more than page copy. Allowing downgrades touches the terms text, the CI clause guard, and likely `parametric-memory-compute` billing. The mock + review will lay out the options; the owner decides the policy before any cross-repo work. Cross-references the existing "migration/tier-change only from `/admin/[slug]`" decision.

### Site-wide quick wins (no mock)
- **S1 (Low)** Delete `metadata.keywords` in `src/app/page.tsx` — folds into Page 1 implementation.
- **X2 (Low)** `SUPPORT_EMAIL` at `src/config/site.ts:31` is a personal `gmail.com`, wired into the Organization JSON-LD (sales + technical support contactPoint) and legal pages. Replace with a domain address (`support@` / `sales@`). **Owner picks the address.** A domain address reads far more trustworthy in structured data and to enterprise buyers.

---

## Out of scope (flagged, handed to owner)

These came out of the review but are not page-design work:

- **X1 (Med, Security)** Verify production injects **live** Stripe keys (`pk_live_` + live secret), not `pk_test_`. A test key in prod means checkout renders but takes no real money. This is an env/deploy check — **human-only** per ground rules (`.env` files). Confirm and rotate any credential that has sat in a shared location.
- **X3 (Low, Security)** Route protection is cookie-presence only by design (`src/proxy.ts`); real validation is per-page. Verify an **expired-but-present** cookie doesn't flash a protected shell before the page-level bounce. QA check, not a design change.

---

## Do NOT regress — the review's strengths (K1–K5)

Leave these alone; they are assets, not debt:

- **K1** Checkout & billing coverage is production-grade (embedded Stripe + hosted fallback, adblock probing, cap-reached card, proration previews, cancel/reactivate windows, refund previews, TOTP 2FA — all tested). *"The edge-case handling here is the moat, not the hero animation."*
- **K2** The CSRF model is correct (`src/lib/csrf.ts`) — Origin/Referer + SameSite=lax, mutating-methods-only, the `x-mmpm-internal` bypass deliberately removed.
- **K3** AEO/structured data ahead of most funded startups (`layout.tsx`, `page.tsx`, `public/llms.txt`, `actions.json`).
- **K4** Restrained, cohesive type/colour system (Syne / Outfit / JetBrains Mono; dark slate + one brand blue).
- **K5** Accessibility enforced in CI (semantic-HTML mandate, `maximumScale` 5 preserves pinch-zoom, axe-core name gates, `scripts/check-testids.mjs` fails the build on unlabeled interactive elements).

---

## Design tokens (map to existing system — do not invent)

From the homepage handoff; applies to every page's mock → code translation. Map to `src/app/globals.css` `@theme`:

- Ground `#030712` → `surface-950` / body bg. Panels `#0a1220` / `rgba(11,18,32,.5–.6)` → `surface-900`.
- Primary blue (buttons) `#0c8ee6` → `brand-500`. Bright accent / eyebrows `#38bdf8` (≈ `#36aaf5`) → `brand-400`.
- Accents: cyan `#22d3ee`, amber `#f59e0b`, emerald `#34d399 / #10b981` — already in use.
- Text: `#f8fafc` headings, `#e2e8f0`/`#cbd5e1` body, `#94a3b8` muted, `#64748b`/`#475569` faint.
- Borders: `rgba(148,163,184,0.08–0.16)`.
- Type: **Syne** (display, 700–800, ls ≈ -0.03em), **Outfit** (body, 300–400), **JetBrains Mono** (eyebrows/labels/stats, uppercase, ls 0.12–0.28em) — all already loaded in `layout.tsx`.
- Radii: cards 16–24px, buttons 12–13px, pills 999px. Button glow `0 0 36px rgba(12,142,230,0.4)`.

---

## Definition of done (per page)

1. Mock built and placed in `docs/design-mocks/<page>/`.
2. Written review committed to the sprint thread (findings closed, token mapping, testid/aria check).
3. **Owner sign-off** on mock + review.
4. Page recreated in the codebase using existing components/tokens; findings closed; copy verbatim from the mock.
5. `data-testid` + `aria` preserved on every interactive element (`docs/DUAL-ACCESSIBILITY.md`).
6. Tests written and passing — unit for logic, e2e/Playwright for interactive pages.
7. Preflight green (lint, typecheck, unit, e2e, `check-testids`).
8. No regression to K1–K5.
9. Owner reviews the code; owner runs any `git`/env/DB commands.

---

## Suggested order

Page 1 Homepage (mock ready) → Page 2 Pricing → Page 3 Signup → Page 4 Terms → site-wide quick wins (fold keywords into Page 1; contact email standalone) → sprint-close verification.

Rationale: homepage first because its mock is ready and it sets the visual/positioning language the other pages inherit; pricing second because the homepage preview must stay consistent with the full pricing page; Terms last because it carries a policy decision that may reach into `compute`.
