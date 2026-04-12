# Sprint Plan — Multi-Substrate Support

**Related:** [ADR-002-MULTI-SUBSTRATE.md](./ADR-002-MULTI-SUBSTRATE.md)
**Date:** 2026-04-11
**Status:** Proposed
**Planned sprints:** 4
**Total estimated duration:** ~6–7 engineering weeks (solo), ~3–4 weeks (two engineers parallel). See *Pre-launch context* below — the original 8–10 week estimate assumed existing-customer migration toil that no longer applies.
**Deciders:** Entity One

---

## Locked decisions from ADR-002 (feeding this plan)

1. **Billing model:** one Stripe subscription per substrate. No quantity-based billing.
2. **Identifier:** existing auto-generated slug `{email-prefix}-{6-hex}`. No display names, no rename flow.
3. **No stopgap.** The duplicate-billing bug gets fixed by shipping this plan, not by a Band-Aid PR.
4. **`accounts.tier`:** dropped in Sprint 4. Compute on demand from `substrates.tier`.
5. **Trial:** one per account, lifetime. `accounts.has_used_trial BOOLEAN` tracks it.
6. **Cancel/deprovision:** lifecycle pipeline unchanged per-substrate. UI unifies behind one "Cancel this substrate" button that branches on free/paid. No refund flow built in this plan.
7. **Enterprise Cloud:** pinned at 1 substrate per subscription contractually. JSDoc note, no structural field.

---

## Pre-launch context — single-user, clean-slate cutover

**Context (2026-04-11, Entity One):** MMPM is not yet in production with real customers. Entity One is the sole user of the system today. At go-live, the following data will be wiped from every environment:

- `accounts` table — all rows
- `substrate_subscriptions` table — all rows
- `substrates` table — all rows
- `billing_events` and associated per-account audit rows
- Any in-flight `substrate_provision_queue`, `destroy_queue`, `key_rotation_queue` entries
- Stripe test-mode customer and subscription objects created during dev

**Retained:** the DigitalOcean droplet itself (with docker, Traefik, nginx, Postgres binary), compute codebase, website codebase, MMPM memory atoms, this ADR and sprint plan.

### What this simplifies

1. **Migration 064 has no backfill.** The ALTER TABLE adds the `substrate_id` FK column and the `cap_exceeded` status check. There are no existing `substrate_subscriptions` rows to UPDATE. The backfill SQL block from ADR-002 is not written; the migration is a simple schema change.
2. **The pre-flight duplicate-billing diagnostic query is not run.** No existing customers means no accounts to reconcile. The "most dangerous line of the plan" watch-out is eliminated.
3. **Risk register entry for backfill corruption is removed.** The Sprint 2 top-three-risk list drops to two items.
4. **Sprint 1 shim (SM-13) is optional.** The shim existed to keep the old dashboard working while new routes were built. With zero real users, the cutover can be coordinated with dashboard code so legacy routes are deleted in Sprint 1, not Sprint 4. Keeping the shim still has value for developer-velocity reasons (lets Sprint 1 and Sprint 3 progress in parallel), so the recommendation is: **keep SM-13 as a convenience but drop its deprecation-header ceremony — there are no external callers to deprecate to**. Delete the shim whenever Sprint 3 is ready, not on a fixed schedule.
5. **Sprint 3 SM-27 visual-diff baseline is not against production.** There's no pre-change production state for a single-substrate customer to regress against. The fast path still matters for correctness (the one-substrate UX should feel simple, not cluttered) but the "visual diff vs pre-Sprint-3 screenshot" gate becomes "visual inspection against the design intent", judged subjectively against ADR-002's exit criteria.
6. **Sprint 2 staging soak becomes a pure functional-validation exercise.** The 48h soak's purpose was "does the webhook correctly handle real customer traffic". With no real customers, the soak is a Stripe test-mode replay harness — fire every event type, verify every (substrate count, event) combination, move on. No customer-originated variation to discover. The soak can probably collapse from 48h to the time it takes to run the replay harness end-to-end (a few hours).
7. **Rollback plan is dramatically simplified.** If any sprint goes wrong, the clean-slate property still holds right up until launch. Wipe the DB, fix the bug, re-run the schema migrations, re-seed any dev-user data, continue. No customer reconciliation, no Stripe refund coordination, no data preservation toil.
8. **Trial flag `accounts.has_used_trial` has no row backfill.** The column lands with `DEFAULT FALSE` and all new accounts start with FALSE as expected. No special case for Entity One's dev account — it too starts fresh at cutover.
9. **Sprint 2 feature flag `FEATURE_MULTI_SUBSTRATE_WEBHOOK` is cheaper to ignore.** The flag still has value as a deploy-time safety net (flip off if anything looks wrong in the first hour post-launch), but its primary purpose — "don't break existing customer flow during gradual rollout" — is moot. Keep the flag plumbing because it's trivial (SM-16) and gives a one-line kill switch, but do not gate the production rollout on a multi-day soak.

### What this does NOT change

1. **The 404-vs-403 IDOR discipline still applies.** Entity One becoming a real customer of the launched product means the security model must be correct from day one. Cross-account IDOR tests in SM-11 are unchanged — the test fixtures create multiple test accounts at the fixture level, which has nothing to do with production data state.
2. **Cap-exceeded refund code still needs to be correct.** At launch, Entity One is the first real customer. If Entity One hits the cap by accident, the refund path is what protects the launch from its own architecture. SM-20 test rigor is unchanged.
3. **URL shape is still a public contract from launch minute one.** The slug-scoped URLs in ADR-002 cannot be changed after launch without breaking any customer who bookmarked them. This constraint has nothing to do with whether there is pre-launch data.
4. **The named regression test `buying-solo-twice-creates-two-substrates.test.ts` still ships.** It is a forward-looking test protecting launched-customer behaviour, not a historical audit. Its name is deliberately visible in CI forever.
5. **SM-38/SM-39 ordering still matters.** The `accounts.tier` drop still must come one deploy after the code refactor that stops reading it. Data volume is irrelevant; code-path correctness is not.
6. **The `platform_settings` shared-constants source-of-truth in SM-32/SM-36 still matters.** The cap values (free=1, indie=2, pro=3, team=5) are marketing promises the moment they're on the pricing page. Wrong numbers on launch day are worse than wrong numbers discovered during migration.
7. **Stripe test-mode → live-mode cutover** is a separate concern that this plan does not address. It should be handled as a separate pre-launch checklist item, not folded into any sprint ticket.

### Implications for sprint scheduling

- **Sprint 2 compresses.** With no backfill, no diagnostic query, no customer reconciliation, no 48h soak, and no production-data migration anxiety, Sprint 2 collapses from ~7 days to ~5 days. The ticket list doesn't shrink, but the schedule buffer for operational caution does.
- **Sprint 4 can land tighter to Sprint 3.** The cleanup sprint's value is entirely forward-looking (remove singular-substrate code paths before they become technical debt). With no existing customers depending on legacy routes, Sprint 4 can start the day Sprint 3 exits, not a deploy cycle later.
- **Total plan duration drops from 8–10 weeks solo to ~6–7 weeks solo.** Two engineers working in parallel compresses to ~3–4 weeks.

### Launch-day DB wipe as a formal sprint item

This wipe should be an explicit ticket, not a vague pre-launch task. **Added as SM-46 in Sprint 4.** It runs after all cleanup is done, after migrations have been validated on the wiped state, before the production DNS flip. The wipe script lives in `scripts/pre-launch-reset.sql` and is version-controlled alongside the migrations so its exact behaviour is reviewable.

---

## Sprint metadata legend

| Field | Values |
|---|---|
| **Size** | XS (≤2h), S (½ day), M (1 day), L (2–3 days), XL (4+ days) |
| **Risk** | Low (contained, revertible), Med (touches shared state or security), High (touches money, migrations on live data, or public URL contracts) |
| **Area** | compute / website / docs / ops |
| **Tests** | unit / integration / e2e / manual |

Every ticket lands with its test tranche green. No exceptions.

---

## Sprint 1 — Compute foundation

**Sprint goal:** Compute can serve slug-scoped routes with IDOR defence behind a single ownership helper, *without changing customer-facing behaviour*. Legacy `/my-substrate/*` routes still work via shims. Ship in one week. All customers still see today's experience; the new endpoints are dormant until Sprint 3 consumes them.

**Exit criteria:**
- `resolveOwnedSubstrate` is the single chokepoint for "does this account own this slug"
- Every new route returns `404` (never `403`) for non-ownership, fuzzing-safe
- Full integration test suite green, including cross-account IDOR attempts
- Legacy routes untouched behaviourally; deprecation log counter visible in ops

### Tickets

| ID | Ticket | Area | Size | Risk | Depends | Tests |
|---|---|---|---|---|---|---|
| SM-1 | `src/lib/substrate-ownership.ts` — `resolveOwnedSubstrate(pool, accountId, slug)` helper | compute | XS | Low | — | unit |
| SM-2 | `GET /api/v1/substrates` — list caller's substrates | compute | S | Low | SM-1 | integration |
| SM-3 | `GET /api/v1/substrates/{slug}` — per-substrate status | compute | XS | Low | SM-1 | integration |
| SM-4 | `POST /api/v1/substrates/{slug}/rotate-key` | compute | S | Med | SM-1 | integration + security |
| SM-5 | `POST /api/v1/substrates/{slug}/claim-key` + `GET /key-rotation/status` | compute | S | Low | SM-1 | integration |
| SM-6 | `POST /api/v1/substrates/{slug}/cancel` — Stripe `cancel_at_period_end` | compute | S | Med | SM-1 | integration |
| SM-7 | `POST /api/v1/substrates/{slug}/deprovision` — port free-tier guard | compute | S | Med | SM-1 | integration |
| SM-8 | `POST /api/v1/substrates/{slug}/reactivate` | compute | S | Low | SM-1 | integration |
| SM-9 | `GET /api/v1/substrates/{slug}/usage` — per-substrate atom/bootstrap usage | compute | S | Low | SM-1 | integration |
| SM-10 | `billing/status.ts` + `billing/caps.ts` accept optional `?slug=` | compute | M | Med | SM-1 | integration |
| SM-11 | IDOR integration test suite (cross-account slug fuzzing, existence leak check) | compute | M | High | SM-2→SM-9 | integration + security |
| SM-12 | Rate-limit slug-scoped routes per-account-per-minute | compute | S | Med | SM-2→SM-9 | integration |
| SM-13 | Legacy `my-substrate/*` routes become shims that delegate to new handlers, emit deprecation header | compute | S | Low | SM-2→SM-9 | integration |

**Sprint size total:** ~8 days solo. Breaks cleanly across two engineers if SM-1→SM-3 land on day 1 (unblocking everything else).

### Watch-outs for Sprint 1

**404 vs 403 discipline is non-negotiable.** Every code reviewer for every route in SM-2 through SM-9 should grep the handler for the string `403` and reject if it appears on a not-found or not-owned path. The only acceptable response for "slug doesn't exist for any reason the caller is allowed to know about" is `404`. The ops-side metric `substrate.ownership.404` can distinguish "slug doesn't exist" from "slug exists but wrong account" for our own debugging; the HTTP response must not.

**The deprovision free-tier guard is subtle.** Today's guard (`app.ts:634-651`) queries `substrate_subscriptions WHERE account_id = $1 AND status = 'active'` — this is account-scoped. Under multi-substrate it must become substrate-scoped: `WHERE substrate_id = $1 AND status = 'active'`. But the FK column doesn't exist until Sprint 2's migration 064. **Workaround for Sprint 1:** SM-7's slug-scoped deprovision route in Sprint 1 continues to use the account-scoped check. Add a FIXME comment referencing SM-14. The guard is conservative (refuses when in doubt), so being over-restrictive during Sprint 1 is the safe direction — we'll tighten it up in Sprint 2.

**Shim delegation must preserve response shape byte-for-byte.** SM-13's shims delegate to the new handlers, but the existing frontend in Sprint 3's starting state still expects the old response shape. Any unintended schema drift in the shim layer will break the dashboard before Sprint 3 even lands. Snapshot-test the old routes' JSON shapes *before* writing the shim.

**Rate limiting tuning.** SM-12 defaults: 60 requests per minute per account across all slug-scoped routes. This is generous for legitimate dashboard use and punitive for a fuzzer. If you see ops metric `substrate.ownership.404` spike on a single account, throttle aggressively and alert.

---

## Sprint 2 — Webhook rewrite (behind a feature flag)

**Sprint goal:** Every Stripe subscription maps to exactly one substrate row, created at `subscription.created` time and linked by an explicit FK. The silent duplicate-billing bug becomes structurally impossible. Behaviour ships behind `FEATURE_MULTI_SUBSTRATE_WEBHOOK` off by default; staging runs with it on for 48h before production cutover.

**Exit criteria:**
- Migration 064 applied to staging against the wiped schema; SM-17 proves the new handler always populates `substrate_id`, then the column is tightened to NOT NULL in a follow-up statement
- Integration tests pass with the flag on: every (existing substrate count, Stripe event) combination
- Named regression test `"buying Solo twice creates two substrates"` is green and will stay in test output permanently
- `cap_exceeded` refund path verified end-to-end in staging against a real Stripe test-mode customer
- Stripe test-mode event replay (SM-24) runs cleanly end-to-end against the flag-on staging environment — no 48h soak required under clean-slate

### Tickets

| ID | Ticket | Area | Size | Risk | Depends | Tests |
|---|---|---|---|---|---|---|
| SM-14 | Migration `064_substrate_subscription_fk.sql` — ALTER TABLE adds `substrate_id` FK column + `cap_exceeded` status check (no backfill under clean-slate; see Pre-launch context) | compute | XS | Med | — | integration |
| SM-15 | Migration `065_account_trial_tracking.sql` — `accounts.has_used_trial BOOLEAN NOT NULL DEFAULT FALSE` | compute | XS | Low | — | unit |
| SM-16 | `FEATURE_MULTI_SUBSTRATE_WEBHOOK` env flag plumbing | compute | XS | Low | — | unit |
| SM-17 | Rewrite `handleSubscriptionCreated` — always INSERT new substrate, cap-trigger-aware | compute | M | **High** | SM-14, SM-15, SM-16 | integration |
| SM-18 | Rewrite `handleSubscriptionUpdated` — look up via FK, scope change to one substrate | compute | S | Med | SM-14 | integration |
| SM-19 | Rewrite `handleSubscriptionDeleted` — look up via FK, scope deprovision to one substrate | compute | S | Med | SM-14 | integration |
| SM-20 | Cap-exceeded refund path — catch `SUBSTRATE_CAP`, refund Stripe payment intent, mark sub `cap_exceeded` | compute | M | **High** | SM-17 | integration + manual staging |
| SM-21 | `session-route.ts` trial gate — block `trial_period_days` when `accounts.has_used_trial = true` | compute | XS | Low | SM-15 | unit + integration |
| SM-22 | Webhook integration suite — every (0/1/N substrates × created/updated/deleted) matrix | compute | L | Med | SM-17→SM-20 | integration |
| SM-23 | Named regression test `buying-solo-twice-creates-two-substrates.test.ts` | compute | XS | Low | SM-17 | integration |
| SM-24 | Staging Stripe event replay — fire test events against feature-flag-on staging (harness, not soak) | ops | S | Med | SM-22 | manual |

**Sprint size total:** ~5 days solo under clean-slate (down from ~7 days in the original estimate; the reduction comes from eliminating the backfill, the pre-flight diagnostic, and the 48h soak, not from cutting tickets). High-risk work; do not parallelise SM-17 and SM-20 across engineers — same file, tight coupling.

### Watch-outs for Sprint 2

**Migration 064 is a simple ALTER TABLE under the pre-launch clean-slate context.** See *Pre-launch context — single-user, clean-slate cutover* near the top of this plan: at go-live, `substrate_subscriptions` is wiped, so the migration has zero rows to backfill. The migration ships as ALTER TABLE adding the `substrate_id` FK column (nullable at first for schema-level safety, tightened to NOT NULL in a follow-up step after SM-17 proves the new handler always populates it) plus the `cap_exceeded` status check. **The historical backfill SQL and the pre-flight duplicate-billing diagnostic query are both removed from SM-14's scope.** If the clean-slate assumption ever stops being true before launch (for example, a real customer is onboarded early for a pilot), re-introduce both the diagnostic query and the backfill block before running the migration — do not silently migrate non-empty data. The diagnostic is preserved in git history on this file for reference.

**Cap-exceeded refund is real money.** SM-20 calls `stripe.refunds.create()` on a live payment intent. Test it in Stripe test mode only until SM-24's staging replay proves it behaves correctly. Wrong refund = chargeback = expensive lesson. The refund call must be idempotent (use `metadata.refund_reason = 'substrate_cap_exceeded'` + idempotency key derived from the subscription ID).

**`subscription.created` idempotency matters under retry.** Stripe retries webhook delivery on non-2xx responses. Make the handler idempotent by checking `INSERT ... ON CONFLICT (stripe_subscription_id) DO NOTHING RETURNING id` — if the insert didn't happen, the row already exists, and the rest of the handler (provisioning enqueue) should be a no-op rather than a second enqueue. The existing idempotency guard at `substrate-stripe.ts:131-139` handles this for the current code; don't regress it in the rewrite.

**Trial flag is write-once per account.** Set it on the *first* successful `subscription.created` where `status='trialing'`. Never clear it. Never check it anywhere except `session-route.ts` trial gate. Do not let admin tools clear it — if a customer genuinely needs a second trial, use a Stripe coupon code, not a DB flip.

**Feature flag rollback plan (simplified under clean-slate).** If SM-24 reveals a bug in staging, flipping `FEATURE_MULTI_SUBSTRATE_WEBHOOK=false` restores the old handler path. Under the pre-launch clean-slate context, any rows created under the new handler in staging can be wiped and recreated — there is no customer preservation concern. Keep the flag wiring (SM-16) because it's a trivial one-line kill switch for the first hour post-launch, but do not gate production rollout on a multi-day soak and do not write a reconciliation runbook for orphaned rows. If the bug is severe enough to warrant flipping the flag off post-launch, the clean-slate property has already been lost and you own a real reconciliation problem; that scenario is out of scope for this plan and becomes a P0 incident runbook, not a feature-flag toggle.

---

## Sprint 3 — Website surface + UX unification

**Sprint goal:** Customers can see, buy, and manage multiple substrates through the dashboard. Single-substrate users see an experience identical to today. The pricing surface advertises truthful per-tier caps again. Cancel and deprovision are unified behind one button per substrate.

**Exit criteria:**
- Dashboard renders a list view when `substrates.length > 1` and the existing single-card view when exactly 1
- Pricing page CTAs adapt to logged-in users' substrate count
- `tiers.ts` pin reversed: Solo=2, Pro=3, Team=5 (matching compute's `platform_settings` caps)
- `tiers.test.ts` invariant rewritten to match the new caps
- Admin panel shows per-account substrate trees
- Component tests cover 0/1/2+ substrate states
- E2E test "buy Solo twice → see two substrates → rotate key on sub 1 → sub 2's key unchanged" green (if Playwright harness available; otherwise manual staging run)

### Tickets

| ID | Ticket | Area | Size | Risk | Depends | Tests |
|---|---|---|---|---|---|---|
| SM-25 | `/api/substrates` and `/api/substrates/[slug]/*` proxy routes | website | M | Low | Sprint 1 shipped | unit |
| SM-26 | `DashboardClient.tsx` — fetch `GET /api/substrates` list at mount | website | S | Low | SM-25 | component |
| SM-27 | Dashboard 1-substrate fast path — renders identical UI to today when `length === 1` | website | S | Med | SM-26 | component + visual regression |
| SM-28 | Dashboard N-substrate list view — card-per-substrate, action buttons scoped | website | L | Med | SM-26 | component |
| SM-29 | Unified "Cancel this substrate" button — branches on free/paid client-side | website | M | Med | SM-28 | component + integration |
| SM-30 | Pricing page CTA logic — "Get your first substrate" / "Add another substrate" | website | S | Med | — | component |
| SM-31 | Admin panel `AdminClient.tsx` — account→substrates tree view | website | M | Low | SM-26 | component |
| SM-32 | Reverse `tiers.ts` pin — Solo=2, Pro=3, Team=5; update JSDoc | website | XS | Low | SM-28 verified | unit |
| SM-33 | Update `limits.mdx`, `plans-and-trial.mdx`, `llms.txt`, `faq/page.tsx` to match new caps | docs | S | Low | SM-32 | manual |
| SM-34 | `terms/page.tsx` — add clause "each substrate is an independent subscription, cancelled independently" | docs | XS | Low | — | manual |
| SM-35 | `tiers.ts` `ENTERPRISE_TIERS` JSDoc — dedicated-droplet-per-subscription note | docs | XS | Low | — | — |
| SM-36 | `tiers.test.ts` invariant rewrite — tier caps match a shared source of truth | website | S | Med | SM-32 | unit |
| SM-37 | E2E test: buy Solo twice → two substrates → per-substrate key rotation | website | M | Low | SM-25, Sprint 2 shipped | e2e or manual |

**Sprint size total:** ~8 days solo. SM-28 and SM-31 can parallelise; SM-27's single-substrate fast path is the riskiest ticket for UX regression.

### Watch-outs for Sprint 3

**The single-substrate fast path is the 99% case and it must look right at launch.** SM-27 is small but high-impact. Under the pre-launch clean-slate context (see top of plan), there is no pre-change production dashboard to visual-diff against — Entity One is the first and only user, and the whole DB is wiped at cutover. The "visual diff vs pre-Sprint-3 screenshot" gate therefore collapses to a subjective inspection judged against ADR-002's exit criteria: the one-substrate view should feel simple, no new chrome, no "Add substrate" CTA cluttering the card, the "Add another" entry point lives *below* the existing card and not inside it. The rigor didn't go away — the baseline just moved from a screenshot comparison to a design-intent review. Keep a screenshot of the final Sprint-3 fast-path view in the PR description so future multi-substrate regressions have something to diff against after launch.

**The "Cancel this substrate" branching logic must match compute's guard exactly.** SM-29 has two code paths on the client:
- Substrate is free tier → POST `/api/substrates/{slug}/deprovision`
- Substrate is paid → POST `/api/substrates/{slug}/cancel`
Compute's guard at Sprint 2's SM-17 deprovision handler *also* makes this decision and will reject a paid-tier deprovision with `403 active_subscription`. The client-side branch is a UX convenience; compute's guard is the security invariant. **Do not remove compute's guard.** A bug in the client-side branch must not become a bug in substrate lifecycle.

**`tiers.ts` pin reversal is a pricing page change.** This is customer-facing copy. Before SM-32 lands, confirm that the marketing/pricing story actually is "Solo gets 2 substrates, Pro gets 3, Team gets 5". These numbers come from `platform_settings.max_substrates_{free,indie,pro,team}` on the compute side and should be a single source of truth. My suggestion: export the defaults from a shared TypeScript constants file that both compute's cap trigger setup and the website's `tiers.ts` import, so they can never drift. SM-36 enforces this with a test.

**E2E test in SM-37 requires Sprint 2 webhook rewrite already shipped.** Scheduling dependency: SM-37 cannot land until Sprint 2 is in production with `FEATURE_MULTI_SUBSTRATE_WEBHOOK=true`, because the test's premise is "buy Solo twice actually creates two substrates", which is the exact Sprint 2 behaviour. If Sprint 2 is still running behind the flag when Sprint 3 starts, park SM-37 as a manual staging verification instead of blocking the sprint.

**Pricing page CTA change is subtle but important.** SM-30 needs to fetch the logged-in user's substrate list before rendering the CTA. If that fetch fails, the CTA should gracefully fall back to "Get [Tier]" (the current behaviour). A 500 on `/api/substrates` must not break the pricing page for anonymous visitors. Wrap in an optional `try/catch` and default to the anonymous-visitor copy.

**Admin panel is internal — low risk, easy to defer.** If Sprint 3 runs long, SM-31 is the cleanest thing to push to Sprint 4. It doesn't affect customers, and an admin panel showing one substrate per account is technically still accurate (just incomplete) for the first few hours post-launch.

---

## Sprint 4 — Cleanup + decision integration

**Sprint goal:** Delete everything the shims and feature flags left behind. Drop `accounts.tier`. Remove singular-substrate code paths from the codebase entirely. Declare the migration done.

**Exit criteria:**
- `grep -r "my-substrate" src/` returns 0 matches in both compute and website repos
- `accounts.tier` column dropped; no reader left in the codebase
- Slug-less branches removed from `billing/status.ts` and `billing/caps.ts`
- `docs/future-work.md` updated to reflect shipped state
- MMPM memory atoms documenting the old singular-substrate assumption tombstoned
- `scripts/pre-launch-reset.sql` merged, reviewed, and dry-run against staging; launch runbook references it by commit SHA

### Tickets

| ID | Ticket | Area | Size | Risk | Depends | Tests |
|---|---|---|---|---|---|---|
| SM-38 | Migration — drop `accounts.tier` column | compute | S | Med | SM-39 landed first | unit |
| SM-39 | Refactor `ops-context.ts` + `billing/substrate-checkout.ts` observer to resolve tier on-demand | compute | S | Low | Sprint 3 shipped | unit |
| SM-40 | Delete `/api/v1/my-substrate/*` routes from compute | compute | S | Low | Sprint 3 shipped | integration (ensure removed routes 404) |
| SM-41 | Delete `/api/my-substrate/*` proxy routes from website | website | S | Low | SM-40 in staging | integration |
| SM-42 | Remove slug-less branches from `billing/status.ts` + `billing/caps.ts`; make `slug` required | compute | S | Med | SM-40 | integration |
| SM-43 | Update `docs/future-work.md` with shipped state | docs | XS | Low | — | — |
| SM-44 | Tombstone singular-substrate memory atoms via `session_checkpoint` | ops | XS | Low | — | — |
| SM-45 | CI grep check: `my-substrate` returns 0 matches or CI fails | ops | XS | Low | SM-40, SM-41 | CI |
| SM-46 | Pre-launch DB wipe — version-controlled `scripts/pre-launch-reset.sql` wipes `accounts`, `substrate_subscriptions`, `substrates`, `billing_events`, `substrate_provision_queue`, `destroy_queue`, `key_rotation_queue`, and coordinates Stripe test-mode customer/subscription cleanup | ops | S | Med | SM-38, SM-40, SM-41, SM-42, SM-45 all merged and staged | manual + reviewed SQL |

**Sprint size total:** ~4 days solo (was 3 days; SM-46 adds the wipe script, review, and dry-run on staging).

### Watch-outs for Sprint 4

**SM-38 column drop must come after SM-39.** Obvious, but dangerous. If SM-38 lands first, `ops-context.ts:100` and `substrate-checkout.ts:71` still reference the column and will throw. Ship SM-39 a deploy cycle before SM-38. A migration that drops a column in use is a P0 incident.

**SM-42 `slug` becomes required.** This is a breaking change to any internal caller that was passing through without a slug. The slug-less branch was added in Sprint 1 as a back-compat convenience for the legacy routes. Once SM-40 deletes the legacy routes, there's no caller left. But check for internal services (metering workers, ops scripts, scheduled tasks) that might hit `billing/status` without a slug. Run:
```
grep -rn "billing/status" src/ scripts/ scheduled-tasks/
```
before merging SM-42. Every remaining hit must be updated to pass `?slug=`.

**Memory atom tombstoning requires knowing which atoms to tombstone.** Before SM-44, run `memory_search` for atoms referencing `max_substrates_1`, `singular_substrate`, or similar. Tombstone the specific atoms found; don't blanket-tombstone. Create a new atom `v1.event.multi_substrate_shipped_2026_XX_XX` with a `supersedes` edge to each tombstoned one.

**SM-45 CI grep is the anti-regression guard.** The check is trivial (`grep -r 'my-substrate' src/ && exit 1`), but it prevents any future engineer from reintroducing the legacy routes out of habit. Make it a hard CI fail, not a warning.

**SM-46 is destructive by design and runs once.** The wipe script must be idempotent-on-empty (running it twice is a no-op), must refuse to run outside the staging/launch environments (guard on `PM_ENV = 'staging' | 'launch'`, not `production`), and must log every affected row count to a provisioned audit file before COMMIT. Review path: SM-46's PR requires two reviewers — one for the SQL itself, one for the run procedure in the launch runbook. Do NOT include `TRUNCATE CASCADE` on the `substrates` table without first confirming that no new FK has been added to it since the plan was written (the cap trigger FK chain is the obvious risk). Run the script against a fresh throwaway staging database *at least once* before the real run — treat it like any other high-risk migration. After launch, keep the script in the repo as historical context; add a runtime guard so that re-running it post-launch requires a manual `--i-know-what-im-doing` flag.

---

## Cross-sprint dependencies

```
Sprint 1 ────────▶ Sprint 3 (proxy routes need slug-scoped compute routes)
    │
    └──▶ Sprint 2 ───▶ Sprint 3 (E2E test needs webhook rewrite shipped)
                 │
                 └──▶ Sprint 4 (cleanup can only start after webhook is stable in prod)
```

**Parallelisation opportunities (if staffing permits):**
- Sprint 1's SM-1→SM-3 lands day 1, unblocking SM-4→SM-9 in parallel across two engineers
- Sprint 2's SM-14 (migration) and SM-15 (trial column) can land together as a single migration PR with two atomic statements
- Sprint 3's SM-28 (dashboard list) and SM-31 (admin panel) are independent files and can parallelise
- Sprint 4's SM-40 (compute delete) and SM-41 (website delete) must ship in that order, one deploy apart

**Hard serialisation points:**
- Sprint 2's SM-14 migration **blocks** any Sprint 2 ticket that reads the new `substrate_id` FK column
- Sprint 3's SM-32 pin reversal **blocks** SM-33 docs updates (otherwise docs ship ahead of code)
- Sprint 4's SM-39 refactor **blocks** SM-38 column drop by exactly one deploy

---

## Test strategy summary

| Test layer | Ownership | Covers |
|---|---|---|
| **Unit** | `resolveOwnedSubstrate`, trial gate, tier resolution helpers, cap-trigger integration | Fast, high-coverage, gate every PR |
| **Integration** | All slug-scoped routes with 0/1/2+ substrate fixtures, cross-account IDOR attempts, Stripe webhook matrix | Runs in CI against Testcontainers Postgres |
| **Security regression** | `substrate-idor.test.ts` — brute-force slug guessing returns 404, rate-limit trips | Runs in CI, never allowed to skip |
| **Named regression** | `buying-solo-twice-creates-two-substrates.test.ts` | Name is the specification; failure means the original bug returned |
| **Component** | Dashboard single/list/empty states, pricing CTA states | Vitest + Testing Library |
| **E2E** | Buy twice, rotate key on one, verify the other's key unchanged | Playwright or manual staging walk-through |
| **Migration verification** | Schema-only verification for migration 064 under clean-slate (no rows to backfill or audit); post-migration schema dump diff against a known-good target | Manual DBA check before launch apply; see Pre-launch context for the assumption this relies on |
| **Staging Stripe replay** | Fire Stripe test-mode events against staging with flag on, via replay harness (not 48h soak) | Manual end-to-end run; pass gate is every event type in the matrix succeeding once cleanly |
| **Pre-launch wipe dry-run** | Run `scripts/pre-launch-reset.sql` against a throwaway staging DB with seeded fixtures | Manual; SM-46 gate |

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Clean-slate assumption silently breaks (a pilot customer is onboarded before launch) | Low | High (Migration 064 would then need the backfill that SM-14 removed) | Entity One owns the clean-slate invariant; before onboarding anyone pre-launch, re-introduce the backfill SQL from this file's git history and the pre-flight diagnostic query into SM-14 |
| Cap-exceeded refund path refunds the wrong amount | Med | High (real money) | Stripe test mode only until SM-24 passes; idempotency key on refund call |
| IDOR bug in a new slug-scoped route | Med | High (customer data exposure) | Single `resolveOwnedSubstrate` chokepoint; reviewer grep-check for raw `WHERE account_id = $1`; dedicated security test file |
| SM-46 pre-launch wipe script runs in the wrong environment | Low | **Critical** (destroys launched-customer data) | Environment guard on `PM_ENV`; two-reviewer rule on the PR; dry-run on throwaway staging before real run; post-launch, require `--i-know-what-im-doing` flag |
| Single-substrate UX regression in SM-27 | Med | Med (perceived launch quality) | Design-intent review against ADR-002 criteria (no pre-launch visual baseline under clean-slate); screenshot of final Sprint-3 view preserved in PR description as the post-launch regression baseline |
| `accounts.tier` drop fails because a forgotten caller exists | Low | Med (deploy-time error) | Grep-check in SM-39 before shipping; SM-38 lands one deploy after SM-39 |
| Trial gate bypassed via direct Stripe checkout URL reuse | Low | Med (trial farming) | Gate enforced in `session-route.ts` at URL creation time; old session URLs naturally expire |
| Pricing page hits 500 when fetching substrate list | Low | Low (cosmetic) | Try/catch with fallback to anonymous-visitor CTA copy |

---

## Ship gates

Each sprint has a single ship gate. Do not merge the sprint-end PR until the gate passes.

| Sprint | Gate |
|---|---|
| Sprint 1 | IDOR integration test suite green; `grep -n "403" src/api/substrates/*.ts` returns zero hits |
| Sprint 2 | `buying-solo-twice-creates-two-substrates.test.ts` green; cap-exceeded refund verified in Stripe test mode; 48h staging soak clean |
| Sprint 3 | Single-substrate fast path passes design-intent review against ADR-002 exit criteria (no visual diff baseline available under clean-slate — see SM-27 watch-out); E2E or manual walk of "buy twice → see two" green |
| Sprint 4 | CI `grep "my-substrate" src/` returns zero matches in both repos; `accounts.tier` column absent in schema dump; `scripts/pre-launch-reset.sql` reviewed, merged, and dry-run clean on staging |

---

## Things explicitly NOT in this plan (deferred to follow-up ADRs)

- **Refund-remainder on early cancel** — Stripe proration math is a full sprint on its own
- **Substrate display names / rename flow** — revisit after 3 months of multi-substrate launch if slug opacity becomes a real complaint
- **Unified cross-substrate billing summary** — Stripe customer portal already handles this; no reason to rebuild
- **Substrate transfer between accounts** — separate decision, separate ADR
- **Multi-substrate on a single Enterprise droplet** — deferred until a real prospect asks
- **Per-substrate API key scopes beyond today's rotate-key flow** — today's rotate-key already works per-substrate; no change needed

---

## Post-ship follow-up

After Sprint 4 exits and SM-46 has run against the launch database:

1. Record the shipped state in MMPM memory: `v1.event.multi_substrate_shipped_YYYY_MM_DD` with edges to the tombstoned singular-substrate atoms
2. Record the wipe event: `v1.event.pre_launch_db_wipe_YYYY_MM_DD` with the SM-46 commit SHA as evidence; `produced_by` the SM-46 task atom
3. Update `docs/future-work.md` to remove multi-substrate from the backlog
4. Write a short technical blog post (`technical-blog` skill) announcing multi-substrate support — pitched as a feature expansion, not a bug fix
5. Add a metric dashboard for `substrates_per_account` distribution; watch for the first accounts to hit 2+ substrates and verify their experience matches expectations
6. Open a follow-up ticket for the display-name ADR if any of the first 20 multi-substrate customers file a complaint about slug opacity
7. Re-seed Entity One's own account on the freshly wiped DB as the first real customer, using the production Stripe flow — this is the true end-to-end test of the entire plan
