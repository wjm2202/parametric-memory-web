# Journey Review — Billing Lifecycle

**Date:** 2026-04-17
**Scope:** trial → active → past_due → suspended → cancelled → reactivated → deprovisioned → destroyed. Tier changes, Stripe billing portal, spend caps, Stripe webhooks.
**Status:** Draft — findings to be consolidated into SPRINT-PLAN.md
**Companion docs:** `JOURNEY-REVIEW-SIGNUP-CHECKOUT.md`, `JOURNEY-REVIEW-DASHBOARD-RETURNING.md`, `JOURNEY-REVIEW-API-KEY-LIFECYCLE.md`

---

## Executive summary

Billing state is sourced from Stripe; compute stores a projection and surfaces it to the dashboard. The design principle is sound: **Stripe is authoritative, webhooks are the only path that mutates billing state.** Handlers are mostly idempotent and signature-verified. Multi-substrate support (Sprint 2 migration 063) scopes billing to individual substrates via `substrate_subscriptions.substrate_id`.

**What works well:**
- Stripe signature verification enforced on the webhook route.
- Subscription creation uses `UNIQUE(stripe_subscription_id)` + 23505 catch for idempotency.
- `invoice.payment_succeeded` deduplicates via `metadata->>'stripeInvoiceId'`.
- Cap-exceeded path is atomic at INSERT time — `substrate_subscriptions.status='cap_exceeded'` is stamped on the row before refund/cancel runs.
- Payment-failed handler does NOT auto-suspend — correctly defers to Stripe Smart Retries.

**Critical gaps:**
1. **TOTP/sudo is disabled on the billing portal route** (lines 43–65 commented out with `TOTP_DISABLED_2026_04_11`). Anyone with an open browser session can cancel a subscription with no second factor.
2. **No `past_due` banner** on the dashboard. State exists; UI never renders it. Customers don't know payment is failing until Stripe gives up and suspends.
3. **No tier-change UI** (J-05 blocker in `JOURNEYS.md`). Customers see nothing while their substrate migrates — retention risk.
4. **No spend-cap proximity warning.** Caps are enforced but the dashboard never surfaces "80% of monthly cap reached".
5. **`invoice.payment_failed` has no idempotency check** — replays can double-insert `billing_events` rows.
6. **`stripe_event_id` is never captured** — reliance on UNIQUE constraints and per-handler query-based dedupe; no global event-level deduplication.
7. **No email notifications** — dunning, renewal, cancel confirmations are not sent. The dashboard's `lastPaymentFailed` flag is the only signal.

---

## State machine diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                 Billing / Substrate lifecycle                            │
└─────────────────────────────────────────────────────────────────────────┘

  [ Signup ]
      │
      ├─► substrate: pending_payment
      │
      ├─► POST /api/checkout → Stripe Checkout session
      │   [user completes payment]
      │
      ├─► Stripe: customer.subscription.created  ─────────────────┐
      │                                                            │
      │   ┌─────────── trial? ────────────┐                       │
      │   │                               │                        │
      │   ▼yes                          no▼                        │
      │ trialing                       active                      │
      │   │                               │                        │
      │   └──→ trial elapses ─► active ◄──┘                        │
      │                                                            │
      │   substrate: provisioning → running                         │
      │                                                            ▼
  ┌───╩══════════════════════════════════════════════════════════════╗
  ║                       ACTIVE PERIOD                               ║
  ║  substrate_subscriptions.status ∈ {active, past_due}              ║
  ║  substrates.status = running                                      ║
  ║                                                                   ║
  ║  invoice.payment_succeeded → billing_events row                   ║
  ║  invoice.payment_failed    → billing_events row                   ║
  ║                               + lastPaymentFailed = true          ║
  ║                               (Stripe Smart Retries runs)         ║
  ║                                                                   ║
  ║  Tier change (via Stripe portal upgrade/downgrade):                ║
  ║    customer.subscription.updated                                   ║
  ║    → substrate_tier_changes(pending) INSERT                        ║
  ║    → tier-change worker runs phases (restart or re-provision)     ║
  ║    → substrates.tier updated, worker marks complete                ║
  ║                                                                   ║
  ║  Cancel (user):                                                    ║
  ║    POST /api/v1/substrates/:slug/cancel                           ║
  ║    → Stripe: cancel_at_period_end = true                          ║
  ║    → webhook: substrates.cancel_at = <period end>                 ║
  ║    → Dashboard: "Cancels on [date]" + Reactivate CTA              ║
  ╚═══════════════════════════════════════════════════════════════════╝
      │
      │ [period elapses, Stripe cancels]
      │
      ├─► customer.subscription.deleted
      │
      ├─► substrate_subscriptions.status = cancelled
      ├─► substrates.status = read_only
      ├─► substrates.grace_period_ends_at = now() + 30d
      ├─► accounts.tier = free  (if no other active subs)
      │
      │ [30-day grace window — reactivation still possible]
      │
  ┌───┴─── reactivate? ──────────────┐
  │ yes                                │ no
  │ POST /reactivate                   │
  │ → Stripe: cancel_at_period_end=false│
  │ → subscription.updated webhook     │
  │ → substrates.cancel_at = NULL      │
  │ → (back to Active Period)          │
  │                                     ▼
  │                              [grace expires]
  │                                     │
  │                              substrates.status = deprovisioned
  │                              destroy_queue INSERT
  │                              [docker down, Traefik deregister,
  │                               data snapshot retained 30d]
  │                                     │
  │                              [hard delete at 60d]
  │                                     │
  │                              substrates.status = destroyed


┌─ EDGE PATHS ──────────────────────────────────────────────────────┐
│                                                                     │
│  charge.dispute.created →  accounts.status = suspended             │
│                            substrates.status = suspended            │
│                            (manual ops review required)           │
│                                                                     │
│  substrate cap exceeded (SM-20) →                                   │
│    subscription.status = 'cap_exceeded' atomic at INSERT           │
│    Stripe refund + cancel immediately                              │
│                                                                     │
│  Free-tier self-deprovision:                                        │
│    POST /api/v1/substrates/:slug/deprovision                       │
│    (only allowed when NO active subscription)                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Step-by-step trace

### 1. `BillingWidget` rendering (dashboard)

**File:** `src/app/dashboard/DashboardClient.tsx:118–266`

Reads `BillingStatus` from `/api/billing/status`. Renders conditional branches:

| Condition | Lines | Copy / CTA | Data source |
|---|---|---|---|
| `lastPaymentFailed && status !== 'suspended'` | 129–151 | Amber: "Payment issue — we'll retry"; "Update payment →" button | `lastPaymentFailed` flag |
| `status === 'suspended'` | 153–182 | Red: "Account suspended"; "Reactivate →" (`/pricing`) + "Contact support" (mailto entityone22@gmail.com — see dashboard review UX-2) | `status` |
| `status === 'cancelled'` | 184–204 | Zinc: "No active subscription" + "Memory preserved for 90 days"; "Choose a plan →" | `status` |
| `status ∈ {active, trialing}` | 208–264 | Card with tier, renewal/trial date, usage bar, "Manage billing →" | `tier`, `renewsAt`, `trialEndsAt`, `tierDisplay` |

**`past_due` has no branch.** Status comes through from the API but collapses into the normal Active card. No banner, no warning, no CTA.

### 2. Manage-billing portal

**Website BFF:** `src/app/api/billing/portal/route.ts` — proxies POST to compute with session cookie.

**Compute:** `src/api/billing/portal.ts:39–103`
- Line 43–65: **TOTP/sudo gate commented out** (marker `TOTP_DISABLED_2026_04_11`). The commented block would have required a sudo token before generating a portal session.
- Line 66+: look up `accounts.stripe_customer_id`; 422 if missing (never completed checkout).
- Create Stripe billing portal session (`stripe.billingPortal.sessions.create({ customer, return_url })`).
- Return `{ portalUrl }`.

### 3. Tier change

**UI:** no dedicated surface on the website. Tier changes happen inside the Stripe billing portal.

**Compute tier-change service:** `src/services/tier-change-service.ts:1–150`

Four transition kinds via `resolveTransitionKind()` (line 122–130):
- `shared→shared` (free↔indie↔pro): restart container with new limits; UPDATE `substrates` (`tier`, `max_atoms`, `max_bootstraps_month`).
- `shared→dedicated` (e.g. indie→team): enqueue new provision, wait, migrate, tear down old shared container.
- `dedicated→shared`: destroy dedicated, provision shared.
- `dedicated→dedicated`: restart with new limits.

**Queue table:** `substrate_tier_changes` (migration 029 lines 89–105) — columns `old_tier`, `new_tier`, `status ∈ {pending, processing, completed, failed}`, `error_message`, `completed_at`.

**Idempotency:** worker-side crash reaper resets `processing > 15min` back to `pending`. Each phase is designed idempotent.

**Webhook trigger:** `customer.subscription.updated` with a different price ID enqueues `substrate_tier_changes(pending)`. See `substrate-stripe.ts:430–530`.

**Gap (J-05 blocker):** `substrate_tier_changes.status` is not exposed through any API the dashboard reads — customer sees zero feedback while their substrate migrates.

### 4. Cancellation

**Website:** dashboard "Cancel subscription" → confirmation modal (`DashboardClient.tsx:274–333`) → POST `/api/my-substrate/cancel` (BFF proxy) → compute `/api/v1/substrates/:slug/cancel`.

**Compute: `src/api/substrates/routes.ts:767–832` (SM-6)**
1. Ownership chokepoint (`resolveOwnedSubstrate`) — 404 on non-ownership.
2. Find active `substrate_subscriptions` row for this substrate (Sprint 2 substrate-scoped).
3. `stripe.subscriptions.update(..., { cancel_at_period_end: true })`.
4. Return `{ scheduled: true, cancelAt }`.

**Webhook response:** `customer.subscription.updated` fires (with `cancel_at_period_end=true`). Handler at `substrate-stripe.ts:456–494`:
- UPDATE `substrate_subscriptions` period dates.
- UPDATE `substrates SET cancel_at = <period end>` for the bound substrate (substrate-scoped via FK subquery).

### 5. Subscription deletion + grace period

**Webhook:** `customer.subscription.deleted` fires when Stripe cancels at period end OR customer cancels via portal.

**Handler:** `substrate-stripe.ts:567–693`
1. UPDATE `substrate_subscriptions SET status='cancelled', cancelled_at=now()`.
2. UPDATE `substrates SET status='read_only', grace_period_ends_at=now()+30d` for the bound substrate.
3. Check other active subs on account. If none → UPDATE `accounts SET tier='free'`. If any → skip downgrade.
4. INSERT `billing_events`.
5. Observability events: `subscription_cancelled`, `grace_period_started`.

**Dashboard reflects:** "No active subscription" + "Choose a plan" CTA.

### 6. Reactivation

**Endpoint:** `POST /api/v1/substrates/:slug/reactivate` — `src/api/substrates/routes.ts:1074–1147` (SM-8)

Preconditions:
- Ownership chokepoint (404 on non-ownership).
- Substrate NOT in `{deprovisioned, destroyed, provision_failed, deprovisioning}` → 409. (`read_only` IS reactivatable.)
- Active `substrate_subscriptions` row must exist → 404 otherwise.

Action:
- `stripe.subscriptions.update(..., { cancel_at_period_end: false })`.
- Webhook `customer.subscription.updated` fires, clears `substrates.cancel_at` to NULL.

### 7. Deprovisioning (user-initiated, free tier)

**Endpoint:** `POST /api/v1/substrates/:slug/deprovision` — `src/api/substrates/routes.ts:835–935` (SM-7)

Preconditions (strict order):
1. Ownership (404).
2. Status NOT terminal (409 on `deprovisioned/destroyed/provision_failed/deprovisioning`).
3. **No active subscription** (403 `active_subscription` — paid subscribers must cancel Stripe first).

Action (atomic BEGIN/COMMIT):
- UPDATE `substrates SET status='deprovisioning'` (409 if `rowCount=0` — someone beat us).
- INSERT `destroy_queue(reason='user_requested')`.

Destroyer worker:
- `docker compose down` on the substrate host.
- Traefik deregister.
- Snapshot data, schedule hard delete at +30d.
- `substrates.status = 'deprovisioned'` (soft).
- At +30d: `substrates.status = 'destroyed'`.

### 8. Spend caps

**Table:** migration 046 — `spend_caps(account_id, cap_type, limit_cents, spent_cents, period_start/end, action_at_cap ∈ {pause, block}, enabled, mandatory)`.

**Routes:** `src/api/billing/caps.ts:74–200`
- `POST /api/billing/caps` — create (enforces platform ceiling per tier).
- `GET /api/billing/caps/:accountId` — list with `isAtCap` flag.
- `PATCH /api/billing/caps/:capId`, `DELETE /api/billing/caps/:capId`.

**SM-20 — substrate cap exceeded at subscription creation:**
`substrate-stripe.ts:207–412` — when `customer.subscription.created` fires, count existing active substrates against `DEFAULT_CEILINGS[tier].maxSubstrates`. If over:
- `substrate_subscriptions.status='cap_exceeded'` stamped at INSERT (atomic).
- Post-COMMIT: `refundAndCancelForCapExceeded` runs (idempotency-keyed).

**UI:** spend caps have NO dashboard surface. No "80% of cap reached" warning, no cap configuration UI, no visibility until you're blocked.

### 9. Stripe webhook handlers summary

**Entry point:** `src/api/webhooks/substrate-stripe.ts:56–108`
- Line 56–71: signature verification (400 on missing/invalid).
- Switch on `event.type`.

| Event | Handler (lines) | Writes | Idempotency |
|---|---|---|---|
| `customer.subscription.created` | 113–428 | `substrate_subscriptions` INSERT, `substrate_provision_queue` INSERT, `substrates.status='provisioning'`, `accounts.tier`, `has_used_trial` write-once | `UNIQUE(stripe_subscription_id)` + 23505 catch → `alreadyProcessed` |
| `customer.subscription.updated` | 430–530 | `substrate_subscriptions` period dates, `substrates.cancel_at`, tier change queue | Query-based (safe on replay) |
| `customer.subscription.deleted` | 567–693 | `substrate_subscriptions.status='cancelled'`, `substrates.status='read_only'` + grace, `accounts.tier='free'` (conditional), `billing_events` | Query-based |
| `invoice.payment_succeeded` | 695–749 | `billing_events` INSERT | Query `metadata->>'stripeInvoiceId'` |
| `invoice.payment_failed` | 751–812 | `billing_events` INSERT | **None — allows duplicates on replay** |
| `charge.dispute.created` | 819–903 | `accounts.status='suspended'`, `substrates.status='suspended'`, `billing_events` | Query via `payment_intent`; `handled: false` on miss |
| `invoice.upcoming` | 910+ | `billing_events` INSERT | Unknown from excerpt |

**Payment-failed rationale (lines 791–804):** do NOT auto-suspend on attempt N. Stripe Smart Retries (configured in dashboard) owns the schedule. When Stripe gives up, it cancels the subscription → `subscription.deleted` handler puts substrate into `read_only`.

### 10. Email notifications

**Not implemented.** `billing_events` rows accrete but no sender consumes them. No dunning emails, no renewal reminders, no cancellation confirmations.

---

## UX findings

### High

**UX-B1: No `past_due` banner.** `DashboardClient.tsx:118–266` — state exists in `BillingStatus` but nothing renders it. Customers are unaware payment is failing until Stripe gives up (~1 week later) and cancels. **Fix:** add a state branch above the Active card: amber banner with "Payment failing — update your card" + portal link.

**UX-B2: No tier-change UI.** `JOURNEYS.md` J-05 is blocked on UI. Customer clicks upgrade in the Stripe portal; their substrate migrates; they see *nothing* for the duration. **Fix:** expose `substrate_tier_changes.status` via `/api/v1/substrates/:slug` and render a stepper (Pending → Restarting → Migrating → Complete) in the admin page.

**UX-B3: No spend-cap proximity warning.** Cap enforcement exists; UI surface does not. Customers hit the cap with no warning. **Fix:** add a pill at 80%, banner at 100%, link to cap-management UI (needs a cap-management UI, which also does not exist).

**UX-B4: `mailto:entityone22@gmail.com` on suspended CTA.** Same as dashboard review UX-2. **Fix:** config constant.

### Medium

**UX-B5: No grace-period countdown.** Cancelled state says "90 days" (copy says 90 but the webhook sets 30 — see L-B4 below); no actual date. **Fix:** show the `grace_period_ends_at` date inline.

**UX-B6: No confirmation dialog on `/deprovision`.** The endpoint exists but there's no UI that calls it; when there is, it must prompt "This is permanent."

**UX-B7: No "Update payment method" CTA on `lastPaymentFailed`.** Banner says "we'll retry" but doesn't open the portal. **Fix:** make the "Update payment →" button POST `/api/billing/portal`.

**UX-B8: Reactivate button on suspended links to `/pricing`.** Should be a one-click reactivate call to `/api/v1/substrates/:slug/reactivate`.

### Low

**UX-B9: Cancel confirmation modal copy implies an extra step.** "You'll be taken to Stripe portal to complete cancellation" — but the call goes to `/api/my-substrate/cancel` directly. Copy is misleading.

**UX-B10: Copy says "Memory preserved for 90 days" but the webhook sets `grace_period_ends_at = now() + 30 days`.** See logic finding L-B4.

---

## Logic findings

### High

**L-B1: TOTP/sudo disabled on billing-portal route.** `src/api/billing/portal.ts:43–65`. Comment marker `TOTP_DISABLED_2026_04_11`. Re-enable before production — otherwise anyone with access to an open session can cancel a subscription.

**L-B2: `invoice.payment_failed` has no idempotency check.** `substrate-stripe.ts:751–812`. Stripe retries webhooks; each retry inserts a new `billing_events` row. Audit counts will be inflated. **Fix:** check `metadata->>'stripeInvoiceId'` + `attemptCount` before insert.

**L-B3: `stripe_event_id` never captured.** No table stores `event.id`. All dedupe is per-handler (UNIQUE constraints, metadata queries). **Fix:** add a `webhook_events(stripe_event_id TEXT PRIMARY KEY, processed_at TIMESTAMPTZ)` table and short-circuit at the entry point on duplicates.

**L-B4: Grace period copy says 90 days; handler sets 30 days.** Dashboard `DashboardClient.tsx:184–204` says "Memory preserved for 90 days". Webhook `substrate-stripe.ts:567–693` sets `grace_period_ends_at = now() + interval '30 days'`. **Fix:** make the copy read from the actual value, or align both to the policy value.

**L-B5: Tier-change failures have no retry / alerting.** `substrate_tier_changes.status='failed'` is terminal. No operator alert; customer's tier is stuck. **Fix:** background retry with exponential backoff; ops alert on 3rd failure.

**L-B6: Sudo/TOTP disabled on `/reactivate` and `/deprovision` too.** The cancel, reactivate, and deprovision handlers all sit behind session auth only. A stolen session can permanently destroy a customer's substrate (after grace period elapses). **Fix:** require sudo for destructive actions.

### Medium

**L-B7: Multi-substrate race around `customer.subscription.deleted`.** The "check for other active subs" query at lines 638–660 uses `WHERE account_id = $1` — if two subscription events race across substrates, tier downgrade decisions can be incorrect for a short window. Mitigated by SERIALIZABLE semantics of Stripe webhooks (they tend to serialise) but not bulletproof.

**L-B8: `charge.dispute.created` looks up account via `payment_intent`.** If the disputed charge is an invoice payment without a stored `stripe_payment_intent_id`, the handler returns `handled: false`. Stripe retries; if still miss, the chargeback is silently unhandled. **Fix:** fall back to customer→account lookup.

**L-B9: `cancel_at` is never cleared on deprovisioning.** A free-tier customer deprovisions a substrate that had `cancel_at` set; the field lingers on the substrate row. If destroy is delayed, dashboard could show a stale cancellation date. **Fix:** include `cancel_at = NULL` in the deprovision UPDATE.

**L-B10: Per-process billing-status cache (60 s in-memory).** Multi-worker deployments see cache divergence per process. See dashboard review L-8.

### Low

**L-B11: Cap-exceeded refund happens post-COMMIT.** `substrate-stripe.ts:386–411` — if the refund/cancel call throws, the subscription stays in `cap_exceeded` limbo. Logs carry the error; ops must intervene. Low frequency but unbounded risk.

**L-B12: `invoice.upcoming` idempotency unknown.** Handler excerpt was truncated; need to verify it doesn't double-insert on replay.

**L-B13: No email notifications exist.** Dunning, trial-ending, renewal, cancel-confirmation — none sent. `billing_events` accretes but nothing consumes it.

---

## Webhook idempotency / signature audit

### Signature verification — ENFORCED ✅
`substrate-stripe.ts:56–71` uses `stripe.webhooks.constructEvent(body, sig, secret)` with 400 on missing/invalid. Raw body is required — confirm `express.raw({ type: 'application/json' })` is mounted on this route in `app.ts`.

### Idempotency matrix

| Handler | Mechanism | Gap |
|---|---|---|
| subscription.created | `UNIQUE(stripe_subscription_id)` | None (solid) |
| subscription.updated | Query-based UPDATE | Safe — target row is the same |
| subscription.deleted | Query-based UPDATE | Safe — target rows are the same |
| invoice.payment_succeeded | `metadata->>'stripeInvoiceId'` query | None |
| **invoice.payment_failed** | **NONE** | Duplicates on replay |
| charge.dispute.created | Query via payment_intent | Handler returns `handled:false` on miss; Stripe retries |
| invoice.upcoming | Unknown | Need to read full handler |

### Global dedupe — MISSING
`stripe_event_id` is never stored. Add a `webhook_events` table keyed on `event.id` for global-first dedupe; keeps handlers simple.

---

## Missing tests

### Already shipped (per `JOURNEYS.md`)
- J-01 Dashboard hydration, J-08 Payment-failed banner, J-09 Trial-ending banner, J-10 Cancelled grace period, J-11–J-21 (auth, keys, admin, pricing, legal).
- Unit: `substrate-webhook-sm17.test.ts` (trial gate), `substrate-webhook-sm20.test.ts` (cap refund), `substrate-webhook-extended.test.ts` (dispute, upcoming), `billing-status.test.ts`, `billing-portal.test.ts`, `billing-enforcer.test.ts`.

### Blocked (`JOURNEYS.md`)
- **J-05 tier-upgrade migration** — blocked on UI. Fix UX-B2 first, then write the e2e.
- J-04 provisioning ETA, J-06 snapshot retention notice.

### Missing e2e

1. `invoice.payment_failed` → dashboard reflects `lastPaymentFailed` → user opens portal → updates card → `payment_succeeded` → banner clears.
2. Reactivation within grace period (end-to-end, including webhook round-trip).
3. Free-tier self-deprovision (preconditions: no active sub).
4. Tier change across kinds (shared→shared, shared→dedicated, dedicated→shared).
5. Chargeback → suspend flow.
6. Cap-exceeded refund + cancel (full flow).
7. Webhook replay for `invoice.payment_failed` asserts only one billing_event row.
8. `stripe.events.retrieve` + replay the same event twice; assert no double-processing.

### Missing integration

9. Re-enable the commented sudo gate on `/billing/portal` in a test branch; verify reject path works.
10. Webhook without signature → 400.
11. Webhook with tampered body → 400.
12. Multi-substrate subscription.deleted: assert only the bound substrate goes read_only.

### Missing unit

13. `BillingWidget` renders all five states (`active`, `trialing`, `past_due`, `suspended`, `cancelled`) + the payment-failed overlay.
14. Grace-period copy uses the actual `grace_period_ends_at` value.

---

## Reference file list

### Website
- `src/app/dashboard/DashboardClient.tsx` (BillingWidget + cancel modal)
- `src/app/api/billing/portal/route.ts`
- `src/app/api/my-substrate/cancel/route.ts`
- `src/app/api/my-substrate/reactivate/route.ts`
- `src/app/api/my-substrate/deprovision/route.ts`

### Compute
- `src/api/billing/portal.ts`
- `src/api/billing/status.ts`
- `src/api/billing/caps.ts`
- `src/services/billing-events-service.ts`
- `src/services/tier-change-service.ts`
- `src/services/spend-cap-service.ts`
- `src/api/substrates/routes.ts` (SM-6 cancel, SM-7 deprovision, SM-8 reactivate)
- `src/api/webhooks/substrate-stripe.ts`
- `src/config/platform-ceilings.ts`, `src/config/stripe-substrate.ts`
- `src/types/substrate-tier.ts`, `src/types/billing.ts`

### Migrations
- `029_substrate-subscriptions.sql`
- `046_mandatory-spend-caps-and-platform-settings.sql`
- `063_substrate-subscriptions-add-substrate-id.sql`
- `066_substrate-subscriptions-cap-exceeded-status.sql`

### Tests
- `tests/e2e/JOURNEYS.md`
- `tests/unit/substrate-webhook-sm17.test.ts`
- `tests/unit/substrate-webhook-sm20.test.ts`
- `tests/unit/substrate-webhook-extended.test.ts`

---

## Summary table — state transitions

| From | Event | To | Webhook | DB writes | Dashboard shows |
|---|---|---|---|---|---|
| pending_payment | checkout succeeds | provisioning → running | subscription.created | substrate_subscriptions(active), substrates(provisioning→running), accounts.tier | "Activating…" |
| running | payment succeeds | running | invoice.payment_succeeded | billing_events(payment_succeeded) | no change |
| running | payment fails | running | invoice.payment_failed | billing_events(payment_failed) | ⚠️ no banner (B1) |
| running | user cancels | running (cancel_at set) | subscription.updated | substrates.cancel_at, period dates | "Cancels on [date]" |
| running (cancel_at) | reactivate | running | subscription.updated | substrates.cancel_at = NULL | back to normal |
| running | period elapses | read_only | subscription.deleted | subscription.cancelled, substrate.read_only + grace, accounts.tier=free | "No active subscription" |
| read_only | reactivate | running | subscription.updated | cancel_at = NULL, period updated | back to normal |
| read_only | grace expires | deprovisioned | (scheduled) | substrate.deprovisioned, destroy_queue | (substrate gone) |
| deprovisioned | +30d | destroyed | (scheduled) | substrate.destroyed | (account shows empty) |
| running | user upgrades tier | provisioning | subscription.updated | substrate_tier_changes(pending) | ⚠️ no UI (B2) |
| running | cap exceeded at INSERT | cap_exceeded + refund | subscription.created (same tx) | sub.status=cap_exceeded, refund dispatched | (failure screen on signup) |
| any | chargeback | suspended | charge.dispute.created | accounts.status=suspended, substrate.suspended | red "Account suspended" |

---

## Pre-launch critical items (billing)

1. **Re-enable TOTP/sudo on `/billing/portal`, `/cancel`, `/reactivate`, `/deprovision`** (L-B1, L-B6).
2. **Add `past_due` banner** to BillingWidget (UX-B1).
3. **Expose `substrate_tier_changes.status` and render a stepper** (UX-B2, unblocks J-05).
4. **Spend-cap proximity warning + cap management UI** (UX-B3).
5. **`webhook_events` dedupe table keyed on `stripe_event_id`** (L-B3).
6. **Idempotency check on `invoice.payment_failed`** (L-B2).
7. **Dunning / renewal / cancel email notifications** (L-B13) — consumer for `billing_events`.
8. **Align grace-period copy to the actual value** (L-B4).
9. **e2e tests for the missing flows** listed above.
