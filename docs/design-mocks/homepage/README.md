# Handoff: Homepage redesign (positioning rewrite)

## Overview
A redesign of the marketing homepage for Parametric Memory. It keeps the existing
visual system but fixes the core positioning problem from the review: the page
sold the *mechanism* (Merkle proofs, RFC 6962, Markov chains) instead of the
*outcome*. The new page leads with what the user gets and demotes the cryptography
to a proof/credibility layer. Metrics are reframed honestly (stated as measured on
our own substrate, not a customer benchmark).

## About the design files
The `.dc.html` files in this folder are **design references** — HTML prototypes that
show the intended look, copy, and structure. They are **not** production code to paste
in. The task is to recreate them in the existing codebase (**Next.js 16 App Router +
Tailwind v4**, dark theme) using its established components and tokens.

- `Homepage.dc.html` — **the deliverable.** Full redesigned homepage, all sections. Source of truth for exact copy.
- `Homepage Hero.dc.html` — the three hero directions explored. We chose **1a** (the one now in `Homepage.dc.html`). Kept for context.
- `Holistic Review.dc.html` — the full review these changes came from (findings + rationale). Reference only.

## Fidelity
**High-fidelity.** Final copy, type, spacing, and colors. Recreate pixel-close using
the codebase's existing design system — don't introduce new tokens or fonts.

## Target file
Primary: **`src/app/page.tsx`** (this is a full rewrite of that page's sections).
Fonts, tokens, `SiteNavbar`, and `SiteFooter` already exist — reuse them; the mock
draws its own nav/footer only so it renders standalone. Do **not** touch `layout.tsx`
metadata/JSON-LD except the small SEO item noted below.

## What changed, mapped to review findings
- **P1 (sell the outcome):** Hero + capabilities rewritten benefit-first; math moved to a sub-line / footnote per card.
- **P2 (honest claims):** Every metric now carries "measured on our own production substrate — not a customer benchmark." Keep this qualifier.
- **P3 (self-referential proof):** The old "we trust it with ours / 821 atoms" block is replaced by the **Verify** section — "Don't take our word for it, take the proof" (actionable trust). 821 figure kept but framed honestly.
- **P4 (six tiers, no anchor):** Pricing preview shows 4 tiers with **Professional flagged "Most popular"**; the two enterprise tiers collapse into one "Talk to us" row.
- **A1 (buried differentiator):** New **Agent-operable** section surfaces the dual human/AI accessibility story as a product pillar.
- **S1 (keywords meta):** While in `page.tsx`, delete the `metadata.keywords` array (dead weight) — unrelated to layout but cheap to do here.

## Sections (top → bottom in `Homepage.dc.html`)
Each section carries a `data-screen-label` for easy location.

1. **Hero** — eyebrow, two-line headline ("Your AI remembers everything now. / And it can prove it."), sub, primary CTA `Get your instance — $5/mo` + text link, then a full-width **honest proof band** (4 metrics + qualifier line).
2. **Setup** — two-column: steps 01–03 (left) + a `claude_desktop_config.json` code card (right). Sells sub-minute onboarding.
3. **Capabilities** — 2×2 grid, benefit-first headings ("It never forgets", "It's warm before you ask", "It answers instantly", "You plug in, you don't integrate"); mechanism + honest stat as the small mono footer of each card.
4. **Agent-operable** — panel with a lead paragraph + 3 supporting cards (every action twice / discoverable / accessibility enforced in CI).
5. **Verify** — centered; replaces old social proof. Primary CTA `Verify a snapshot yourself`.
6. **Pricing** — 4 cards (Starter/Solo/Professional*/Team), Professional is the highlighted "Most popular" tier; dashed "Enterprise & self-hosted → Talk to us" row; USD + guarantee note.
7. **Final CTA** — outcome close, guarantee microcopy.

Use `Homepage.dc.html` for the **verbatim copy** of every heading, paragraph, and stat.

## Design tokens (map to existing system — do not invent)
The mock's inline hex values correspond to the codebase's existing Tailwind theme
(`src/app/globals.css` `@theme`). Map them, don't hardcode:
- Ground `#030712` → `surface-950` / body bg. Panels `#0a1220` / `rgba(11,18,32,.5–.6)` → `surface-900`.
- Primary blue (buttons) `#0c8ee6` → `brand-500`. Bright accent / eyebrows `#38bdf8` (≈ existing `#36aaf5`) → `brand-400`.
- Accents: cyan `#22d3ee`, amber `#f59e0b`, emerald `#34d399/#10b981` — already in use.
- Text: `#f8fafc` headings, `#e2e8f0` / `#cbd5e1` body, `#94a3b8` muted, `#64748b`/`#475569` faint.
- Borders: `rgba(148,163,184,0.08–0.16)`.
- Type: **Syne** (display / headings, 700–800, letter-spacing ≈ -0.03em), **Outfit** (body, 300–400), **JetBrains Mono** (eyebrows/labels/stats, uppercase, letter-spacing 0.12–0.28em) — all already loaded in `layout.tsx`.
- Radii: cards 16–24px, buttons 12–13px, pills 999px. Button glow: `0 0 36px rgba(12,142,230,0.4)`.

## Interactions & responsive
- Static marketing page. CTAs are `<Link>`s: hero/pricing/final → `/pricing` (checkout); "Verify…" → `/verify`; "Read the docs"/"See how it works" → `/docs`.
- Hover states: reuse existing card hover (border → `brand-500/30`, subtle bg lift) and button hover (`brand-400` + stronger glow) from the current `page.tsx`.
- Responsive: all multi-column grids (`setup`, `capabilities` 2×2, `pricing` 4-up, agent-operable 3-up) collapse to single column below `md`. Hero headline steps down (~64px → ~40px) on mobile. Keep pinch-zoom (don't set `user-scalable=no`).
- Keep all interactive elements' `data-testid` + `aria` conventions from `docs/DUAL-ACCESSIBILITY.md` (e.g. `landing-hero-cta-primary`, `pricing-card-*-cta`).

## Do NOT regress (strengths from the review)
Leave these alone — they're assets, not debt: the checkout/billing flows, the CSRF
model (`src/lib/csrf.ts`), the structured-data/AEO in `layout.tsx`, the CI accessibility
guards. This redesign is copy + layout on `page.tsx` only.

## Assets
No new assets. Hero uses a CSS radial-gradient glow (no image needed); the existing
R3F/video hero can stay behind the text or be dropped — the new hero reads fine on the
gradient alone. The Setup code card is plain styled `<pre>`, no image.

## Files in this bundle
- `Homepage.dc.html` — full redesigned page (open in a browser to view; **exact copy source**).
- `Homepage Hero.dc.html` — hero direction explorations (chosen: 1a).
- `Holistic Review.dc.html` — the review + findings behind these changes.
