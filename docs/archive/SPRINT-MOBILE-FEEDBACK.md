# Sprint Plan — Mobile-first, Dual-Accessibility, Mobile-SSO, Compute→UI Feedback

> **Status:** Locked. All 7 sprint questions answered by Entity One on 2026-04-21. Ready to claim and execute per the swim-lane matrix.

---

## Sprint metadata

| Field | Value |
|---|---|
| **Sprint ID** | `2026-W18` (confirmed) |
| **Sprint name** | Mobile, Dual-Accessibility, SSO & Feedback |
| **Start** | Monday 2026-04-27 |
| **Duration** | 5 working days (flexible — items are sized for parallelism) |
| **Derived from** | Two advisor audits on 2026-04-21 (mobile SEO + compute→UI gap matrix), + Entity One objectives round-trip 2026-04-21 |
| **Owner** | Entity One |
| **Operator split** | **Two operators** (canonical): Alpha = all website work (M+A+S tracks), Beta = compute-first (F-track: migration → endpoint → UI wire) |
| **Repos touched** | `mmpm-website`, `parametric-memory-compute` |
| **Tracks** | 4 parallel (see swim lanes) |
| **Item count** | 22 (7 P0, 9 P1, 6 P2) — **all in scope, none dropped** |
| **Target AI agents (O2)** | Claude-in-Chrome, Gemini, OpenAI (ChatGPT Operator / Atlas) |
| **Deploy cadence** | Website ships to prod first and we verify mobile + accessibility in prod. Then we update `ecosystem.config.cjs` in `parametric-memory-compute` and PM2-restart the compute service to pick up any new env / callback URL config, which lets us test Google + GitHub SSO live in prod end-to-end. |

### Decisions locked (2026-04-21)

1. **Sprint window:** 2026-W18, Mon 2026-04-27. Deploy: website first → verify in prod → ecosystem restart in compute for live SSO test.
2. **Operators:** Two (Alpha website, Beta compute).
3. **Scope:** All 22 items — nothing dropped.
4. **Lighthouse CI gate (M8):** In-sprint.
5. **Action manifest path:** `/.well-known/actions.json` (IETF RFC 8615 well-known URI convention — discoverable by any agent that follows the standard). See A4 for rationale.
6. **Google SSO test mode:** Mocked Google provider in CI, real Google in manual pre-deploy + post-deploy smoke.
7. **AI agents:** Optimize for Claude-in-Chrome + Gemini + OpenAI. See A4/A5/A7 for per-agent affordances.

---

## High-level objectives

### O1 — Mobile-friendly
Site passes Googlebot's mobile-first-indexing audit with zero critical issues. Lighthouse mobile ≥ 90 for `/`, `/pricing`, `/dashboard`, `/docs`. No horizontal scroll on 320-412px viewports. No iOS zoom-on-focus. No `h-screen` layout shift on iOS Safari.

### O2 — Dual-accessibility (humans AND AI)
Every interactive element is reachable, labelled, and operable by **both** a human user and an AI agent (e.g. Claude-in-Chrome, Playwright-based assistants). Concretely:
- Stable `data-testid` on every button, link, form field, and status element.
- Accessible name (`aria-label` or inner text) on every interactive element — no icon-only buttons without label.
- Programmatic equivalent (API endpoint) for every UI action, discoverable via a machine-readable action manifest.
- Semantic HTML (`<button>`, `<a>`, `<form>` — not divs).
- `llms.txt` + Action-schema JSON-LD so an AI can plan without screenshots.

### O3 — Google AND GitHub SSO verified on mobile
Both "Sign in with Google" and "Sign in with GitHub" flows work end-to-end on iOS Safari and Chrome Android. Buttons pass 48×48 tap-target. Redirect URI whitelists cover mobile user-agents. Callback handler tolerant of iOS Safari cookie quirks (ITP). Googlebot Smartphone can render `/login` and reach both consent screens. PKCE already in use (`src/lib/auth/pkce-store.ts`) — verify it survives the mobile redirect flow.

*Expanded from original draft: Entity One confirmed GitHub is also live in prod. GitHub provider already exists at `src/lib/auth/providers/github.ts`.*

### O4 — Compute→UI feedback visibility
A failed provisioning, a failed payment, a spend-cap lockout, and a tier-migration phase are each visible in the dashboard or admin page without a support ticket. Every P0 gap from the advisor's 30-row gap matrix is closed.

---

## Success criteria (sprint-level)

1. Lighthouse mobile audit on four key pages scores ≥ 90 (O1).
2. Google Search Console Mobile Usability report shows zero critical issues 7 days post-ship (O1).
3. An automated Playwright test ("agent-drives-site") can complete the happy path (signup → checkout → dashboard → rotate key → sign out) using only `data-testid` selectors (O2).
4. Every UI action has a documented API equivalent in a machine-readable manifest at `/.well-known/actions.json` (O2).
5. Playwright WebKit-mobile + Chromium-mobile tests complete Google sign-in against Stripe/Google test mode without manual intervention (O3).
6. All 5 P0 gaps from the 2026-04-21 advisor matrix are closed with an integration test (O4).
7. Every item ships with the tests in its test plan, green in CI.

## Explicitly out of scope

- Dashboard redesign (tracked in `v1.task.website_substrate_list_redesign`).
- Native mobile app.
- New `substrate_events` table, SSE streaming (advisor rejected).
- Notifications email inbox / in-app bell.
- Over-cap product decision, `limits_version` signal.
- Apple / Microsoft SSO (only Google for this sprint).

---

## Item metadata schema

Each item below has the following fields:

| Field | Meaning |
|---|---|
| **ID** | Stable identifier (M1, A1, S1, F1…). M = mobile, A = AI accessibility, S = SSO, F = feedback. |
| **Priority** | P0 (blocking) / P1 (audit-flagged) / P2 (polish). |
| **Effort** | S ≤ 2h, M ≤ 1 day, L ≤ 2 days. |
| **Repo** | `web` = mmpm-website, `compute` = parametric-memory-compute. |
| **Files** | Specific file(s) touched. |
| **Parallel-with** | Item IDs that can be worked simultaneously without conflict. |
| **Blocks** | Item IDs that cannot start until this one lands. |
| **Blocked-by** | Item IDs that must land first. |
| **Acceptance** | How we know it's done. |
| **Test plan** | Concrete tests to write (project rule: we write tests for everything). |
| **Risk** | What could go wrong; mitigation. |

---

## Track M — Mobile-friendly (O1)

All Track M items are in `mmpm-website` only, so they parallelise fully with Tracks A/S/F.

### M1 — Explicit viewport + theme on root layout
- **Priority / Effort / Repo:** P1 / S / web
- **Files:** `src/app/layout.tsx`
- **Work:** Add `export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 5, colorScheme: 'dark', themeColor: '#030712' }`. Import `Viewport` from `next`. Do not block pinch-zoom (a11y).
- **Parallel-with:** every other item.
- **Blocks / Blocked-by:** nothing / nothing.
- **Acceptance:** `curl -sI` of deployed page shows the viewport meta with maximumScale=5. No visual regression.
- **Test plan:** Playwright smoke: `expect(page.locator('meta[name=viewport]').getAttribute('content')).toContain('device-width')`.
- **Risk:** none.

### M2 — Replace `h-screen` with `min-h-[100dvh]` on immersive pages
- **Priority / Effort / Repo:** P1 / S / web
- **Files:** `src/app/knowledge/KnowledgeClient.tsx:31,52`; `src/app/visualise/VisualiseClient.tsx:17,38`
- **Work:** Replace `h-screen` with `min-h-[100dvh]` (Tailwind's `dvh` arbitrary value). Keep `min-h-screen` as fallback for very old Safari.
- **Parallel-with:** every other item.
- **Acceptance:** On iPhone Safari, scrolling up/down shows no content jump; no vertical scrollbar on initial paint at 390×664.
- **Test plan:** Playwright WebKit-mobile at 390×664 and 412×915 — assert initial paint has no scroll bar; simulate address-bar collapse via `page.setViewportSize`.
- **Risk:** `dvh` unsupported in iOS Safari <15.4 (~1% traffic). Fallback via `min-h-screen` covers them.

### M3 — Responsive `SidePanel` width
- **Priority / Effort / Repo:** P1 / S / web
- **Files:** `src/components/knowledge/SidePanel.tsx:144`
- **Work:** `w-80` → `w-[min(88vw,320px)]`.
- **Parallel-with:** everything.
- **Acceptance:** At 320×568, no horizontal scroll when panel is open.
- **Test plan:** Playwright at 320px — open SidePanel, assert `document.documentElement.scrollWidth === window.innerWidth`.
- **Risk:** none.

### M4 — Input font-size ≥ 16px to prevent iOS zoom
- **Priority / Effort / Repo:** P1 / S / web
- **Files:** `src/components/landing/WaitlistForm.tsx:79`; `src/app/pricing/CapacityInquiryForm.tsx` (all inputs); any other `<input>`/`<textarea>` with `text-sm|text-xs`.
- **Work:** `text-sm` → `text-base sm:text-sm` on the input itself.
- **Parallel-with:** everything (touches different files from A-track items).
- **Acceptance:** Focusing any input in WebKit-mobile does not trigger zoom.
- **Test plan:** Playwright WebKit-mobile — focus each input, assert `window.visualViewport.scale === 1`.
- **Risk:** minor visual shift on desktop — acceptable.

### M5 — Mobile hamburger drawer
- **Priority / Effort / Repo:** P1 / M / web
- **Files:** `src/components/ui/SiteNavbar.tsx`
- **Work:** Add a hamburger button visible `<md`. Drawer contains the links currently hidden by `hidden md:block` / `hidden lg:block` (Blog, FAQ, Legal, Privacy). Body-scroll lock while open. Close on route change. Include `data-testid="nav-hamburger"` and `data-testid="nav-drawer"` for A-track.
- **Parallel-with:** M1-M4, M6-M8, S1-S3, F1-F7.
- **Blocked-by:** none. **Blocks:** A2 (nav-wide data-testid sweep may need to know final markup — but can start in parallel and rebase at the end).
- **Acceptance:** At 375px, user can reach every top-level page via hamburger. Esc closes. `aria-expanded` toggles correctly.
- **Test plan:** Playwright mobile — click hamburger, assert drawer visible, click Blog, assert route change; axe-core assertion on open drawer.
- **Risk:** coordination with A2 on testid naming — pre-agree names in A1.

### M6 — Tap-target + typography batch
- **Priority / Effort / Repo:** P2 / M / web
- **Files:** `src/app/admin/AdminClient.tsx:131`; `src/app/pricing/PricingClient.tsx:55`; `src/app/page.tsx` (lines 380/399/437/463/722/770/~800); `src/components/ui/SiteNavbar.tsx` gap tweak.
- **Work:** Bump underdimensioned tap targets to ≥ 40px; raise `text-[10-11px]` to `text-xs` on mobile; raise low-contrast footer links one shade.
- **Parallel-with:** all.
- **Acceptance:** axe-core contrast violations = 0 on `/`; tap targets ≥ 40px on all primary CTAs.
- **Test plan:** Playwright + axe-core on `/`, `/pricing`, `/admin`.
- **Risk:** cosmetic drift on desktop — intentional.

### M7 — Decorative blob overflow guard
- **Priority / Effort / Repo:** P2 / S / web
- **Files:** `src/app/signup/SignupClient.tsx`; `src/app/admin/AdminClient.tsx`; `src/app/dashboard/DashboardClient.tsx`
- **Work:** Add `overflow-hidden` to the blob's nearest block ancestor, OR `hidden sm:block` on the blob itself.
- **Parallel-with:** all.
- **Acceptance:** At 320/375, no horizontal scroll on signup/admin/dashboard.
- **Test plan:** Playwright — assert `scrollWidth === innerWidth` at 320 and 375 on those three pages.
- **Risk:** none.

### M8 — Lighthouse CI as regression gate (optional)
- **Priority / Effort / Repo:** P2 / M / web
- **Files:** new `.github/workflows/lighthouse.yml`
- **Work:** Run Lighthouse CI against Vercel preview. Budget: mobile perf ≥ 85, a11y ≥ 95, SEO ≥ 95. Start as `warn`, flip to `error` after 1 clean week.
- **Parallel-with:** all — lands whenever ready.
- **Acceptance:** PR that removes viewport meta fails CI.
- **Test plan:** deliberately-bad PR verifies failure mode.
- **Risk:** flaky — use `numberOfRuns: 3`, take median.

---

## Track A — Dual-accessibility (O2)

Track A assumes humans and AI agents share the site. An AI agent should be able to drive it from a DOM snapshot alone, no vision needed. Track A is mostly additive (attributes, new manifests) and parallelises with M/S/F.

### A1 — Define the testid + aria naming convention
- **Priority / Effort / Repo:** P0 / S / web
- **Files:** new `docs/DUAL-ACCESSIBILITY.md`
- **Work:** One-page convention: testid is kebab-case, prefix by surface (`nav-*`, `dashboard-*`, `admin-*`, `checkout-*`), verb + object for actions (`dashboard-add-substrate`, `admin-rotate-key`). `aria-label` matches visible text or clarifies intent for icon-only. Pre-register exact names for the Track A2-A5 work and for M5 (`nav-hamburger`, `nav-drawer`, `nav-link-blog`, etc.).
- **Parallel-with:** everything — does not block since the convention is authored in isolation.
- **Blocks:** A2, A3, A4.
- **Acceptance:** doc merged and linked from root `README.md`.
- **Test plan:** reviewable artefact, no code test.
- **Risk:** bikeshed — time-box the review to 1 day.

### A2 — `data-testid` sweep across the navbar, dashboard, admin, and auth flows
- **Priority / Effort / Repo:** P0 / L / web
- **Files:** `src/components/ui/SiteNavbar.tsx`; `src/app/dashboard/DashboardClient.tsx`; `src/app/admin/AdminClient.tsx`; `src/app/admin/[slug]/**`; `src/app/login/LoginClient.tsx`; `src/app/signup/SignupClient.tsx`; `src/app/pricing/PricingClient.tsx`; `src/app/pricing/PricingCardClient.tsx`; `src/components/dashboard/BillingWidget.tsx`
- **Work:** Add `data-testid` to every interactive element (buttons, links, inputs, status badges, tabs, accordions). Follow A1 convention. No logic change — purely additive attributes.
- **Parallel-with:** Every other item, but coordinate with M5 on final nav markup.
- **Blocked-by:** A1.
- **Acceptance:** grep for `<button`, `<a[^>]*href`, `<input`, `<select`, `<textarea` in listed files — every match has a `data-testid`. Script in `scripts/check-testids.mjs` fails CI if any are missing.
- **Test plan:**
  - Unit: snapshot `SiteNavbar` and `BillingWidget` — testids present.
  - E2E: new `tests/e2e/agent-drives-site.spec.ts` — Playwright using only testids does signup → checkout (Stripe test mode) → dashboard → rotate key → logout. Happy path.
- **Risk:** testid rot — mitigate with the CI grep check in A6.

### A3 — Accessible-name audit & icon-button labels
- **Priority / Effort / Repo:** P1 / M / web
- **Files:** anywhere an icon-only button exists — run `grep -n "lucide\|heroicon\|<svg"` and audit. Likely includes `SiteNavbar` mobile icons, `/admin` copy-to-clipboard button, dashboard card action buttons.
- **Work:** Ensure every interactive element has an accessible name (either visible text or `aria-label`). Add `aria-label="Copy API key"`, `aria-label="Rotate API key"`, etc.
- **Parallel-with:** all.
- **Blocked-by:** A1.
- **Acceptance:** `axe-core` "button-name" and "link-name" violations = 0 on all pages.
- **Test plan:** Playwright + axe on every page in a test loop.
- **Risk:** over-long aria-labels — keep under 40 chars.

### A4 — Action manifest at `/.well-known/actions.json`
- **Priority / Effort / Repo:** P1 / M / web
- **Files:** new `src/app/.well-known/actions.json/route.ts`; `src/app/layout.tsx` (add `<link rel="actions" href="/.well-known/actions.json" type="application/json">` in head); update `public/llms.txt` to link to it.
- **Why `/.well-known/actions.json`:** IETF RFC 8615 standardises `/.well-known/` as the discovery root for machine-readable resources (think `/.well-known/openid-configuration`, `/.well-known/security.txt`, `/.well-known/ai-plugin.json`). Any agent that knows this convention will look here first. We also expose a `<link rel="actions">` in the HTML head so HTML-scraping agents that don't probe `/.well-known/` still discover it.
- **Work:** Build a machine-readable action manifest describing every UI action with an API equivalent. Shape:
  ```json
  {
    "version": "2026-04-21",
    "site": "https://parametric-memory.dev",
    "actions": [
      {
        "id": "signup",
        "ui": { "url": "/signup", "testid": "signup-form-submit" },
        "api": { "method": "POST", "url": "/api/v1/signup", "schema": "/docs/api/signup" },
        "requires_auth": false,
        "description": "Create account + substrate + Stripe checkout session.",
        "agent_hints": {
          "preconditions": ["email", "password_or_sso"],
          "side_effects": ["creates_stripe_customer", "sends_email"]
        }
      },
      …
    ]
  }
  ```
  Include: signup, checkout, dashboard-view, rotate-key, claim-key, tier-change, cancel, reactivate, deprovision, billing-portal.
- **Per-agent considerations:**
  - **Claude-in-Chrome** — drives the real DOM; primarily relies on `ui.testid`. Ensures every `testid` in the manifest actually resolves to a visible, clickable element. Run a `testid-resolves` integration test per action.
  - **OpenAI (ChatGPT Operator / Atlas)** — will fetch `/.well-known/ai-plugin.json` historically; we also publish actions.json under the same well-known root and link both from `llms.txt`. Operator can also drive DOM, so testids must be stable.
  - **Gemini** — primarily consumes structured data via Google Knowledge Graph + schema.org; relies more on A5's JSON-LD than on actions.json. But Gemini CLI / browser-agent modes can also read actions.json if linked in HTML head.
- **Parallel-with:** all — manifest is additive.
- **Blocked-by:** A1 (testid naming).
- **Acceptance:** GET `/.well-known/actions.json` returns valid JSON matching a zod schema. HTML head contains `<link rel="actions" …>`. `llms.txt` contains a line `Actions: /.well-known/actions.json`.
- **Test plan:**
  - Unit: zod-parse the route response.
  - Unit: snapshot of `layout.tsx` head contains the `<link rel="actions">` element.
  - Agent test: from actions.json alone, a Playwright script can execute signup using only `ui.testid` selectors.
  - Per-agent smoke: for each of Claude-in-Chrome / OpenAI / Gemini browsing agents (where available in test harness), confirm discovery path works.
- **Risk:** drift between manifest and reality — add CI check that every declared testid is present in source (A6 handles this).

### A5 — Action-schema JSON-LD on public pages
- **Priority / Effort / Repo:** P2 / S / web
- **Files:** `src/app/page.tsx` (landing); `src/app/pricing/page.tsx`; `src/app/login/page.tsx`; `src/app/signup/page.tsx`.
- **Work:** Add schema.org `Action` JSON-LD nodes (`RegisterAction`, `SubscribeAction`, `LoginAction`) pointing to the same endpoints as `/.well-known/actions.json`. Use `potentialAction` nesting under a top-level `WebPage` or `Organization` node so Google's parser treats the page as an action target.
- **Why this matters for multi-agent coverage:**
  - **Gemini** — Google's Knowledge Graph ingests schema.org JSON-LD directly; this is the primary channel for Gemini to learn what actions our site exposes. Without JSON-LD, Gemini's knowledge of our site is essentially the unstructured HTML. With JSON-LD, `RegisterAction` etc. become first-class capabilities.
  - **OpenAI** — ChatGPT search / browsing also parses schema.org; richer JSON-LD improves answer quality when users ask "how do I sign up for parametric-memory.dev".
  - **Claude-in-Chrome** — primarily driven by the DOM + our explicit manifest, but JSON-LD is a useful secondary signal (especially when planning tasks from a page it hasn't seen before).
- **Parallel-with:** all.
- **Blocked-by:** A4 (share URLs + action IDs so the two manifests don't diverge).
- **Acceptance:** Google Rich Results Test passes for landing + pricing. Manual check: pasting the landing URL into a fresh Gemini conversation surfaces the "Sign up" action as a suggested task.
- **Test plan:**
  - Playwright visits each page, parses JSON-LD, asserts `@type` includes `RegisterAction` / `SubscribeAction` / `LoginAction`.
  - Integrity test: cross-reference JSON-LD `target.url` against `/.well-known/actions.json` — they must match.
- **Risk:** JSON-LD schema errors break Google Rich Results — validate with the official test tool in CI (curl-able API).

### A6 — CI guard: testid coverage + action-manifest integrity
- **Priority / Effort / Repo:** P1 / S / web
- **Files:** new `scripts/check-testids.mjs`; new `scripts/check-actions-manifest.mjs`; `.github/workflows/ci.yml`.
- **Work:** Node script that (1) scans JSX for every interactive element and fails if any lacks a `data-testid`; (2) reads actions.json and fails if any declared testid is not present in source; (3) reads actions.json and fails if any declared API path is not in the Express swagger.
- **Parallel-with:** ships after A2 + A4 land.
- **Blocked-by:** A2, A4.
- **Acceptance:** CI fails on a PR that removes a testid or breaks the manifest.
- **Test plan:** the scripts are the test. Add a meta-test that runs them against a fixture directory with a known-missing testid.
- **Risk:** false positives on third-party components — allowlist in the script.

### A7 — `llms.txt` upgrade (three-agent aware)
- **Priority / Effort / Repo:** P2 / S / web
- **Files:** `public/llms.txt`
- **Work:** Rewrite per the draft llms.txt spec (llmstxt.org). Target audience is explicitly Claude-in-Chrome, Gemini, and OpenAI browsing agents. Required sections:
  1. **H1 title + blockquote summary** — one-sentence product description.
  2. **Site** — base URL, sitemap, robots.
  3. **Actions** — `/.well-known/actions.json` link, one-line per action (id + URL + auth required).
  4. **Docs** — canonical doc URLs (getting started, API reference, FAQ).
  5. **Per-agent hints** — an optional `## Agent notes` section with:
     - `Claude-in-Chrome: use data-testid selectors; the manifest at /.well-known/actions.json is authoritative for available actions.`
     - `Gemini: Action schema.org JSON-LD is on /, /pricing, /login, /signup. Prefer those over HTML scraping.`
     - `OpenAI browsing: see /.well-known/actions.json for a Plugin-style capability listing.`
  6. **Contact / support** — email + status page.
- **Parallel-with:** all.
- **Blocked-by:** A4 (need the final actions.json URL + action IDs).
- **Acceptance:** manual content review against llmstxt.org spec + three-agent section present.
- **Test plan:**
  - Playwright fetches `/llms.txt`, asserts all six sections present by header match.
  - Regex test that every action ID in `/.well-known/actions.json` appears in `llms.txt`.
- **Risk:** spec is still a draft and may evolve — revisit quarterly.

---

## Track S — Mobile SSO: Google + GitHub (O3)

Track S now covers **both** Google and GitHub. They share the callback route (`src/app/api/auth/oauth/[provider]/callback/route.ts`) and PKCE store (`src/lib/auth/pkce-store.ts`), so most items are "do it twice, one per provider" with shared infra.

### S1 — Mobile SSO smoke test (WebKit + Chromium) — Google + GitHub
- **Priority / Effort / Repo:** P0 / M / web
- **Files:** new `tests/e2e/mobile-sso-google.spec.ts`; new `tests/e2e/mobile-sso-github.spec.ts`
- **Work:** Playwright tests on WebKit-mobile + Chromium-mobile, at viewports 375×667 and 412×915. Flow per provider: visit `/login`, click `data-testid="signin-google"` (or `signin-github`), follow redirect, accept consent (mocked), land on `/dashboard`. Mocked providers in CI; env flag (`SSO_REAL=1`) switches to real providers for manual pre-deploy.
- **Parallel-with:** M1-M8, A1-A7, F1-F7.
- **Blocked-by:** A2 (provides `signin-google` and `signin-github` testids).
- **Acceptance:** Both tests green on both engines, both viewports, in CI.
- **Test plan:** the tests ARE the test. Also gate with visual snapshots of each consent button.
- **Risk:** Real-provider flakiness — use mocks in CI; manual smoke is the real truth signal.

### S2 — `Sign in with Google` + `Sign in with GitHub` tap target + labels
- **Priority / Effort / Repo:** P1 / S / web
- **Files:** `src/app/login/LoginClient.tsx`; `src/app/signup/SignupClient.tsx`
- **Work:** Each button min-height 48px, brand-compliant glyphs (Google's G with correct colors, GitHub's Octocat/mark), `aria-label="Sign in with Google"` / `aria-label="Sign in with GitHub"`, `data-testid="signin-google"` / `data-testid="signin-github"`.
- **Parallel-with:** all.
- **Blocked-by:** A1.
- **Acceptance:** visual matches each provider's branding spec; tap target ≥ 48px on both buttons.
- **Test plan:** Playwright — assert computed height ≥ 48 for both; screenshot diffs against references; axe-core accessible-name check.
- **Risk:** none.

### S3 — OAuth callback iOS-Safari cookie resilience (shared for both providers)
- **Priority / Effort / Repo:** P1 / M / web
- **Files:** `src/lib/auth/providers/google.ts`; `src/lib/auth/providers/github.ts`; `src/lib/auth/oauth-callback.ts`; `src/lib/auth/pkce-store.ts`; `src/app/api/auth/oauth/[provider]/callback/route.ts`.
- **Work:** Verify for BOTH providers: (a) cookies set with `SameSite=Lax` + `Secure` (iOS ITP blocks `SameSite=None` without `Secure`); (b) PKCE `code_verifier` survives the redirect roundtrip on iOS Safari (check `pkce-store` TTL + storage); (c) `redirect_uri` is explicit and environment-aware, not computed from incoming `Host` header (iOS proxies and reverse proxies can rewrite it); (d) error path shows a user-readable message with retry CTA, not a blank page. Callback route is already `/api/auth/oauth/[provider]/callback` — works for both.
- **Parallel-with:** S1, S2.
- **Blocked-by:** none.
- **Acceptance:** S1's real-provider smoke test passes on a real iPhone for BOTH providers pre-deploy.
- **Test plan:**
  - Integration: Testcontainers + real PG + mocked provider — assert `Set-Cookie` has `SameSite=Lax; Secure; HttpOnly` on callback response. One test per provider.
  - Integration: assert PKCE `code_verifier` is retrievable after a simulated redirect delay (mimics iOS 300ms pause).
  - Manual: real iPhone SSO flow for both providers before deploy (archive screenshots).
- **Risk:** Google Cloud Console / GitHub OAuth App config drift. Entity One documents the redirect URI allowlist per provider in `docs/runbooks/oauth.md`. Claude cannot read or modify that config.

### S4 — Mobile-Googlebot render check (for both buttons)
- **Priority / Effort / Repo:** P1 / S / web
- **Files:** none — verification task.
- **Work:** Use Google Search Console URL Inspection on `/login` and `/signup` with "Test live URL" to confirm Googlebot Smartphone renders BOTH the Google and GitHub buttons. Archive screenshots.
- **Parallel-with:** all.
- **Blocked-by:** S2.
- **Acceptance:** Search Console rendered screenshots show both buttons visible on the mobile render.
- **Test plan:** manual verification, results archived in `docs/runbooks/oauth.md`.
- **Risk:** none.

### S5 — Post-deploy live SSO verification on prod (gate for ecosystem restart)
- **Priority / Effort / Repo:** P0 / S / both repos
- **Files:** `parametric-memory-compute/ecosystem.config.cjs` (PM2 config — restart needed after any env var change); `docs/runbooks/oauth.md` (new, per-provider runbook).
- **Work:** Per the deploy cadence Entity One set:
  1. **Ship website to prod first** (Vercel or equivalent — `cicd-web-deploy` skill).
  2. Verify S1 tests pass against prod with `SSO_REAL=1` and a staging Google/GitHub app (or manual smoke if automated real-flow is flaky).
  3. **Then update `ecosystem.config.cjs`** with any new env vars (if new callback URLs were added) and PM2-restart compute.
  4. Manual smoke on a real iPhone + real Android: Google sign-in, GitHub sign-in, end-to-end including dashboard land.
  5. Record results in `docs/runbooks/oauth.md`.
- **Parallel-with:** nothing — this is the close-out verification.
- **Blocked-by:** S1, S2, S3, S4 (all merged).
- **Acceptance:** Four green smoke results (Google-iPhone, Google-Android, GitHub-iPhone, GitHub-Android) filed in the runbook.
- **Test plan:** the manual smoke IS the test. Any failure opens a P0 bug and rolls back.
- **Risk:** PM2 restart kills active WebSocket / SSE sessions momentarily. Mitigation: run during low-traffic window, announce in status doc if we have customers online.
- **Human-run commands (Claude will hand over, not run):**
  - `ssh memory.kiwi` (or equivalent) — Entity One owns this.
  - `pm2 restart ecosystem.config.cjs --update-env` — Entity One runs after `.env` is updated.
  - `pm2 logs mmpm-compute --lines 100` — observe for errors.

---

## Track F — Compute→UI feedback plumbing (O4)

Track F straddles both repos. Within the track, work is strictly `migration → endpoint → UI`; at the track level, it parallelises with M/A/S. When migration files are involved, use the `migration` skill.

### F1 — Provisioning phase + error exposed
- **Priority / Effort / Repo:** P0 / L / compute + web
- **Files:**
  - `parametric-memory-compute/migrations/NNN_provision-queue-phase.sql` (new — add `phase` column + `error_message` already exists; verify).
  - `parametric-memory-compute/src/workers/substrate-provisioner.ts` — persist phase transitions.
  - `parametric-memory-compute/src/api/v1/substrates/[slug]/index.ts` — return `provisioning: { phase, startedAt, errorMessage }`.
  - `mmpm-website/src/app/admin/[slug]/page.tsx` — render phase-aware progress.
- **Parallel-with:** M-, A-, S-tracks fully. Within F: F1-migration and F1-UI can be split between two operators (migration first, UI second).
- **Blocks:** admin UI phase badge (F1-UI part).
- **Acceptance:** a deliberately-failed provision shows a phase + reason in `/admin/[slug]`, not a spinner.
- **Test plan:**
  - Integration (Testcontainers, real PG): seed queue row, tick worker, assert phase advances, mark failed, call GET, assert `errorMessage` present.
  - E2E: mock-do-server returns timeout → dashboard poll → UI shows "Provisioning failed: DigitalOcean timed out (120s)" within 10s.
  - Migration audit via `migration` skill.
- **Risk:** worker deadlock on phase update. Mitigation: update phase in the same tx as existing status write.
- **Human-run after merge:** `npm run db:migrate` in `parametric-memory-compute` (NOT pnpm — see project CLAUDE.md).

### F2 — Payment-failure details on `/api/billing/status`
- **Priority / Effort / Repo:** P0 / M / compute + web
- **Files:** `parametric-memory-compute/src/api/billing/status.ts`; `mmpm-website/src/app/api/billing/status/route.ts`; `mmpm-website/src/components/dashboard/BillingWidget.tsx`.
- **Work:** Extend response with `paymentFailureDetails: { attemptCount, nextAttemptAt, amountCents } | null` sourced from latest `billing_events` row where `event_type='payment_failed'`. BillingWidget renders red banner with retry date + update-card CTA.
- **Parallel-with:** F1 (different file), F3 (different UI area), M-/A-/S- fully.
- **Blocked-by:** none.
- **Acceptance:** a fired Stripe webhook `invoice.payment_failed` shows up as a user-actionable banner within the next billing-status poll.
- **Test plan:**
  - Integration: insert webhook fixture, call status, assert shape.
  - Cache test: two calls within 60s → assert 2nd is cache hit.
- **Risk:** none.

### F3 — Read-only reason surfaced (spend cap, grace period, dispute, cancel)
- **Priority / Effort / Repo:** P0 / M / compute + web
- **Files:** `parametric-memory-compute/src/api/v1/substrates/[slug]/index.ts`; `mmpm-website/src/components/ui/SubstrateStateBanner.tsx`.
- **Work:** GET response includes `readOnlyReason` (already in DB per migration 072) + `gracePeriodEndsAt` if applicable. Banner has 4 variants mapped to 4 reasons with reason-specific CTAs.
- **Parallel-with:** F1, F2, all M/A/S.
- **Blocked-by:** none.
- **Acceptance:** each of the 4 read-only reasons renders the right banner + CTA.
- **Test plan:** integration test × 4 (one per reason) asserting response + Playwright asserting banner.
- **Risk:** none.

### F4 — Tier-migration phase + error
- **Priority / Effort / Repo:** P1 / L / compute + web
- **Files:** `parametric-memory-compute/migrations/NNN_tier-changes-phase.sql` (verify columns don't already exist); `parametric-memory-compute/src/workers/substrate-migration-worker.ts`; `parametric-memory-compute/src/api/v1/substrates/[slug]/index.ts`; `mmpm-website/src/app/admin/[slug]/page.tsx`.
- **Work:** Add `phase` + `error_message` to `substrate_tier_changes`. Expose in GET. Admin page shows migration banner; disables tier-change button while in progress.
- **Parallel-with:** F1-F3, all M/A/S.
- **Blocked-by:** none (but coordinate migration numbering with F1 via `migration` skill).
- **Acceptance:** triggered tier change shows phase progression in UI.
- **Test plan:** integration test walks state machine; UI test asserts banner + disabled button.
- **Risk:** migration numbering collision with F1 — `migration` skill audits sequence.

### F5 — Invoice-upcoming banner
- **Priority / Effort / Repo:** P2 / S / compute + web
- **Files:** `parametric-memory-compute/src/api/billing/status.ts`; `mmpm-website/src/components/dashboard/BillingWidget.tsx`.
- **Work:** Add `invoiceUpcomingAt: ISO | null`. Widget shows "Renews [date]" if within 7 days.
- **Parallel-with:** F1-F4, all M/A/S.
- **Blocked-by:** F2 (touches same file — merge F2 first, then rebase F5).
- **Acceptance:** upcoming invoice event → UI banner.
- **Test plan:** integration test.
- **Risk:** none.

### F6 — Key-rotation error surfaced in UI
- **Priority / Effort / Repo:** P1 / S / web
- **Files:** `mmpm-website/src/app/admin/[slug]/key-rotation/**`.
- **Work:** Render `error_reason` from existing `/api/my-substrate/key-rotation/status` response. Add restart CTA on failure state.
- **Parallel-with:** all.
- **Blocked-by:** none — endpoint already returns the field.
- **Acceptance:** failed rotation shows reason + restart.
- **Test plan:** E2E with mock-do-server simulating SSH failure.
- **Risk:** none.

### F7 — 429 rate-limit toast
- **Priority / Effort / Repo:** P2 / S / web
- **Files:** `mmpm-website/src/lib/api/client.ts` (or whichever fetch wrapper is in use).
- **Work:** On 429, read `Retry-After` header and spawn toast "Rate limit reached — retry in X seconds."
- **Parallel-with:** all.
- **Blocked-by:** none.
- **Acceptance:** mocked 429 produces the expected toast.
- **Test plan:** unit test on fetch wrapper with mock 429.
- **Risk:** none.

---

## Swim lanes — who can do what in parallel

Two independent operators (e.g. Claude-A + Entity One, or two separate sessions) can be running at the same time without conflict as long as they stay in different lanes. The table shows which items are safe to claim side-by-side.

| Lane | Items (can all run simultaneously across lanes) | Conflict zone |
|---|---|---|
| **Lane 1 — Mobile CSS** | M1, M2, M3, M4, M6, M7 | Touches layout, typography, SidePanel, forms. No overlap with Lane 2/3/4. |
| **Lane 2 — Mobile structure** | M5 (hamburger) | Touches SiteNavbar — coordinate with A2 via A1's pre-agreed testid names. |
| **Lane 3 — A11y foundation** | A1 (first), then A2, A3 in parallel | A1 is the critical path — do it first, 1 day max. |
| **Lane 4 — A11y manifests** | A4, A5, A7 | All additive new files / JSON-LD. No overlap with Lane 3 except A4 consumes A1's testid list. |
| **Lane 5 — SSO** | S1, S2, S3, S4 | Touches auth flow. S2 pairs well with A2 (same file). |
| **Lane 6 — Compute migrations** | F1 (migration part), F4 (migration part) | Both touch `migrations/` — use `migration` skill to audit sequence. Do F1 migration first, then F4 migration. |
| **Lane 7 — Compute endpoints** | F1-endpoint, F2-endpoint, F3-endpoint, F4-endpoint | Different files; pure additive response-shape changes. |
| **Lane 8 — Website UI wiring** | F1-UI, F2-UI, F3-UI, F4-UI, F5, F6, F7 | Different components; rebase F5 after F2 since same file. |
| **Lane 9 — CI guards** | A6, M8 | New workflow files; land after their prerequisites. |

### Recommended three-operator split

- **Operator Alpha (web-only):** Lane 1 + Lane 2 + Lane 3 + Lane 4 + Lane 5 (all website work).
- **Operator Beta (compute-first):** Lane 6 then Lane 7.
- **Operator Gamma (integrator):** Lane 8 (wires Gamma's UI to Beta's endpoints) + Lane 9 (CI gates once everything lands).

Or for a **two-operator split**:
- **Operator Alpha:** M-track + A-track + S-track (all website).
- **Operator Beta:** F-track (migration → endpoint → UI wire).

### Critical path

The longest dependency chain is:
```
A1 (½ day) → A2 (1.5 days) → A6 (½ day)        [4 days total for strict a11y chain]
F1-migration → F1-endpoint → F1-UI             [2 days total for F1]
```
A2 is the hottest single-item bottleneck for E2E test value. Sequence A2 on day 1-2 so M-track and S-track can depend on its testids.

---

## Dependencies (external to the sprint)

- Stripe test mode keys — for F2 integration tests. Claude cannot set env; Entity One adds `STRIPE_TEST_SECRET_KEY` to `.env.local` if not already there.
- Google OAuth test-mode client — for S1 automated smoke. Entity One confirms client + secret exist or creates them in Google Cloud Console. Claude cannot touch `.env`.
- Real iPhone + real Android device — for S4 manual verification pre-deploy.
- Testcontainers (PG) — already in project.
- Playwright — verify installed in `mmpm-website`; if missing, add in the first Lane-1 item.
- `migration` skill — required for F1 + F4 migration authoring.
- `cicd-web-deploy` skill — for the ship step at end of sprint.

---

## Risks & mitigations (sprint-level)

| Risk | Lk | Im | Mitigation |
|---|---|---|---|
| A2's testid sweep clashes with M5's navbar restructure | M | L | A1 pre-registers navbar testids; M5 and A2 use the pre-registered names. |
| `dvh` unsupported in legacy iOS Safari | L | L | `min-h-screen` fallback covers them. |
| Playwright missing in repo — Lane 1 must add it first | L | L | Check in Lane 1 opening move; `npm i -D @playwright/test playwright` if missing. |
| Google OAuth test-mode differs from prod | M | M | S3 uses mocked provider in CI; S1 has a flag for real-Google manual smoke; S4 is manual verification on a real device. |
| F1 + F4 both add migrations — numbering collision | M | M | `migration` skill audits sequence before each `git add`. |
| PR sprawl — 22 items is a lot | M | M | Encourage small PRs, one per item. Swim lanes make this natural. |
| Lighthouse flakes fail PRs | L | L | `numberOfRuns: 3`, `warn` mode first week. |

---

## Testing posture (sprint-wide)

- Every item in its `## Test plan` section has a concrete test that will be authored alongside the change.
- Coverage types: **unit** (component snapshot, fetch-wrapper), **integration** (Testcontainers + real PG), **E2E** (Playwright, multi-engine), **CI guards** (testid + manifest integrity), **a11y** (axe-core), **visual regression** (Playwright screenshot diff for SSO button + banners), **Lighthouse** (perf/SEO budget).
- No merge without green tests. No ship without green CI.

## Claude's hard limits (reminder — unchanged from prior plan)

- Will not run `git commit|push|tag|merge|rebase|reset` — hands over commands.
- Will not `rm` any file — hands over the command with reason.
- Will not read/write `.env*` — tells you the key name + value and asks you to add it.
- Will not run `psql`, pgadmin, or any direct DB command — schema via migrations only; local `npm run db:migrate`, prod via `scripts/run-migrations.cjs`.

---

## Ready-to-claim checklist (day 0 — 2026-04-27)

Before the first item is claimed, Entity One should confirm:

- [ ] `.env.local` in `mmpm-website` has `STRIPE_TEST_SECRET_KEY`, `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` (test app), and `GITHUB_OAUTH_CLIENT_ID` + `GITHUB_OAUTH_CLIENT_SECRET` (test app). Claude cannot read these — Entity One is the only operator for env work per the ground rules.
- [ ] `docs/runbooks/oauth.md` exists or is about to be created by S3/S4.
- [ ] Playwright is installed in `mmpm-website`. If not, `npm i -D @playwright/test playwright` + `npx playwright install webkit chromium` (run locally, commit lockfile changes manually).
- [ ] `migration` skill reviewed — Beta operator understands the npm-vs-pnpm rule and the sequence-audit requirement before F1/F4 land.
- [ ] Alpha + Beta each know their lane (see "Recommended two-operator split") and have read A1 before starting any work that adds testids.

Once these are ticked, the sprint is live — claim by lane, small PRs, one item per PR, green tests before merge.
