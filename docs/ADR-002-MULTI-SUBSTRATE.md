# ADR-002: Multi-Substrate Support — One Stripe Subscription Per Substrate

**Status:** Proposed
**Date:** 2026-04-11
**Deciders:** Entity One
**Related:** commit `30dcb41` ("fix sudo issue", reverted), this morning's `tiers.ts` pin to `maxSubstrates: 1`, `migration/029_substrate-subscriptions.sql`, `migration/047` (enforce_substrate_cap trigger)
**Supersedes:** The architectural assumption documented in `src/config/tiers.ts:23-31` JSDoc on `TierLimits.maxSubstrates` (2026-04-11)

---

## Context

Every paid MMPM customer receives a "substrate" — a containerised MMPM server (PostgreSQL + MMPM API) running in its own docker project on a shared droplet (or, for Team tier, a dedicated droplet). The substrate is the customer's private memory instance.

Today, the compute API treats "my substrate" as singular. Every route that reads or mutates a customer's substrate resolves it from the session's `accountId` via a query of the form:

```sql
SELECT ... FROM substrates
WHERE account_id = $1
  AND status NOT IN ('deprovisioned', 'destroyed', 'provision_failed')
ORDER BY created_at DESC
LIMIT 1
```

This morning (2026-04-11) we pinned every tier in `src/config/tiers.ts` to `maxSubstrates: 1` to align the customer-facing pricing surface with the singular-resolution assumption.

### Three discoveries prompted this ADR

**1. The compute schema is already multi-substrate-ready.** Migration `029_substrate-subscriptions.sql` created `substrates` with no `UNIQUE(account_id)` constraint. Migration `047` added a DB trigger `enforce_substrate_cap()` that reads `platform_settings.max_substrates_{free,indie,pro,team}` and rejects inserts exceeding per-tier caps. Defaults: free=1, indie=2, pro=3, team=5 — exactly the numbers this morning's website change removed. `tests/integration/substrate-cap-enforcement.test.ts` explicitly verifies all four caps. The compute DB layer was built for multi-substrate; the application layer never caught up.

**2. The Stripe webhook silently swallows duplicate purchases as "tier changes".** `src/api/webhooks/substrate-stripe.ts:163-202` handles `customer.subscription.created` by:

- `SELECT id, tier, status FROM substrates WHERE account_id = $1 AND status != 'deprovisioned'` (no LIMIT)
- If zero rows → enqueue new substrate provisioning (correct)
- If any rows → enqueue a `tier_change` on the existing substrate
- **Never creates a second substrate row**

If a logged-in Solo customer clicks "Get Solo" again on the pricing page, Stripe accepts the second subscription and charges their card. The webhook fires with `subscription.created`. The handler sees an existing substrate, enqueues a `tier_change` from Solo to Solo (a no-op), and the customer now pays $18/month for one substrate. **This is a silent duplicate-billing bug.**

**3. Every downstream read is "lossy" regardless.** Even if the webhook created a second substrate row, `billing/status.ts:101`, `billing/caps.ts:20`, and every `my-substrate/*` route would only surface the newest one. The website dashboard is typed `substrate: SubstrateInfo | null`, not `SubstrateInfo[]`. The admin panel is singular. No `substrateId` parameter exists in any `/api/my-substrate/*` URL. The compute API has no path for the client to disambiguate between live substrates on the same account.

### Forces at play

- **Revenue-leak risk (acute):** Customers can accidentally double-charge themselves. Our ToS doesn't cleanly cover it. A single complaint + chargeback cycle costs more than the second sub would have earned.
- **Product growth constraint (chronic):** As long as we're singular, power users cannot legitimately run "personal" and "work" substrates, dev teams cannot run "staging" + "prod" memory instances, and we lose an upsell path. Competitors (Mem0, Zep) allow multiple projects per account.
- **Schema/application mismatch (technical debt):** The compute schema, the cap trigger, and the subscription-cap integration tests all imply multi-substrate. The application layer violates that intent. Every day this mismatch persists, more singular-substrate assumptions get baked in.
- **Customer identifier legibility:** Slugs like `entity-a3f2c1` are opaque. Anyone managing 2+ substrates needs to tell them apart.
- **Security (IDOR):** If URLs contain a `substrateId`, every route must verify the caller owns that substrate. A buggy route becomes an IDOR vulnerability. The current singular design has zero IDOR surface because there is no ID in the URL.

---

## Decision

Adopt a **"one Stripe subscription = one substrate"** model. Each substrate is an independently billable unit with its own `stripe_subscription_id`, its own tier, its own lifecycle (provision → running → deprovisioned), and its own rotate-key / cancel / reactivate flows. The customer's account owns N substrates (N ≥ 0, capped by per-tier caps in `platform_settings`). The account has a single Stripe customer record; it may have N subscriptions.

Three locked decisions from the design Q&A:

1. **Billing model:** One Stripe subscription per substrate. No quantity-based billing. No admin-only gating. Customer self-serve creates subscriptions through checkout; each completed checkout provisions a new substrate row.

2. **Identifier:** Keep the existing auto-generated slug `{email-prefix}-{6-char random hex}` as the sole customer-facing substrate ID. No display names, no rename flow, no customer-chosen names, no ordinals. Slugs are stable, URL-safe, already unique, and already the container project name / Traefik subdomain / SSH path component.

3. **No stopgap.** The duplicate-billing bug does not get a dedicated Band-Aid PR. It gets fixed by shipping the multi-substrate design correctly. Between ADR approval and the first phase landing, we mitigate the bleed by leaving this morning's pricing surface pinned to "1 substrate" copy — the pricing page's hard-coded feature list doesn't advertise multi, and the Stripe webhook's existing `tier_change` no-op behaviour accidentally absorbs the duplicate on matching-tier purchases. This is not a fix, but it is not zero protection either.

---

## Options Considered

### Option A — Hard guard, singular forever

Block duplicate checkouts at the website (pricing page shows "Manage subscription" for existing subscribers) and at compute (checkout route rejects second attempt with 409). Keep `maxSubstrates: 1` across all tiers permanently. Delete migration 047's cap trigger or hard-code free=1 everywhere.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — ~2 files + tests |
| Cost | ~1 engineer-day |
| Scalability | Caps the product at one-substrate-per-account forever |
| Team familiarity | Very high |
| Reversibility | High (can add multi-substrate later, but re-introduces all the same work) |

**Pros:** Fastest possible close of the revenue leak. No schema changes. No IDOR surface. Pricing page today is already shaped for this. Aligns with this morning's `tiers.ts` pin.
**Cons:** Discards the schema work already done in migrations 029/047. Closes the upsell path ("buy a second substrate for staging"). Forces power users and dev teams onto second-account workarounds. Leaves `substrate_cap_enforcement.test.ts` as a monument to a deprecated design.

**Rejected because:** Entity One explicitly asked for "an elegant solution to **allow** a customer to buy and manage more than one substrate". Option A forbids the use case the question asked to enable.

### Option B — One Stripe subscription per substrate *(chosen)*

Each substrate has a 1:1 relationship with a Stripe subscription. Stripe `subscription.created` → new substrate row + provisioning. Stripe `subscription.updated` with plan change → tier change on the linked substrate (identified by `stripe_subscription_id`, not by `account_id`). Stripe `subscription.deleted` → deprovisioning of the linked substrate. Every `my-substrate/*` route becomes `my-substrate/{slug}/*`. The dashboard becomes a list-of-substrates view. Per-tier caps from `platform_settings` are re-enabled on the website surface.

| Dimension | Assessment |
|-----------|------------|
| Complexity | High — ~15 compute routes, ~8 website routes, dashboard rework, admin rework, webhook rewrite, new IDOR guard, new ownership helper, docs, pricing copy |
| Cost | ~2 sprints (10–14 engineer-days) |
| Scalability | Unbounded by design; caps enforced at DB trigger layer |
| Team familiarity | Medium — touches every part of the stack |
| Reversibility | Medium (hard to walk back URL shapes once customers depend on them) |

**Pros:** Matches the schema's original intent. Clean billing semantics — one subscription, one substrate, one cancel button, one invoice history. Stripe portal "just works" (customer sees N subscriptions, can cancel each independently). Tier changes scope naturally to a specific substrate (upgrade *this* substrate from Solo to Pro). Deprovision is per-substrate, not per-account. Opens the upsell path. No quantity accounting needed. Webhook logic becomes simpler, not more complex, because each event maps to exactly one substrate.
**Cons:** Every `/api/my-substrate/*` route needs a slug in the URL and an ownership check in the handler. The dashboard needs a picker or list. The billing portal button becomes "manage all subscriptions" and routes to Stripe's customer portal (which already handles multi-subscription cleanly). IDOR risk must be handled with a single, tested `assertSubstrateOwnership(accountId, slug)` helper shared across every route. Admin panel needs a "substrates for account X" view.

**Chosen because:** It cleanly supports the growth use case, aligns with the existing schema and trigger, produces a simpler mental model than quantity-based billing, and each substrate's lifecycle stays independent (one can be deprovisioned without affecting the other).

### Option C — One Stripe subscription with `quantity: N`

Customer buys "Solo × 2" as a single Stripe subscription with `quantity=2`. Webhook provisions N substrates from one subscription row. `substrate_subscriptions` stores `stripe_subscription_id` + `substrate_slug`, with N rows per Stripe subscription. Upgrades apply to all N substrates at once.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — simpler billing, but coupled substrate lifecycles |
| Cost | ~1 sprint |
| Scalability | Good for "buy N of the same tier", awkward for "Solo staging + Pro prod" |
| Team familiarity | Medium |
| Reversibility | Low (Stripe subscription items with quantity are sticky) |

**Pros:** Fewer Stripe subscriptions to manage in the portal. Single invoice, single payment method, single cancellation. Natural fit for "give me 3 of these".
**Cons:** Per-substrate tier mixing is impossible without turning each into its own subscription anyway. Quantity changes are atomic — customer cannot deprovision just one of the three staging substrates without also decrementing the charge, which requires mid-cycle prorating and gets messy. Upgrading one substrate to Pro requires splitting the quantity, which Stripe supports but is awkward. Upsell story is weaker ("upgrade one of your substrates" becomes a 3-step flow).

**Rejected because:** Entity One chose "One Stripe subscription per substrate" in the design Q&A. Option C's simpler billing surface is not worth the loss of per-substrate tier flexibility and independent lifecycles.

### Option D — Admin-only provisioning for multi-substrate

Self-serve checkout caps at 1 substrate per account. Customers who want more file a support ticket; we provision the extras manually via an admin panel. Stripe subscription model stays 1:1 with account.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low-Medium — add an admin "provision substrate" button |
| Cost | ~2 engineer-days |
| Scalability | Hard-capped by support capacity |
| Team familiarity | High |
| Reversibility | High |

**Pros:** Zero IDOR risk on the self-serve path. No pricing page changes. Cheap to build.
**Cons:** Manual ops don't scale. Support ticket for a purchase is friction. Doesn't close the duplicate-billing bug on the self-serve path (it's still hit on "Solo and then Solo again" even at cap=1 unless we also add Option A's guard). Hybridises poorly with any future self-serve multi-substrate story.

**Rejected because:** Entity One chose full self-serve multi-substrate in the design Q&A.

---

## Trade-off Analysis

The chosen design accepts three major trade-offs:

**1. IDOR surface area expands from zero to every route.** Today, the absence of a `substrateId` parameter means the server cannot be tricked into acting on another account's data — there is no ID to tamper with. Tomorrow, every route takes a slug and must prove the session owns it. Mitigation: a single helper function, `resolveOwnedSubstrate(accountId, slug) → Substrate | throw NotFound`, called at the top of every route handler. One place to audit, one place to test. The helper must return `404 Not Found` (not `403 Forbidden`) for non-ownership, so an attacker cannot distinguish "substrate doesn't exist" from "substrate exists but isn't yours".

**2. URL shape is a public contract.** `/api/my-substrate/{slug}/rotate-key` is a URL customers will bookmark, link to from dashboards, and embed in tooling. Once shipped, the shape is effectively permanent. Mitigation: freeze the URL shape as part of this ADR, not as an implementation detail. The ADR is the contract.

**3. Dashboard complexity jumps.** Today the dashboard is a single card. Tomorrow it's a list with a selector. A customer with one substrate should not feel the new UI as friction. Mitigation: when `substrates.length === 1`, the dashboard renders the single-substrate layout identically to today. The list view only materialises when N > 1. This keeps the 99% case unchanged.

There is also an accepted non-trade-off: **we do not unify billing**. Each subscription bills independently, generates its own invoice, and can be cancelled without affecting the others. If a customer wants a unified monthly invoice for 3 substrates, they can use Stripe's customer portal to view all their subscriptions in one place. We do not build a merged billing summary.

---

## Consequences

### What becomes easier
- The duplicate-billing bug becomes structurally impossible. A second subscription.created event creates a second substrate row. Customer can see it. Customer can cancel it. No silent loss.
- Tier changes are scoped correctly. Upgrading *this* substrate from Solo to Pro touches exactly one substrate, not all of an account's substrates.
- Provisioning observability improves. Each substrate has a clear 1:1 back-reference to the subscription that created it. Support cases become "which subscription?" → "that substrate".
- Reversing this morning's `tiers.ts` pin — the per-tier caps (free=1, indie=2, pro=3, team=5) come back as architectural reality, not just a platform_settings row.

### What becomes harder
- Every new API route (present and future) must remember to include the slug and ownership check. This is a forever-tax on server-side development.
- Dashboard development. Any screen that shows "your usage" must now ask "for which substrate?".
- Pricing page copy gets more complex. "1 substrate" on Free and Starter is fine, but "up to 3 substrates" on Pro requires explaining what that means to a user whose only substrate exists.
- The substrate slug becomes visible in URLs and in copy. We accept the opacity of `entity-a3f2c1` as a deliberate trade-off. If this creates usability complaints within 3 months of launch, revisit with a display-name layer in a follow-up ADR.

### What we'll need to revisit
- **Display names.** If slugs prove too opaque, a later ADR can layer `substrates.display_name` as an optional field without changing any URL. The slug stays the canonical ID.
- **Unified billing.** If enterprise customers demand a single invoice across N subscriptions, Stripe supports subscription schedules and invoice grouping. Out of scope here.
- **Substrate migration between accounts.** Today, a substrate belongs permanently to the account that provisioned it. If we later want "transfer substrate ownership", that is a separate decision.
- **Per-substrate API keys.** Today each substrate has its own API key (the rotate-key flow already works at substrate scope). No change needed.

---

## Implementation Plan

Four phases. Each phase ends at a ship point. Each phase has its own test suite and can be reverted independently.

### Phase 1 — Compute: ownership primitive + slug-scoped routes

**Goal:** Add the foundation. Ship new routes behind a feature flag, leave old routes running. No website changes yet.

1. Create `src/lib/substrate-ownership.ts` exporting `resolveOwnedSubstrate(pool, accountId, slug) → Substrate`. Returns 404 on not-owned or not-found. This is the single chokepoint for IDOR defence.
2. Add slug-scoped versions of every `my-substrate/*` route at `POST /api/v1/substrates/{slug}/...`:
   - `GET /api/v1/substrates` — list my substrates (shape: `{ substrates: [{ slug, tier, status, created_at, mcp_endpoint, usage }, ...] }`)
   - `GET /api/v1/substrates/{slug}` — status
   - `POST /api/v1/substrates/{slug}/rotate-key`
   - `POST /api/v1/substrates/{slug}/claim-key`
   - `POST /api/v1/substrates/{slug}/cancel`
   - `POST /api/v1/substrates/{slug}/deprovision`
   - `POST /api/v1/substrates/{slug}/reactivate`
   - `GET /api/v1/substrates/{slug}/key-rotation/status`
3. Leave existing `GET /api/v1/my-substrate`, `POST /api/v1/my-substrate/*` routes in place as deprecated shims. Shim implementation: `SELECT ... ORDER BY created_at DESC LIMIT 1` (today's behaviour), then delegate to the slug-scoped handler. Log a deprecation warning.
4. Expand `billing/status.ts` and `billing/caps.ts` to accept an optional `?slug=` query. Without slug → preserve current LIMIT 1 behaviour for back-compat. With slug → ownership check + scoped response.
5. Write integration tests in `tests/integration/multi-substrate-routes.test.ts` covering:
   - Account with 1 substrate: slug-scoped routes behave identically to singular routes
   - Account with 2 substrates: each substrate's routes target only its own data
   - Account tries to rotate another account's substrate key → 404 (not 403, so existence is not leaked)
   - Slug-scoped rotate-key on substrate A does not affect substrate B's key
   - Slug that does not exist in DB → 404
   - Deprovisioned substrate slug → 404 (treat as not-found, not gone)
6. Unit tests for `resolveOwnedSubstrate` against every ownership case (owned + running, owned + deprovisioned, owned + suspended, not owned, not exists).

**Exit criteria:** All new routes pass tests; old routes untouched behaviourally; deprecation log counter is visible in ops dashboard.

### Phase 2 — Webhook rewrite: subscription.created always creates a substrate

**Goal:** Fix the duplicate-billing bug at the source. Every Stripe subscription now maps to exactly one substrate row.

1. Rewrite `src/api/webhooks/substrate-stripe.ts:handleSubscriptionCreated`:
   - Idempotency check: `SELECT 1 FROM substrate_subscriptions WHERE stripe_subscription_id = $1` (unchanged)
   - DB transaction begin
   - `INSERT INTO substrate_subscriptions (stripe_subscription_id, account_id, tier, status)` — fails if `stripe_subscription_id` already exists (UNIQUE constraint)
   - `INSERT INTO substrates (account_id, slug, tier, status='pending_provision')` — fails if tier cap exceeded (trigger raises `SUBSTRATE_CAP`)
   - Capture the inserted substrate's `id` and store it in `substrate_subscriptions.substrate_id` (new FK column — see schema changes below)
   - Enqueue `substrate_provision_queue` row for the newly created substrate
   - Commit
2. Rewrite `handleSubscriptionUpdated`:
   - Look up the substrate by `stripe_subscription_id` via `substrate_subscriptions.substrate_id` FK (not by `account_id`)
   - Apply tier change to that specific substrate only
3. Rewrite `handleSubscriptionDeleted`:
   - Look up the substrate by `stripe_subscription_id`
   - Enqueue deprovisioning for that substrate only
4. If cap trigger raises on subscription.created → the webhook handler catches the error, marks the subscription as `substrate_subscriptions.status = 'cap_exceeded'`, and immediately refunds the Stripe payment intent with reason "cap exceeded — please deprovision an existing substrate before purchasing another". Log this as a support-alert event.
5. Add integration tests in `tests/integration/stripe-webhook-multi-substrate.test.ts`:
   - Account with 0 substrates: subscription.created → 1 substrate
   - Account with 1 substrate: subscription.created → 2 substrates (both visible, both linked to their own subscription)
   - Account at cap: subscription.created → substrate_subscriptions marked cap_exceeded, refund enqueued
   - subscription.updated on substrate A does not affect substrate B
   - subscription.deleted on substrate A does not affect substrate B
   - Double-delivery of subscription.created (same stripe_subscription_id) → idempotent, still one substrate

**Exit criteria:** Silent duplicate-billing bug cannot reproduce in integration tests. Tier changes are scoped correctly.

### Phase 3 — Website: slug-aware dashboard and API proxy routes

**Goal:** Surface multi-substrate to the customer. Let them see, manage, and pay for multiple substrates.

1. Add slug-scoped proxy routes:
   - `GET /api/substrates` — list
   - `GET /api/substrates/[slug]/route.ts` — status
   - `POST /api/substrates/[slug]/rotate-key/route.ts`
   - `POST /api/substrates/[slug]/cancel/route.ts`
   - `POST /api/substrates/[slug]/deprovision/route.ts`
   - `POST /api/substrates/[slug]/reactivate/route.ts`
   - `GET /api/substrates/[slug]/key-rotation/status/route.ts`
2. Keep existing `/api/my-substrate/*` routes as shims pointing to "the first substrate the server returns" for one release cycle, with a deprecation warning in the response header.
3. Rework `src/app/dashboard/DashboardClient.tsx`:
   - Fetch `GET /api/substrates` at page load
   - If `substrates.length === 0` → onboarding CTA (unchanged)
   - If `substrates.length === 1` → render the existing single-substrate layout unchanged, targeting that slug
   - If `substrates.length >= 2` → render a list view: each substrate as a card with slug, tier, status, atom usage, bootstrap usage, rotate-key button, deprovision button. "Add another substrate" CTA at the bottom (routes to pricing page).
4. Pricing page (`src/app/pricing/page.tsx` + `PricingCTA.tsx`):
   - Logged-in user fetches their current substrate list
   - CTA label changes to "Get your first substrate" / "Add another substrate" depending on substrate count
   - No "Manage subscription" button hijack — let customers buy freely; the cap trigger at the DB is the hard stop
5. Admin panel (`src/app/admin/AdminClient.tsx`): change "Instances" to a tree view: Account → N substrates.
6. Reverse this morning's `tiers.ts` pin: restore `maxSubstrates: 2` for Solo, `3` for Pro, `5` for Team. Update `limits.mdx`, `plans-and-trial.mdx`, `llms.txt`, `faq/page.tsx`, `tiers.test.ts` accordingly. The invariant test becomes "every tier's `maxSubstrates` matches the `platform_settings` value from compute" (or a shared constants file).
7. Update `src/app/terms/page.tsx` to clarify "each substrate is an independent subscription and may be cancelled independently".

**Exit criteria:** Dashboard shows N substrates cleanly. Single-substrate users see identical UX to today. Pricing page advertises truthful caps.

### Phase 4 — Cleanup

**Goal:** Delete the shims. Declare the migration done.

1. Remove `/api/v1/my-substrate/*` compute routes and `/api/my-substrate/*` website proxy routes.
2. Update `public/llms.txt` and all docs to reference `/api/substrates/{slug}/...` exclusively.
3. Remove the slug-less shim from `billing/status.ts` and `billing/caps.ts` — `slug` becomes required.
4. Update `docs/future-work.md` to reflect the shipped state.
5. Tombstone the `v1.other.hub_mmpm_core` memory atom(s) that documented the singular-substrate assumption.

**Exit criteria:** Singular-substrate code paths are gone. `grep -r "my-substrate" src/` returns nothing.

---

## Schema Changes

**New migration: `migration/064_substrate_subscription_fk.sql`** (number TBD at creation time)

```sql
-- Link substrate_subscriptions rows to their specific substrate
ALTER TABLE substrate_subscriptions
  ADD COLUMN substrate_id UUID REFERENCES substrates(id) ON DELETE SET NULL;

CREATE INDEX idx_substrate_subscriptions_substrate_id
  ON substrate_subscriptions(substrate_id);

-- Backfill: existing rows link to the most-recent substrate for their account
-- (this is the pre-ADR assumption; post-ADR, new inserts set substrate_id at write time)
UPDATE substrate_subscriptions ss
SET substrate_id = (
  SELECT s.id FROM substrates s
  WHERE s.account_id = ss.account_id
    AND s.status != 'deprovisioned'
  ORDER BY s.created_at DESC
  LIMIT 1
)
WHERE substrate_id IS NULL;

-- Add a new status to the substrate_subscriptions check constraint
-- to cover the "payment accepted but cap exceeded" refund path
ALTER TABLE substrate_subscriptions
  DROP CONSTRAINT IF EXISTS substrate_subscriptions_status_check;
ALTER TABLE substrate_subscriptions
  ADD CONSTRAINT substrate_subscriptions_status_check
    CHECK (status IN ('active', 'past_due', 'cancelled', 'trialing', 'cap_exceeded'));
```

**No changes to `substrates` table itself.** The schema was already correct. Migration 029's choice to not add `UNIQUE(account_id)` is now validated, not regretted.

---

## Webhook Semantics (locked)

| Stripe event | Current behaviour (bug) | ADR-002 behaviour |
|---|---|---|
| `subscription.created`, 0 existing substrates | Enqueue new substrate provisioning | Same: `INSERT substrate + INSERT substrate_subscriptions + enqueue provision` |
| `subscription.created`, N existing substrates | Enqueue `tier_change` on newest substrate (wrong — silent duplicate bill) | `INSERT new substrate + INSERT substrate_subscriptions with FK + enqueue provision`. Cap-exceeded → refund + `cap_exceeded` status |
| `subscription.updated`, plan changed | Enqueue `tier_change` on newest substrate | Look up substrate via `substrate_subscriptions.substrate_id` FK; apply tier change to that specific substrate |
| `subscription.deleted` | Enqueue deprovisioning of newest substrate | Look up substrate via FK; deprovision only that one |
| Cap-exceeded at insert time | (never happened — no second insert) | Catch `SUBSTRATE_CAP` from trigger; mark subscription `cap_exceeded`; refund Stripe payment intent; alert support |

---

## URL Shape (locked public contract)

All slug-scoped routes live under `/api/v1/substrates/{slug}/...` on compute and `/api/substrates/{slug}/...` on the website. The slug is the existing `{email-prefix}-{6 hex}` generated at provisioning time.

```
GET    /api/v1/substrates                            → list my substrates
GET    /api/v1/substrates/{slug}                     → status
POST   /api/v1/substrates/{slug}/rotate-key          → rotate API key
POST   /api/v1/substrates/{slug}/claim-key           → claim pending rotated key
GET    /api/v1/substrates/{slug}/key-rotation/status → poll rotation status
POST   /api/v1/substrates/{slug}/cancel              → cancel subscription (keeps substrate read-only until deprovision)
POST   /api/v1/substrates/{slug}/deprovision         → tear down (irreversible)
POST   /api/v1/substrates/{slug}/reactivate          → resume from read-only
GET    /api/v1/substrates/{slug}/usage               → atom/bootstrap usage
GET    /api/v1/billing/status?slug={slug}            → per-substrate billing summary
GET    /api/v1/billing/caps?slug={slug}              → per-substrate tier ceiling
```

Every route returns `404 Not Found` for: slug does not exist, slug belongs to another account, slug is deprovisioned. Never `403`. Ownership and existence must not be distinguishable to an attacker.

---

## Security / IDOR Defence

**Single helper, single place:**

```ts
// src/lib/substrate-ownership.ts
export async function resolveOwnedSubstrate(
  pool: Pool,
  accountId: string,
  slug: string,
): Promise<Substrate> {
  const result = await pool.query(
    `SELECT id, slug, account_id, tier, status, mcp_endpoint, created_at
     FROM substrates
     WHERE slug = $1
       AND account_id = $2
       AND status != 'deprovisioned'
     LIMIT 1`,
    [slug, accountId],
  );
  if (result.rows.length === 0) {
    throw new NotFoundError(`Substrate not found: ${slug}`);
  }
  return result.rows[0];
}
```

**Rules:**
- Every route handler's first meaningful line is `const substrate = await resolveOwnedSubstrate(pool, req.session.accountId, req.params.slug);`
- No route may read `substrates` directly by `account_id = $1` anymore. Route reviewers check for this.
- `resolveOwnedSubstrate` logs every 404 to an ops metric `substrate.ownership.404` with a breakdown of "slug doesn't exist" vs "slug exists but wrong account". The breakdown is ops-side-only; the client only sees 404.
- Rate-limit slug-scoped routes per-account per-minute. A bot fuzzing slugs generates the ops metric spike and gets throttled.
- Slug entropy: 6 hex chars = 24 bits = 16.7M values, scoped to an email prefix. Not a security primitive — ownership check is. But it's enough to make fuzzing impractical without triggering rate limits.

---

## Testing Strategy

Per the project rule "we write tests for everything we make," each phase lands with its own test tranche. No phase merges without green tests.

**Phase 1 tests:**
- Unit: `substrate-ownership.test.ts` — every ownership case
- Integration: `tests/integration/multi-substrate-routes.test.ts` — full route coverage with 0, 1, 2 substrates per account, including cross-account access attempts
- Regression: `tests/security/substrate-idor.test.ts` — brute-force slug guessing returns 404, rate limit trips

**Phase 2 tests:**
- Integration: `tests/integration/stripe-webhook-multi-substrate.test.ts` — every (existing count, event) combination
- Regression: "buying Solo twice creates two substrates" as an explicit test case with a name that will be visible in test output forever
- Regression: "cap exceeded triggers refund" — uses the existing cap trigger from migration 047

**Phase 3 tests:**
- Component: dashboard renders correctly for 0, 1, and 2+ substrates
- Playwright/E2E (if available): end-to-end "create account → buy Solo → buy Solo again → see two substrates → rotate key on substrate 1 → confirm substrate 2's key unchanged"
- Invariant: `tiers.test.ts` updated to match the new `maxSubstrates` values per tier from `platform_settings`

**Phase 4 tests:**
- Deletion test: `grep "my-substrate" src/` returns 0 matches in CI

---

## Rollback Plan

Each phase is independently revertible because each phase leaves the previous phase's code running until explicitly deleted.

- **Phase 1 rollback:** Delete new routes. Old routes unchanged, still work.
- **Phase 2 rollback:** Revert webhook handler to the pre-ADR `tier_change` behaviour. Substrate rows created by the new handler become orphans but remain billable under their `stripe_subscription_id`. Manual cleanup ticket required.
- **Phase 3 rollback:** Revert dashboard + pricing page changes. Compute routes unchanged, customers fall back to seeing their newest substrate only. Risk: UI tells customer they have 1 substrate when they actually have 2 — surface a support-visible warning banner instead of silent truncation.
- **Phase 4 rollback:** Not applicable (cleanup only).

The Phase 2 rollback is the most painful and is the reason Phase 2 must ship behind a feature flag (`FEATURE_MULTI_SUBSTRATE_WEBHOOK=true`) with explicit off-switch for the first week of production.

---

## Action Items

Phase 1 — Compute foundation:
1. [ ] Create `src/lib/substrate-ownership.ts` with `resolveOwnedSubstrate` helper
2. [ ] Create `src/api/substrates/` directory with slug-scoped route handlers mirroring every existing `my-substrate/*` route
3. [ ] Add `?slug=` query param support to `billing/status.ts` and `billing/caps.ts`
4. [ ] Write unit tests for ownership helper
5. [ ] Write integration tests for slug-scoped routes (0/1/2 substrates, IDOR attempts)
6. [ ] Write IDOR regression test with rate-limit verification
7. [ ] Type-check + full test suite green

Phase 2 — Webhook rewrite:
1. [ ] Create migration `064_substrate_subscription_fk.sql` with the new FK column, backfill, and `cap_exceeded` status
2. [ ] Rewrite `handleSubscriptionCreated`, `handleSubscriptionUpdated`, `handleSubscriptionDeleted` behind `FEATURE_MULTI_SUBSTRATE_WEBHOOK` flag
3. [ ] Implement cap-exceeded refund path
4. [ ] Write webhook integration tests
5. [ ] Deploy to staging, run manual Stripe event replay
6. [ ] Flip feature flag in production after 48h of clean staging behaviour

Phase 3 — Website:
1. [ ] Add `/api/substrates/*` proxy routes
2. [ ] Rework `DashboardClient.tsx` to fetch and render a substrate list
3. [ ] Update pricing page CTA logic for logged-in multi-substrate users
4. [ ] Update admin panel for per-account substrate trees
5. [ ] Reverse this morning's `tiers.ts` pin; restore tier caps to 1/1/2/3/5 (Free/Starter/Solo/Pro/Team)
6. [ ] Update `tiers.test.ts`, `limits.mdx`, `plans-and-trial.mdx`, `llms.txt`, `faq/page.tsx`, `terms/page.tsx`
7. [ ] Type-check + test suite green

Phase 4 — Cleanup:
1. [ ] Delete all `/api/v1/my-substrate/*` and `/api/my-substrate/*` routes
2. [ ] Remove slug-less branches from `billing/status.ts` and `billing/caps.ts`
3. [ ] Update `docs/future-work.md`; create `v1.event.multi_substrate_shipped_*` memory atom
4. [ ] `grep -r "my-substrate" src/` must return 0 matches in CI

---

## Open Questions (resolve before starting Phase 1)

1. **Per-substrate tier vs account tier.** Today, `accounts.tier` is maintained as a convenience mirror of the active substrate's tier. With N substrates, this stops making sense. Should `accounts.tier` be dropped, or should it become "highest tier across all my substrates"? My recommendation: drop it and compute on demand from `substrates.tier` whenever the UI needs a headline tier. This reduces the "tier stored in three places" debt flagged in the findings.

2. **Trial handling.** Today, a customer starts on a 14-day trial. With per-substrate subscriptions, does a customer get one trial per substrate, or one trial per account? My recommendation: one trial per account (the first subscription is the trial; every subsequent subscription is immediately billed). This matches Stripe's `trial_from_plan` + customer-level trial tracking, and prevents trial farming.

3. **Cancel vs deprovision semantics, per-substrate.** Today, "cancel" pauses billing and marks the substrate read-only until the end of the billing period; "deprovision" tears it down. With multi-substrate, is there any case where these should behave differently per-substrate? My recommendation: no. Each substrate's lifecycle is independent and the current cancel/deprovision split remains per-substrate.

4. **Enterprise tiers and multi-substrate.** Enterprise Cloud and Enterprise Self-Hosted are priced at $299/$499 and today assume one dedicated droplet / one license. Do we extend multi-substrate to enterprise, or are those tiers always 1:1? My recommendation: enterprise stays 1:1 until we have a concrete customer asking for more. Mark enterprise with `maxSubstrates: 1` in the tier config with a JSDoc note that multi-substrate is not offered at enterprise tiers.

These are questions for you to resolve before Phase 1 begins. I will not assume defaults.
