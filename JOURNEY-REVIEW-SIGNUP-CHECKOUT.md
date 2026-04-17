# Signup + First Checkout — Journey Review

**Scope.** End-to-end trace of the "never heard of MMPM → MCP endpoint live and API key in hand" journey, spanning `mmpm-website` (Next.js App Router) and `parametric-memory-compute` (Express + PostgreSQL + Stripe + DigitalOcean). UX/UI sanity check, logic sanity check, and a list of missing tests.

**Cross-referenced against.** Live swagger at `http://localhost:3100/api/docs/`, source in both repos, and the existing e2e journey matrix at `parametric-memory-compute/tests/e2e/JOURNEYS.md`.

**Reviewed.** April 17, 2026.

---

## Executive summary

The journey works, but there are **two parallel entry flows** and they diverge in ways a first-time user is likely to notice. The `/signup` page and the `/pricing` page each kick off a different compute endpoint, with different UX contracts for when/how the user sees their API key.

High-priority issues:

1. **`/signup` discards the `checkoutUrl` returned by compute.** `POST /api/v1/signup` creates a substrate with `status='pending_payment'` and returns a Stripe Checkout URL. The website client (`SignupClient.tsx`) never uses it — it shows the API key inline and tells the user to "click the magic link". The substrate remains in `pending_payment` until a subscription webhook fires. If no webhook ever fires (because the user never went to checkout), the user has an API key that points at a substrate that never gets provisioned. See issue **L-1** below.
2. **API key is revealed before the substrate exists.** `/signup` shows the key + `mcp_config` immediately, but provisioning is async and can take ~90s (dedicated tier longer). If the user pastes the config into Claude Desktop in that window, they get connection errors with no explanation. See **UX-1**.
3. **Three checkout endpoints, no single source of truth.** `POST /api/v1/signup`, `POST /api/checkout`, and `POST /api/v1/billing/substrate-checkout` all create Stripe Checkout sessions. It is not obvious from code comments which is canonical for which user. See **L-2**.
4. **Polling cadence is inconsistent.** Success page polls `/api/my-substrate` every 3s (60s cap). Dashboard post-checkout banner polls `/api/substrates` every 2s (60s cap). Dashboard steady-state polls every 10s. Three cadences, two different endpoints. See **UX-2**.
5. **Website has almost no tests for this journey.** The entire signup + checkout + success + claim path is covered by a single React component test (`PricingCardClient.test.tsx`). Compute has solid unit + integration coverage but the website's BFF proxies and client polling are untested. See the "Missing tests" section.

Memory atom `v1.fact.checkout_tier_id_mismatch` (website sends `enterprise-cloud`, compute expects `enterprise_cloud`) is **stale** — verified against current code. Enterprise tiers are website-only (sales redirect in `PricingCTA.tsx`); compute's substrate tiers are `free | starter | indie | pro | team`. Tombstone that atom.

---

## High-level map

```
                                  ┌─────────────────────────────┐
                                  │  FLOW A — Self-serve signup │
                                  │  (/signup page)              │
                                  └──────────────┬──────────────┘
                                                 │
  user visits   ─►  SignupClient.tsx ──► POST /api/signup ──► POST /api/v1/signup
  /signup           (email + ToS)       (website BFF,          (compute, PUBLIC,
                                         CSRF-checked)          no session needed)
                                                                       │
                                                                       ▼
                                                         creates: accounts + substrates(pending_payment)
                                                         + billing_events(signup) + spend_cap
                                                         + Stripe Checkout session (outside TX)
                                                         + api_key (hash only, raw in response)
                                                                       │
                          (checkoutUrl is RETURNED but IGNORED by SignupClient — L-1)
                                                                       │
                                                                       ▼
  magic link email ◄── POST /api/auth/request-link ◄──  (separate call from SignupClient)
      ▼
  /auth/callback?token=X ──► GET /api/auth/verify ──► sets mmpm_session cookie ──► /admin


                                  ┌─────────────────────────────┐
                                  │  FLOW B — Pricing / upgrade │
                                  │  (/pricing page)            │
                                  └──────────────┬──────────────┘
                                                 │
  user visits     ─►  PricingCardClient ──► GET /api/capacity ──► tier availability badges
  /pricing            (+ 3s debounce fresh check on CTA click)

  logged OUT ─► redirect /login?redirect=/pricing ──► magic link ──► back to /pricing

  logged IN  ─► click CTA ──► POST /api/checkout (website BFF, forwards Bearer)
                                       │
                                       ▼
                     POST /api/checkout (compute, session auth)
                                       │
                                       ▼
                     creates: substrate(pending_payment) pre-Stripe
                              Stripe Checkout session (subscription mode)
                              trial_period_days:14 if tier=indie and !hasUsedTrial
                                       │
                                       ▼
               returns { sessionUrl, tier, amountCents } ──► redirect to Stripe

                                       │
                                       ▼
                         Stripe Checkout (hosted)
                                       │
                          success_url redirects back to /billing/success
                                       │
                                       ▼
        ┌──────────────── ALSO in parallel ──────────────────────┐
        │                                                        │
        ▼                                                        ▼
 /billing/success                              POST /api/v1/webhooks/substrate-stripe
 BillingSuccessClient.tsx                      handleSubscriptionCreated()
 polls GET /api/my-substrate                   • INSERT substrate_subscriptions
 every 3s for 60s                              • UPDATE accounts.tier
 until mcpEndpoint is set                      • INSERT substrate_provision_queue
                                               • INSERT billing_events
                                                             │
                                                             ▼
                                          SUBSTRATE PROVISIONER WORKER (async)
                                          src/workers/substrate-provisioner.ts
                                          • SSH to substrate host
                                          • docker compose up (mmpm-service + mmpm-mcp)
                                          • write Traefik config
                                          • poll /health with exp. backoff, 2-min timeout
                                          • on healthy: UPDATE substrates
                                            SET status='running', mcp_endpoint=...

                                                             │
                                                             ▼
                                    /billing/success now sees mcpEndpoint
                                    shows: copy MCP endpoint + Claude Desktop steps
                                                             │
                                                             ▼
                              user pastes config into Claude Desktop
                              key from /signup response (Flow A) OR
                              POST /api/v1/substrates/:slug/claim-key (Flow B)
                              atomic CTE: SELECT pending_api_key, UPDATE to NULL
                                                             │
                                                             ▼
                                                   Claude Desktop connects
                                                   5-location token chain intact
```

---

## Step-by-step trace

### Step 1 — Entry

Website has two front doors.

| Entry | File | Purpose |
|---|---|---|
| Marketing CTAs | `src/app/page.tsx:531, :749` | "Get Your Instance" → `/pricing` |
| Pricing page | `src/app/pricing/page.tsx:212-431` | Capacity-aware tier picker |
| Signup page | `src/app/signup/page.tsx` + `SignupClient.tsx` | Email-first, instant API key |

**UX observation.** The homepage CTA and the top-nav both go to `/pricing`. `/signup` is reachable but not in the primary flow (it is linked from the login page as "create account"). The practical default new-user path is `/pricing` → click CTA → `/login` → magic link → `/pricing` again → Stripe. This means Flow B (checkout-first) is the dominant path. Flow A (signup page) is a fallback.

### Step 2 — Magic-link authentication

| Step | Website | Compute |
|---|---|---|
| Request link | `LoginClient.tsx:59` POSTs `/api/auth/request-link` | `src/api/auth/routes.ts:49-78` — writes `auth_tokens`, sends via Resend |
| Email delivered | — | Magic link URL is `https://parametric-memory.dev/auth/callback?token=…` |
| Callback | `src/app/auth/callback/route.ts:25-101` — calls compute verify, sets `mmpm_session` httpOnly cookie | `src/api/auth/routes.ts:93-157` — GET /api/auth/verify, marks token used, issues raw session token |
| Session check | Forwarded by BFF proxies as `Authorization: Bearer <cookie>` | `src/middleware/session-auth.ts` (`requireSession`) |
| Logout | `src/app/auth/callback/route.ts` clears cookie; BFF also forwards `POST /api/auth/logout` | `src/api/auth/routes.ts:162-189` — invalidates session |

**Magic link lifetime.** UI copy says **15 minutes** (`LoginClient.tsx` line 125, `SignupClient.tsx` line 106). Confirm against the actual `auth_tokens.expires_at` default in compute — it was 24h in an earlier atom. Drift is fine as long as the UI and DB agree. **Action:** add a single-source-of-truth constant.

**Post-login redirect.** `auth/callback/route.ts:88-100` reads a cookie to pick the redirect target; default is `/admin`, not `/dashboard`. Verify which page is the canonical logged-in landing — memory shows `/dashboard` as the multi-substrate page and `/admin` as per-substrate. If the default is wrong the user lands in the wrong place after their first magic link.

### Step 3a — Flow A: `/signup` (email-first)

`SignupClient.tsx:190-254`:

1. POST `/api/signup` with `{ email, agreedToTerms:true, termsVersion:"2026-04-05" }`.
2. If 200 → new account created. Parse response, show `apiKey` + `mcpConfig` inline (lines 110-163). Warning text: *"Save this now. It cannot be retrieved again."*
3. If 409 → account already exists. Proceed to step 4 silently.
4. If 422 → show validation errors.
5. Then POST `/api/auth/request-link` to send the magic link.
6. Render `CheckEmailView`.

Compute `POST /api/v1/signup` (`src/api/signup/routes.ts:72-278`):

- INSERT `accounts` (tier='free', agreed_to_terms_at=NOW()).
- INSERT `substrates` (tier='free', status='pending_payment', `api_key_hash`, `mcp_auth_key_hash`).
- INSERT `billing_events` (event_type='signup').
- INSERT spend cap (platform ceiling).
- Outside TX: generate Stripe Checkout session with $1 free-tier price (per memory atom `free_tier_now_1_dollar_stripe_checkout`).
- Return `{ customerId, slug, tier, mcpEndpoint, apiKey, mcpConfig, limits, status:'pending_payment', checkoutUrl }`.

**Critical gap — L-1.** The `checkoutUrl` returned by compute is **not** in `SignupClient.tsx`'s `SignupResult` interface (lines 8-23) — the field is silently discarded. That means:

- If `/signup` is the intended "free-tier onboarding" path, the user needs Stripe to fire `subscription.created` for provisioning to kick off. Without hitting `checkoutUrl`, no subscription is created and the substrate sits in `pending_payment` forever.
- OR there is a separate free-tier auto-provision path that bypasses Stripe — if so, it's undocumented and the `checkoutUrl` returned is dead weight.

Either way, **behaviour is ambiguous.** Decide:
- **Option A (charge-first):** SignupClient must redirect to `checkoutUrl` immediately after rendering the "check email" view. The API key warning is premature — show it on the success page, not here.
- **Option B (free means free):** Remove `checkoutUrl` from the `POST /api/v1/signup` response and add a free-tier auto-provision step in the signup handler (insert to `substrate_provision_queue` directly). Update the signup page copy to remove any payment-adjacent language.

This is load-bearing for M-1B. File a ticket.

### Step 3b — Flow B: `/pricing` (upgrade / paid)

`PricingCardClient.tsx:62` hydrates capacity badges via `GET /api/capacity` (website BFF → compute `GET /api/v1/capacity`). Fail-open: if compute is unreachable, render "Available" for every tier.

On CTA click (`PricingCTA.tsx:137-207`):

1. Debounced fresh capacity check (3s).
2. If not logged in → `router.push('/login?redirect=/pricing')`.
3. If team tier → render `TeamInquiryForm`, POST `/api/team-inquiry`.
4. Otherwise POST `/api/checkout` with `{ tier:tierId, agreedToTerms:true, termsVersion:"2026-04-05", ...(trial ? { trial:true } : {}) }`.

Website proxy `src/app/api/checkout/route.ts:16-39` → forwards Bearer to compute `POST /api/checkout`.

Compute `src/api/checkout/session-route.ts:50-199`:

- `requireSession` middleware.
- INSERT substrate (tier, `status='pending_payment'`) **before** creating Stripe session.
- Build Stripe Checkout session in `mode:'subscription'`.
- If `tier==='indie'` and `!account.hasUsedTrial` and `trial:true` → `trial_period_days:14`.
- Return `{ sessionUrl, tier, amountCents }`.

**Observation L-2.** There are three checkout endpoints:
- `POST /api/v1/signup` — public, email-only, creates substrate + Stripe session.
- `POST /api/checkout` — session auth, used by `PricingCTA`. Handler pre-creates substrate.
- `POST /api/v1/billing/substrate-checkout` — session auth, per swagger description: *"Create a substrate tier Stripe Checkout session"*.

A BFF proxy exists at `src/app/api/billing/substrate-checkout/route.ts` but **no client component in the website currently POSTs to it** (grep confirms: only `route.ts` and its own test reference it). From the user's perspective, only the first two endpoints are reachable. `substrate-checkout` appears to be either legacy or intended for an unimplemented flow (second-substrate purchase from an existing account?). Add a comment to each of the three explaining its role and which caller is expected, or delete the dead one along with its orphan website proxy.

### Step 4 — Stripe Checkout (hosted)

Nothing to map on our side — Stripe hosts the page. Success URL is configured in the Checkout session params (compute side).

### Step 5 — Stripe webhook

`POST /api/v1/webhooks/substrate-stripe` — `src/api/webhooks/substrate-stripe.ts:56-109`.

- Signature verify via `stripe.webhooks.constructEvent()`.
- Dispatches to `handleSubscriptionCreated` (lines 113-426), `handleSubscriptionUpdated`, `handleSubscriptionDeleted`, `handlePaymentSucceeded`, `handlePaymentFailed`, `handleDisputeCreated`, `handleInvoiceUpcoming`.
- `handleSubscriptionCreated`:
  - Idempotent on `stripe_subscription_id`.
  - Resolves substrate from `subscription.metadata.substrateId` (preferred) or oldest non-deprovisioned substrate for the account.
  - INSERT `substrate_subscriptions`.
  - UPDATE `accounts.tier`.
  - UPDATE `accounts.has_used_trial = TRUE` if applicable (write-once CAS).
  - If substrate is `pending_payment` → INSERT `substrate_provision_queue`.
  - If over tier cap → mark `cap_exceeded`, refund + cancel post-commit.

### Step 6 — Provisioner worker

`src/workers/substrate-provisioner.ts` — runs under PM2, polls `substrate_provision_queue WHERE status='pending'`.

- Generate compose file from `integrations/saas/docker-compose.customer.yml` template.
- SSH to substrate host, `docker compose up -d`.
- Poll container `/health` with exp. backoff (2-min hard cap).
- On healthy: UPDATE `substrates` → `status='running'`, `mcp_endpoint='https://<slug>.<domain>/mcp'`, write Traefik config, mark queue `completed`.
- On timeout: mark queue `failed`, reaper scoops.

### Step 7 — `/billing/success` (post-checkout)

`src/app/billing/success/BillingSuccessClient.tsx:65-240`:

- Line 73: fetch `/api/billing/status` once (tier, status, trial info, etc.).
- Lines 82-115: poll `/api/my-substrate` every 3000ms, max 20 attempts (= 60s wall time), until response has `mcpEndpoint`.
- Render states:
  - Polling: *"Setting up your substrate… (Xs)"* + spinner.
  - Success: copy-block showing `mcpEndpoint` + 3-step Claude Desktop instructions (lines 168-219).
  - Timeout: *"Not ready yet. Check your dashboard in a minute."*

**UX-2 (polling cadence inconsistency).** Success page polls every 3s. Dashboard post-checkout banner (`DashboardClient.tsx:464-467`) polls every 2s. Dashboard steady-state polls every 10s. Pick one cadence per "we're waiting on provisioning" state and use it everywhere. Recommend 2s for the first 60s after any checkout, then back off to 10s.

### Step 8 — Claim the API key

Two paths, depending on entry:

- **Flow A (`/signup`).** Key is in the response body and displayed on the "check email" view. User should copy it now or regenerate later. The warning *"Save this now. It cannot be retrieved again."* is accurate.
- **Flow B (pricing).** The key is not surfaced on success page automatically. User must hit claim-key endpoint:
  - Website BFF: `src/app/api/my-substrate/claim-key/route.ts` — POST, requires `mmpm_session` cookie.
  - Compute: `POST /api/v1/my-substrate/claim-key` (legacy shim) → `POST /api/v1/substrates/:slug/claim-key`.
  - Compute handler: atomic CTE (`src/api/substrates/routes.ts:603-645`) that SELECTs `pending_api_key` FOR UPDATE and UPDATEs to NULL in the same statement. Second call returns `{ claimed: false, message: "..." }` — idempotent.

**UX-3.** `/billing/success` does not currently prompt the user to claim the key. The copy-block shows only `mcpEndpoint`, not the key. Either:
  - Call `claim-key` automatically once provisioning completes and render the raw key inline, with the same "shown once" warning the signup page uses.
  - OR explicitly link to the dashboard's claim-key button and explain why.

Right now the user leaves `/billing/success` with an `mcpEndpoint` but no `Bearer` token to put in Claude Desktop config. They'll get a 401 on first connect.

### Step 9 — Dashboard (steady state)

`src/app/dashboard/DashboardClient.tsx:518-646`:
- Grid of substrate cards (`/api/substrates`, poll 10s).
- BillingWidget (`status`, `renewsAt`, `trialEndsAt`, `lastPaymentFailed` driven).
- Post-checkout banner (hidden when `?checkout=success` absent).
- "Add Substrate" CTA → `/pricing`.

---

## UX findings

| ID | Severity | Description | Suggested fix |
|---|---|---|---|
| UX-1 | high | `/signup` shows API key **before** substrate is provisioned. If the user plugs it into Claude Desktop in the gap, they get silent 401 / connection-refused errors. | Show the key only after provisioning succeeds. Either redirect to `/billing/success` (and have it poll `my-substrate` + auto-claim), OR include a "still provisioning… we'll email you when ready" step. |
| UX-2 | medium | Three different polling cadences across three surfaces for the same underlying "are we done provisioning?" question. | Standardise on 2s-for-60s-then-10s. Extract a single `useProvisioningPoll()` hook. |
| UX-3 | high | `/billing/success` never prompts user to claim the API key. User walks away with an MCP endpoint and no Bearer token. | Call `/api/my-substrate/claim-key` automatically once `mcpEndpoint` is live and render the key inline with a one-time-reveal warning. |
| UX-4 | low | Homepage + nav default to `/pricing`, but `/signup` is reachable and has a different UX contract. Two front doors for the same product. | Pick one front door for new users. Make `/signup` a link *from* `/pricing` for users who want free-tier only. |
| UX-5 | low | `LoginClient.tsx` and `SignupClient.tsx` both hardcode "15 minutes" magic-link lifetime. If the compute default changes, docs and UI drift. | Return `expiresAt` (or TTL) from `POST /api/auth/request-link` and render it. |
| UX-6 | low | Post-login default redirect is `/admin`. `/dashboard` is the canonical multi-substrate landing. | Confirm which page should be the default and update `src/app/auth/callback/route.ts:88-100`. |
| UX-7 | low | `/billing/success` timeout message ("Check your dashboard in a minute") is a dead end — no CTA to the dashboard, no retry button. | Add a "Go to dashboard" primary CTA + "Retry" secondary. |
| UX-8 | low | Capacity badges fail-open (show "Available" on network error). Correct for conversion, but a user who pays for a full tier will hit a failure mode on the webhook side. | Keep fail-open, but surface errors clearly post-Stripe if capacity is actually full. Add a monitor alert when capacity-check errors spike. |

---

## Logic findings

| ID | Severity | Description | Suggested fix |
|---|---|---|---|
| L-1 | **critical** | `SignupClient.tsx` discards the `checkoutUrl` from `POST /api/v1/signup`. If free-tier requires a $1 Stripe charge (as memory atom `free_tier_now_1_dollar_stripe_checkout` claims), the user is stuck in `pending_payment`. | Decide: charge-first (redirect to checkoutUrl) OR free-means-free (auto-provision in signup handler). File as M-1B sub-ticket. |
| L-2 | medium | Three checkout endpoints with overlapping responsibilities. `POST /api/v1/billing/substrate-checkout` is not called from the website. | Document each endpoint's role in its handler's JSDoc. Delete `substrate-checkout` if genuinely dead. |
| L-3 | medium | `/api/v1/my-substrate` returns `apiKeyPrefix` + `keyUnclaimed` but the dashboard doesn't surface a claim-key CTA (per the UX-3 finding). | Add a "Claim your API key" prompt in BillingWidget when `keyUnclaimed === true`. |
| L-4 | low | `api_key_prefix` is described as "sensitive" in `CLAUDE.md` but returned in `my-substrate` response for a prefix reveal. Confirm this is intentional (it should be — the prefix is not by itself a valid bearer token). | Add a comment on the `api_key_prefix` column and the `my-substrate` handler documenting that prefix-only is safe. |
| L-5 | low | Webhook `handleSubscriptionCreated` picks substrate with `ORDER BY created_at DESC LIMIT 1` when `metadata.substrateId` is missing. If a user signs up twice fast (signup → pricing → stripe), the webhook may attach the subscription to the wrong substrate. | Always populate `metadata.substrateId` in `createCheckoutSession` call sites. Fail loudly if missing rather than fall back. Covered by existing `buying-solo-twice-creates-two-substrates.test.ts` — extend to assert substrate selection is explicit. |
| L-6 | low | Memory atom `v1.fact.checkout_tier_id_mismatch` is stale. Enterprise tiers are sales-redirect only, confirmed in `PricingCTA.tsx:107` and `src/config/tiers.ts:290`. | Tombstone the atom. |

---

## Missing tests (write-before-merge list)

### Website (`mmpm-website/src`)

Almost no coverage of this journey today. Only `PricingCardClient.test.tsx` exists.

1. `src/app/api/signup/route.test.ts` — BFF forwards body, CSRF guard blocks cross-origin, compute 409 passes through.
2. `src/app/api/checkout/route.test.ts` — requires `mmpm_session` cookie, forwards Bearer, handles compute 401/402/500.
3. `src/app/api/my-substrate/route.test.ts` — session required, 401 without cookie, passes through response shape.
4. `src/app/api/my-substrate/claim-key/route.test.ts` — already partial. Add: idempotent second call returns `{claimed:false}` from compute, is surfaced to client.
5. `src/app/signup/SignupClient.test.tsx` — new account path renders key + mcpConfig + "shown once" warning. 409 path hides key panel. Decide L-1 behaviour first.
6. `src/app/billing/success/BillingSuccessClient.test.tsx` — polling loop, 60s timeout state, success reveal of `mcpEndpoint`. Mock `/api/my-substrate` with fake timers.
7. `src/app/pricing/PricingCTA.test.tsx` — debounced capacity check, logged-out redirect to `/login?redirect=/pricing`, team-tier branch.
8. `src/app/auth/callback/route.test.ts` — cookie set on success, redirect target from cookie, error query surfaced on verify failure.

### Compute (`parametric-memory-compute/tests`)

Coverage is strong here. Gaps specific to this journey:

1. Integration test: **end-to-end signup page path**. `POST /api/v1/signup` → webhook `subscription.created` → provisioner → `my-substrate` returns `mcpEndpoint`. Flow A is currently only covered by the free-tier shakedown, which is slow and non-deterministic.
2. Contract test: assert `SignupResponse` swagger schema matches the `SignupResult` interface used by the website. `tests/unit/tier-consistency.test.ts` does this for tiers — do the same for signup/checkout response shapes.
3. Unit test: `POST /api/v1/signup` with missing `tier` defaults to `free` and does/does-not create a Stripe session depending on L-1 decision.
4. Unit test for `resolveImplicitSubstrate` — what happens when an account has two substrates, one `pending_payment` and one `running`? Which one does a webhook without `metadata.substrateId` attach to? This is the L-5 corner.

### Shared (website ↔ compute contract)

Consider adding an OpenAPI-driven contract test that pulls the compute swagger JSON and asserts every response shape consumed by the website matches the TS interface on the client side (`SignupResult`, `MySubstrateResponse`, `BillingStatusResponse`). This would have caught L-1 automatically (`checkoutUrl` missing from client interface).

---

## Reference: key files

### Website

- `src/app/page.tsx` — home page with primary CTAs.
- `src/app/pricing/page.tsx`, `PricingCardClient.tsx`, `PricingCTA.tsx`, `TeamInquiryForm.tsx` — pricing flow.
- `src/app/signup/page.tsx` + `SignupClient.tsx` — signup flow.
- `src/app/login/LoginClient.tsx` — magic-link request form.
- `src/app/auth/callback/route.ts` — magic-link callback, session cookie writer.
- `src/app/billing/success/BillingSuccessClient.tsx` — post-checkout success page.
- `src/app/dashboard/page.tsx` + `DashboardClient.tsx` — dashboard.
- `src/app/api/signup/route.ts` — BFF proxy.
- `src/app/api/checkout/route.ts` — BFF proxy.
- `src/app/api/auth/[...path]/route.ts` — auth BFF catchall.
- `src/app/api/my-substrate/route.ts` + `claim-key/route.ts` + `cancel/route.ts` + `deprovision/route.ts` + `reactivate/route.ts` + `rotate-key/route.ts` — substrate BFFs.
- `src/app/api/capacity/route.ts` — capacity proxy.
- `src/app/api/billing/status/route.ts` — billing status proxy.
- `src/lib/compute-proxy.ts` — shared proxy helper (M-0A HTML-in-JSON hardening).
- `src/config/tiers.ts` — tier config and env var names.

### Compute

- `src/api/auth/routes.ts` — magic link endpoints.
- `src/api/signup/routes.ts` — `POST /api/v1/signup`.
- `src/api/checkout/session-route.ts` — `POST /api/checkout`.
- `src/api/billing/substrate-checkout.ts` — third checkout endpoint (dead?).
- `src/api/billing/status.ts` — billing status.
- `src/api/capacity/routes.ts` — capacity.
- `src/api/webhooks/substrate-stripe.ts` — Stripe webhook.
- `src/api/my-substrate/route.ts` — dashboard BFF.
- `src/api/substrates/routes.ts` — substrate CRUD including `claim-key` and `rotate-key`.
- `src/api/substrates/legacy-shims.ts` — `/api/v1/my-substrate/*` → `/api/v1/substrates/:slug/*` shims.
- `src/services/key-generator.ts` — `generateKey()`, hash derivation.
- `src/services/auth-service.ts` — magic-link TTL + session issuance.
- `src/workers/substrate-provisioner.ts` — async provisioner.
- `src/middleware/session-auth.ts` — `requireSession`.
- `src/types/substrate-tier.ts` — tier type union.
- `src/api/docs/swagger-spec.ts` + `src/api/docs/features/*.ts` — OpenAPI spec (hand-written).

### Swagger

- `http://localhost:3100/api/docs/` — live UI.
- `src/api/docs/generated/openapi.json` — generated JSON (checked in).

---

## Recommendations (priority order)

1. **Resolve L-1.** Decide whether `/signup` is charge-first or free-means-free. This is the single most impactful UX/logic question in this journey. Estimate: 1 session.
2. **Auto-claim on `/billing/success`** (UX-3 + L-3). After `mcpEndpoint` is live, call `claim-key` and render the raw key with a "shown once" warning. Estimate: 1 session.
3. **Unify polling** (UX-2). Extract `useProvisioningPoll()`. Estimate: 0.5 session.
4. **Write the missing website tests** above. Estimate: 2 sessions.
5. **Add the shared contract test** (compute swagger vs website TS interfaces). Estimate: 1 session. Would have caught L-1 automatically.
6. **Tombstone the stale tier-id mismatch atom.** Estimate: 1 minute.

Total to close this journey's gaps: ~5 sessions.
