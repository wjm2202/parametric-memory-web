# Checkout Adblocker Resilience Sprint

**Date:** 2026-05-29
**Author:** Claude (research + plan only — no code shipped this session)
**Status:** Drafted, awaiting approval. Implementation-ready.
**Repos affected:** `mmpm-website`, `mmpm-compute` (`parametric-memory-compute/`)

---

## TL;DR

Live evidence (2026-05-29 pricing-page screenshot, gd.osborne@outlook.com session): the `Get Solo` / `Get Professional` / `Get Starter` CTAs all fall through to the amber "We can't load the payment form" notice because `js.stripe.com` is being blocked on-page by EasyPrivacy / uBlock Origin / Brave Shields. `Manage billing` on `/dashboard` still works because it's a server-driven redirect to `billing.stripe.com` — no on-page Stripe script load, nothing for the blocker to filter.

This sprint makes the pricing-page CTA adopt the same fundamental shape as `Manage billing`: **when the Stripe.js probe fails, server-side redirect the user to Stripe-hosted Checkout instead of showing a dead-end notice.** Embedded Checkout stays as the default (better UX) for the ~70% of visitors without aggressive blockers.

Bundled in: clean up the `checkoutUrl` mismatch in `ConfirmUpgradeDialog.tsx` flagged at `src/app/api/billing/upgrade/route.ts:20-27` — the upgrade endpoint stopped returning `checkoutUrl` when it moved to in-place `subscriptions.update`, but the dialog still toasts "Submission error" on success because it reads an undefined field.

Three workstreams, one merge.

1. **Hybrid checkout — embedded by default, hosted-redirect fallback.** Backend `/api/checkout` accepts `{ tier, mode?: "embedded" | "hosted" }`. Frontend `PricingCTA` keeps the existing probe; on probe failure it POSTs `{ mode: "hosted" }` and `window.location.href = response.url` instead of rendering the amber notice. `compute` checkout handler branches on `mode` and creates the Stripe session with `ui_mode: 'embedded_page'` (existing) or `ui_mode: 'hosted'` + `success_url` + `cancel_url`.
2. **Upgrade-dialog `checkoutUrl` cleanup.** `ConfirmUpgradeDialog.tsx` drops the `checkoutUrl` read entirely. On 200, close the dialog, surface a success toast, and let the existing `useTierChangePoll` hook drive the progress banner. Remove the stale comment in `src/app/api/billing/upgrade/route.ts:20-27` once the dialog is fixed.
3. **Tests for both.** Unit tests covering the new fallback branches (probe fail → hosted redirect; backend `mode=hosted` returns `{ url }`; dialog close + poll handoff). E2E smoke that loads `/pricing` with `js.stripe.com` blocked at the network layer and verifies the redirect lands on `checkout.stripe.com`.

---

## Locked decisions

Lock these before implementation. If a later question contradicts one, escalate.

| # | Decision | Lock |
|---|---|---|
| D1 | Hybrid checkout. Embedded is default; hosted-redirect is the probe-fail fallback. No "always hosted" mode and no "always embedded" mode. | locked |
| D2 | `/api/checkout` request body extends to `{ tier, mode?: "embedded" \| "hosted" }`. Default `mode = "embedded"` for back-compat with anything still calling the old shape. | locked |
| D3 | `/api/checkout` response is **either** `{ clientSecret, tier, amountCents }` (embedded) **or** `{ url, tier, amountCents }` (hosted). Frontend branches on which key is present. | locked |
| D4 | Hosted session uses `ui_mode: 'hosted_page'` (dahlia rename of pre-2026-03-25 `'hosted'`), `success_url: '/billing/return?session_id={CHECKOUT_SESSION_ID}'`, `cancel_url: '/pricing'`. `/billing/return` already handles the success/poll case and works identically for hosted-mode sessions. The wire contract between the website and compute uses the shorter pre-dahlia names (`mode: 'embedded' | 'hosted'`) — compute translates to the dahlia enum at the Stripe boundary. | locked |
| D5 | Probe stays as-is in `CheckoutDrawer.tsx` (`probeStripeAvailability`). The fallback replaces the amber `adblockNotice` block in `PricingCTA.tsx`, not the probe itself. | locked |
| D6 | Stripe Custom Domains add-on ($10/mo, payments.parametric-memory.dev → Stripe) is **out of scope** this sprint. Document as a follow-up. Hosted redirect to `checkout.stripe.com` is already adblocker-safe. | locked |
| D7 | Self-hosting / reverse-proxying `js.stripe.com` is forbidden (Stripe TOS + PCI DSS + breaks Radar). Not an option. Stated here so it can't resurface in review. | locked |
| D8 | `ConfirmUpgradeDialog.tsx` stops reading `checkoutUrl` from the upgrade response. On 200, close the dialog and let `useTierChangePoll` drive the UI. The stale comment in `src/app/api/billing/upgrade/route.ts:20-27` is deleted in the same PR. | locked |

---

## Architecture — adblock fallback flow

```
Browser (/pricing)
   │
   │  ① click "Get Solo"
   ▼
PricingCTA.handleCheckout
   │
   │  ② capacity check (existing)
   ▼
probeStripeAvailability()    ← loadStripe('pk_…')
   │
   ├── ok ──► open <CheckoutDrawer>            (today's flow, unchanged)
   │            POST /api/checkout { tier }
   │            → { clientSecret } → embedded
   │
   └── fail ► POST /api/checkout { tier, mode: "hosted" }
                │
                ▼
            mmpm-website BFF ── proxy ──► mmpm-compute
                                            checkout.sessions.create
                                              ui_mode: 'hosted'
                                              success_url: …/billing/return?session_id={…}
                                              cancel_url: …/pricing
                                            ─► { url, …}
                ◄── { url, tier, amountCents }
                │
                ▼
            window.location.href = url    ← top-level navigation,
                                            adblockers don't filter this
                │
                ▼
            checkout.stripe.com/c/pay/…   ← user pays
                │
                ▼
            /billing/return?session_id=…  ← existing poll page works as-is
```

Dashboard `Manage billing` flow is **already** the bottom branch — this sprint brings the pricing CTA into structural alignment with it.

---

## Workstream 1 — Hybrid checkout

### D1.1 — `mmpm-compute` checkout handler accepts `mode`

File: the compute-side checkout handler (whichever resolves from `parametric-memory-compute` route `/api/checkout`). Find it via `grep -r "checkout.sessions.create" parametric-memory-compute/src`.

Change:

- Read `mode` from request body. Default `"embedded"`.
- If `mode === "hosted"`:
  - `ui_mode: 'hosted_page'` (dahlia)
  - `success_url: \`${SITE_ORIGIN}/billing/return?session_id={CHECKOUT_SESSION_ID}\``
  - `cancel_url: \`${SITE_ORIGIN}/pricing\``
  - omit `return_url`
- If `mode === "embedded"` (or absent):
  - existing `ui_mode: 'embedded_page'` flow unchanged
- Response body branches accordingly:
  - hosted → `{ url: session.url, tier, amountCents }`
  - embedded → `{ clientSecret: session.client_secret, tier, amountCents }`

Idempotency key strategy unchanged — still `checkout:${userId}:${tier}:${dayBucket}`.

`automatic_tax: { enabled: true }` and `adaptive_pricing: { enabled: true }` stay on both modes (locked in the 2026-05-18 sprint, D12/D13).

### D1.2 — `mmpm-website` `/api/checkout` BFF passes `mode` through

File: `src/app/api/checkout/route.ts`.

- Forward `mode` in the proxied body. The current implementation reads the request body via `request.json()` and passes it to `computeProxy`, so this is a no-op as long as the proxy preserves unknown keys — verify that it does.
- No response transformation needed; just pass through.

### D1.3 — `PricingCTA.tsx` replaces amber notice with hosted-redirect

File: `src/app/pricing/PricingCTA.tsx`.

Today, lines 191-196:

```ts
const probe = await probeStripeAvailability();
if (!probe.ok) {
  setAdblockNotice(true);
  setLoading(false);
  return;
}
```

Change to:

```ts
const probe = await probeStripeAvailability();
if (!probe.ok) {
  // Hosted-redirect fallback. Adblocker is killing js.stripe.com on
  // this page; do the same thing Manage Billing does — server-side
  // redirect to a Stripe-hosted session URL the blocker can't filter.
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: tierId, mode: "hosted" }),
    });
    if (!res.ok) {
      // Surface the same error semantics as the drawer's fetchClientSecret.
      const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      setError(
        res.status === 401
          ? "You need to sign in again before paying. Please reload."
          : res.status === 409
            ? (body?.message ?? "This tier is temporarily full. Please come back shortly.")
            : (body?.error ?? `Checkout failed (HTTP ${res.status}).`),
      );
      setLoading(false);
      return;
    }
    const body = (await res.json()) as { url?: string };
    if (!body.url) {
      setError("Stripe returned no checkout URL. Please retry.");
      setLoading(false);
      return;
    }
    window.location.href = body.url;
    // intentionally leave loading=true — page is about to navigate away
    return;
  } catch {
    // Network died between the probe and the redirect. Fall back to the
    // old amber notice so the user has something to act on.
    setAdblockNotice(true);
    setLoading(false);
    return;
  }
}
```

Keep the `adblockNotice` JSX block — it's now a last-resort if both the probe AND the hosted-redirect POST fail (rare, but defensible).

### D1.4 — `/billing/return` works for both modes

Verify. The existing return page polls substrate status by `session_id`. Both `ui_mode: 'embedded_page'` and `ui_mode: 'hosted'` produce identical webhook events on Stripe's side (`customer.subscription.created`, `checkout.session.completed`), so the poll loop should be unchanged. Add a check during D3 testing.

---

## Workstream 2 — Upgrade-dialog `checkoutUrl` cleanup

### D2.1 — Drop `checkoutUrl` read in `ConfirmUpgradeDialog.tsx`

File: `src/app/admin/ConfirmUpgradeDialog.tsx`.

Today the dialog (per the comment in `src/app/api/billing/upgrade/route.ts:20-27`) expects `{ checkoutUrl }` in the success body and toasts "Submission error" when it's `undefined`. The actual upgrade flow is now in-place via `subscriptions.update` — no checkout, no redirect.

Change:

- Remove the `checkoutUrl` field read.
- On 200, close the dialog and surface a success toast ("Plan change submitted — finishing up…").
- Trust `useTierChangePoll` (already wired in the dashboard / admin detail page) to render the progress banner from the new in-flight tier-change row.
- The response body fields `{ accepted, currentTier, targetTier, transitionType, stripeSubscriptionId, prorationCents }` may be useful for the toast copy ("Pro-rata charge of $X today" if `prorationCents > 0`) — optional polish, not required.

### D2.2 — Delete stale comment in `route.ts`

File: `src/app/api/billing/upgrade/route.ts`, lines 20-27.

Once D2.1 lands, the comment block describing the mismatch is stale and confusing. Delete it. Replace with a one-liner: `// Returns compute's in-place upgrade response verbatim. See PLAN-ADMIN-UPGRADE-FLOW.md §4.3.`

---

## Workstream 3 — Tests

We write tests for everything we make. Coverage per ticket:

### D3.1 — `PricingCTA.test.tsx` — hosted-redirect fallback

New test file or extend the existing `PricingCardClient.test.tsx`.

Cases:

- Probe returns `{ ok: false }` → fetch `/api/checkout` is called with `{ tier, mode: "hosted" }`.
- `/api/checkout` 200 with `{ url: "https://checkout.stripe.com/c/pay/foo" }` → `window.location.href` is set to that URL. Mock `window.location` via `Object.defineProperty(window, 'location', ...)`.
- `/api/checkout` 401 → error message "You need to sign in again before paying. Please reload."
- `/api/checkout` 409 → error message uses `body.message`.
- `/api/checkout` returns body without `url` → error "Stripe returned no checkout URL. Please retry."
- Network throw → falls through to the amber `adblockNotice` (existing testid `pricing-cta-adblock-notice` still renders).
- Probe returns `{ ok: true }` → drawer opens, no `/api/checkout` call from PricingCTA itself (drawer makes its own).

### D3.2 — `/api/checkout/route.test.ts` — `mode` pass-through

Extend the existing test. Verify that a request body with `mode: "hosted"` is forwarded to compute unchanged. (The BFF is a thin proxy — this test is small.)

### D3.3 — `mmpm-compute` checkout handler tests

In `parametric-memory-compute`. Cases:

- `mode = "embedded"` (or absent) → session created with `ui_mode: 'embedded_page'`, response body `{ clientSecret, tier, amountCents }`.
- `mode = "hosted"` → session created with `ui_mode: 'hosted'`, `success_url` ending in `/billing/return?session_id={CHECKOUT_SESSION_ID}`, `cancel_url` ending in `/pricing`, response body `{ url, tier, amountCents }`.
- Mock the Stripe client; assert on the `sessions.create` call arguments.

### D3.4 — `ConfirmUpgradeDialog.test.tsx` — close-on-200 + no `checkoutUrl` read

Update the existing test file.

Cases:

- 200 response with the in-place body shape → dialog closes, success toast surfaces, no navigation occurs, no error toast.
- 400 / 409 / 500 → error toast surfaces with the appropriate copy. No close.
- Response body without `checkoutUrl` is **not** treated as an error (this was the bug).

### D3.5 — E2E: adblock-simulated redirect

Add a Playwright spec under whichever E2E folder this codebase uses (check `playwright.config.ts` / `e2e/`).

```ts
test("pricing CTA redirects to hosted checkout when js.stripe.com is blocked", async ({ page, context }) => {
  // Block js.stripe.com at the network layer — same effect as uBlock.
  await context.route("**/js.stripe.com/**", (route) => route.abort());

  await page.goto("/pricing");
  // … log in / accept terms …
  await page.getByTestId("pricing-card-solo-cta").click();

  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 10_000 });
  // No need to drive Stripe's hosted page in CI — landing on the URL is the assertion.
});
```

This is the canary that the whole sprint exists to deliver. Worth making it loud if it ever fails.

---

## CSP / nginx changes — none expected

Hosted Checkout is a top-level navigation, not an iframe. The existing `frame-src` / `connect-src` allowances added in the 2026-05-18 sprint (P0-4) for `checkout.stripe.com` and `hooks.stripe.com` already cover the embedded path. Hosted-redirect doesn't need anything new. **Confirm during staging** by hitting `/pricing` with an EasyPrivacy filter active and a strict CSP.

---

## Risks

| Risk | Mitigation |
|---|---|
| Probe latency (loadStripe waits ~200–500ms before resolving null) — blocked users feel a delay before the redirect kicks in. | Acceptable trade for keeping the better embedded UX for unblocked users. If complaints surface, swap to an always-hosted variant gated on a feature flag. |
| Stripe rate-limits `checkout.sessions.create` if a user clicks the CTA repeatedly during the latency window. | Existing `loading` state + button disable already prevent double-clicks. Re-verify in D3.1. |
| Adblock filter lists update to start blocking the BFF endpoint `/api/checkout` directly. | Low probability — these lists target third-party CDNs, not first-party API routes. If it ever happens, the path is also same-origin to the page so won't match generic third-party filters. |
| In-flight `mode = "embedded"` requests deployed before D1.1 hit a backend that doesn't know `mode` yet. | Default-on-absent makes the change backward-compatible. Deploy compute first, website second. |
| `useTierChangePoll` doesn't pick up the new in-flight row immediately after dialog close (D2.1). | Verify the dialog calls the existing refetch / SWR mutate before closing. Add to D3.4 test. |

---

## Out of scope (follow-ups)

- **Stripe Custom Domains ($10/mo).** `payments.parametric-memory.dev → checkout.stripe.com` via CNAME + TXT. Hides the `stripe.com` redirect from adblockers entirely and gives a branded URL bar during payment. Worth doing once Stripe revenue justifies the recurring cost. Not blocking this sprint — `checkout.stripe.com` is not on EasyList/EasyPrivacy as a blocked domain today.
- **Always-hosted mode.** A page-level config that skips the embedded drawer entirely. Useful if the embedded iframe ever becomes a source of CSP / mobile-Safari pain. Defer until there's a reason.
- **Telemetry on probe failure rate.** Track how often the hosted-redirect path triggers vs the embedded path. Would inform whether the embedded code is worth the maintenance. Add to `lib/analytics.ts` follow-up.
- **`PricingCardClient.tsx` waitlist-form parity.** The waitlist form already works regardless of blocker. No changes needed but call this out so reviewers don't ask.

---

## Deploy order

1. `mmpm-compute` — D1.1 + D3.3. Deploy and verify staging by manually hitting `/api/checkout` with `{ mode: "hosted" }` and confirming a Stripe session URL comes back.
2. `mmpm-website` — D1.2 + D1.3 + D2.1 + D2.2 + D3.1 / D3.2 / D3.4 / D3.5. Deploy after compute.
3. Smoke check on prod: load `/pricing` in a fresh Brave window with Shields up, click `Get Solo`, verify the redirect lands on `checkout.stripe.com`. Repeat with uBlock Origin (default lists) in Chrome.

Rollback: revert the website PR. Compute change is additive (new `mode` field, backward-compatible) — safe to leave deployed even if the website is rolled back.

---

## Memory anchors

- `v1.state.pricing_page_embedded_checkout_only_no_hosted_fallback` — current state, tombstone on merge.
- `v1.fact.adblockers_block_stripe_embedded_not_hosted` — diagnosis, keep.
- `v1.fact.stripe_js_must_load_from_stripe_cdn` — PCI constraint, keep.
- `v1.fact.stripe_custom_domain_paid_feature` — follow-up option, keep.

On sprint completion: checkpoint `v1.state.pricing_page_hybrid_checkout_active`, tombstone the embedded-only state, edge `supersedes` between them, `member_of` → `v1.other.hub_mmpm_compute`.
