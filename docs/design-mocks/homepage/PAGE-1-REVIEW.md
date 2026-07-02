# Page 1 — Homepage · Mock Review

**Reviewed:** 2026-07-01 · **Mock:** `docs/design-mocks/homepage/Homepage.dc.html` (direction 1a)
**Target:** `src/app/page.tsx` (+ `src/components/landing/HeroAnimatedSequence.tsx`, `HeroSceneWrapper.tsx`)
**Status:** Review complete — **awaiting owner sign-off before any code.**

---

## Verdict

The mock is a clean, faithful redesign that closes the review's positioning findings and maps cleanly onto the existing token/type system. It's implementable in `page.tsx` with **no new components or fonts**. Before I write code there are **7 decisions** to confirm — mostly factual-accuracy and copy-source questions, plus two small test updates. None are blockers; they're the things I don't want to guess on.

---

## Findings closed by this mock

| ID | Sev | Finding | How the mock closes it | Verified |
|----|-----|---------|------------------------|----------|
| P1 | High | Sells mechanism, not outcome | Hero "Your AI remembers everything now. / And it can prove it." + benefit-first capability headings ("It never forgets", "It's warm before you ask", …), math demoted to each card's mono footer | ✓ |
| P2 | High | Claims outrun a beta product | Honest proof band carries "measured on our own production substrate — not a customer benchmark"; 821 figure reframed as "we run our own company on it" | ✓ (see D5) |
| A1 | High | Differentiator buried in a doc | New **Agent-operable** section ("Operable by the humans and the agents", every action twice / discoverable / accessible-enforced) | ✓ |
| P3 | Med | Social proof points only at yourself | Replaced by **Verify** section — "Don't take our word for it. Take the proof." → `Verify a snapshot yourself` | ✓ |
| P4 | Med | Six tiers, no anchor | Pricing preview = 4 cards, **Professional flagged "Most popular"**, enterprise collapsed to one "Talk to us" row | ✓ (full fix on Page 2) |
| D2 | Med | Every section same volume | Verify + hero given dominance; capabilities recede to a quiet 2×2 | ✓ |
| D3 | Low | Brand colours hand-typed | Tokenization is an implementation rule (see token map) | at impl |
| S1 | Low | Dead `keywords` meta | Delete `metadata.keywords` (`page.tsx:14`) — folds in here | at impl |

## Token mapping — mock hex → existing `@theme` (confirmed against `globals.css`)

Confirmed present: `brand-400 #36aaf5`, `brand-500 #0c8ee6`, `surface-950 #020617`, `surface-900 #0f172a`, `surface-800 #1e293b`, `surface-400 #94a3b8`, `surface-600 #475569`, `amber-500 #f59e0b`, `cyan-400 #22d3ee`. Mono/Display/Body fonts all defined.

**Token-coverage check (not a blocker):** the mock (and the *current* page) also use `surface-500`, `surface-700`, `surface-300`, `surface-200`, and an emerald scale (`#34d399`/`#10b981`) that are **not** in the `@theme` block I read. The current page ships these classes today, so they either resolve via Tailwind defaults or are defined elsewhere in `globals.css`. I'll confirm during impl and, if any are missing, add the token rather than hardcode hex (this is exactly the D3 fix).

## Accessibility / testid preservation (CI-enforced — `scripts/check-testids.mjs`)

These must survive the rewrite or the build/e2e breaks:

- `landing-hero-cta-primary` — hero primary. Mock copy → "Get your instance — $5/mo", target `/pricing`. **Keep testid.**
- `landing-hero-cta-secondary` — hero secondary. Mock copy → "Watch it verify itself →". Target changes from `/knowledge` → **`/verify`** (confirm, D3 below). e2e only asserts *visibility*, so safe if the testid stays.
- `landing-section-features` — must stay on the capabilities section even though it's retitled "What your AI gets".
- New interactive elements (Verify CTA, "Talk to us", pricing-preview cards) each need a **new** `landing-*` testid + verb-first `aria-label`. I'll **not** reuse the `pricing-card-*-cta` testids — those are owned by the real `/pricing` page and reusing them would create duplicate-testid collisions.

## Do-NOT-regress (verified present, must stay)

`SiteNavbar` / `SiteFooter` reused (mock's own nav/footer are standalone-only). All three JSON-LD blocks (`landingJsonLd`, `homeFaqJsonLd`, `homeBreadcrumbJsonLd`) preserved — **and kept consistent** with the new pricing copy. `getAggregateOfferData()` / `getHomeMetaDescription()` untouched. `layout.tsx` metadata/JSON-LD untouched except the contact-email quick win (separate task). CSRF, checkout, a11y guards out of scope here.

---

## Decisions needed before I write code

**D1 — Storage-engine wording (P2 accuracy).** The mock says "**LevelDB** sharded across four independent Merkle trees"; the current features copy agrees, but the page's own JSON-LD and our compute stack describe **PostgreSQL** per-tenant substrates. Shipping "LevelDB" may be factually wrong — the exact kind of unreproducible claim P2 warns about. Which is correct for the customer-facing substrate — PostgreSQL, LevelDB, or both (Postgres store + Merkle/LevelDB index)? I'll use the approved wording verbatim.

**D2 — Instance URL + key format in the setup code card.** The mock shows `https://mmpm.dev/you/mcp` and `Bearer mmk_live_••••••`. The real domain in the repo is `mmpm.co.nz/mcp`. What's the real per-instance URL shape (subdomain? path?) and the real key prefix? I don't want a fake endpoint in the hero.

**D3 — Hero secondary CTA target.** "Watch it verify itself →" — point it at `/verify` (matches the copy) or `/docs`? Currently it's `/knowledge`.

**D4 — Hero background.** Keep the existing R3F/`HeroSceneWrapper` scene behind the new static headline, or drop it for the gradient-only hero the mock shows (review D1: pick one, ensure reduced-motion/low-power fallback — the single biggest mobile-perf lever)? My recommendation: **keep R3F but confirm the reduced-motion fallback**, unless you want the perf win of dropping it.

**D5 — "Basic" $1 tier.** `tiers.ts` has a **Basic $1 / 500-atom** tier the mock's pricing preview omits (it shows Starter → Team). Is Basic being retired, hidden from the homepage, or should it appear? This must stay consistent with Page 2 (Pricing) and the FAQ JSON-LD.

**D6 — Two small test updates (expected, flagging for transparency).** `HeroAnimatedSequence.test.tsx` asserts current hero copy; the pricing-preview + Verify sections need new tests. These are in-scope "tests for every change" — noting so the diff isn't a surprise.

**D7 — BetaBanner tension (P2, out of this page's scope).** The review paired the honest-metrics fix with the site-wide `BetaBanner` + waitlist forms still shipping. Those live in `layout.tsx`/pricing, not `page.tsx`. Flagging so we consciously decide whether the homepage's confident copy and a site-wide "beta" banner should coexist — handle in a later task, not here.

---

## On sign-off, implementation plan (for reference — not started)

Rewrite `page.tsx` sections top→bottom to match the mock (Hero + proof band → Setup → Capabilities 2×2 → Agent-operable → Verify → Pricing preview → Final CTA), update `HeroAnimatedSequence` copy + CTA targets (testids preserved), delete `metadata.keywords`, route repeated hex through `@theme` tokens, add `landing-*` testids + aria to new interactive elements, keep all JSON-LD consistent with new pricing. Then: unit tests (hero copy, pricing-preview render, Verify CTA) + e2e visibility, `check-testids`, full preflight green. No git/env/DB actions — I'll hand you any commands.
