# Mobile Experience Baseline Audit — 2026-04-24

> **Purpose:** Capture the current-state mobile experience of parametric-memory.dev
> before executing the remainder of Sprint 2026-W18 (Tracks M, A, S). Produced
> as Phase 1 of that sprint, triggered by visible navbar and pricing-table
> breakage on mobile.
>
> **Author:** Cowork session, 2026-04-24.
> **Approach:** Static code audit against `SPRINT-MOBILE-FEEDBACK.md` item list.
> Playwright + Lighthouse runtime audits are queued but require local install
> (see "Runtime verification — next steps" below).
> **Verdict:** 7 of 22 sprint items already landed before this session. 15
> remain. The user-visible breakage in the screenshots maps to three specific
> items, two of which are P0/P1.

---

## Executive summary

The mobile experience is broken in three specific, reproducible ways that a
typical mobile visitor will hit in the first 30 seconds:

1. **The navbar overflows the viewport** on any device narrower than about
   `640px`. The logo, four centre-positioned nav links, and the auth button
   collectively demand ~450px of horizontal space but the viewport is 390px
   or less. The centre-positioned absolute block slides under the logo on the
   left and the auth button on the right, producing the "PMEM / Views /
   Sign In" overlap visible in the provided screenshots. **Sprint item M5 is
   the fix** (mobile hamburger drawer). Status: not landed.

2. **The pricing comparison table is clipped off-screen** on mobile. The
   outer `<div>` does set `overflow-x-auto`, so horizontal scroll technically
   works, but there is no visual affordance — no fade gradient on the right
   edge, no swipe hint — so users do not discover it. The competitor columns
   (Mem0, Zep) are invisible without discovery behaviour that mobile users do
   not perform on first-visit sales pages. **This is not an existing sprint
   item**; I have added it as M5b.

3. **Three forms (`WaitlistForm`, `CapacityInquiryForm`) will trigger iOS
   Safari's zoom-on-focus behaviour** because their inputs use `text-sm`
   (14px), which is below iOS's 16px threshold. Each time a user taps an
   email or text field, the viewport scales up and does not reliably scale
   back, leaving the page permanently zoomed until manually pinched out.
   **Sprint item M4 is the fix.** Status: not landed.

A fourth issue worth flagging: **the pricing-table `sticky left-0` first
column has no `z-index`**, so while it correctly stays put during horizontal
scroll, it can end up visually behind siblings on specific render paths. Not
a sprint item but easy to fix alongside M5b.

## Status of the 22 sprint items, verified against code

| ID  | Item                                                | Status        | Evidence                                                                                |
| --- | --------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------- |
| M1  | Viewport + theme meta on root layout                | Done          | `src/app/layout.tsx` — `export const viewport: Viewport` present with sprint comment    |
| M2  | Replace `h-screen` with `min-h-[100dvh]`            | Done          | `KnowledgeClient.tsx:31,55` and `VisualiseClient.tsx:17,40` use `min-h-[100dvh] min-h-screen` |
| M3  | Responsive SidePanel width                          | Done          | `SidePanel.tsx:149` — `w-[min(88vw,320px)]` with sprint M3 comment                      |
| M4  | Input font-size ≥16px to prevent iOS zoom           | **Not done**  | `WaitlistForm.tsx:79` uses `text-sm`. `CapacityInquiryForm.tsx:150,158,168,178` all use `text-sm`. |
| M5  | Mobile hamburger drawer                             | **Not done**  | `SiteNavbar.tsx` standard variant has no hamburger; centre nav is absolute-positioned and always rendered. |
| M5b | Responsive pricing comparison table (new item)      | **Not done**  | `src/app/pricing/page.tsx:377` — `overflow-x-auto` only, no scroll affordance           |
| M6  | Tap-target + typography batch                       | **Not done**  | Several CTAs inspected use `py-1.5` giving ~30px height. Need pass with ≥40px minimum. |
| M7  | Decorative blob overflow guard                      | Done          | `SignupClient.tsx:478`, `AdminClient.tsx:422`, `DashboardClient.tsx:617` — all have `overflow-x-hidden` |
| M8  | Lighthouse CI regression gate                       | **Not done**  | No `.github/workflows/lighthouse.yml`                                                    |
| A1  | testid + aria naming convention                     | Done          | `docs/DUAL-ACCESSIBILITY.md` (14KB) exists with four rules, testid registry             |
| A2  | data-testid sweep                                   | Partial       | SSO buttons and CapacityInquiryForm have testids; navbar, FAQAccordion, footer, landing CTAs lack them |
| A3  | Accessible-name audit                               | **Not done**  | `SiteNavbar` `<img>` logomark uses alt correctly, but icon-only buttons (e.g. FAQ chevron) have no aria-label |
| A4  | Action manifest at `/.well-known/actions.json`      | **Not done**  | No `src/app/.well-known/` directory                                                      |
| A5  | Action-schema JSON-LD on public pages               | Partial       | `layout.tsx` has Organization + WebApplication + SoftwareApplication site-wide. No page-level RegisterAction / LoginAction / SubscribeAction. |
| A6  | CI guard: testid + manifest integrity               | **Not done**  | No `scripts/check-testids.mjs` or `scripts/check-actions-manifest.mjs`                  |
| A7  | `llms.txt` upgrade                                  | Needs review  | `public/llms.txt` exists (12KB, 147 lines). Needs structured section check vs llmstxt.org spec. |
| S1  | Mobile SSO smoke (WebKit + Chromium)                | **Not done**  | No `tests/e2e/` directory. Playwright not installed.                                     |
| S2  | SSO button tap target + labels                      | Partial       | `LoginClient.tsx:106` — buttons have `data-testid="oauth-button-${id}"` and icon. Height is `py-2.5 text-sm` ≈ 38px — **below 48px target**. Button text is "Join with Google" / "Join with GitHub" — inconsistent with sprint-doc "Sign in with Google". |
| S3  | OAuth callback iOS-Safari cookie resilience         | Needs verify  | Code path exists at `src/lib/auth/providers/google.ts` etc. Cookie flags not verified yet. |
| S4  | Mobile-Googlebot render check                       | **Not done**  | Manual task (Search Console URL Inspection).                                             |

Ratio: **7 done, 2 partial, 2 needs-review, 11 not-done**. The three most
visible breakages (M4, M5, M5b) are all in the not-done set.

## Deep dives on the three user-facing breakages

### Navbar overlap (M5)

`src/components/ui/SiteNavbar.tsx` renders the "standard" variant as a
three-column layout. The column assignments in Tailwind are:

- **Left** — the `<Link>` for the brand, `flex shrink-0`, about `26px + 70px
  text = ~96px` wide on mobile (PMEM label used below `sm:`, full text above).
- **Centre** — a `<div>` positioned `absolute top-1/2 left-1/2 -translate-x-1/2
  -translate-y-1/2` containing Docs, About, Pricing, and the Knowledge pill.
  These widths add up to roughly 240-300px.
- **Right** — the auth `<Link>` inside a `ml-auto shrink-0` wrapper, about
  `80-100px`.

On a 390px iPhone viewport: `96 + 280 + 90 = 466px` of content competes for
390px of space. The centre block is absolutely positioned so it does not push
the other two out; instead, it just draws over them. That is exactly the
overlap shown in the third screenshot.

The fix is item **M5** in the sprint plan: below `md`, hide the centre nav
links and render a hamburger button on the right that opens a drawer
containing all the links. The logo stays on the left, the auth button moves
into the drawer (or becomes a second icon-button in the top bar). Body-scroll
lock while open, close on route change, `aria-expanded` toggles, testids
`nav-hamburger` and `nav-drawer` as pre-registered in
`docs/DUAL-ACCESSIBILITY.md`.

### Pricing-table overflow (M5b, new item)

`src/app/pricing/page.tsx:377` renders the comparison:

```tsx
<div className="border-surface-200/10 bg-surface-900/30 overflow-x-auto rounded-xl border backdrop-blur-sm">
  <table className="w-full text-sm">
    <thead>
      <tr>
        <th className="bg-surface-950/80 sticky left-0 ..."> ... Feature ... </th>
        <th ...>Parametric Memory</th>
        <th ...>Mem0</th>
        <th ...>Zep</th>
      </tr>
    </thead>
    ...
```

Four columns, each about 180px after padding, plus the sticky first column.
Total minimum width roughly 720px. The `overflow-x-auto` works technically;
what fails is discovery. Users on a sales page do not horizontally swipe a
table unless the affordance is explicit.

Three candidate fixes, ordered by implementation cost:

- **Option A — cheapest.** Add a `::after` pseudo-element on the outer div
  with a right-edge gradient that fades the clipped content, plus a small
  "← swipe →" chip below the table on `<md`. Ships in an hour. Accessible
  but still not ideal on very small screens.
- **Option B — moderate.** Swap to a stacked-card layout below `md`: one card
  per plan (Parametric / Mem0 / Zep), with feature rows inside each card.
  Eight or so features × three cards = three vertical scrolls, but every
  value is visible without horizontal swipe. Half-day of work.
- **Option C — best UX.** A segmented control "Parametric | Mem0 | Zep" on
  `<md`, tapping each shows that one column's feature list. One vertical
  scroll, easy to compare. A day of work including the animation polish.

My recommendation is **Option B**. It hits the "first class mobile experience"
bar you set without requiring a component system rewrite, and it has an
accessible fallback if JS disables (Option C requires state).

### iOS zoom-on-focus (M4)

Two forms affect the public sales path:

- `src/components/landing/WaitlistForm.tsx:79` — the waitlist capture on the
  landing page. Input uses `text-sm` (14px).
- `src/app/pricing/CapacityInquiryForm.tsx:150,158,168,178` — the pricing-page
  capacity-inquiry form. Three inputs and one textarea, all using `text-sm`.

iOS Safari scales the viewport if a form field receives focus and its computed
`font-size` is below 16px. After the zoom, scroll position often does not
return cleanly, and without `user-scalable=no` in the viewport meta (which
we correctly do not set — that is a WCAG failure), the user ends up stuck
zoomed until they manually pinch out.

Fix: change `text-sm` to `text-base sm:text-sm` on the input itself — 16px on
phones, 14px on desktop. Five-minute change across five fields. Acceptance:
Playwright focuses each input on WebKit-mobile and asserts
`window.visualViewport.scale === 1`.

## Other findings not in the original sprint

These did not make the 22-item sprint but surfaced during this audit and
should be noted for the next one.

1. **SSO button height is 38px, not 48px.** `LoginClient.tsx:106` — `py-2.5 text-sm`
   gives the OAuth buttons an effective tap target of roughly 38-40px.
   Apple's and Google's recommended minimum is 44px and 48px respectively.
   Sprint S2 already plans this fix; calling it out here so it is not missed
   when S2 lands.
2. **SSO button labels say "Join with Google"** rather than the conventional
   "Sign in with Google" or "Continue with Google". This matters for
   accessibility AI — Claude-in-Chrome, Gemini and Operator all learn the
   "Sign in with X" pattern; drifting from it makes action-discovery
   probabilistic. S2 should standardise to "Sign in with Google" / "Sign in
   with GitHub" unless you specifically want "Join" for new-user tone.
3. **Testid naming drift.** Sprint originally called for `signin-google`
   (Track S), but A1's DUAL-ACCESSIBILITY.md and the actual code use
   `oauth-button-${id}`. Both are valid kebab-case; the DUAL-ACCESSIBILITY
   convention wins because it is the written standard. Update the sprint
   doc text when it next opens.
4. **`BetaBanner` overhead.** `src/app/layout.tsx` renders `<BetaBanner />`
   above the navbar on every page. On mobile this is a ~40-60px tax on
   every page's above-the-fold real estate. Worth auditing whether the
   banner should be dismissible and whether dismissal persists.
5. **Absolute-centered nav on immersive variant also at risk.** The
   "immersive" variant of `SiteNavbar` (used on `/knowledge` and `/visualise`)
   has its own layout with `justify-between` and is safer, but the `pageLabel`
   (e.g. "SUBSTRATE VIEWER") is hidden below `sm:` using `sm:inline` — that
   is correct, but the LIVE badge at the far right is always rendered and
   competes with the auth mini-link. On very small (<360px) devices this
   can still overflow. Low priority.

## Runtime verification — next steps

A static code audit gets us 85% of the way but cannot measure actual
Lighthouse mobile scores or take screenshots at specific breakpoints.
Playwright is **not installed** in this repo yet (`package.json` does not list
`@playwright/test`). That install has to happen locally because it writes to
`package-lock.json` and downloads ~500MB of browser binaries; it is not
something the sandbox should do.

### Command to run locally (Entity One)

The first command installs Playwright and its browser binaries. Run this from
the `mmpm-website` repo root on your Mac. You have sudo-like control over your
`node_modules` and this is a standard dev dependency install.

```bash
# Why: install Playwright test runner + WebKit/Chromium binaries so we can
# produce a real mobile audit (screenshots at 320/375/412px, Lighthouse).
# Where: /Users/glenosborne/Documents/code/mmpm-website
# Safe? Yes — adds one dev dependency + downloads browsers into ~/Library/Caches.
# No network/git/env side effects beyond lockfile update.
npm i -D @playwright/test playwright
npx playwright install webkit chromium
```

After that, I will write `tests/e2e/mobile-baseline.spec.ts` that captures:

- Screenshots of `/`, `/pricing`, `/login`, `/signup`, `/docs` at viewports
  320×568, 375×667, 412×915 on both WebKit and Chromium.
- `scrollWidth === innerWidth` assertion per page (no horizontal scroll).
- `visualViewport.scale === 1` after tapping each input (iOS zoom check).
- Axe-core audit per page with HTML reports.

Screenshots get saved to `test-results/baseline-2026-04-24/` so you can share
them with advisors or use them as the "before" half of before/after pairs.

### Lighthouse (separate)

Lighthouse mobile will ride alongside M8 when we do that item; for the
baseline we can run it manually from Chrome DevTools → Lighthouse tab,
saving the JSON. I will not run it from the sandbox — it needs a real Chrome
with network access to the real site, and the numbers from a headless install
in a sandbox would be unreliable.

## Recommended sequence from here

Given the user-visible severity:

1. **M5 (hamburger drawer) — ship first.** Highest visual impact fix. About
   half a day including tests. Tests: Playwright mobile click-through + axe-core
   on open drawer. Also write a unit snapshot that asserts the pre-registered
   `nav-hamburger` + `nav-drawer` testids exist.
2. **M5b (pricing table redesign) — ship second.** Option B (stacked cards
   below md). Half a day. Tests: Playwright at 320/375 asserts all three
   competitor labels are visible without horizontal scroll.
3. **M4 (iOS zoom) — ship third.** Five minutes of className changes + a
   Playwright WebKit-mobile assertion. Low-hanging fruit.
4. **A2 (testid sweep) + M6 (tap targets)** — longer items, batch into
   session 2.
5. **S1 + S2 + S3 (mobile SSO)** — session 3. These depend on having
   Playwright installed (step above) and on S2's standardised labels.
6. **A4 + A5 + A6 + A7 (AI-accessibility plumbing)** — session 4. Ship after
   A2 gives us a stable testid registry.
7. **M8 (Lighthouse CI) — last.** Ship after the mobile CSS fixes land so the
   baseline is green.

Everything in this sequence ships with the tests declared in its sprint-item
test plan. No merge without green CI — consistent with the project rule.

## Follow-up for the session-end checkpoint

- Tombstone `v1.task.sprint_w18_mobile_feedback` (description still says "plan
  draft", should be "locked — 7 of 22 items shipped as of 2026-04-24, 15
  remain, see docs/mobile-audit-baseline-2026-04-24.md for per-item status").
- New atoms to checkpoint per item completed this session, with `produced_by`
  edges to a newly-created or reused `v1.task.sprint_2026_w18_execute` task
  atom in `v1.domain.website`.
- All new atoms need `member_of` → `v1.other.hub_sprint_state` and/or
  `v1.other.hub_visualization` where they touch the knowledge-graph viewer.
