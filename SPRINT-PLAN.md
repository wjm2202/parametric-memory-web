# Sprint Plan — Website ↔ Compute Journey Review

**Date:** 2026-04-17
**Source docs:**
- `JOURNEY-REVIEW-SIGNUP-CHECKOUT.md`
- `JOURNEY-REVIEW-DASHBOARD-RETURNING.md`
- `JOURNEY-REVIEW-BILLING-LIFECYCLE.md`
- `JOURNEY-REVIEW-API-KEY-LIFECYCLE.md`

**Aggregated findings:** 8 critical/high UX + 6 critical/high logic + 25 medium/low across the four journeys. See per-journey docs for the full severity-graded lists.

**Goal:** close the biggest UX gaps and pre-launch security holes, then the reliability gaps in the rotation path and webhook layer, then the polish and tests. Every sprint ships with tests per the project rule.

---

## How this plan is organised

Each sprint is **scoped to fit in 1–3 working sessions** and is themed around a single thread. Sprints are ordered by a combination of severity and dependency: S1–S3 are the "cannot ship to production without" block; S4–S7 fix the big UX and reliability holes that hurt every customer; S8–S10 fill test coverage and polish.

**Finding IDs** reference the per-journey docs:
- Signup/checkout: `UX-1..8`, `L-1..6`
- Dashboard: `UX-1..13`, `L-1..13`
- Billing: `UX-B1..10`, `L-B1..13`
- API keys: `UX-K1..10`, `L-K1..13`

**Per the user's project rule, every sprint includes "write tests for everything we make."** Each sprint's deliverables list ends with tests; the sprint is not done until they pass.

---

## S1 — Pre-launch security: re-enable sudo/TOTP on destructive actions

**Why:** `TOTP_DISABLED_2026_04_11` is commented into three billing/portal handlers. A stolen session currently has god-mode over a customer's subscription and substrate — cancel, reactivate, deprovision, and open-billing-portal all run on session cookie alone.

**Scope:** re-enable the sudo-token gate on:
- `src/api/billing/portal.ts:43–65` *(billing portal — L-B1)*
- `POST /api/v1/substrates/:slug/cancel` *(L-B6)*
- `POST /api/v1/substrates/:slug/reactivate` *(L-B6)*
- `POST /api/v1/substrates/:slug/deprovision` *(L-B6)*

**Work:**
1. Un-comment the sudo checks; ensure frontend passes `sudoToken` in the request body.
2. Website: add a "confirm with code" modal step before issuing the destructive action; wire it to `/api/v1/auth/sudo-verify` (or whatever the endpoint is — verify the existing one wasn't deleted alongside the commented-out check).
3. Verify TOTP verify endpoint (`auth/routes.ts:112–137` commented branch) still wires to `totpService.isEnrolled()`; re-enable.
4. If TOTP enrolment UI does not exist yet, decide whether to ship a temporary "email-code sudo" as a stopgap.

**Deliverables + tests:**
- Integration tests: each of the four endpoints rejects (400/401) without a valid sudo token; accepts a valid one.
- e2e: the cancel flow prompts for sudo and rejects an expired code.

**Estimate:** 2 sessions.

**Dependency:** none.

---

## S2 — Webhook idempotency & event dedupe

**Why:** `invoice.payment_failed` has zero idempotency check and replays double-count `billing_events`. `stripe_event_id` is never captured anywhere, so per-handler dedupe is all we have.

**Scope:** introduce a `webhook_events` table as the first line of dedupe; patch the one handler (`invoice.payment_failed`) that's totally missing a check.

**Work:**
1. Migration (per `migration` skill): `CREATE TABLE webhook_events (stripe_event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, received_at TIMESTAMPTZ DEFAULT now(), processed_at TIMESTAMPTZ NULL, result JSONB NULL);`
2. In `substrate-stripe.ts` entry handler (lines 56–108), after signature verification: `INSERT INTO webhook_events(...) ON CONFLICT (stripe_event_id) DO NOTHING RETURNING stripe_event_id`. If no row returned, short-circuit with `{received: true, duplicate: true}`.
3. Add idempotency check in `handlePaymentFailed` (L-B2): query `billing_events WHERE metadata->>'stripeInvoiceId' = $1 AND metadata->>'attemptCount' = $2`; skip insert on match.
4. Audit `invoice.upcoming` handler (line 910+) — confirm it has dedupe and document.

**Deliverables + tests:**
- Unit: webhook handler rejects a replayed event (same `event.id`) with `duplicate: true`.
- Unit: `invoice.payment_failed` twice with same `(invoiceId, attemptCount)` → one `billing_events` row.
- Integration: end-to-end replay of a captured Stripe event does not mutate DB a second time.

**Estimate:** 1.5 sessions.

**Dependency:** none.

---

## S3 — Claim-key UX & return-code fix

**Why:** The key is shown exactly once; if the customer refreshes, their only recourse is rotation (which is rate-limited). The claim endpoint also returns 200 for "already claimed" (L-K1), so clients cannot cleanly tell success from no-op. Combined with signup's `UX-3`/`L-3` (no claim prompt on `/billing/success`), customers routinely walk away with no Bearer token.

**Scope:**
- Fix claim endpoint return codes (200 on fresh, 409 on already-claimed, 404 on not-found).
- Auto-call claim on `/billing/success` once `mcpEndpoint` is live (UX-3, L-3).
- Add a pre-claim acknowledgement step on `/admin` ("I understand the key will be shown only once") before the claim actually clears `pending_api_key`.
- Surface `keyUnclaimed` prominently on the dashboard with a banner that links to claim (UX-K5).

**Work:**
1. `src/api/substrates/routes.ts:596–663` — change the two-branch 200 return to `200 | 404 | 409`. Keep the atomic CTE.
2. Website: `/billing/success` BillingSuccessClient — after `mcpEndpoint` is present, POST to claim-key, render the revealed key + mcpConfig inline with the "shown once" warning (mirrors `SignupClient.tsx:110–163`).
3. Website: `/dashboard` — add a top-of-page banner when any substrate has `keyUnclaimed === true` (L-3). Wires straight into the existing `/admin` claim flow.
4. Website: `/admin` claim button — add an "I understand" confirmation before the click actually fires. Keeps the "shown once" invariant honest.

**Deliverables + tests:**
- Integration: `/claim-key` returns 200/409/404 correctly; CTE atomicity preserved.
- Website unit: `BillingSuccessClient` test that mocks `/api/my-substrate` returning `mcpEndpoint`, asserts auto-claim fires and the key panel renders.
- Website unit: dashboard banner renders when any substrate is `keyUnclaimed`.
- e2e: full signup → checkout → `/billing/success` → key revealed → config renders.

**Estimate:** 2 sessions.

**Dependency:** none (but this is the top blocker for a smooth onboarding, so do it early).

---

## S4 — Rotation reliability: step-5 verification and key persistence on SSH failure

**Why:** Rotation has two genuine production bugs:
- **L-K2/F1/F5:** step 5 `/health` check does not prove the new env is loaded in containers — customers claim new keys and then hit 401 because containers are still running old env.
- **L-K3/F4:** SSH failure at step 2 orphans the generated key (`new_key_raw = NULL` on fail; retry calls `generateKey()` again, losing the first key).

**Scope:** make rotation actually prove the new key works before committing to DB, and make retry reuse the same generated key.

**Work:**
1. `src/key-rotation/state-machine.ts:181–203` — replace the `/health` probe with an **authenticated probe** using the new raw key. Only proceed to commit if the authenticated call returns 200. Confirms all three locations (host `.env`, both containers) are in sync.
2. `state-machine.ts:156–162` — persist `new_key_raw/hash/prefix` on the job row **before** the first SSH call. On retry, reuse the same key instead of regenerating.
3. `state-machine.ts:156–162` — after `sed`, `grep ^CUSTOMER_API_KEY=` and assert the new value is in the file (L-K10 / F2). Fail the step if not.
4. Add a cooldown banner on `/admin` between "rotation complete" and "safe to update Claude Desktop" (UX-K4) — a 30 s countdown before the customer is told to paste.

**Deliverables + tests:**
- Integration: rotation end-to-end asserts all 5 locations sync (DB hash, host env, both container envs, successful authenticated call). See the 5-location sync test in `JOURNEY-REVIEW-API-KEY-LIFECYCLE.md` §Missing tests #1.
- Integration: mock SSH throw at step 2; assert `new_key_raw` persists on the job row and retry reuses it.
- Integration: mutate host `.env` to remove `CUSTOMER_API_KEY` line; attempt rotation; assert failure with specific error.
- e2e: admin page shows cooldown banner between "complete" and "ready to paste".

**Estimate:** 2.5 sessions.

**Dependency:** none.

---

## S5 — Dashboard polling: 401 handling, consolidation, visibility

**Why:** Every dashboard poll silently swallows 401 (UX-1/L-2 of the dashboard review). Three polling cadences across three surfaces answer the same question (signup UX-2). Polling runs in background tabs (UX-8). Logout doesn't clear intervals (UX-10).

**Scope:** one shared polling hook with 401 handling, visibility pause, abort on unmount, cleanup on logout.

**Work:**
1. Extract `useProvisioningPoll()` (signup UX-2 already identified): wraps a `setInterval`, clears on unmount, listens to `visibilitychange`, uses `AbortController` on fetch.
2. On `401`: call `router.push('/login?error=session_expired')` and clear the interval.
3. Replace the three existing implementations:
   - `DashboardClient.tsx:549–566` (substrate polling, 10 s)
   - `DashboardClient.tsx:455–514` (`PostCheckoutBanner`, 2 s for 60 s — also fix UX-3 dashboard: keep banner visible until substrate actually appears or 5 min elapse)
   - `BillingSuccessClient.tsx:112` (3 s)
4. In logout handler (`DashboardClient.tsx:568–575`), explicitly clear the polling interval *before* redirecting.
5. `getAccount()` at `dashboard/page.tsx:40–50`: distinguish 401 from 5xx. Only clear cookie on 401.

**Deliverables + tests:**
- Website unit: `useProvisioningPoll` — poll fires, pauses on tab hidden, aborts on unmount, redirects on 401.
- e2e: expire the session cookie mid-dashboard, assert redirect to `/login?error=session_expired`.
- e2e: log out, assert no further network activity.
- e2e: provision a substrate that takes >60 s; assert `PostCheckoutBanner` degrades to "still provisioning — check back shortly" instead of vanishing.

**Estimate:** 1.5 sessions.

**Dependency:** none.

---

## S6 — `past_due` banner, grace-period countdown, spend-cap UI

**Why:** Three billing states have zero dashboard surface today. `past_due` is returned by the API but never rendered (UX-B1). Cancelled state says "Memory preserved for 90 days" but the webhook sets 30 days and the actual date is never shown (UX-B5, L-B4). Spend caps are enforced but never surfaced in UI (UX-B3).

**Scope:** make the BillingWidget reflect the state machine honestly.

**Work:**
1. `DashboardClient.tsx:118–266` (`BillingWidget`) — add a `past_due` branch above the active card: amber banner, "Payment failing — update your card →" that opens `/api/billing/portal`.
2. Fix the grace-period copy: read `grace_period_ends_at` from the billing-status response (add it to the API payload if missing) and render the exact date. Align the copy to the actual 30-day window in the webhook handler — or, if 90 days is the policy, update the webhook. **Decide which is correct before editing either side.**
3. `lastPaymentFailed` amber banner — change the CTA from the generic "Update payment →" to an anchor that actually POSTs to `/api/billing/portal`.
4. Build a lightweight spend-cap proximity pill on the BillingWidget: read `/api/billing/caps/:accountId`, render "N% of monthly cap" at ≥60%, amber pill at ≥80%, red banner at 100%. (Does not build the full cap-management UI — that's S9.)

**Deliverables + tests:**
- Website unit: `BillingWidget` renders all five API states — `active, trialing, past_due, suspended, cancelled` — plus the payment-failed overlay.
- Website unit: grace-period copy renders the actual date from the API.
- Website unit: cap proximity pill renders at the three thresholds.
- Integration (compute): `/api/billing/status` returns `gracePeriodEndsAt` if it doesn't already.

**Estimate:** 1.5 sessions.

**Dependency:** alignment decision on grace-period duration (30 vs 90). Tag Cameron.

---

## S7 — In-place upgrade flow on the admin page (unblocks J-05)

**Detailed plan:** see [`PLAN-ADMIN-UPGRADE-FLOW.md`](./PLAN-ADMIN-UPGRADE-FLOW.md). Decisions captured, research done, ready to execute.

**Why:** The existing "Upgrade" button on `/admin?slug=X` drops substrate context and sends users to `/pricing`. `substrate_tier_changes` has a full state machine on the backend but zero UI, so customers upgrading from indie to team see nothing during the migration. This is J-05 blocked in `JOURNEYS.md`. We also need the upgrade scoped to *this* substrate, not a new subscription.

**Scope (from the plan doc):**
- shared→shared paid upgrades (starter→indie→pro) — in-place limit update, ~10 s visible
- shared→dedicated upgrade (any shared → team) — full migration pipeline, 3–10 min visible, **API key preserved** so MCP config keeps working
- Progress UX walks the user through every phase; banner persists across page reloads; email on completion / rollback
- Downgrades and free→paid are explicitly **out** (see `FOLLOW-UP-DOWNGRADES.md`; no free tier for active accounts)

**Split into three sub-sprints:**

### S7a — Backend API + key preservation (2 sessions)
- Migration 067 (`substrate_migrations.carry_forward_api_key` TEXT)
- `deriveKeyObjectFromRaw()` helper in `key-generator.ts`
- Provisioner accepts optional `carryForwardKey` instead of minting a fresh one
- Tier-change-service SSH-reads old host's `.env` before enqueuing shared→dedicated provision
- New endpoints: `GET /billing/upgrade-options`, `POST /billing/upgrade`, `GET /billing/tier-change/:slug`, `GET /billing/tier-change/batch`
- Integration tests: full shared→dedicated with key preservation; all four endpoints

### S7b — Admin UI + progress banner (1.5 sessions)
- Five new components: `ChangePlanButton`, `ChangePlanSheet`, `ConfirmUpgradeDialog`, `TierChangeProgressBanner`, `useTierChangePoll`
- Three BFF proxy routes in `mmpm-website`
- AdminClient.tsx edits: replace the pricing-link button; mount banner; handle `?upgrade=pending|cancelled`
- Dashboard badge for in-flight tier changes (closed-tab recovery)
- Component tests + Playwright J-05a (shared→shared happy path) + cancel path

### S7c — Progress depth + notifications (1 session)
- Three new notification methods + Resend templates (started for slow path, completed, failed)
- Migration 068 (`substrate_tier_changes.phase_metadata` JSONB) for richer progress telemetry
- Integration test: rollback email fires with correct reason
- Playwright J-05b (shared→dedicated happy path, 7 phases)

**Deliverables + tests:** ~20 new tests across integration, component, and E2E layers. See plan doc §9 for full breakdown.

**Estimate:** ~3.5 sessions total.

**Dependency:** S2 (webhook idempotency) MUST land first — otherwise a Stripe retry of `customer.subscription.updated` could double-enqueue `substrate_tier_changes`. High retention value.

---

## S8 — Test-connection endpoint + 401 recovery path

**Why:** UX-K2 and UX-K3: after paste, the customer has no in-app way to verify the key works. If Claude Desktop hits 401, there's no guided recovery.

**Scope:**
1. New compute endpoint `POST /api/v1/substrates/:slug/test-key`:
   - Session-authenticated; compute makes an authenticated request to the customer substrate using the substrate's known key (reads `api_key_hash` and compares or uses the stored prefix + a stored test-key mechanism — design decision; simplest is to make an authenticated health call from compute to the substrate).
   - Returns `{ ok: true, latencyMs }` or `{ ok: false, reason: 'unreachable' | 'auth_failed' | 'timeout' }`.
2. Website: "Test connection" button on `/admin` below the MCP config block. Renders the result inline.
3. When `{ ok: false, reason: 'auth_failed' }`, surface an inline recovery CTA: "Your Claude Desktop key may be out of date — re-claim and re-paste."

**Deliverables + tests:**
- Integration: test-key endpoint returns `ok: true` for a healthy substrate; `auth_failed` when key diverges.
- Website unit: button state transitions (idle → testing → ok / error + recovery copy).
- e2e: after rotation, intentionally do not re-paste; click Test; assert `auth_failed` + recovery CTA.

**Estimate:** 1.5 sessions.

**Dependency:** S4 (because this is most meaningful after rotation reliability is solid).

---

## S9 — Email notifications (dunning, trial-ending, cancel confirm, claim reminder)

**Why:** L-B13 — `billing_events` accretes but nothing consumes it. Customers don't know payment failed until Stripe cancels and they're read-only. Also L-K5: no reaper for unclaimed `pending_api_key`.

**Scope:** consumer service for billing events + scheduled reaper for unclaimed keys.

**Work:**
1. Decide email provider (Resend / Postmark / SES). If already decided, skip.
2. Background worker `billing-notifier`: scans `billing_events WHERE processed_at IS NULL`; routes by `event_type`:
   - `payment_failed` → dunning email with portal link (attempt-aware copy: "attempt 1 of 3" etc.)
   - `invoice.upcoming` → renewal reminder
   - `subscription_cancelled` → cancel confirm with reactivation link
   - `grace_period_started` → read-only state + grace-end date
3. Scheduled reaper `pending-key-reaper`: every hour, `UPDATE substrates SET pending_api_key = NULL WHERE pending_api_key IS NOT NULL AND <age> > 7 days`; emits a `key_unclaimed_expired` event.
4. Email for the unclaimed-key reaper: one reminder at day 3, one final at day 6, then NULL at day 7.

**Deliverables + tests:**
- Integration: billing-notifier processes each event type; idempotency via `processed_at` column.
- Integration: pending-key-reaper NULLs old columns; emits the right event.
- Unit: email templates for each notification type.

**Estimate:** 3 sessions.

**Dependency:** S2 (so the `webhook_events` dedupe is in place before we rely on event-driven emails).

---

## S10 — Test coverage fill + OpenAPI contract test

**Why:** Website has almost no test coverage of the signup/dashboard journeys (only `PricingCardClient.test.tsx`). Compute has good unit coverage but gaps around the 5-location sync and replay flows. A contract test between compute's OpenAPI spec and the website's TypeScript interfaces would have caught `L-1` (`checkoutUrl` missing from `SignupResult`) automatically.

**Scope:** pick up the per-journey "Missing tests" sections and ship the fills. This sprint is a catch-up sprint and is intentionally large — treat it as 2–3 sub-sprints.

**Work (split into three sub-sprints):**

### S10a — Website BFF + client unit tests

Write everything in the "Missing tests" sections of the four review docs under "Website" and "e2e". Priority order:
- Signup/checkout: tests 1–8 in `JOURNEY-REVIEW-SIGNUP-CHECKOUT.md` §Missing tests → Website.
- Dashboard: tests 1–6 in `JOURNEY-REVIEW-DASHBOARD-RETURNING.md` §Missing tests → e2e + 11–13 → Unit.
- Billing: tests 13–14 in `JOURNEY-REVIEW-BILLING-LIFECYCLE.md` §Missing tests → Unit.
- API keys: test 9–12 in `JOURNEY-REVIEW-API-KEY-LIFECYCLE.md` §Missing tests → e2e.

**Estimate:** 2 sessions.

### S10b — Compute integration tests

- Full 5-location sync test (`JOURNEY-REVIEW-API-KEY-LIFECYCLE.md` test #1) — this is the biggest gap and the highest-value test in the codebase.
- Webhook replay tests.
- Billing: reactivation within grace period, free-tier deprovision, chargeback suspend, cap-exceeded refund (`JOURNEY-REVIEW-BILLING-LIFECYCLE.md` tests 1–7).
- Claim-key concurrency test (`JOURNEY-REVIEW-API-KEY-LIFECYCLE.md` test #2).

**Estimate:** 2 sessions.

### S10c — OpenAPI contract test (shared)

- Build a test harness that fetches `src/api/docs/generated/openapi.json` from the compute repo and walks it against the TypeScript interfaces in `mmpm-website/src` (`SignupResult`, `MySubstrateResponse`, `BillingStatusResponse`, admin response, rotation job status, etc.).
- Fail the build if any website-consumed response shape diverges from the OpenAPI spec.
- Add to CI for both repos.

**Estimate:** 1 session.

---

## S11 — Polish: copy, colours, endpoint rationalisation

**Why:** the batch of low-severity items that hurt nothing on their own but add up to a scruffy product. Grouped into a single cleanup sprint.

**Scope (punchlist):**
1. Hardcoded `entityone22@gmail.com` in suspended-state CTA (dashboard `UX-2`, billing `UX-B4`) → config constant or real support inbox.
2. `cancelled` and `suspended` share red (dashboard `UX-4`) → cancelled to zinc/neutral.
3. Dashboard and admin status-badge colour divergence (`UX-9`) → single shared component.
4. Dashboard `hasActiveSubscription` is on the type but never rendered (`L-13`) → per-substrate billing pill.
5. Cancel modal copy says "taken to Stripe portal" but actually calls `/cancel` directly (`UX-B9`) → align copy.
6. Reactivate button on suspended links to `/pricing` instead of calling `/reactivate` (`UX-B8, UX-12 dashboard`) → one-click reactivate.
7. Rate-limit reset parsed as seconds without unit in header (`UX-11 dashboard`) → add unit to header name.
8. "Manage billing" visible when `!hasStripeCustomer` (`UX-6 dashboard`) → hide/disable.
9. Trial vs renewal date copy hint (`UX-7 dashboard`).
10. `/billing/success` dead-end timeout (`UX-7 signup`) → "Go to dashboard" CTA.
11. Signup page / pricing page two-front-door problem (`UX-4 signup`) → decide and wire.
12. `src/app/auth/callback/route.ts:88–100` default redirect is `/admin`; confirm and align with desired landing (`UX-6 signup`).
13. Swagger: document both `/claim-key` paths (new + legacy) or deprecate (`L-K12`).
14. Comment on `api_key_prefix` column + `my-substrate` handler documenting that prefix-only is safe (`L-4 signup`).
15. Comment on rotation job partial unique index (`L-K13`).
16. Populate `metadata.substrateId` always in `createCheckoutSession` call sites; fail-fast in webhook instead of `ORDER BY created_at DESC LIMIT 1` fallback (`L-5 signup`).
17. Tombstone stale memory atom (already done during signup review but re-verify) (`L-6 signup`).
18. Align `BillingWidget` grace copy with actual `grace_period_ends_at` value (addressed in S6; this is a cleanup verification).

**Deliverables + tests:**
- Unit tests for each touched component.
- Visual regression snapshot tests if available.

**Estimate:** 2 sessions.

**Dependency:** S6 handles the grace-period copy.

---

## Sprint ordering & total

| # | Sprint | Sessions | Risk if skipped |
|---|---|---|---|
| S1 | Re-enable sudo/TOTP on destructive routes | 2 | 🔴 production security gap |
| S2 | Webhook idempotency + `webhook_events` dedupe | 1.5 | 🔴 billing correctness |
| S3 | Claim-key UX + return codes + auto-claim on success | 2 | 🔴 every new customer hits this |
| S4 | Rotation reliability (step-5 verify, key persistence) | 2.5 | 🔴 silent 5-location desync |
| S5 | Dashboard polling + 401 handling | 1.5 | 🟠 sessions die silently |
| S6 | `past_due` banner, grace countdown, cap proximity | 1.5 | 🟠 customers don't see payment issues |
| S7a | Upgrade-flow backend + key preservation | 2 | 🟠 retention risk during upgrade |
| S7b | Admin-page upgrade UI + progress banner | 1.5 | 🟠 |
| S7c | Upgrade email notifications + richer progress | 1 | 🟠 |
| S8 | `/test-key` + 401 recovery path | 1.5 | 🟠 no diagnostic path |
| S9 | Email notifications + unclaimed-key reaper | 3 | 🟠 secret at rest, no dunning |
| S10a | Website/e2e test fill | 2 | 🟡 regression risk |
| S10b | Compute integration test fill (5-location sync) | 2 | 🟡 regression risk |
| S10c | OpenAPI contract test | 1 | 🟡 would have caught L-1 automatically |
| S11 | Copy/colour/endpoint polish (punchlist) | 2 | 🟢 product feels sharper |

*S7a/b/c collectively replace the old S7 placeholder. Detailed design in [`PLAN-ADMIN-UPGRADE-FLOW.md`](./PLAN-ADMIN-UPGRADE-FLOW.md). Downgrades deferred to [`FOLLOW-UP-DOWNGRADES.md`](./FOLLOW-UP-DOWNGRADES.md).*

**Total:** ~25.5 sessions (was ~24; +1.5 for the deeper upgrade progress UX).

**Minimum viable pre-launch block:** S1 + S2 + S3 + S4 = **8 sessions**. Everything else can ship incrementally after the launch block is solid.

---

## Cross-sprint decisions / open questions

### Recently resolved (2026-04-17)

- **Email provider** — **Resend**, already wired via `config.resendApiKey` + `notification-service.ts`. No change needed for S7c or S9.
- **Free tier semantics** — there is no free tier for active accounts. `free` ($1) is the post-cancellation / deprovisioned state only. The path for a deprovisioned account returning to paid is **reactivation** (SM-8), not an upgrade. This removes one ambiguity from S3 and S7.
- **Upgrade scope** — S7 covers shared→shared paid + shared→dedicated only. Downgrades deferred to [`FOLLOW-UP-DOWNGRADES.md`](./FOLLOW-UP-DOWNGRADES.md).
- **API key on shared→dedicated** — preserved via a short-lived `substrate_migrations.carry_forward_api_key` column, SSH-read from the old host at tier-change enqueue time and passed through to the new provisioner. See [`PLAN-ADMIN-UPGRADE-FLOW.md`](./PLAN-ADMIN-UPGRADE-FLOW.md) §6.
- **Checkout strategy for S7** — Stripe hosted Checkout redirect (Phase 1). Revisit in-app `subscriptions.update()` proration later if the redirect feels jarring.

### Still open

1. **L-1 signup flow:** charge-first (redirect to `checkoutUrl`) vs free-means-free (auto-provision). Gates S3's exact implementation on `/billing/success`. Memory atom `v1.fact.free_tier_now_1_dollar_stripe_checkout` claims charge-first.
2. **Grace period duration:** 30 (webhook) vs 90 (UI copy). Align before S6.
3. **Sudo/TOTP UX:** do we have a TOTP enrolment flow? If not, ship email-code sudo as a stopgap for S1.
4. **Support email destination:** what replaces `entityone22@gmail.com` in S11? `support@parametric-memory.dev`?
5. **Signup vs pricing front door:** kill one path or document the role of each. With the "no free tier" clarification above, `/signup` may just be redundant with `/pricing`.

---

## Notes on working style

Per the user's project rule: **every sprint ships with tests.** Any sprint that can't produce passing tests in the same PR is not done.

Per the HARD RULES at the top of the repo:
- No commits, tags, pushes, branch switches, or destructive git from Claude. Commands will be handed to the user with a one-line reason each.
- No `rm` / `git rm` / `allow_cowork_file_delete` from Claude.
- No `.env` file edits from Claude (except the two pre-approved auto-patches noted in `CLAUDE.md`).
- No direct DB writes from Claude — all schema changes go through `migrations/` via the `migration` skill. Data fixes go through reviewed scripts run by the user.

Each sprint is expected to be pre-planned with the `token-budget` skill at the start of the session that picks it up, so routing to the cheapest capable tier (haiku for file ops, sonnet for code/content, opus for anything architectural) is explicit.
