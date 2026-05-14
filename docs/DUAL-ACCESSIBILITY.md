# Dual-Accessibility Convention — `data-testid` + `aria-*` + Semantic HTML

> **Status:** Draft v1 — locks the naming convention and pre-registers every
> `data-testid` used by the Sprint 2026-W18 work (Tracks A, M, S). Updated during
> A2 as real components land.
> **Owner:** sprint 2026-W18 (`v1.state.sprint_2026_w18_locked_22_items_src_human`)
> **Enforced by:** `scripts/check-testids.mjs` (A6) and
> `scripts/check-actions-manifest.mjs` (A6) in CI.

---

## Why this document exists

`parametric-memory.dev` is used by two populations:

1. **Humans** — who rely on visual layout, screen readers, and keyboard/touch.
2. **AI agents** — Claude-in-Chrome, Gemini, OpenAI browsing (Operator / Atlas),
   and any Playwright-driven automation we write ourselves. These drive the DOM
   directly and cannot see images; they rely on stable selectors and
   programmatic labels.

Sprint objective **O2 — dual-accessibility** requires that every interactive
element is discoverable and operable by **both**. This document is the single
source of truth for how we achieve that.

It is linked from `README.md`, from `public/llms.txt`, and referenced by the
action manifest at `/.well-known/actions.json` (item A4).

---

## Four rules (all non-negotiable)

### Rule 1 — Semantic HTML first

Use the right element for the job. **Never** style a `<div>` into a button.

| Intent | Element | Never use |
|---|---|---|
| A click that does something | `<button type="button">` | `<div onClick>` |
| Navigate to another URL | `<a href>` (Next.js `<Link>`) | `<div onClick={() => router.push}>` |
| Submit a form | `<button type="submit">` inside `<form>` | `<div>` |
| Pick from multiple | `<input type="radio">` or `<select>` | custom div widgets |

Rationale: screen readers, keyboard navigation, and AI agents all rely on
native element semantics. Role ARIA shims (`role="button"`) are a patch, not
an alternative.

### Rule 2 — Every interactive element has a `data-testid`

Every `<button>`, `<a>`, `<input>`, `<select>`, `<textarea>`, and interactive
custom element gets a stable `data-testid`. Non-interactive status badges that
change state (e.g. provisioning phase, read-only banner) also get a `testid`
so agents can assert on them.

CI enforces this via `scripts/check-testids.mjs` (A6).

### Rule 3 — Every interactive element has an accessible name

Prefer visible text. For icon-only buttons (copy, close, menu, rotate), add
an explicit `aria-label`. Keep labels ≤ 40 characters, verb-first, specific.

Axe-core rules `button-name` and `link-name` must pass with zero violations
on every page.

### Rule 4 — Every UI action has a documented API equivalent

Every `testid` that invokes a state-changing UI action must have a
corresponding entry in `/.well-known/actions.json` pointing to the API method
+ URL that does the same thing. This lets a cautious agent call the API
directly rather than simulating clicks.

`scripts/check-actions-manifest.mjs` (A6) enforces that every declared testid
exists in source, and every declared API path is in the Express swagger.

---

## Naming convention for `data-testid`

Format: `<surface>-<verb-object>` or `<surface>-<object>-<qualifier>`, all
kebab-case, all lower-case. No dots, no underscores, no slashes.

### Surface prefixes (reserved)

| Prefix | Surface |
|---|---|
| `nav-*` | Site-wide top navbar, hamburger drawer, footer links |
| `footer-*` | Footer (secondary to `nav-*`) |
| `landing-*` | The `/` page |
| `pricing-*` | `/pricing` page and pricing cards |
| `login-*` | `/login` page |
| `signup-*` | `/signup` page |
| `dashboard-*` | `/dashboard` page (customer-facing) |
| `admin-*` | `/admin` and `/admin/[slug]` pages |
| `billing-*` | Billing widget inside dashboard |
| `substrate-*` | Substrate state banner, provisioning progress, read-only banner |
| `keyrot-*` | Key-rotation flow (admin) |
| `checkout-*` | Stripe checkout embedded flows + return handlers |
| `waitlist-*` | Landing-page waitlist form |
| `capacity-*` | Pricing capacity-inquiry form |
| `knowledge-*` | `/knowledge` immersive surface (SidePanel etc.) |
| `verify-*` | `/verify` snapshot-verifier surface (PublicKeysPanel, ScopePanel, drop zone, result cards) |
| `toast-*` | Toast notifications (`toast-*` id matches the event type) |

**Admin subflow aliases.** Some admin-scoped components register names without
the `admin-` prefix where the component itself is only ever rendered inside
`/admin/*` and the extra prefix would be pure noise: `change-plan-*`,
`confirm-upgrade-*`, `proration-*`, `tier-change-*`, `dedicated-migration-*`,
`two-factor-*`, `two-factor-status-card-*`, `recent-auth-gate-*`, `enrol-*`,
`manage-*`, `backup-codes-*`, `six-digit-input-*`. These are still admin-only;
the short prefix is a convention for in-component testids, not a new surface.
The `enrol-*` and `manage-*` prefixes specifically scope to the two sub-flows
inside `/admin/security/two-factor` (enrolment vs management); they never
appear outside that page.

### Verb-object rules

- **Actions:** `<surface>-<verb>-<object>` — e.g. `admin-rotate-key`,
  `dashboard-view-substrate`, `checkout-submit`.
- **Objects/regions:** `<surface>-<object>` — e.g. `nav-drawer`,
  `substrate-banner-readonly`, `billing-widget`.
- **Items in a list/group:** `<surface>-<object>-<key>` — e.g.
  `pricing-card-starter-cta`, `nav-link-blog`.
- **Status / state:** `<surface>-<object>-status` or
  `<surface>-<object>-phase` — e.g. `admin-provision-phase`,
  `keyrot-status-error`.

### Forbidden names

- `test-1`, `foo`, `click-me` — meaningless names.
- Any name containing a UUID, database id, or other non-stable token.
- Any name that mirrors a CSS class. The testid is the selector of record; CSS
  classes change for design reasons.

---

## Pre-registered `testid` names

This list is authoritative for the Sprint 2026-W18 work. Any new interactive
element added during the sprint must choose a name from this list or add a new
entry here **first**, before the PR that uses it.

### Top navbar — `src/components/ui/SiteNavbar.tsx`

**Standard variant (home, pricing, docs, etc.):**

| testid | Element | aria-label |
|---|---|---|
| `nav-home` | Logo link to `/` | "Parametric Memory — home" |
| `nav-link-docs` | `/docs` link | (visible text "Docs") |
| `nav-link-about` | `/about` link | (visible text "About") |
| `nav-link-blog` | `/blog` link (hidden `<md`) | (visible text "Blog") |
| `nav-link-pricing` | `/pricing` link | (visible text "Pricing") |
| `nav-link-faq` | `/faq` link (hidden `<md`) | (visible text "FAQ") |
| `nav-link-legal` | `/terms` link (hidden `<lg`) | (visible text "Legal") |
| `nav-link-privacy` | `/privacy` link (hidden `<lg`) | (visible text "Privacy") |
| `nav-link-knowledge` | `/knowledge` link | (visible text "Knowledge") |
| `nav-auth-dashboard` | Dashboard link (when signed in) | "Open dashboard" |
| `nav-auth-signin` | Sign-in link (when signed out) | (visible text "Sign In") |
| `nav-hamburger` | Hamburger button (M5, visible `<md`) | "Open navigation menu" |
| `nav-drawer` | Drawer container (M5) | (n/a — region with `role="dialog"`) |
| `nav-drawer-close` | Drawer close button (M5) | "Close navigation menu" |
| `nav-drawer-account` | Account section region in the drawer (sprint 2026-W17 — only rendered when the user is signed in; groups Dashboard/Billing/Security/Sign-out) | (n/a — labelled region) |
| `nav-drawer-dashboard` | Dashboard link inside the drawer's account section (signed-in users) | (visible text "Dashboard") |
| `nav-drawer-billing` | Billing-portal trigger inside the drawer's account section — opens Stripe portal in the same tab | (visible text "Billing") |
| `nav-drawer-security` | Security link to `/admin/security` inside the drawer's account section | (visible text "Security") |
| `nav-drawer-signout` | Sign-out button inside the drawer's account section — POSTs to `/api/auth/logout` then redirects to `/login` | (visible text "Sign out") |

**Immersive variant (`/visualise`, `/knowledge`):**

| testid | Element | aria-label |
|---|---|---|
| `nav-immersive-home` | Logo link | "Parametric Memory — home" |
| `nav-immersive-auth` | Auth link (dashboard or sign-in) | "Open dashboard" / "Sign in" |

### Landing — `src/app/page.tsx`

| testid | Element |
|---|---|
| `hero-video` | Background video element on the landing-page hero (sprint 2026-W17 — replaced the static MemoryRing). Audio stripped at encode time + `muted` attribute set; decorative (`aria-hidden`); the slogan is in DOM via HeroAnimatedSequence. |
| `landing-hero-cta-primary` | Primary "Get started" button |
| `landing-hero-cta-secondary` | Secondary "View pricing" link |
| `landing-section-features` | Features region |
| `waitlist-form` | Waitlist form element |
| `waitlist-email` | Email input |
| `waitlist-submit` | Submit button |

### Pricing — `src/app/pricing/*`

| testid | Element |
|---|---|
| `pricing-card-starter-cta` | Starter tier CTA |
| `pricing-card-solo-cta` | Solo tier CTA |
| `pricing-card-pro-cta` | Professional tier CTA |
| `pricing-card-team-cta` | Team tier CTA |
| `pricing-card-enterprise-cloud-cta` | Enterprise Cloud CTA |
| `pricing-card-enterprise-self-cta` | Enterprise Self-Hosted CTA |
| `pricing-comparison` | Competitor comparison section (M5b) |
| `pricing-comparison-table` | Desktop `<table>` layout (≥ md) (M5b) |
| `pricing-comparison-cards` | Mobile stacked-card `<ul>` layout (< md) (M5b) |
| `pricing-comparison-row-<slug>` | One row per feature in both layouts (M5b) |
| `capacity-form` | Capacity-inquiry form (pre-registered; template below is the live form) |
| `capacity-email` | Email input |
| `capacity-company` | Company input |
| `capacity-notes` | Notes textarea |
| `capacity-submit` | Submit button |
| `capacity-form-<tier>` | Per-tier capacity-inquiry form wrapper (`enterprise-cloud`, `enterprise-self`) |
| `capacity-cta-<tier>` | Open-form CTA on the tier card; also the collapse button after submit |
| `capacity-success-<tier>` | Post-submit confirmation region (`role="status"`) |
| `capacity-tier-label-<tier>` | Hidden label paired with the tier-id input |
| `capacity-tier-input-<tier>` | Hidden `<input>` carrying the tier id on form submit |

### Login + signup — `src/app/login/*`, `src/app/signup/*`

| testid | Element | aria-label |
|---|---|---|
| `login-form` | Email/password form | (n/a) |
| `login-email` | Email input | (associated `<label>`) |
| `login-password` | Password input | (associated `<label>`) |
| `login-error` | Error message region | (`role="alert"`) |
| `login-submit` | Submit button | (visible text "Sign in") |
| `signin-google` | Google SSO button (S2) | "Sign in with Google" |
| `signin-github` | GitHub SSO button (S2) | "Sign in with GitHub" |
| `signup-form` | Signup form | (n/a) |
| `signup-email` | Email input | (associated `<label>`) |
| `signup-password` | Password input | (associated `<label>`) |
| `signup-tier-select` | Tier radio group | (fieldset legend) |
| `signup-form-submit` | Submit button | (visible text "Create account") |
| `signup-error` | Error message region | (`role="alert"`) |
| `signup-cancel-banner` | "Signup cancelled" recovery banner shown on return from Stripe checkout cancel | (`role="status"`) |

### Dashboard — `src/app/dashboard/*`

| testid | Element |
|---|---|
| `dashboard-substrate-list` | Substrate list region |
| `dashboard-substrate-row-<slug>` | One row per substrate (slug-interpolated) |
| `dashboard-add-substrate` | Primary CTA to provision another |
| `dashboard-view-substrate-<slug>` | Link into admin page for that substrate |
| `billing-widget` | Billing widget container |
| `billing-status-badge` | Current subscription status badge |
| `billing-payment-failure-banner` | Payment-failure banner (F2) |
| `billing-payment-failure-retry-cta` | "Update card" CTA inside banner (F2) |
| `billing-invoice-upcoming` | Renews-on banner (F5) |
| `billing-portal-cta` | Open Stripe portal |
| `cancel-substrate-modal-backdrop` | Modal backdrop for the cancel-substrate confirmation in the Dashboard substrate-list flow; click-to-dismiss target (sibling of the inner card whose `onClick={(e) => e.stopPropagation()}` keeps clicks inside the modal from bubbling) |

### Admin — `src/app/admin/*`, `src/app/admin/[slug]/*`

| testid | Element |
|---|---|
| `admin-back-to-dashboard` | "← Back to Dashboard" link in the admin page subheader (sprint 2026-W17 — moved out of the bespoke admin header into a breadcrumb when SiteNavbar replaced the custom navbar) |
| `admin-substrate-header` | Header region with name + status |
| `admin-copy-api-key` | Copy-to-clipboard button |
| `admin-rotate-key` | Rotate-API-key button |
| `admin-billing-label` | Section label (`<p>Billing</p>`) on the merged Billing+Status card; pinned with a testid so tests can disambiguate it from the `nav-drawer-billing` span in the SiteNavbar drawer that also reads "Billing" |
| `admin-change-plan` | Change-plan button |
| `admin-change-plan-sheet` | Change-plan sheet dialog |
| `admin-change-plan-confirm` | Confirm-upgrade button in sheet |
| `admin-provision-phase` | Provisioning phase badge (F1) |
| `admin-provision-error` | Provisioning error detail (F1) |
| `admin-tier-change-banner` | In-progress migration banner (F4) |
| `admin-tier-change-phase` | Tier-change phase badge (F4) |
| `admin-tier-change-error` | Tier-change error detail (F4) |
| `substrate-banner-readonly` | Read-only reason banner (F3) |
| `substrate-banner-readonly-cta` | CTA inside read-only banner (F3) |
| `keyrot-status` | Key-rotation status region (F6) |
| `keyrot-status-error` | Error-reason detail (F6) |
| `keyrot-restart` | Restart-rotation button (F6) |
| `keyrot-status-reauth` | Re-auth-required alert banner shown inside `keyrot-status` when the rotation flow needs the user to re-authenticate before continuing (F6) |
| `keyrot-reauth-cta` | "Re-authenticate" link/button inside `keyrot-status-reauth`; navigates to the re-auth flow (F6) |

**Change-plan subflow — `src/app/admin/ChangePlanButton.tsx`, `ChangePlanSheet.tsx`:**

| testid | Element |
|---|---|
| `change-plan-button` | Trigger button that opens the change-plan sheet |
| `change-plan-sheet` | Sheet dialog container (`role="dialog"`) |
| `change-plan-sheet-backdrop` | Modal backdrop (click-to-close target) |
| `change-plan-sheet-close` | Close (×) button inside sheet header |
| `change-plan-sheet-subtitle` | Subtitle paragraph under the sheet title |
| `change-plan-sheet-options` | `<ul>` containing the selectable plan options |
| `change-plan-sheet-loading` | Loading spinner region while options are fetched |
| `change-plan-sheet-error` | Error region when options fetch fails |
| `change-plan-sheet-empty` | Empty-state region when no plans are eligible |
| `change-plan-option-<tier>` | One plan-option row per eligible tier; suffixes `-price`, `-hosting`, `-deltas`, `-warning`, `-select` target the row's subregions |

**Confirm-upgrade subflow — `src/app/admin/ConfirmUpgradeDialog.tsx`:**

| testid | Element |
|---|---|
| `confirm-upgrade-dialog` | Confirmation dialog container (`role="dialog"`) |
| `confirm-upgrade-backdrop` | Modal backdrop |
| `confirm-upgrade-close-icon` | "×" close icon in the dialog top-right; dismisses without confirming (sibling of `confirm-upgrade-cancel`; provided so agents/tests can target the icon variant separately from the textual Cancel button) |
| `confirm-upgrade-cancel` | Cancel button |
| `confirm-upgrade-confirm` | Confirm-and-charge button |
| `proration-charge` | "Charge today" amount line |
| `proration-monthly` | New monthly rate line |
| `proration-full-line` | Full breakdown footnote ("X/mo starting …") |
| `dedicated-migration-warning` | Warning block shown when the target tier triggers a dedicated-cluster migration |

**Tier-change progress banner — `src/app/admin/TierChangeProgressBanner.tsx`:**

| testid | Element |
|---|---|
| `tier-change-banner` | Root banner shown while a tier-change migration is in flight (`role="status"`) |
| `tier-change-phase-list` | Ordered list of migration phases |
| `tier-change-retry-counter` | Retry-count detail shown when a phase is retrying |

### Security — `src/app/admin/security/*`

Two-factor (TOTP) enrolment, management, disable, and regenerate-backup-codes flows. Sprint 8 of the TOTP rollout (`docs/sprint-totp-implementation.md`). The status card lives on `/admin/security`; the wizard + management flows live on `/admin/security/two-factor`. Sub-flows (enrolment vs management) are mounted inside the same client component with an in-memory state machine — the testids let tests target each step without separate URLs.

**Status card on `/admin/security` — `src/components/TwoFactorStatusCard.tsx`:**

| testid | Element |
|---|---|
| `two-factor-status-card-loading` | Skeleton card while the initial `/status` fetch is in flight |
| `two-factor-status-card-error` | Soft-fallback card shown when `/status` returns an error or null body |
| `two-factor-status-card-cta-fallback` | "Open settings" link inside the error card |
| `two-factor-status-card-not-enrolled` | Card body for the "Off" state |
| `two-factor-status-card-enable` | "Set up two-factor authentication" CTA inside the not-enrolled card |
| `two-factor-status-card-enrolled` | Card body for the "On" state |
| `two-factor-status-card-last-used` | Last-used-at value inside the enrolled card |
| `two-factor-status-card-backup-count` | "X of 10 remaining" backup-codes value |
| `two-factor-status-card-manage` | "Manage" CTA inside the enrolled card |

**Wizard chrome — `src/app/admin/security/two-factor/TwoFactorClient.tsx`:**

| testid | Element |
|---|---|
| `two-factor-loading` | Skeleton card on the wizard page while `/status` is fetched |
| `two-factor-error` | Network-error retry card on the wizard page (`role="alert"`) |
| `two-factor-breadcrumb-back` | "← Security" link in the breadcrumb |

**Recent-auth gate — `src/components/RecentAuthGate.tsx`:**

The gate wraps any TOTP-mutating UI. Renders children when `recentAuthFresh: true`; otherwise renders the re-verify UX described below.

| testid | Element |
|---|---|
| `recent-auth-gate-loading` | Skeleton card during initial `/status` fetch |
| `recent-auth-gate-error` | Network-error fallback card (`role="alert"`) |
| `recent-auth-gate-retry` | "Try again" button inside the error card |
| `recent-auth-gate-stale` | Re-verify card body when recent-auth is stale |
| `recent-auth-gate-error-message` | Inline error after a failed magic-link request |
| `recent-auth-gate-send-email` | "Email me a sign-in link" button on the stale card |
| `recent-auth-gate-email-sent` | "Check your email" card after a successful send |
| `recent-auth-gate-resend` | "resend" link inside the email-sent card |
| `recent-auth-gate-recheck` | "I clicked the link" button — manual refetch fallback when `visibilitychange` doesn't fire (mobile) |

**Enrolment sub-flow — wizard steps for `not-enrolled → enrolled`:**

| testid | Element |
|---|---|
| `enrol-step-intro` | Step 1 card body — explainer + Continue + Cancel |
| `enrol-step-intro-continue` | "Continue" button → triggers `/setup-init` |
| `enrol-step-intro-cancel` | "Cancel" link → `/admin/security` |
| `enrol-error` | Inline error on the intro step (e.g. `/setup-init` failed) |
| `enrol-step-scan` | Step 2 card body — QR + manual key + Continue |
| `enrol-qr-svg` | Server-rendered QR SVG container (innerHTML injected) |
| `enrol-manual-key` | Monospace block with the base32 secret for manual entry |
| `enrol-step-scan-continue` | "I scanned the code" button → advances to verify step |
| `enrol-step-scan-cancel` | "Cancel" button → resets wizard via startOver |
| `enrol-step-verify` | Step 3 card body — six-digit input + submit |
| `enrol-verify-error` | Inline error after a failed `/setup-verify` (wrong code, etc.) |
| `enrol-step-verify-submit` | "Confirm" button (auto-submit also fires from `SixDigitInput.onComplete`) |
| `enrol-step-codes` | Step 4 card body — the 10 backup codes + acknowledge + finish |
| `enrol-backup-codes` | `<ul>` listing the 10 codes |
| `enrol-backup-code-<idx>` | One `<li>` per backup code (`idx = 0..9`) |
| `enrol-acknowledge` | "I've saved these" checkbox |
| `enrol-step-codes-finish` | "Done" button → returns to `/admin/security` |
| `enrol-fallback` | Defensive fallback rendered if the state machine reaches an unexpected state |

**Management sub-flow — wizard steps for `enrolled → disable | regenerate`:**

| testid | Element |
|---|---|
| `manage-step-overview` | Top card showing on-state + last-used + backup count |
| `manage-go-disable` | "Disable 2FA" button → opens the disable step |
| `manage-go-regenerate` | "Regenerate codes" button → opens the regenerate step |
| `manage-step-disable` | Disable step card body |
| `manage-disable-input` | Single-line input accepting EITHER 6-digit code OR `xxxx-xxxx` backup code |
| `manage-disable-submit` | "Disable 2FA" submit button |
| `manage-disable-cancel` | "Cancel" button → returns to overview step |
| `manage-disable-error` | Inline error after a failed `/disable` |
| `manage-step-regenerate` | Regenerate step card body (TOTP code only — backup codes rejected) |
| `manage-regenerate-submit` | "Regenerate" submit button (auto-submit also fires from `SixDigitInput.onComplete`) |
| `manage-regenerate-cancel` | "Cancel" button → returns to overview step |
| `manage-regenerate-error` | Inline error after a failed `/regenerate-backup-codes` |
| `manage-step-codes` | New-codes display step after regenerate |
| `manage-backup-codes` | `<ul>` listing the 10 newly-issued codes |
| `manage-backup-code-<idx>` | One `<li>` per backup code (`idx = 0..9`) |
| `manage-acknowledge` | "I've saved these new codes" checkbox |
| `manage-codes-finish` | "Done" button → returns to `/admin/security` with toast |

**Cross-flow — `src/app/admin/security/two-factor/TwoFactorClient.tsx`:**

| testid | Element |
|---|---|
| `backup-codes-download` | "Download as .txt" anchor; in-memory blob URL revoked on unmount. Used by both `enrol-step-codes` and `manage-step-codes`. |

**Six-digit input — `src/components/SixDigitInput.tsx`:**

Used in the enrolment verify step and the regenerate step. Default `dataTestId` is `"six-digit-input"`; a parent component can override via the `dataTestId` prop.

| testid | Element |
|---|---|
| `six-digit-input` | Wrapper `<div role="group">` containing the six inputs |
| `six-digit-input-<idx>` | One single-character `<input>` per digit (`idx = 0..5`) |

### Login challenge (Sprint 9) — `src/app/auth/two-factor/*`

Login-time TOTP prompt. Routed here from /auth/callback when compute returns requiresFactor: 'totp' (Sprint 5 fork). The pending token lives in the mmpm_pending_token httpOnly cookie set by /auth/callback; this page POSTs the user-provided code to /api/auth/factors/totp/login-verify which reads the cookie server-side and forwards to compute.

| testid | Element |
|---|---|
| `two-factor-challenge` | Card body for the default state (TOTP or backup-code prompt + submit) |
| `two-factor-challenge-locked` | Lockout card when the pending row is locked (5 wrong codes) |
| `two-factor-challenge-back-to-login` | "Request a new sign-in link" CTA inside the lockout card |
| `two-factor-challenge-error` | Inline error after a failed code (carries attempts-remaining text) |
| `two-factor-challenge-backup-input` | Single-line input for xxxx-xxxx backup codes (alternative to the SixDigitInput) |
| `two-factor-challenge-submit` | "Sign in" button — only rendered in backup-code mode (TOTP mode auto-submits via SixDigitInput.onComplete) |
| `two-factor-challenge-toggle-mode` | Toggle between 6-digit and backup-code inputs |

### Auth audit (Sprint 7) — `src/app/admin/security/audit/*`

Read-only audit feed of every auth-relevant event tied to the signed-in account. Recent-auth gated — same security bar as the TOTP card on `/admin/security`. Reached via the "Recent activity" card on `/admin/security`. Lists events with cursor pagination + a kind filter; each row shows the formatted label, parsed UA, IP, and ISO timestamp.

| testid | Element |
|---|---|
| `auth-audit-card-link` | The "Recent activity" card on `/admin/security` that links to the audit page |
| `auth-audit-feed` | Outer container of the feed (rendered after RecentAuthGate passes) |
| `auth-audit-back-to-security` | "← Back to security" link in the page header |
| `auth-audit-kind-filter` | `<select>` for narrowing the feed by event-kind group |
| `auth-audit-list` | `<ul>` containing the per-event rows |
| `auth-audit-item` | One `<li>` per event. Carries `data-event-kind="<kind>"` for targeted assertions |
| `auth-audit-load-more` | "Load older events" button — only rendered when `nextCursor` is non-null |
| `auth-audit-loading` | Skeleton paragraph shown while the first page is in flight |
| `auth-audit-empty` | Empty-state copy when the feed has no rows |
| `auth-audit-error` | Inline error region (network failure, 401, malformed response) |
| `auth-audit-retry` | Retry button inside the error region |

### Verify page — `src/app/verify/*`

Cryptographic snapshot verifier. The drop zone is the primary affordance (handled by a hidden `<input type="file">` inside a `<label>`, no testid needed because the input itself is the interactive element and the label wraps it). Additional surfaces:

- **ScopePanel** (V1.1) renders the "what this proves / does not prove" framing after a verify completes — non-interactive, no testid.
- **FreshnessLine** (V1.4) renders exporter host + relative age inside the result hero — non-interactive, no testid.
- **PublicKeysPanel** (V1.2 + V1.3) renders the JWKS publication panel anchored to the verified snapshot's signature, including the **Fetch JWKS now** button (V1.3) that lets the reader live-verify the embedded key against the published key from inside the browser. The button + its three result states are the only interactive surface inside this panel; each carries a testid below.

| testid | Element |
|---|---|
| `verify-fetch-jwks` | "Fetch JWKS now" button inside PublicKeysPanel (V1.3). Clicking it fetches `signature.keyUri` cross-origin, looks up `signature.kid` in the response, and recomputes the SHA-256 fingerprint of the published key for comparison against the embedded fingerprint. |
| `verify-jwks-result-match` | Green result panel rendered when the published fingerprint equals the embedded fingerprint. Shows the kid found in the JWKS, the published fingerprint, and the embedded fingerprint side by side. |
| `verify-jwks-result-mismatch` | Red result panel rendered when (a) the snapshot's kid is not present in the published JWKS, OR (b) the kid is present but the published key's fingerprint differs from the embedded fingerprint. Both branches mean "refuse to trust this snapshot." |
| `verify-jwks-result-error` | Amber result panel rendered when the cross-origin fetch fails (network error, 5xx, CORS misconfiguration). Explicitly tells the reader the embedded-key signature path is still structurally safe — the fallback is by-design, not a vulnerability. |
| `verify-hash-toggle` | Click-to-expand button rendered by the `<HashWithCopy>` primitive (V2.2) on every truncatable hex value shown on the verify page (CheckCard `expected`/`computed` hashes, ShardRootsTable per-shard roots, SnapshotMeta `masterRoot` + `publicKey fingerprint`). Click toggles between truncated (`first-N + …`) and full hex display. `aria-expanded` reflects the state. Same testid is emitted by every instance — tests scope via `within(card)` for specificity. |
| `verify-hash-copy` | Copy-to-clipboard icon rendered by `<HashWithCopy>` next to every hash. On click invokes `navigator.clipboard.writeText(fullHex)` and flips the icon to a green checkmark for 1.5s with `title="Copied"`. `aria-label` describes which hash is being copied. Same instance-multiple pattern as `verify-hash-toggle`. |
| `verify-hash-match-tick` | Inline green ✓ rendered in a CheckCard's `computed` row (V2.3) when the card is PASS and the computed hash byte-equals the expected hash. Visual confirmation that the verifier did the work and got the same answer — the trust signal that "computed equals expected" is now visible, not implicit. `aria-label="computed matches expected"`. Same instance-multiple pattern as the other `verify-hash-*` testids; tests scope via `within(card)`. Absent on FAIL (where the FAIL/red rendering already conveys disagreement) and absent on cards where either expected or computed is missing. |
| `verify-tamper-controls` | The tamper-demo panel (V2.1) rendered below the result panel on a successful verify. Header text "Tamper with this snapshot" and three mutation buttons (children below). Only rendered on `state.kind === "done"`. |
| `verify-tamper-flip-master` | "Flip a bit in masterRoot" button (V2.1). On click, the parent mutates a deep clone of the verified snapshot by flipping the high bit of `tree.masterRoot[0]` and re-runs the verifier. Expected outcome: masterRoot card and Ed25519 signature card both FAIL. `aria-label="Flip a bit in tree.masterRoot"`. |
| `verify-tamper-mutate-atom` | "Mutate atoms[0].leafHash" button (V2.1). On click, flips a bit in the first atom's leafHash. Expected outcome: the affected shard's root FAILs. Disabled when the snapshot has no atoms. `aria-label="Mutate the leaf hash on the first atom"`. |
| `verify-tamper-drop-audit` | "Drop an audit entry" button (V2.1). On click, shifts the first entry from `auditLogExcerpt.entries`. Expected outcome: auditLogRoot card FAILs. Disabled when the snapshot has no audit-log entries. `aria-label="Drop the first audit-log entry"`. |
| `verify-tamper-restore` | "Restore original" button (V2.1) shown only when a tamper is active. Reverts the displayed result + scope panel to the original verified state without re-running the verifier. `aria-label="Restore the original (un-tampered) snapshot"`. |
| `verify-tamper-ribbon` | Yellow header banner (V2.1) rendered above the scope panel when a tamper is active. Visually distinct from a real FAIL (yellow not red) to make clear "this is a demo, not a shipped bug". Names which mutation was applied and which checks are expected to fail. |
| `verify-atom-context` | Sentence below the Snapshot metadata table (V2.4) anchoring the abstract atom-count to concrete meaning ("MMPM agent memory entries — facts, procedures…") and stating the redaction stance for THIS snapshot (derived from whether any atom has a `value` field — never hardcoded). Wording adapts to redacted vs unredacted snapshot. No hardcoded counts. |
| `verify-success-greeting` | Human-tone sentence (V3.4) at the top of the result hero panel, above the technical `result.summary` line. Renders ONLY on `state.kind === "done" && result.overallOk === true`. Tells the reader what they just accomplished in plain language ("You just independently verified an MMPM signed memory snapshot in your browser. No server trust, no API key, no Parametric Memory code path.") before the engine output. Absent on FAIL — the rose-coloured summary speaks for itself; a warmer greeting would feel tone-deaf. |

### Knowledge — `src/components/knowledge/*`

| testid | Element |
|---|---|
| `knowledge-sidepanel` | Collapsible side-panel container on `/knowledge` (`role="complementary"`) |
| `knowledge-overlay-toggle` | Top-right control panel that hides/shows the SearchBar and bottom-left controls (sprint 2026-W17 — added so the user can capture a clean substrate hero video) |
| `knowledge-toggle-search` | Checkbox: hide/show the SearchBar overlay |
| `knowledge-toggle-search-label` | The `<label>` wrapping the search checkbox (clickable text) |
| `knowledge-toggle-weight` | Checkbox: hide/show the bottom-left DegreeSizeSlider + ViewToggle cluster |
| `knowledge-toggle-weight-label` | The `<label>` wrapping the weight checkbox (clickable text) |

### Checkout + billing return

| testid | Element |
|---|---|
| `checkout-submit` | Embedded Stripe checkout submit (or our return handler) |
| `checkout-success` | Success state region |
| `checkout-error` | Error state region |

### Toasts — `src/components/ui/Toaster` (sonner)

| testid | Element |
|---|---|
| `toast-rate-limit` | 429 rate-limit toast (F7) |
| `toast-error-generic` | Generic error toast |

### Legal pages — `src/app/{terms,aup}/page.tsx`

Legal-page testids anchor the protective clauses (pricing changes,
suspension, indemnification, force majeure, AUP enforcement). They are
asserted by `src/app/__tests__/legal-clauses.test.ts` so accidental
deletion of a clause fails CI.

| testid | Element |
|---|---|
| `terms-section-5` | `<h2>` Section 5 (Subscription Plans & Payment) on `/terms` |
| `terms-pricing-changes` | `<h3>` Section 5.3 (Right to Change Pricing) on `/terms` |
| `terms-section-6` | `<h2>` Section 6 (Suspension, Cancellation & Termination) on `/terms` |
| `terms-suspension` | `<h3>` Section 6.2 (Suspension by MMPM) on `/terms` |
| `terms-termination` | `<h3>` Section 6.3 (Termination by MMPM) on `/terms` |
| `terms-no-refund-cause` | `<h3>` Section 6.5 (No Refund on Termination for Cause) on `/terms` |
| `terms-indemnification` | `<h2>` Section 14 (Indemnification) on `/terms` |
| `terms-force-majeure` | `<h2>` Section 15 (Force Majeure) on `/terms` |
| `aup-section-5` | `<h2>` Section 5 (Enforcement) on `/aup` |
| `aup-enforcement-actions` | `<h3>` Section 5.1 (Range of Actions) on `/aup` |
| `aup-no-prior-notice` | `<h3>` Section 5.2 (No Prior Notice for Severe Violations) on `/aup` |
| `aup-discretion` | `<h3>` Section 5.3 (Discretion and Finality) on `/aup` |
| `aup-no-refund` | `<h3>` Section 5.4 (No Refund on Enforcement Action) on `/aup` |

### Copyright page — `src/app/copyright/page.tsx`

Public-facing copyright + licensing statement (closed-source migration,
Sprint 2026-W18). Anchors the canonical notice, the human-authorship
statement, and the New Zealand jurisdiction clause. Asserted by
`src/app/copyright/__tests__/page.test.tsx` so any wording drift in
load-bearing legal sentences fails CI before deploy.

| testid | Element |
|---|---|
| `copyright-page-main` | `<main>` wrapper on `/copyright` |
| `copyright-page-heading` | `<h1>` "Copyright & Licensing" on `/copyright` |
| `copyright-canonical-notice` | Boxed canonical short notice ("© 2025–2026 G. Osborne … New Zealand") on `/copyright` |
| `copyright-authorship-statement` | `<p>` in §1 stating the work is by a sole human author with AI used as an instrument under continuous human direction |
| `copyright-jurisdiction-statement` | `<p>` in §2 declaring New Zealand as place of first publication and the exclusive jurisdiction for any dispute |

### SiteFooter — `src/components/ui/SiteFooter.tsx`

Site-wide canonical copyright trailer rendered globally from
`src/app/layout.tsx` so every page (including ones without their own
bespoke footer) carries the canonical copyright + jurisdiction line.
Asserted by `src/components/ui/SiteFooter.test.tsx` and by
`src/app/__tests__/mobile-typography.test.tsx`.

| testid | Element | Accessible name |
|---|---|---|
| `site-footer` | `<footer role="contentinfo">` site-wide trailer | "Site copyright" (`aria-label`) |
| `site-footer-copyright` | `<p>` containing the canonical "© 2025–2026 G. Osborne …" string + link | (visible text) |
| `site-footer-copyright-link` | `<Link href="/copyright">` to the public copyright page | "Copyright & licensing" (visible text) |

---

## `aria-label` patterns

**Icon-only buttons** — always an `aria-label`. Keep it verb-first, specific:

```tsx
<button type="button" data-testid="admin-rotate-key" aria-label="Rotate API key">
  <RotateIcon />
</button>
```

**Buttons with visible text** — do not duplicate the text in `aria-label`.
Screen readers already announce it. Only add an `aria-label` if you need to
override or clarify (e.g. an icon+number button where the icon has no text).

**Links with truncated text** — put the full text in `aria-label` and keep the
visible text truncated:

```tsx
<Link href="/dashboard" aria-label={`Dashboard — signed in as ${email}`}>
  {email.split("@")[0]}
</Link>
```

**Forms** — every `<input>` has either a visible `<label for>` or an
`aria-label`. Grouped radios/checkboxes sit inside `<fieldset>` with a
`<legend>`.

---

## Relationship to other sprint items

- **A2** (testid sweep) adds the `data-testid` attributes defined here to
  existing components. No logic changes.
- **A3** (accessible-name audit) adds the `aria-label` attributes defined here
  and raises axe-core to zero violations.
- **A4** (action manifest) references testids from the "UI action" section of
  each entry. The `id` field of each manifest entry maps 1:1 to the `verb-object`
  portion of the testid for the primary action on that surface (e.g. manifest
  `id: "rotate-key"` → testid `admin-rotate-key`).
- **A5** (JSON-LD actions) puts `potentialAction.target.url` on the page that
  hosts the corresponding testid.
- **A6** (CI guards) enforces that the source tree and the action manifest
  agree with this document.
- **A7** (`llms.txt`) links to this document under the `Docs` section.
- **M5** (mobile hamburger) uses `nav-hamburger`, `nav-drawer`, and
  `nav-drawer-close` as registered above. The drawer reuses the existing
  `nav-link-*` testids from the standard navbar.
- **S2** (Google + GitHub buttons) uses `signin-google` and `signin-github` as
  registered above.
- **F1–F7** (feedback items) use the `substrate-*`, `admin-provision-*`,
  `admin-tier-change-*`, `billing-payment-failure-*`, `billing-invoice-upcoming`,
  `keyrot-*`, and `toast-rate-limit` testids as registered above.

---

## Enforcement (CI)

`scripts/check-testids.mjs` (ships in A6):

1. Walk every `.tsx` file under `src/`.
2. Parse JSX and find every `<button>`, `<a href>`, `<input>`, `<select>`,
   `<textarea>`, and any element with an `onClick` or `onSubmit` prop.
3. Fail if any such element lacks a `data-testid`.
4. Fail if any `data-testid` is used that does not appear in this document or
   is not whitelisted.
5. Allowlist: third-party components (sonner's internal toast markup, Next.js
   internals).

`scripts/check-actions-manifest.mjs` (ships in A6):

1. Load `/.well-known/actions.json` from the built route (or read the route
   source statically).
2. Fail if any manifest entry's `ui.testid` is not present in the source tree.
3. Fail if any manifest entry's `api.url` is not present in the compute repo's
   Express swagger / OpenAPI document.

---

## Update process

- Before adding a new interactive element in a PR, add an entry to this file
  in the same PR.
- If you need a new surface prefix, propose it in a PR that updates the
  "Surface prefixes (reserved)" table and cite at least two use-sites.
- The doc is versioned by git history; significant restructures bump the v1
  marker at the top.

---

## Related reading

- `/.well-known/actions.json` (lives at the route, not as a static file)
- `public/llms.txt`
- WCAG 2.2 — [Success Criterion 4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html)
- IETF RFC 8615 — [`/.well-known/` URI convention](https://datatracker.ietf.org/doc/html/rfc8615)
- llms.txt spec — [llmstxt.org](https://llmstxt.org)
