# PLAN — In-place Upgrade Flow on the Admin Page

**Sprint:** S7a / S7b / S7c (replaces the old "S7 Tier-change UI" placeholder)
**Date scoped:** 2026-04-17
**Status:** approved design, not yet implemented
**Owner:** (to assign)
**Related docs:**
`SPRINT-PLAN.md` · `JOURNEY-REVIEW-BILLING-LIFECYCLE.md` · `JOURNEY-REVIEW-API-KEY-LIFECYCLE.md` · `FOLLOW-UP-DOWNGRADES.md`

---

## 1. Problem statement

The admin page (`/admin?slug=<substrate>`) has an "Upgrade" button that throws away the substrate context and sends the user to `/pricing`, where they'd effectively start a second subscription rather than upgrade the one they're looking at. The dashboard has no "upgrade this subscription" affordance at all. The backend has most of the machinery (`tier-change-service.ts`, `substrate_tier_changes` queue, `substrate_migrations` pipeline, `POST /billing/substrate-checkout`) but the UI never lands the user back on the substrate they were editing, and there is no way to tell the user what's happening during the 5-minute window a `shared→dedicated` upgrade takes.

---

## 2. Scope

### In scope
- **Paid → higher paid within shared hosting** (shared→shared) — e.g. starter→indie, indie→pro. Fast path, in-place limit update, container restart, ~10s visible.
- **Paid → dedicated** (shared→dedicated) — provisions a new droplet, migrates data, 3–10 min visible, substrate goes `read_only` during transfer.
- **In-place progress UX** on `/admin?slug=X` through every phase of both paths.
- **Email notification** on upgrade completion and on rollback (via existing Resend wiring).
- **API-key preservation** on shared→dedicated so the customer's MCP config keeps working unchanged.

### Explicitly out of scope
- **Downgrades** (dedicated→shared, lower paid tier). Captured in `FOLLOW-UP-DOWNGRADES.md`.
- **Free→paid.** There is no free tier for active accounts — `free` is the post-cancellation / deprovisioned state at $1, not an onboarding tier. Users enter via paid checkout from `/pricing`. Converting a free/deprovisioned account back to paid is the **reactivation** flow (SM-8, `POST /substrates/:id/reactivate`) and is owned by the billing-lifecycle work, not here.
- **In-app proration with `subscriptions.update()`.** Phase 1 uses Stripe Checkout redirect. We can add in-app proration later if the redirect feels jarring.
- **Cross-account plan migrations.** Not a real use case; ignore.

---

## 3. The four transition kinds and what actually has to happen

| Kind | Example | Backend action | Customer-visible time | Container restart | Data migration | API key |
|---|---|---|---|---|---|---|
| `shared_to_shared` | starter → indie | UPDATE substrate limits + optional restart | ~10 s | Optional (limit change) | No | Unchanged |
| `dedicated_to_dedicated` | team → team+ (future) | Same as above | ~10 s | Optional | No | Unchanged |
| `shared_to_dedicated` | indie → team | Provision new droplet + `substrate_migrations` pipeline | 3–10 min | Yes (new host) | Yes (LevelDB stream) | **Preserved** (see §6) |
| `dedicated_to_shared` | (downgrade) | Same pipeline, reversed | 3–10 min | Yes | Yes | Preserved | — *out of scope, see follow-up doc* |

Only the first three ship in this sprint.

---

## 4. User flow — the experience we're building

### 4.1 Entry

On `/admin?slug=my-sub`, inside the existing **Billing + Status card** (currently `AdminClient.tsx:375–487`), replace the "Upgrade" button at lines 401–407 with a **Change plan** button. Clicking it opens a right-side slide-in sheet (`<ChangePlanSheet />`) scoped to *that* substrate.

### 4.2 Tier comparison sheet

The sheet fetches `GET /api/billing/upgrade-options?substrateSlug=my-sub` and renders one row per available tier that's strictly higher than the current one. Each row shows:

- Tier name (Starter / Indie / Pro / Team)
- Price per month ($3 / $9 / $29 / $79)
- Key limits delta vs. current ("+450k atoms", "+100 bootstraps/mo", "+1 GB storage")
- Hosting model badge — "Shared" vs. "**Dedicated**"
- Proration preview — "$6.33 charged today, then $29/mo on May 17" — from `stripe.invoices.retrieveUpcoming`
- A per-row warning panel for `shared_to_dedicated`:
  > **Team is on dedicated hosting.** We'll provision a private droplet for you and migrate your data. Your substrate will be read-only for about 5 minutes during migration. Your MCP endpoint and API key won't change.
- A **Select** button

### 4.3 Confirmation dialog

Clicking Select opens `<ConfirmUpgradeDialog />` with a clear restatement: what they're going from → to, what they'll pay today (prorated), what they'll pay next month, any read-only window, and for dedicated upgrades a single-sentence "and here's what we're doing" step list.

Clicking **Upgrade** calls `POST /api/billing/upgrade { slug, targetTier }`. Backend returns `{ checkoutUrl }`. Client does `window.location.href = checkoutUrl`.

### 4.4 Stripe Checkout

Standard Stripe hosted page. Customer uses their existing saved payment method or updates it. On success Stripe redirects to `${APP_URL}/admin?slug=my-sub&upgrade=pending`. On cancel Stripe redirects to `${APP_URL}/admin?slug=my-sub&upgrade=cancelled`.

### 4.5 Return to admin — the progress experience

When `/admin?slug=my-sub` loads with `?upgrade=pending` (or whenever `GET /api/billing/tier-change/:slug` returns anything other than `{ state: 'none' }`), the page renders a sticky `<TierChangeProgressBanner />` at the top and disables the **Change plan** button until the change terminates.

**For shared→shared** the banner walks through:

1. *Confirming your payment…* (webhook lag — usually < 5 s, shown as an indeterminate spinner)
2. *Applying your new limits…* (container restart — usually < 5 s)
3. *Done! You're on Indie. New limits are active.* (auto-dismisses after 5 s, single success toast)

**For shared→dedicated** the banner is bigger and multi-phase with a step list:

1. *Confirming your payment…*
2. *Provisioning your dedicated droplet…* ~60–120 s, shows the new droplet's public IP once allocated
3. *Preparing data for transfer…* (source container stopped, tarball created)
4. *Transferring your data…* with "Attempt 1 of 5" retry counter if `transfer_attempts > 0`
5. *Verifying your new host…* (atom-count equality check)
6. *Cutting over…* (Traefik update)
7. *Done! You're on Team, on a dedicated instance. Your API key and MCP endpoint are unchanged.*

If the pipeline fails and rolls back, the banner turns amber:

> *We couldn't complete your upgrade. You're still on Indie, and no charge will land on your card. Our team has been notified. Support: `support@parametric-memory.dev`*

### 4.6 If the user closes the tab

The `TierChangeProgressBanner` is driven entirely by polling `GET /api/billing/tier-change/:slug`, so returning to `/admin?slug=my-sub` later picks up where they left off. On completion (or failure) we also send a Resend email so they don't need to check. The dashboard (which lists all their substrates) also shows a small "Upgrade in progress" badge on any substrate with an active tier-change row, with a link straight to `/admin?slug=X`.

---

## 5. Backend changes

### 5.1 New endpoints

All under `src/api/billing/`, session-authenticated via `requireSession`:

#### `GET /api/v1/billing/upgrade-options?substrateSlug=X`

Returns the list of tiers the caller can move to from their current tier. Only shows strictly higher tiers in Phase 1 (downgrades deferred). Each option includes a Stripe proration preview.

Response shape:
```json
{
  "currentTier": "indie",
  "currentHostingModel": "shared",
  "options": [
    {
      "tier": "pro",
      "name": "Pro",
      "amountCents": 2900,
      "hostingModel": "shared",
      "transitionKind": "shared_to_shared",
      "limits": { "maxAtoms": 2000000, "maxBootstrapsMonth": 500, "maxStorageMb": 2048 },
      "estimatedProrationCents": 633,
      "stripePriceId": "price_1N...",
      "warnings": []
    },
    {
      "tier": "team",
      "name": "Team",
      "amountCents": 7900,
      "hostingModel": "dedicated",
      "transitionKind": "shared_to_dedicated",
      "limits": { "maxAtoms": 10000000, "maxBootstrapsMonth": 2000, "maxStorageMb": 10240 },
      "estimatedProrationCents": 2366,
      "stripePriceId": "price_2O...",
      "warnings": [
        { "code": "dedicated_migration", "severity": "info", "message": "Your substrate will be read-only for about 5 minutes during migration. Your MCP endpoint and API key won't change." }
      ]
    }
  ]
}
```

Implementation reads `SUBSTRATE_TIERS` (src/types/substrate-tier.ts) + the current subscription row + calls `stripe.invoices.retrieveUpcoming` once per candidate tier to get an accurate proration number.

#### `POST /api/v1/billing/upgrade`

Body:
```json
{ "substrateSlug": "my-sub", "targetTier": "pro" }
```

Validation: target tier is strictly higher than current, subscription is `active` or `trialing`, no in-flight `substrate_tier_changes` row for this substrate.

Behaviour: creates a Stripe Checkout session via the existing `createSubstrateCheckoutSession()` service (we reuse `POST /billing/substrate-checkout` logic but the route path is cleaner for the new use). Success URL: `${APP_URL}/admin?slug=${slug}&upgrade=pending`. Cancel URL: `${APP_URL}/admin?slug=${slug}&upgrade=cancelled`.

Response: `{ checkoutUrl }`.

#### `GET /api/v1/billing/tier-change/:slug`

The endpoint the admin page polls. Joins `substrate_tier_changes` + `substrate_provision_queue` + `substrate_migrations` on `substrate_id` to return a single unified state + phase payload.

Response shape:
```json
{
  "state": "processing",         // none | payment_pending | queued | processing | completed | failed | rolled_back
  "phase": "transferring",       // see phase enum below, null if not cross-host
  "targetTier": "team",
  "transitionKind": "shared_to_dedicated",
  "startedAt": "2026-04-17T10:02:14Z",
  "estimatedCompletionAt": "2026-04-17T10:08:00Z",
  "transferAttempts": 1,
  "migrationProgress": {
    "atomCountBefore": 42817,
    "atomCountAfter": null,
    "newDropletIp": "165.22.xx.xx"
  },
  "error": null
}
```

Phase enum: `confirming_payment | provisioning | source_read_only | backing_up | awaiting_disk_space | transferring | restoring | verifying | cutting_over | null`.

### 5.2 Data model changes

New migration `067_add_carry_forward_api_key_to_migrations.sql`:

```sql
-- up
ALTER TABLE substrate_migrations
  ADD COLUMN carry_forward_api_key TEXT NULL,
  ADD COLUMN carry_forward_api_key_claimed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN substrate_migrations.carry_forward_api_key IS
  'Raw API key SSH-read from the source substrate host during migration, passed through to the new provisioned substrate so the customer keeps the same credential. Cleared (NULL) once the new substrate has been provisioned and health-checked.';

-- down
ALTER TABLE substrate_migrations
  DROP COLUMN carry_forward_api_key,
  DROP COLUMN carry_forward_api_key_claimed_at;
```

The column is TEXT because the existing `substrates.pending_api_key` (same kind of short-lived raw-key storage) is also TEXT. It holds the raw key for the window between "tier-change queued" and "new substrate provisioned", then is NULLed. Typical lifetime: < 5 minutes.

**Security rationale.** This creates a short-lived raw-key row in the compute DB that doesn't exist today. Acceptable because:
- The key is already in plaintext on the substrate host's `.env` — so compromising the compute DB doesn't grant new material if the host is also accessible to the attacker
- The row is NULLed within minutes
- The alternative (force key rotation on every hosting-model change) forces the customer to re-claim and reconfigure MCP for a reason that has nothing to do with security, which is a worse product
- The carry-forward column is not exposed on any API response — it's read-internal-only by the provisioner worker

If we later decide the short-lived raw-key row is unacceptable, we switch to a second option: the tier-change-service holds the key in a short-lived in-memory map keyed by migration-id, with a 15-minute TTL. A process crash would force key rotation, but that's a rare failure mode and recoverable via the customer claiming a freshly-generated key.

### 5.3 Provisioner change

`src/workers/substrate-provisioner.ts` line 740:

```ts
// before:
const customerApiKeyObj = generateKey();

// after:
const customerApiKeyObj = carryForwardKey
  ? deriveKeyObjectFromRaw(carryForwardKey)   // returns { rawKey, hash, prefix }
  : generateKey();
```

The `carryForwardKey` is read from `substrate_migrations.carry_forward_api_key` by the tier-change worker when it enqueues the new substrate provisioning. A new helper `deriveKeyObjectFromRaw(raw)` in `src/services/key-generator.ts` computes the hash and prefix from a raw key without re-randomising.

### 5.4 Tier-change service change

`src/services/tier-change-service.ts`, `handleSharedToDedicated()`:

New step inserted between "create tier_change row" and "enqueue substrate_provision_queue":

1. Load the source substrate's `host_id` + slug.
2. Load the host's `ssh_target` from `compute_hosts`.
3. Run `ssh ${sshTarget} "grep '^CUSTOMER_API_KEY=' /opt/mmpm/customers/${slug}/.env | cut -d= -f2-"` via an injected `readHostEnvVar` dep (parallel to the other injected SSH primitives in this service).
4. Write the returned raw key into `substrate_migrations.carry_forward_api_key` on the row we just created.
5. Proceed with `substrate_provision_queue` insertion as before.

Then, during `handlePending()` inside `substrate-migration-service.ts`, once the new substrate has bound to the migration row AND answered `/health`, we NULL `carry_forward_api_key` and set `carry_forward_api_key_claimed_at = now()` as part of the same transaction that advances the row to `source_read_only`. Short half-life.

### 5.5 Webhook delta

`handleSubscriptionUpdated` already detects tier changes and enqueues `substrate_tier_changes` rows. No changes needed. It does need one idempotency fix that's already in S2 (webhook dedupe table) — out of scope for this plan, but a dependency.

### 5.6 Notifications

New methods on `notification-service.ts`:
- `sendTierChangeStarted(accountEmail, { slug, oldTier, newTier, transitionKind, estMinutes })` — sent only for `shared_to_dedicated` (fast paths don't need an email; banner + toast are enough)
- `sendTierChangeCompleted(accountEmail, { slug, newTier, newLimits })`
- `sendTierChangeFailed(accountEmail, { slug, oldTier, attemptedTier, reason })`

All three use the existing Resend adapter — no new provider, no new env var. Templates live next to the existing magic-link template.

Hook points:
- `sendTierChangeStarted`: tier-change-service right after it inserts the `substrate_tier_changes` row for a cross-host transition
- `sendTierChangeCompleted`: migration worker at the `cutting_over → complete` transition
- `sendTierChangeFailed`: migration worker `rollback()` path

---

## 6. The key-preservation design (the answer to Q3)

### Current reality

Every `substrate-provisioner.ts` run mints a fresh key via `generateKey()` at line 740 and writes it to `${customerDir}/.env` (line 759). So today a `shared→dedicated` migration would silently rotate the key — breaking the customer's MCP config with a 401 loop until they notice the rotate-link in the dashboard and re-claim.

### Where raw keys live today

| Location | Stored as | Lifetime |
|---|---|---|
| Substrate host `${customerDir}/.env` | Plaintext | Lifetime of the substrate |
| Compute DB `substrates.api_key_hash` | SHA-256 hex | Lifetime of the substrate |
| Compute DB `substrates.api_key_prefix` | First 32 chars of raw key | Lifetime of the substrate |
| Compute DB `substrates.pending_api_key` | Raw plaintext | Between provisioning and customer's first `claim-key` call — minutes to hours |
| Compute-server process memory | Raw | During the provisioning function call |
| **Not stored anywhere in the compute DB** | — | — |

### Proposed design

We add a sixth, very-short-lived storage: `substrate_migrations.carry_forward_api_key`. It holds the raw key for the window between "tier-change enqueued" and "new substrate provisioned + health-passed". The tier-change-service SSH-reads the old host's `.env` once, writes the raw key into the row, and NULLs it as soon as the new substrate is running. Typical lifetime ~60–120 seconds.

The new substrate's provisioner accepts this carry-forward key via a code path in `generateKey()` that derives the hash and prefix from a pre-existing raw key (a trivial change: hashing is deterministic, the "generate" part is only the randomness). The new host's `.env`, the new `substrates.api_key_hash`, and the new `substrates.api_key_prefix` all line up on the same key the customer already has in their MCP config.

At cutover, Traefik swaps the subdomain to point at the new droplet. Same slug, same endpoint URL from the customer's POV. Same key. Silent migration.

The OLD substrate row still has a matching `api_key_hash` for 48 hours during the hold window. This is harmless — the old droplet is read-only and will be destroyed after the window. If the customer hits the old endpoint directly (they shouldn't — Traefik redirects) the key works on both. No security issue because the hash space is per-account and the customer is hitting their own substrate either way.

### Rejected alternatives

- **Migrate the hash, not the raw key.** Would require SSH-patching the new host's `.env` post-provision. More steps, more failure modes than just carrying the key forward.
- **Pre-claim a new key for them.** Customer still has to reconfigure MCP. Whole point is that they shouldn't have to.
- **Force rotation and email them the new key.** Customer has to edit Claude Desktop config. Worst UX.

---

## 7. Frontend changes (`mmpm-website`)

### 7.1 New components
- `src/app/admin/ChangePlanButton.tsx` — replaces the hardcoded pricing-link button
- `src/app/admin/ChangePlanSheet.tsx` — tier comparison UI
- `src/app/admin/ConfirmUpgradeDialog.tsx` — confirmation modal with proration breakdown
- `src/app/admin/TierChangeProgressBanner.tsx` — sticky banner driven by `useTierChangePoll`
- `src/hooks/useTierChangePoll.ts` — polls `GET /api/billing/tier-change/:slug` every 3 s, stops at terminal states, returns shape matching the API response

### 7.2 BFF proxy routes (Next.js)
- `src/app/api/billing/upgrade-options/route.ts` → `compute:/api/v1/billing/upgrade-options`
- `src/app/api/billing/upgrade/route.ts` → `compute:/api/v1/billing/upgrade`
- `src/app/api/billing/tier-change/[slug]/route.ts` → `compute:/api/v1/billing/tier-change/:slug`

All three use the existing `computeProxy()` helper from `src/lib/compute-proxy.ts`.

### 7.3 AdminClient.tsx edits
- Replace lines 401–407 (the `/pricing` button) with `<ChangePlanButton />`
- Insert `<TierChangeProgressBanner />` near the top of the page (above the Billing card) — conditionally rendered when `useTierChangePoll` reports anything other than `{ state: 'none' }`
- Disable the Change-plan button while a tier change is in flight
- React to `?upgrade=pending|cancelled` query params: show a "Processing your upgrade…" or "Upgrade cancelled" toast on mount

### 7.4 /billing/success update
`BillingSuccessClient.tsx` currently polls `my-substrate` for a first-time provision. It doesn't know about upgrades. Easiest fix: the new `/api/billing/upgrade` endpoint sets the success URL to `/admin?slug=X&upgrade=pending` and we never land on `/billing/success` for an upgrade. No changes needed to that page.

### 7.5 Dashboard badge
`DashboardClient.tsx`: small "Upgrade in progress" badge on any substrate card whose `/api/billing/tier-change/:slug` returns a non-`none` state. Batched: a single `GET /api/billing/tier-change/batch?slugs=a,b,c` endpoint to avoid N queries. Minor — worth it for the "closed the tab" recovery UX.

---

## 8. Sprint breakdown

### S7a — Backend API surface + key preservation (2 sessions)

Work in `parametric-memory-compute`.

Session 1:
- Migration 067 (carry-forward column)
- `src/services/key-generator.ts` — add `deriveKeyObjectFromRaw(raw)`
- `src/workers/substrate-provisioner.ts` — accept optional `carryForwardKey` param
- `src/services/tier-change-service.ts` — SSH-read + stash carry-forward key on `shared_to_dedicated` path
- `src/services/substrate-migration-service.ts` — NULL carry-forward key at `pending → source_read_only`
- Integration tests (Testcontainers): full shared→dedicated migration with key preservation end-to-end; assert hash equality, assert column NULLed after bind, assert old substrate's hash still valid during hold window

Session 2:
- `GET /billing/upgrade-options` + `POST /billing/upgrade` + `GET /billing/tier-change/:slug` + `GET /billing/tier-change/batch`
- Stripe proration preview helper (cached per `subscriptionId+priceId` for 30 s)
- OpenAPI entries for all four endpoints in `src/api/docs/`
- Vitest unit tests per endpoint: input validation, auth, shape, the "no in-flight job" guard, Stripe error handling
- Integration test: happy-path shared→shared, assert Stripe Checkout session creation + webhook receipt + tier-change row + completion state via poll endpoint

**Tests written:** integration-level happy paths for both transition kinds, unit tests for each new endpoint, key-preservation regression test (`~8 new tests across 3 files`).

### S7b — Admin UI + progress banner (1.5 sessions)

Work in `mmpm-website`.

Session 3 (1 full session):
- Three BFF proxy routes
- Five components (`ChangePlanButton`, `ChangePlanSheet`, `ConfirmUpgradeDialog`, `TierChangeProgressBanner`, `useTierChangePoll`)
- AdminClient.tsx integration (replace upgrade button, mount banner, handle query params)
- Component tests (vitest + @testing-library): sheet renders options, confirm dialog renders proration, banner renders each phase with correct copy, poll hook stops at terminal

Session 3b (0.5 session):
- Dashboard "upgrade in progress" badge
- `/billing/success` query-param handling (no-op for upgrades, but confirm we never route there)
- Playwright E2E: J-05 shared→shared happy path (new scenario in `JOURNEYS.md`); Stripe-cancel path lands back on admin with cancelled toast

**Tests written:** component tests for all five new components, 2 new Playwright scenarios.

### S7c — Progress depth + notifications (1 session)

Work across both repos.

Session 4:
- `notification-service.ts` — three new methods + Resend templates
- Tier-change-service / migration-worker hooks to emit emails at right transitions
- `substrate_tier_changes.phase_metadata JSONB` column (migration 068) for richer progress telemetry (new droplet IP, atom counts, transfer attempts) — surfaced through `/tier-change/:slug`
- Integration test: simulate a migration failure mid-transferring, assert rollback email fires with the right reason
- Playwright E2E: J-05 shared→dedicated happy path — spin up a second mock substrate host via `mock-do-server.js`, watch banner walk through 7 phases, assert final state "Done"

**Tests written:** 3 notification tests (one per new email method), 1 rollback integration test, 1 Playwright scenario for the slow path.

### Totals
- **~3.5 sessions of work** (S7a 2 + S7b 1.5 + S7c 1)
- **~20 new tests** across integration, component, and E2E layers

### Dependencies / ordering
- S7a depends on **S2** (webhook idempotency / dedupe) being done first — otherwise a Stripe retry of `customer.subscription.updated` could enqueue two tier-change rows for the same upgrade and the second one would try to migrate a substrate that's already mid-migration. Path of least risk is to land S2 first per the existing sprint plan.
- S7b depends on S7a (needs the endpoints to call).
- S7c can run in parallel with S7b once S7a lands.

---

## 9. Test strategy

Three layers:

1. **Unit / service level (`parametric-memory-compute`, Testcontainers).** Every phase of the migration state machine, plus the new carry-forward-key path. Tests must exercise both happy paths (shared→shared and shared→dedicated) and the failure-rollback paths. Key-preservation assertions: hash in DB = hash derived from raw key on new host's .env.

2. **Component level (`mmpm-website`, vitest + testing-library).** Each new component renders correctly against fixture data. `useTierChangePoll` hook tested with fake timers + a mocked fetch. Copy is pulled from a single constants file so QA can review phase strings in one place.

3. **End-to-end (Playwright, local stack).** Add two scenarios to `JOURNEYS.md`:
   - **J-05a** — shared→shared upgrade happy path (add starter→pro). Roughly: log in, open admin, click Change plan, select Pro, accept Stripe test card, land back on admin, watch banner go confirming→applying→done, assert new limits reflected.
   - **J-05b** — shared→dedicated upgrade happy path. Same but with a mocked second host in `mock-do-server.js`. Watch all 7 phases. Assert final state + that API key is unchanged (re-call MCP endpoint with original key, expect 200).
   - Rollback scenario covered at the integration-test layer rather than E2E — Playwright can't easily simulate transfer failures.

---

## 10. Observability / ops

- Log at every state transition (already done by migration-service — extend to tier-change-service).
- Emit MMPM memory atoms for failed tier changes: `v1.event.tier_change_failed_<slug>_<ts>` member_of `v1.other.hub_mmpm_compute`, derived_from the substrate row. Operator can query atoms to triage.
- Expose `substrate_tier_changes` counts by state in `/ops/health` output (read-only SELECT, no cost).

---

## 11. Risks and open questions

| Risk | Severity | Mitigation |
|---|---|---|
| SSH-read of old host's `.env` fails (host unreachable, key not where we expect) | High | Block the tier-change from starting with a clear user-facing error. Do not proceed with migration. Unit-test the grep/cut command against a fixture .env. |
| Carry-forward key leaks via compute DB compromise | Low | Key is already plaintext on the substrate host. Window is ~120 s. Documented in §5.2. |
| Stripe Checkout success URL query params spoofed | Low | The banner polls `GET /tier-change/:slug` which is the source of truth — the `?upgrade=pending` param is decorative. |
| Two rapid Change-plan clicks create two Checkout sessions | Medium | Disable button while any in-flight `substrate_tier_changes` exists. Server-side guard in `POST /upgrade` that returns 409 if an in-flight row exists. Unit-test the guard. |
| User closes Stripe Checkout without paying | Low | Stripe sends them to `cancel_url`. No tier-change row exists. No-op. |
| Email delivery fails | Low | Best-effort. Banner is authoritative. Log the Resend error, don't fail the migration. |
| The existing tier-change-worker wasn't designed with `shared_to_dedicated` + key carry-forward in mind | Medium | Need to validate the existing shared→dedicated integration tests still pass after we insert the SSH-read step. First task in S7a is to run the existing suite before touching it, so we know our baseline. |

### Open questions for follow-up

1. **For S7c, should the "upgrade started" email fire on every kind, or only slow-path (shared→dedicated)?** Currently scoped as slow-path only; happy to flip if you want a belt-and-braces approach.
2. **Do we want a Slack webhook for tier-change failures?** Low-lift if we wire it through the existing ops-observer channel. Not in scope unless you say.
3. **Pro → higher paid shared** — the current SUBSTRATE_TIERS map only has one dedicated tier (`team`). Do we have a roadmap for additional paid-shared tiers above Pro? If not, the `shared_to_shared` path is only really starter↔indie↔pro in practice and the UI can hardcode ordering. If yes, make it data-driven now.

---

## 12. Decisions captured

| Decision | Choice | Date |
|---|---|---|
| Checkout strategy Phase 1 | Stripe hosted Checkout (redirect), not in-app proration | 2026-04-17 |
| Upgrade scope | shared→shared + shared→dedicated only; downgrades deferred | 2026-04-17 |
| Free-tier upgrade path | Does not exist — free is a post-cancel state, entered via reactivation flow | 2026-04-17 |
| API key on shared→dedicated | Preserved via carry-forward column + pre-provisioner injection | 2026-04-17 |
| Email provider | Resend (existing wiring, no change) | 2026-04-17 |
| Ordering vs. pre-launch security block | S1–S4 (security / webhook idempotency / claim-key / rotation reliability) land first; S7a/b/c after | 2026-04-17 |

---

## 13. What "done" looks like

- `/admin?slug=X` has a working Change-plan button that opens a tier comparison scoped to X
- A test paid account can upgrade starter→pro via Stripe Checkout, returns to admin, watches the banner complete in <30 s, sees new limits active
- A test paid account can upgrade indie→team, returns to admin, watches 7 phases complete in 3–10 min, MCP endpoint responds to original API key on the new dedicated droplet
- Resend emails arrive for shared→dedicated start, complete, and (in a simulated failure test) rollback
- Playwright green on both J-05a and J-05b
- All new tests pass; no regression on existing suite
- `SPRINT-PLAN.md` updated to reference this doc + `FOLLOW-UP-DOWNGRADES.md`
