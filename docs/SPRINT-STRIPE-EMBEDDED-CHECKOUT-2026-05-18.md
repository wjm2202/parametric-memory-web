# Stripe Sprint — Embedded Checkout, Cancel at Period End, v22 Upgrade

**Date:** 2026-05-18 (final after ultra-review + grill session)
**Author:** Claude (research + plan only — no code shipped this session)
**Status:** Approved scope, launch blocker. Every decision below is locked. Implementation-ready.
**Repos affected:** `mmpm-website`, `mmpm-compute` (`parametric-memory-compute/`)

---

## TL;DR

Three workstreams, one sprint, one merge. Pre-launch + Stripe sandbox = no backwards-compat burden.

1. **SDK + API version upgrade.** `stripe@^20.4.1` → `^22.1.1` in compute. Pin `apiVersion: '2026-04-22.dahlia'` at both `new Stripe(...)` call sites. Drop the dead `stripe@^20.4.1` from `mmpm-website/package.json`. Fix three already-broken code paths the v22 types will expose: `subscription.current_period_start/end` (moved to items), `invoice.subscription` (moved to `invoice.parent`), and `ui_mode: 'embedded'` (renamed to `'embedded_page'`).
2. **Embedded Checkout.** Replace `/api/checkout` outright to return `{ clientSecret }` from a `ui_mode: 'embedded_page'` session. Mount `<EmbeddedCheckoutProvider>` in a right-side **drawer** on `/pricing`. New return page at `/billing/return` polls substrate status every 2s with a 90s timeout. Delete the dead `/api/v1/billing/substrate-checkout`. Add Stripe Tax (`automatic_tax: enabled`) and Adaptive Pricing (`adaptive_pricing: enabled`) on every session.
3. **Cancel at period end (hard delete).** Click Cancel → `stripe.subscriptions.update(cancel_at_period_end: true)` with an idempotency key. User keeps full read+write access until period end (no refund). Dashboard shows both an amber banner (first load each day, dismissable) and a persistent "Cancelling" badge. Reactivate button in both places. Tier upgrade during cancel-pending auto-reactivates and applies the change in one Stripe call. At period end the webhook deprovisions immediately — the existing 30-day read-only grace block at `substrate-stripe.ts:724-736` is **removed**, eliminating the "free use exploit" tail.

---

## Locked decisions

Stamped here so they don't drift in implementation. If a later question contradicts one of these, escalate before changing it.

| # | Decision | Lock |
|---|---|---|
| D1 | Cancel policy = `cancel_at_period_end: true`. User keeps full access until period end. No refund. No snapshot. Hard delete at period end (no read-only grace tail). | locked |
| D2 | Stripe SDK target: `stripe@^22.1.1`. API version pin: `'2026-04-22.dahlia'` at every `new Stripe(...)`. | locked |
| D3 | Embedded Checkout. `ui_mode: 'embedded_page'`. Replaces the existing `/api/checkout` outright (pre-launch, no compat shim). | locked |
| D4 | Checkout layout = right-side drawer over `/pricing`. | locked |
| D5 | Return page = `/billing/return?session_id={CHECKOUT_SESSION_ID}` with 2s polling, 90s timeout, then "still working — we'll email you" fallback. | locked |
| D6 | Cancel confirm copy is **minimum**: "Your paid subscription will end on DD MMM YYYY." No warning prose, no export prompts, no button row beyond Confirm / Keep. | locked |
| D7 | Dashboard cancel-pending UI = banner (first load each day, dismissable) + persistent badge. | locked |
| D8 | Reactivate = button in both the banner and the substrate detail page. | locked |
| D9 | Upgrade during cancel-pending = auto-reactivate + apply tier change in one Stripe call. | locked |
| D10 | Stripe.js failure mode = proactive adblock/CSP detection before drag-click. If detected: show "Disable adblock for parametric-memory.dev" notice before the drawer opens. | locked |
| D11 | Invariant "all compute Stripe writes via webhook except cancel" is acknowledged as **false**. Reactivate, deprovision, checkout, portal all do request-path writes. Mitigation: idempotency keys on every request-path Stripe write. | locked |
| D12 | Stripe Tax (`automatic_tax: { enabled: true }`) on every checkout session. | locked |
| D13 | Adaptive Pricing (`adaptive_pricing: { enabled: true }`) on every checkout session. | locked |

---

## Architecture invariant — Stripe goes through compute

Server-side Stripe access lives only in `mmpm-compute`. The website is a Next.js BFF that proxies. The dead `stripe@^20.4.1` in `mmpm-website/package.json` is removed in workstream 1.

```
Browser (parametric-memory.dev)
   │
   │  ① POST /api/checkout  (session cookie, body: { tier })
   ▼
mmpm-website BFF  ── proxy ──►  mmpm-compute  ── checkout.sessions.create
                                                  (ui_mode='embedded_page',
                                                   automatic_tax, adaptive_pricing,
                                                   return_url with {CHECKOUT_SESSION_ID})
                                                  ─► Stripe
                                                       │
                                                  clientSecret ◄┘
   ② { clientSecret } ◄── proxy ──
   │
   ▼
Drawer mounts <EmbeddedCheckout>
   │
   │  ③ iframe → Stripe.js → Stripe (card data, PCI-scoped to Stripe only)
   ▼
Stripe webhook → mmpm-compute /api/v1/webhooks/substrate-stripe
   │
   │  customer.subscription.created → substrate_provision_queue
   │  provisioner spins up droplet (~30-60s)
   ▼
return page polls substrate.status until 'running' → redirect to dashboard
```

Cancel sub-flow:

```
Dashboard "Cancel" → POST /api/my-substrate/cancel (CSRF + recent-auth)
   │
   ▼
compute → stripe.subscriptions.update(cancel_at_period_end: true,
                                       idempotencyKey: `cancel:${subId}:${dayBucket}`)
   │
   ▼
substrate row gets cancel_at = period_end (via webhook subscription.updated)
   │
   ▼
[ user keeps full access until period_end ]
   │
   ▼
Stripe period_end → fires customer.subscription.deleted
   │
   ▼
webhook handler: hard delete (status='deprovisioning', enqueue destroy queue)
                  — NO grace_period_ends_at, NO read_only stop —
   │
   ▼
substrate-destroyer worker tears down container
```

---

## Pre-flight DB check (run before merge)

The v22 type-system surfaces a bug that may **already be writing 1970-01-01 rows to production**. Run this check before the SDK bump so we know what data state we're inheriting:

```sql
-- Run as read-only against prod or the latest dump.
SELECT id, stripe_subscription_id, current_period_start, current_period_end, created_at
FROM substrate_subscriptions
WHERE current_period_start = to_timestamp(0)
   OR current_period_end = to_timestamp(0)
ORDER BY created_at DESC
LIMIT 50;
```

If this returns rows, P0-2 has been silently failing since whatever date matches `to_timestamp(0)` first appears. Backfill plan: after the v22 deploy lands, run a one-shot script that fetches each affected subscription via `stripe.subscriptions.retrieve(id, { expand: ['items.data.price'] })` and writes the correct `current_period_start/end` from `subscription.items.data[0]`. Track in a separate migration ticket.

---

## Gotchas the ultra-review surfaced (filtered to what's still relevant under D1)

The "no grace + immediate deprovision + snapshot" design that earlier rounds of this doc contemplated had ten P0 and ten P1 gotchas. The locked decision D1 (`cancel_at_period_end: true` + hard delete at period end) eliminates many of them. What remains:

### P0 — must fix in this sprint

**P0-1 — `ui_mode: 'embedded'` is a removed enum string.** Dahlia renamed it to `'embedded_page'`. The first call to `stripe.checkout.sessions.create({ ui_mode: 'embedded', ... })` against `2026-04-22.dahlia` returns 400 with an enum error. Fix: use `'embedded_page'`. Where: new `/api/checkout` handler.

**P0-2 — `Stripe.Subscription.current_period_start/end` removed.** Basil 2025-03-31 moved both fields to `subscription.items.data[0]`. The `(subscription as any).current_period_start` casts at `substrate-stripe.ts:264-265, 544` currently write `to_timestamp(NULL)` → 1970-01-01 epoch rows. Fix: read from `subscription.items.data[0].current_period_start` and `.current_period_end`. Drop the `as any`. Run the pre-flight DB check above.

**P0-3 — `invoice.subscription` removed.** Replaced by `invoice.parent.subscription_details.subscription`. Casts at `substrate-stripe.ts:832, 888, 1053` currently `undefined`; three webhook handlers (`payment_succeeded`, `payment_failed`, `invoice.upcoming`) silently short-circuit. Fix:
```ts
const subscriptionId = invoice.parent?.type === 'subscription_details'
  ? invoice.parent.subscription_details?.subscription
  : null;
```

**P0-4 — CSP `frame-src` doesn't allow `checkout.stripe.com`.** `mmpm-website/nginx.conf:67` whitelists only `js.stripe.com`. Embedded Checkout iframe is served from `checkout.stripe.com`. Browser blocks it. Add `https://checkout.stripe.com` to `frame-src` and `https://hooks.stripe.com` to `connect-src` (3DS Hooks). Test in staging with the strict CSP.

**P0-5 — CSRF check missing on `/api/my-substrate/cancel` BFF.** `mmpm-website/src/app/api/my-substrate/cancel/route.ts:15` is a mutating POST with no `verifyCsrfOrigin()` call. Three other routes already use it (auth catch-all, totp login-verify, signup). Add it. Also audit every other website BFF that proxies a mutating compute call (`reactivate`, `deprovision`, `rotate-key`, `claim-key`, `portal`, `checkout`) — fix any missing CSRF guards in the same PR.

**P0-6 — 30-day read-only grace block must be deleted.** `substrate-stripe.ts:724-736` is the block that contradicts D1. Replace with: immediate `status='deprovisioning'` + enqueue destroy. The `grace-period-worker.ts` file becomes effectively dead code; it can be deleted in the same commit (hand the rm command to the user — see Commands section). The dashboard banner copy stops referring to "30 days read-only".

**P0-7 — Idempotency key on the `update(cancel_at_period_end: true)` call.** Even though `update` is naturally more forgiving than `cancel`, the request-path Stripe write needs an idempotency key per D11. Suggested key: `cancel:${subscriptionId}:${dateBucket}` where `dateBucket = YYYY-MM-DD` (so a same-day retry collapses but a deliberate cancel/reactivate/cancel cycle still produces a fresh Stripe operation).

### P1 — fix in same PR

**P1-1 — `handlePaymentSucceeded` idempotency has a TOCTOU window.** `substrate-stripe.ts:852-860` does SELECT+INSERT without a transaction or unique index on `billing_events.metadata->>'stripeInvoiceId'`. Concurrent Stripe retries can double-book. Add a partial unique expression index: `CREATE UNIQUE INDEX billing_events_invoice_idemp ON billing_events ((metadata->>'stripeInvoiceId')) WHERE event_type IN ('payment_succeeded','invoice_upcoming');` Same shape at `invoice.upcoming` (line 1073).

**P1-2 — `handleDisputeCreated` silently misses subscription disputes.** `substrate-stripe.ts:967` joins on `billing_events.stripe_payment_intent_id`, but `handlePaymentSucceeded` stores `stripeInvoiceId` in `metadata`, not `stripe_payment_intent_id`. Subscription invoice disputes hit the `account_not_found` no-op branch → account is NOT suspended during a chargeback. Fix: fall back to looking up the dispute's `charge.invoice` and joining via `substrate_subscriptions.stripe_customer_id`.

**P1-3 — `session_id` in return URL leaks.** `/billing/return?session_id=cs_xxx` retains the id in browser history, server logs, and referer headers. Defence in depth (ownership check on `metadata.accountId` is the real guard, this is belt-and-braces). Add `Referrer-Policy: no-referrer` on `/billing/return` specifically (the global nginx policy doesn't cover it). On client mount, `history.replaceState(null, '', '/billing/return')` to strip the param after reading.

**P1-4 — Tier-change worker doesn't check substrate status.** Cancel-pending substrate with a queued tier change: worker mutates a substrate that's about to be deprovisioned. Fix: `tier-change-worker.ts` SELECT must include `status IN ('running','read_only') FOR UPDATE`. Same shape on the new "auto-reactivate + tier-change in one call" path (D9) — single Stripe operation, but the worker still needs to read fresh status.

**P1-5 — `cap-refund.ts:149-154` cancel has no `prorate: false`.** Combined with the refund issued at line 119, Stripe may compute proration credit on top of the manual refund if the account-level setting is on. Pass `{ prorate: false, invoice_now: false }` explicitly.

**P1-6 — `cancelSubstrateStripeSub` swallows non-404 errors.** `cancel-substrate-stripe-sub.ts:48-54` `console.warn`s real Stripe API errors (rate limit, transient 5xx) and marks substrate cancelled locally. Orphan live subscriptions accumulate. Add an `orphan_stripe_subs` reconciliation queue with a daily reaper, OR fail the deprovision and let it retry.

### P2 — watch, fix opportunistically

**P2-1 — Concurrent multi-substrate cancel race.** Two `subscription.deleted` webhooks for the same account fire within ms. Each one's `otherActive` check at `substrate-stripe.ts:753-759` runs at `READ COMMITTED`; each sees the other as still active. Neither downgrades the account tier. Fix: `SELECT...FOR UPDATE` on the accounts row at the start of `handleSubscriptionDeleted`.

**P2-2 — `(deps.stripe as any)` on `billing.meterEvents.create`** at `substrate-metering.ts:122` was needed in v20 because types lagged. v22 types include it. Drop the cast.

### Things that ARE fine (no work needed)

- Webhook signature verification with `express.raw` BEFORE `express.json` — correctly ordered (`app.ts:524-540`).
- Per-substrate scoping via `substrate_subscriptions.substrate_id` FK with the `targetSubstrate.find(...)` ownership join at `substrate-stripe.ts:200-209` — forged `metadata.substrateId` correctly rejected.
- Stripe customer reuse across multiple subs — no cross-leak; binding is per-subscription, not per-customer.
- Soft-delete `deleted_at IS NULL` guards on every webhook handler — audited cleanly.
- Idempotency keys on `cap_refund:${subId}` and `cap_cancel:${subId}` (`cap-refund.ts:128, 153`) — correctly scoped.
- `requireRecentAuth` IS applied to `mySubstrate.cancel` policy (`policy.ts:248`).
- `X-Frame-Options: DENY` blocks third parties from iframing us — clientSecret leak via foreign-iframe attack is structurally prevented.

---

## Stripe v22 / dahlia features being adopted

| Feature | Effort | Where | Why |
|---|---|---|---|
| `automatic_tax: { enabled: true }` | M | new `/api/checkout` handler | NZ company billing internationally. Pre-launch is the right time. Set tax origin in Stripe Dashboard. |
| `adaptive_pricing: { enabled: true }` | S | new `/api/checkout` handler | Show prices in customer's local currency. ~1-2% Stripe FX margin acceptable. One line. |
| Apple Pay / Google Pay / Link | S | Stripe Dashboard toggle | Auto-surfaced in Embedded Checkout when enabled. No code change. |
| `subscription_update_confirm` portal flow | S | future enhancement | Same `flow_data` shape as the existing cancel deep-link. Defer. |
| Drop `(deps.stripe as any)` on `billing.meterEvents.create` | XS | `substrate-metering.ts:122` | v22 types now include it. |

---

## Workstream 1 — Stripe SDK + API version upgrade

### Compute changes

- **`mmpm-compute/parametric-memory-compute/package.json`** — bump `stripe` to `^22.1.1`.
- **`src/server.ts:20`** — `new Stripe(config.stripeSecretKey, { apiVersion: '2026-04-22.dahlia' })`.
- **`src/workers/grace-period-worker.ts:40`** — same pin; drop `as any` cast (the legacy `'2025-02-24.acacia'` pin is now wrong because grace-period itself is dead code per P0-6; if you keep the file at all until the destroy worker is fully verified, pin to dahlia).
- **`src/api/webhooks/substrate-stripe.ts`** — fix P0-2, P0-3 (period fields, `invoice.parent`), drop `as any` casts; fix P1-1 idempotency on `payment_succeeded` and `invoice.upcoming`; fix P1-2 dispute account lookup.
- **`src/workers/substrate-metering.ts:122`** — drop `(deps.stripe as any)` cast.
- **Stripe Dashboard** — set the webhook endpoint API version to `2026-04-22.dahlia` at the same time as the deploy. Pin drift between the SDK and the webhook is what produces silent payload-shape mismatches.

### Website changes

- **`mmpm-website/package.json`** — remove `"stripe": "^20.4.1"`. Confirmed unused: `grep -r "from 'stripe'" src/` returns zero hits.

### Tests

- Existing webhook integration tests (`tests/integration/webhook-tier-mapping-hardening.test.ts`, `tests/unit/substrate-webhook-soft-delete.test.ts`, etc.) must stay green.
- Add `tests/unit/period-fields-from-items.test.ts` — webhook handler given a `subscription.created` event with new-shape period fields → asserts `substrate_subscriptions.current_period_start` is NOT `1970-01-01`.
- Add `tests/unit/invoice-parent-subscription.test.ts` — `payment_succeeded` handler given a new-shape invoice → asserts `billing_events` row is recorded (not silently skipped).
- Add `tests/integration/dispute-on-subscription-invoice.test.ts` — fires a `charge.dispute.created` event whose payment intent is on a subscription invoice → asserts account is suspended (covers P1-2).

---

## Workstream 2 — Embedded Checkout

### Compute changes

**Replace `src/api/checkout/session-route.ts`** with the embedded version. Keep every existing gate (capacity, substrate cap, customer reuse, pre-create substrate in `pending_payment`, trial logic, observer signals, all metadata writes — these are correct). Change only the `stripe.checkout.sessions.create` call:

```ts
const session = await deps.stripe.checkout.sessions.create({
  ui_mode: 'embedded_page',                            // P0-1 rename
  mode: 'subscription',
  customer: customerId,
  line_items: lineItems,
  subscription_data: {
    description: slug,
    metadata: { accountId, tier: substrateTier.tier, substrateId },
    ...(trialDays ? { trial_period_days: trialDays } : {}),
  },
  metadata: { accountId, tier: substrateTier.tier, substrateId },
  automatic_tax: { enabled: true },                    // D12
  adaptive_pricing: { enabled: true },                 // D13
  customer_update: { address: 'auto' },                // required for automatic_tax
  return_url: `${deps.baseUrl}/billing/return?session_id={CHECKOUT_SESSION_ID}`,
});

res.json({
  clientSecret: session.client_secret,
  tier: substrateTier.tier,
  amountCents: substrateTier.amountCents,
});
```

**New route `GET /api/v1/checkout/session/:id`** — thin wrapper around `stripe.checkout.sessions.retrieve`. Ownership check is `session.metadata.accountId === req.session.accountId` (never compare on customer id). Response: `{ status, customerEmail, tier, substrateSlug, substrateId, substrateStatus }`. Session-authenticated, no recent-auth required (it's a read). Returns 404 (not 403) on mismatch — don't leak which session IDs exist.

**Delete `src/api/billing/substrate-checkout.ts`** + its swagger entry (per memory: confirmed dead). User runs the `rm` — see Commands section.

**Update swagger** — `src/api/docs/features/checkout.ts` to register the new request/response shape and the new session-retrieve route.

### Website changes

**Install client deps:**
- `@stripe/react-stripe-js@^6.3.0`
- `@stripe/stripe-js@^9` (bump from `^5.0.0`)

**New right-side drawer component** `mmpm-website/src/app/pricing/CheckoutDrawer.tsx`. Uses the existing shadcn `Sheet` component (`@/components/ui/sheet`) with `side="right"`. Mobile breakpoint: full-screen sheet. Width on desktop: `max-w-xl`. Header shows tier name + price. Body mounts `<EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}><EmbeddedCheckout /></EmbeddedCheckoutProvider>`.

**Pre-mount adblock/CSP check (D10):**
```ts
async function probeStripeAvailability(): Promise<{ ok: boolean; reason?: string }> {
  try {
    const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
    return stripe ? { ok: true } : { ok: false, reason: 'stripe_unavailable' };
  } catch (err) {
    return { ok: false, reason: 'load_failed' };
  }
}
```
Called on `PricingCTA.tsx` button click before opening the drawer. If `ok: false`, show inline notice: *"We can't load the payment form. Please disable any adblockers for parametric-memory.dev and reload."* No retry button (user must reload). Don't open the drawer.

**Rewrite `PricingCTA.tsx`** — keep the terms-checkbox gate and capacity check. Replace `window.location.href = data.sessionUrl` with: probe → open drawer → `fetchClientSecret = useCallback` POSTs to `/api/checkout` → drawer mounts iframe.

**New page `mmpm-website/src/app/billing/return/page.tsx`** — server component reads `searchParams.session_id`, fetches `/api/checkout/session/:id` via new BFF, then branches:
- `status === 'complete'` → client component takes over, polls `/api/v1/my-substrate/:slug` every 2s. Step rendering: "Payment confirmed ✓ → Provisioning droplet → Starting MCP server → Ready". Auto-redirect to `/dashboard` when `substrate.status === 'running'`. After 90s without `running`, fall back to: *"Still working — we'll email you when your substrate is ready. [Back to dashboard]"* Compute's existing `OpsObserver` already emits the alert if provisioning takes too long.
- `status === 'open'` → remount the embedded checkout drawer so the user can retry. Per Stripe's docs, this is the canonical retry path.

**New BFF `mmpm-website/src/app/api/checkout/session/[id]/route.ts`** — proxies to `/api/v1/checkout/session/:id` on compute. Forwards session cookie. CSRF not required (GET only).

**Update `mmpm-website/src/app/api/checkout/route.ts`** — body shape unchanged, but the response is now `{ clientSecret }` not `{ sessionUrl }`. BFF wrapper itself is mostly unchanged; downstream callers (just `PricingCTA.tsx`) update.

**Retire `/billing/success`** — fold its UI into the return page as the `status === 'complete'` body.

**Strip session_id from URL on mount:**
```tsx
useEffect(() => {
  if (window.location.search.includes('session_id')) {
    window.history.replaceState(null, '', '/billing/return');
  }
}, []);
```

**Nginx CSP update** — `mmpm-website/nginx.conf:67`:
```
frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com;
connect-src 'self' https://api.stripe.com https://hooks.stripe.com ...;
```
And on `/billing/return` specifically, add `Referrer-Policy: no-referrer`.

### Tests

- Component test for `<CheckoutDrawer>` with `@stripe/react-stripe-js` mocked — verify `fetchClientSecret` is called and iframe shell mounts.
- Component test for the proactive adblock probe — `loadStripe` returns null → user sees "disable adblock" notice, drawer does NOT open.
- Integration test against stripe-mock for new `POST /api/checkout`: asserts `ui_mode === 'embedded_page'`, `automatic_tax.enabled === true`, `adaptive_pricing.enabled === true`, `return_url` includes `{CHECKOUT_SESSION_ID}`, response contains `client_secret`, all metadata fields present.
- Integration test for `GET /api/v1/checkout/session/:id`: complete session → 200 with session payload; open session → 200 with open status; session belonging to another account → 404 (ownership leak guard).
- Return-page integration: complete status → polls substrate until `running` → redirects to dashboard; provisioning stalls past 90s → fallback copy renders.
- Regression: `tests/integration/buying-solo-twice-creates-two-substrates.test.ts` must still pass (the named substrate-resolution test at `substrate-stripe.ts:347-349`).

---

## Workstream 3 — Cancel at period end, hard delete

### Compute changes

**Update `src/api/substrates/routes.ts createCancelHandler`** (the SM-6 handler that the legacy shim and the new slug-scoped route both call):
- Still calls `stripe.subscriptions.update(subId, { cancel_at_period_end: true })`.
- Add the idempotency key: `{ idempotencyKey: \`cancel:\${subId}:\${new Date().toISOString().slice(0,10)}\` }`.
- Returns `{ cancel_at: <unix>, current_period_end: <unix> }` so the website can render the banner without waiting for the webhook.

**Update `src/api/webhooks/substrate-stripe.ts handleSubscriptionDeleted` (lines 682-823)** — this is where D1+P0-6 lands. Remove the read-only/grace block (lines 724-736) entirely. Replace with:
```ts
await client.query(
  `UPDATE substrates
      SET status = 'deprovisioning',
          updated_at = now()
    WHERE id = (
        SELECT substrate_id
          FROM substrate_subscriptions
         WHERE stripe_subscription_id = $1
      )
      AND status NOT IN ('deprovisioned', 'deprovisioning')`,
  [subscription.id],
);

await client.query(
  `INSERT INTO substrate_destroy_queue (substrate_id, reason, status)
   SELECT substrate_id, 'subscription_cancelled', 'pending'
     FROM substrate_subscriptions
    WHERE stripe_subscription_id = $1
   ON CONFLICT DO NOTHING`,
  [subscription.id],
);
```
Drop the `grace_period_ends_at` from the schema OR keep the column but document it as legacy (decide in implementation). The `cancellation_reason: 'grace_period_ended'` observer signal becomes `'subscription_period_ended'`.

**`grace-period-worker.ts` becomes dead code.** If kept, replace its body with a startup log and a `process.exit(0)`. Or hand the user the `rm` command — see Commands.

**Update `createReactivateHandler`** — same idempotency-key pattern, key: `reactivate:${subId}:${dayBucket}`.

**Tier-upgrade auto-reactivate (D9).** Currently `src/api/substrates/upgrade-handlers.ts` calls `stripe.subscriptions.update` to change tier. If the sub has `cancel_at_period_end: true`, the same `update` call adds `cancel_at_period_end: false`. One Stripe operation, atomic. Add a unit test for this case. Add the idempotency key: `upgrade:${subId}:${newTier}:${dayBucket}`.

**P1-4 tier-change worker status guard** — `src/workers/mock-tier-change-worker.ts` (and the prod equivalent) — wrap the worker's SELECT with `status IN ('running', 'read_only') FOR UPDATE` so a cancel-pending row that has flipped to `deprovisioning` during the worker's run is correctly skipped.

### Website changes

**Cancel confirm dialog (`mmpm-website/src/components/CancelSubstrateDialog.tsx`, new file)** — modeled on `ConfirmUpgradeDialog.tsx`. **Minimum copy per D6:**
> **Cancel [substrate-slug]**
> Your paid subscription will end on **DD MMM YYYY**.
> [Cancel subscription]  [Keep subscription]

Two buttons. No warning prose. No export prompts. The dashboard cancel-pending UI carries any further surface.

**Dashboard banner + badge (D7)** in `DashboardClient.tsx`:
- Per-substrate **banner** at top of the substrate row: amber background, text *"Cancels on DD MMM YYYY. [Reactivate]"*. Shown on first dashboard load each day (track in `localStorage` keyed on `dismissed-cancel-banner-<substrateId>-<YYYYMMDD>`). Dismissable with an `x` icon. Auto-shown again the next calendar day.
- **Badge** next to substrate name: small `"Cancelling"` pill with `cancels DD MMM YYYY` tooltip. Always visible while `substrate.cancel_at` is set and `substrate.status === 'running'`.

**Substrate detail page** — add a "Subscription" section with the same banner copy and a Reactivate button (D8). Even when the dashboard banner is dismissed, the detail page surface stays visible.

**Tier upgrade UX during cancel-pending (D9)** — `ChangePlanSheet.tsx` and `ConfirmUpgradeDialog.tsx` show a softer note when `substrate.cancel_at` is set: *"Upgrading will reactivate your subscription."* On confirm, the existing upgrade endpoint handles both the reactivation and tier change in one call.

### CSRF audit pass (P0-5)

In the same PR, audit every BFF route under `mmpm-website/src/app/api/` that proxies a mutating compute call. Grep for `method: "POST"` (or `PUT`, `DELETE`, `PATCH`) and check each one calls `verifyCsrfOrigin()`. Routes to verify at minimum:
- `/api/my-substrate/cancel/route.ts`
- `/api/my-substrate/reactivate/route.ts`
- `/api/my-substrate/deprovision/route.ts`
- `/api/billing/portal/route.ts`
- `/api/billing/upgrade/route.ts`
- `/api/checkout/route.ts`
- Any key-rotation / claim-key route.

### Tests

**The named cascade invariant test:** `tests/integration/cancel-flow-end-to-end.test.ts`.

Scenario: provision substrate → user calls `POST /api/my-substrate/cancel` → assert `stripe.subscriptions.update` was called with `cancel_at_period_end: true` and `idempotencyKey: cancel:${subId}:YYYY-MM-DD` → fire `customer.subscription.updated` event into the webhook → assert substrate has `cancel_at` populated and `status === 'running'` (still!) → advance simulated time past period end → fire `customer.subscription.deleted` → assert substrate `status === 'deprovisioning'`, NO `grace_period_ends_at` set → run destroy worker → assert substrate `status === 'deprovisioned'`, Stripe sub `cancelled`.

**Idempotency replay test:** same scenario but call `/api/my-substrate/cancel` twice within the same calendar day → assert only one `stripe.subscriptions.update` call hits stripe-mock (idempotency-key collision is observable in the mock's call log).

**Double-cancel across day boundary:** cancel today, reactivate tomorrow, cancel the day after → assert each operation is a fresh Stripe call.

**Tier upgrade during cancel-pending:** cancel substrate → call upgrade endpoint → assert one Stripe `subscriptions.update` call with both `cancel_at_period_end: false` AND new tier price.

**Component test for `<CancelSubstrateDialog>`** — minimum copy renders, network error path, recent-auth-required redirect.

**Component test for banner dismissal** — banner shown → click dismiss → not shown again same day → next day → shown again.

**Existing tests must stay green:**
- `tests/integration/buying-solo-twice-creates-two-substrates.test.ts`
- `tests/unit/cancel-substrate-stripe-sub.test.ts`
- `tests/security/recent-auth-gating.test.ts`

---

## Cross-workstream cleanup (same PR)

- Delete `mmpm-compute/parametric-memory-compute/src/api/billing/substrate-checkout.ts` and its swagger entry.
- Delete `mmpm-website/src/app/api/billing/substrate-checkout/route.ts`.
- Remove `"stripe": "^20.4.1"` from `mmpm-website/package.json`.
- Delete or stub `mmpm-compute/parametric-memory-compute/src/workers/grace-period-worker.ts` (becomes dead code per P0-6).
- Tighten every `(subscription as any)` and `(invoice as any)` cast in `substrate-stripe.ts` against dahlia types now that v22 is in.
- Update swagger spec entries for `/api/checkout` (new response shape) and `/api/v1/checkout/session/:id` (new route).

---

## Commands the user needs to run

Package installs, file deletions, and DB queries are human-only per ground rules. Each command has why / where / safety.

### 1. Pre-flight DB check — is `current_period_start = 1970` already in production?

**Why:** Validate whether P0-2 has been silently failing before we deploy v22. Tells us if we need a backfill ticket.
**Where:** Run against the production read replica or the latest dump. Read-only — no mutations.
**Safe?** Yes, SELECT only.

```sql
SELECT id, stripe_subscription_id, current_period_start, current_period_end, created_at
FROM substrate_subscriptions
WHERE current_period_start = to_timestamp(0)
   OR current_period_end = to_timestamp(0)
ORDER BY created_at DESC
LIMIT 50;
```

If this returns >0 rows, flag for a follow-up backfill ticket (out of scope for this sprint, but block on the count).

### 2. Bump compute's Stripe SDK to v22

**Why:** Two majors behind. Latest is 22.1.1. Required to access dahlia types and the new feature surface.
**Where:** `cd /Users/glenosborne/Documents/code/mmpm-compute/parametric-memory-compute`
**Safe?** Yes. Lockfile-only change, no runtime change until code uses the new types. If `tsc` errors, revert with `npm install stripe@20.4.1` and ping me.

```bash
cd /Users/glenosborne/Documents/code/mmpm-compute/parametric-memory-compute
npm install stripe@^22.1.1
npx tsc --noEmit
npm test
```

(Reminder: local dev for both repos uses `npm`. Compute uses `pnpm` only on the prod deploy host — the production deploy script will need its lockfile regenerated separately when this PR lands.)

### 3. Remove the dead `stripe` dependency from the website

**Why:** `mmpm-website/package.json` declares `stripe@^20.4.1` but `grep -r "from 'stripe'" src/` returns zero hits. Dead.
**Where:** `cd /Users/glenosborne/Documents/code/mmpm-website`
**Safe?** Yes. If `npm run build` fails after removal, the grep missed something; reinstall with `npm install stripe@^22.1.1`.

```bash
cd /Users/glenosborne/Documents/code/mmpm-website
npm uninstall stripe
npm run build
npm test
```

### 4. Add the Embedded Checkout client deps

**Why:** `<EmbeddedCheckoutProvider>` and `<EmbeddedCheckout>` ship in `@stripe/react-stripe-js@^6.3.0`. Its peer dep is `@stripe/stripe-js@>=9.3.1 <10.0.0` — we install both in one `npm install` so npm resolves the peer correctly. Installing them in two separate commands hits an `ERESOLVE` peer-conflict against the previous stripe-js@^5 line.
**Where:** `cd /Users/glenosborne/Documents/code/mmpm-website`
**Safe?** Yes — stripe-js 5→9 is a forward double-major; the breaking changes are minor (mostly TypeScript types and some Elements options we don't use). `loadStripe(publishableKey)` is still the canonical entry point.

```bash
cd /Users/glenosborne/Documents/code/mmpm-website
npm install @stripe/stripe-js@^9 @stripe/react-stripe-js@^6.3.0
npx tsc --noEmit
npm run build
```

### 5. Remove the dead `/api/v1/billing/substrate-checkout` route (DEFERRED — follow-up ticket)

**Status at sprint end:** NOT EXECUTED. The handler is still mounted because the compute swagger-parity and session-routes security tests still pin it. Full retirement requires removing the route from app.ts + auth policy + swagger + 5 test files; deferring keeps this sprint focused.

**Customer impact:** none — no website code calls the route. Embedded Checkout at `POST /api/checkout` is the only checkout entry users go through.

Tracked follow-up: delete `src/api/billing/substrate-checkout.ts` + its swagger registration + the policy entry + update the 5 test files. Same posture for `src/workers/grace-period-worker.ts` (dead since D1+P0-6 but still safe to leave running — finds zero rows to process).

**Why:** Confirmed dead per memory atom `v1.fact.three_checkout_endpoints_swagger_confirmed_dt_2026_04_17`. Two files.
**Where:** repo roots.
**Safe?** Verify with grep first. If clean, delete is safe.

```bash
# Verify first — must return zero hits before deleting:
grep -r "substrate-checkout" \
  /Users/glenosborne/Documents/code/mmpm-website/src \
  /Users/glenosborne/Documents/code/mmpm-compute/parametric-memory-compute/src \
  --include='*.ts' --include='*.tsx' --exclude-dir=node_modules

# If clean:
rm /Users/glenosborne/Documents/code/mmpm-compute/parametric-memory-compute/src/api/billing/substrate-checkout.ts
rm /Users/glenosborne/Documents/code/mmpm-website/src/app/api/billing/substrate-checkout/route.ts
```

### 6. Remove the dead `grace-period-worker.ts` (P0-6)

**Why:** D1 + P0-6 eliminate the 30-day read-only grace path. The worker that processed grace expiry is now dead.
**Where:** compute repo.
**Safe?** Verify nothing else imports the file first. PM2 / process supervisor config will also need the entry removed (separate ops step).

```bash
# Verify first:
grep -r "grace-period-worker" \
  /Users/glenosborne/Documents/code/mmpm-compute/parametric-memory-compute/src \
  --include='*.ts' --exclude-dir=node_modules

# Also check pm2 / supervisor config files for grace-period entries.
# If clean, and PM2 config updated:
rm /Users/glenosborne/Documents/code/mmpm-compute/parametric-memory-compute/src/workers/grace-period-worker.ts
```

### 7. Stripe Dashboard — webhook API version + Stripe Tax origin

**Why:** Webhook endpoint version must match the SDK pin (`2026-04-22.dahlia`) or payload shapes will drift silently. Stripe Tax needs the tax origin (NZ) set in dashboard before `automatic_tax: enabled` works.
**Where:** Stripe Dashboard, sandbox account.
**Safe?** Yes — sandbox, no real customer impact. Coordinate with code deploy.

Steps in the Stripe Dashboard:
1. Developers → Webhooks → [our endpoint] → "..." → Update API version → `2026-04-22.dahlia`.
2. Settings → Tax → Set up Stripe Tax → Add origin: New Zealand → Set tax behaviour: tax-inclusive (or exclusive, ops call).
3. Settings → Payment methods → Enable Apple Pay / Google Pay / Link for Embedded Checkout sessions.

---

## Out of scope (deferred follow-ups)

- Backfilling `1970-01-01` rows in `substrate_subscriptions.current_period_start` if the pre-flight check finds any. Separate ticket.
- `subscription_update_confirm` portal flow for upgrades (Stripe feature A6) — defer to a future sprint; existing dashboard-driven upgrade is fine.
- Stripe Radar rules tuning for repeated chargebacks — defer.
- Webhook IP allowlist at nginx (P2-style hardening) — defer; Stripe's 5-minute timestamp tolerance is acceptable given the rate-limit posture.
- Tidying up marketing pages + docs to reflect the new cancel policy — per user note, that's a follow-up after we know where we land.

---

## Sources

- [Stripe Node v22 migration guide](https://github.com/stripe/stripe-node/wiki/Migration-guide-for-v22)
- [dahlia changelog index](https://docs.stripe.com/changelog/dahlia)
- [Updates Checkout Session UI mode enum values (dahlia 2026-03-25)](https://docs.stripe.com/changelog/dahlia/2026-03-25/updates-available-checkout-session-ui-modes)
- [Renames Embedded Checkout initialisation method (dahlia 2026-03-25)](https://docs.stripe.com/changelog/dahlia/2026-03-25/rename-init-embedded-checkout-to-create-embedded-checkout-page)
- [Subscription item-level billing periods (basil 2025-03-31)](https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end)
- [Invoicing parent field (basil 2025-03-31)](https://docs.stripe.com/changelog/basil/2025-03-31/adds-new-parent-field-to-invoicing-objects)
- [Removes legacy usage-based billing (basil 2025-03-31)](https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-legacy-usage-based-billing)
- [Embedded Checkout quickstart (React)](https://docs.stripe.com/checkout/embedded/quickstart?client=react)
- [Embedded Checkout custom success page](https://docs.stripe.com/payments/checkout/custom-success-page?payment-ui=embedded-page)
- [Retrieve a Checkout Session API](https://docs.stripe.com/api/checkout/sessions/retrieve)
- [Stripe Tax in Checkout](https://docs.stripe.com/tax/checkout)
- [Adaptive Pricing per Checkout Session](https://docs.stripe.com/changelog/acacia/2024-11-20/adaptive-pricing-param)
- [Customer Portal flow_data deep links](https://docs.stripe.com/customer-management/portal-deep-links)
- [Customer Portal configuration](https://docs.stripe.com/customer-management/configure-portal)
- [Stripe API versioning policy](https://docs.stripe.com/api/versioning)
- Memory atoms: `v1.fact.checkout_mode_mismatch`, `v1.fact.free_tier_now_1_dollar_stripe_checkout`, `v1.fact.compute_provision_trigger_is_stripe_webhook_dt_2026_04_14`, `v1.fact.three_checkout_endpoints_swagger_confirmed_dt_2026_04_17`, `v1.fact.substrate_billing_model_subscription_based`, `v1.fact.mmpm_compute_stripe_webhook_raw_body`, `v1.fact.stripe_dual_webhook_architecture`
