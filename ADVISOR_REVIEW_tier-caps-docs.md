# Advisor Review — Tier Migration, Caps, Capacity & Sensitive-Atom Docs

**Date:** 2026-04-19
**Scope:** `parametric-memory-compute` + `mmpm-website`
**Mode:** Fast survey, code-grounded, no fixes applied
**Reviewer:** Claude (advisor pattern)

---

## TL;DR — the 60-second answer

| # | Question | Verdict |
|---|---|---|
| 1 | Atom / bootstrap cap updating on tier change? | **Yes — DB updates immediately, container restarts with new limits.** Caveat: caps live in the `substrates` row, not in `.env`. Enforcement is in `mmpm-service` (separate repo). |
| 2a | Where is the "migrate tier" UI? | **Backend API exists, no migrate button found in the mounted repos.** API is `POST /api/v1/substrates/:slug/upgrade`. The website has a **Team inquiry form** only — no self-serve upgrade flow. |
| 2b | Is PROFESSIONAL shared or dedicated? | **PROFESSIONAL is shared.** Only **TEAM** gets a dedicated droplet (`s-2vcpu-4gb`). Your observation ("I spun up Pro and no dedicated droplet") is the intended behaviour. |
| 3 | Substrate-capacity / droplet check / "email for more"? | Capacity gate exists (75% blocks, 65% reopens) and a waitlist endpoint exists. **No DO account-limit check** for dedicated droplets. Pricing page has a Team inquiry CTA, nothing for other tiers. |
| 4 | Multi-subscription on dashboard? | **API returns an array** of substrates (`GET /api/v1/substrates`). Whether the dashboard UI actually renders the list is not verifiable in the mounted repos — almost certainly yes on the site, but unconfirmed. |
| 5 | "Why we block sensitive atoms" docs? | **Not documented at all.** No page, no mention in the 422 error table. |
| 6 | 14-day trial survives tier change? | **Yes — trial is preserved on `subscriptions.update()`.** But trial is `indie`-only at checkout, and gated write-once per account (`has_used_trial`). |
| 7 | Does changing tier break existing memories? | **No delete / prune code exists on downgrade.** Atoms persist. Over-cap behaviour is decided in `mmpm-service`, not here. |

---

## 1. Atom cap & bootstrap cap updating on tier change

**Verdict:** Caps update immediately in the database, and the container is restarted with the new resource limits during the same tier-change job.

- Tier-change path: `src/services/tier-change-service.ts:214–284` (`handleSharedToShared`).
- Atomic `UPDATE substrates SET tier, max_atoms, max_bootstraps_month, max_storage_mb, container_memory_mb, container_cpu_cores … WHERE id = $1` at **tier-change-service.ts:228–247**.
- Container restart with new limits at **tier-change-service.ts:273**, delegated to `deps.restartContainerWithLimits()`.
- Per-tier constants live in **src/types/substrate-tier.ts:47–123** (SUBSTRATE_TIERS) and are duplicated in **CONTAINER_LIMITS:105–111**.

**Per-tier caps (today):**

| Tier | max_atoms | bootstraps/mo | storage |
|---|---|---|---|
| free | 200 | 30 | 10 MB |
| starter | 1,000 | 200 | 100 MB |
| indie (Solo) | 10,000 | 1,000 | 500 MB |
| pro (Professional) | 100,000 | 10,000 | 2 GB |
| team | 500,000 | 20,000 | 10 GB |

**Important nuance — caps are NOT in `.env`:**
The customer `.env` file (written at **substrate-provisioner.ts:784–798**) contains only resource limits: `SHARD_COUNT`, `HEAP_SIZE_MB`, `MEM_LIMIT`, `CPU_LIMIT`. The atom / bootstrap caps live only in the `substrates` table row (columns `max_atoms`, `max_bootstraps_month`, `max_storage_mb`). That means:

- Container restart refreshes **container-level resource limits** (memory/CPU) from `.env`.
- Atom & bootstrap caps are queried by `mmpm-service` at runtime from the DB.
- **Gap / thing to verify outside this review:** does `mmpm-service` cache tier limits in-process, and if so is there a cache-invalidation signal on upgrade? If there's no signal, a tier upgrade might appear "stuck" until the next cache expiry / restart. Worth confirming in the core repo.

**Recommendation:**
- Add a `(limits_version INT)` column bumped on every tier change, so `mmpm-service` can detect staleness without a restart.
- Write a test: upgrade a substrate mid-session, perform a bootstrap immediately, assert the new `maxTokens` budget is honoured. (Per your "tests for everything" preference.)

---

## 2. Where is the tier-migration UI, and what's the tier → substrate-shape mapping?

### 2a. UI

**Verdict:** Not present in either mounted repo. The backend API is ready:

- `GET /api/v1/substrates/:slug/upgrade/tiers` — list available target tiers (**upgrade-handlers.ts:165**).
- `GET /api/v1/substrates/:slug/upgrade/preview?tier=<target>` — proration preview (**upgrade-handlers.ts:270+**).
- `POST /api/v1/substrates/:slug/upgrade` — execute tier change (**upgrade-handlers.ts:485**).
- Under the hood: `stripe.subscriptions.update()` with `proration_behavior: 'create_prorations'` (**upgrade-handlers.ts:594–604**).

On the website side, the only tier-change UX I found is **`src/app/pricing/TeamInquiryForm.tsx:59`** ("Talk to us →"), which posts to `/api/team-inquiry` — i.e. a **contact-sales form for TEAM tier only**, not a self-serve migrate flow for an existing customer.

**Recommendation:**
- Ship a `Dashboard → Subscription → Change tier` page that calls the three existing endpoints. The skeleton can be small: tier list → preview (show proration + trial status) → confirm → poll `tier_change_queue` for completion.
- Include a clear banner when the customer is mid-trial: "Your 14-day trial continues — charge starts <date>".
- **Test:** integration test calling `upgrade/tiers` and `upgrade/preview` against Testcontainers DB, asserting that each tier returns sensible proration and that the preview call doesn't mutate state.

### 2b. Tier → substrate shape

**Verdict:** **PROFESSIONAL is SHARED. Only TEAM is DEDICATED.**

Source of truth: **src/types/substrate-tier.ts:47–123**
- Lines 94–107: `pro` → `hostingModel: 'shared'`
- Lines 108–122: `team` → `hostingModel: 'dedicated'`, `dedicatedDropletSize: 's-2vcpu-4gb'`

Your observation is confirmed — when you subscribed to PROFESSIONAL, no dedicated droplet was spun up because PROFESSIONAL runs as a Docker container on a shared host. Provisioning still "worked" because the shared-host flow is a different code path (new compose service, not a new droplet).

**Recommendation (UX):**
- The pricing page should make this explicit. Suggested copy under Professional: *"Shared infrastructure — same isolation and SLA, lower cost."* Under Team: *"Dedicated droplet — your memory runs alone."* Otherwise customers (like you just did) will wonder why no droplet appeared.

---

## 3. Substrate limits, droplet capacity check, "email us for more"

**Verdict:** Capacity gate exists at the shared-host level; waitlist endpoint exists; no DO account-limit check for dedicated droplets; pricing page only has a capacity CTA for the Team tier.

**What's in place:**
- Capacity gate: **src/services/capacity-service.ts:85–89** — block signups at 75% host utilisation, reopen at 65% (`GATE_THRESHOLD_PCT = 75`, `REOPEN_THRESHOLD_PCT = 65`).
- Waitlist endpoint: **src/api/capacity/routes.ts:134–165** — `POST /waitlist`, public, rate-limited 5/min, persists email + tier to a waitlist table.
- Waitlist drain: **capacity/routes.ts:254–273** — `notifyAndClearWaitlist()` sends notifications (email sender is injected, lives elsewhere).
- Provisioner capacity query: **substrate-provisioner.ts:533–543** — picks a shared host with `current_tenants < max_tenants`; throws `"No shared hosts available with capacity"` if none.

**What's missing:**
- **No DO account quota check** before trying to create a dedicated droplet for TEAM. The provisioner calls DO and lets it fail. With DigitalOcean's default droplet quotas, this is a real failure mode if you add a lot of Team customers at once.
- **No "email us for more capacity" on the pricing page** other than the Team-tier inquiry form. There's no CTA on Pro/Indie/Starter like *"Need higher limits? Talk to us →"*.
- On provision failure, I did not trace whether the Stripe subscription is refunded or left charged-but-dangling — worth tracing before the next launch.

**Recommendation:**
- Add a prominent "Need more? Contact us →" link next to every tier's cap on the pricing page, not just Team. Route it to the existing `/api/team-inquiry` (rename to `/api/capacity-inquiry`) with the tier pre-filled.
- Add a DO-quota pre-check worker that runs hourly, and a feature flag `TEAM_TIER_SOLD_OUT` that flips the Team button to the waitlist form when quota headroom < 3 droplets.
- **Test:** simulate "all hosts full" in an integration test, POST to checkout, assert the customer is added to the waitlist and receives a 409 (or 200 with waitlist flag) rather than getting charged.

---

## 4. Multi-subscription dashboard behaviour

**Verdict:** The API supports multiple substrates per account; the UI rendering is in a repo not mounted here, so confirmed on the backend side only.

- `GET /api/v1/substrates` at **src/api/substrates/routes.ts:222** returns **an array** (ordered: running → provisioning → read_only → suspended).
- Each row includes `hasActiveSubscription` (bool) + `renewsAt` — joined via `EXISTS` subquery, **routes.ts:228–241**.
- Code uses `.query()` (array) not `.find()` (single).

**What I can't tell from these repos:**
- Whether the dashboard frontend actually iterates this array and renders one card per substrate, or picks the first/most-recent and ignores the rest. The Next.js dashboard code isn't in either mounted folder.

**Recommendation:**
- Confirm in whichever repo renders `/dashboard` that multi-substrate is handled — add a visual test / screenshot if not already present.
- If the UI currently shows only one, add an explicit "All subscriptions" section.
- **Test:** seed an account with two subscriptions in the integration-test DB, hit the substrates endpoint, assert length = 2 and the ordering invariant holds.

---

## 5. "Why we block sensitive atoms, for your safety" — docs

**Verdict:** **Not documented anywhere.** The 422 behaviour is a real safety feature and customers will hit it; they deserve an explanation.

- Docs framework: Next.js 15 + `next-mdx-remote`, MDX files in `content/docs/`.
- Nav config: **src/config/docs-nav.ts**.
- Grep across `content/docs/` for `sensitive | secret | 422 | blocked | PII | redact | safety | password | api_key` — **1 match**, and it's an unrelated code sample (`mcp/claude.mdx:135`).
- Error reference page `content/docs/api/atoms.mdx:84–93` lists 413 and 429 — but **no 422 entry**.

**Suggested new page:** `content/docs/api/atom-safety.mdx`

Suggested outline:
- **Why we block sensitive atoms** — trust, liability, and the reality that LLM context windows leak. Memory is long-lived; one leaked credential lives forever.
- **What we detect** — patterns and entropy checks (be honest about limits so people don't rely on it as a DLP layer).
- **What the API returns** — HTTP 422 with an error shape: `{ error: "sensitive_content_rejected", pattern: "aws_access_key", field: "atom" }` — adjust to match what the core actually returns.
- **How to remediate** — sanitise upstream, reference credentials indirectly ("the staging DB password is in 1Password under …"), or use redaction before checkpoint.
- **What we do NOT store** — even transiently.
- **Related:** link to a privacy page.

**Nav entry to add (src/config/docs-nav.ts, under API Reference):**
```ts
{ title: "Atom safety & blocking", slug: "api/atom-safety" }
```

**Error-table edit to make in `content/docs/api/atoms.mdx`:**
Add a 422 row: `422 | sensitive_content_rejected | Atom payload matched a sensitive-content pattern. See /docs/api/atom-safety.`

**Deploy mechanism:** GitHub Actions on push to `main` (`.github/workflows/deploy.yml`) → Docker build → push → SSH to the production droplet → health check. ~2–3 min end-to-end. No manual step.

**Recommendation:**
- Write the page; ship the PR; include a link from the error-response section of `atoms.mdx`.
- **Test:** snapshot test on the rendered MDX (ensures it builds) + an e2e that sends a known-bad atom through the public API and asserts the 422 error code + error body.

---

## 6. 14-day free trial on tier change

**Verdict:** Trial is preserved across tier changes — Stripe-side. But there are two subtleties you should know about.

**Trial is set only on `indie` and only once per account.**
- `src/api/checkout/session-route.ts:153` — `trialEligible = wantsTrial && tier === 'indie'`.
- `src/api/checkout/session-route.ts:155` — `trialDays = trialEligible && !account.hasUsedTrial ? 14 : undefined`.
- `src/api/checkout/session-route.ts:165` — passes `trial_period_days: 14` into `subscription_data`.
- Write-once gate: **src/webhooks/substrate-stripe.ts:265–272** sets `accounts.has_used_trial = TRUE` on first `subscription.created` with status `trialing`. **Once burned, never granted again for that account.**

**Tier change during a trial:**
- `stripe.subscriptions.update()` (upgrade-handlers.ts:594–604) passes only `items` + `metadata.tier`. It does **not** touch `trial_end`.
- Net effect: Stripe preserves the trial window through a price change. Customer finishes the trial on the new tier, is billed at the new tier's price at trial end.
- **But:** the code path only sets the trial at *checkout* for `indie`. If a customer trials `indie`, upgrades mid-trial to `pro`, the trial continues — but if they ever cancel and try again later, `has_used_trial = TRUE` blocks them forever.

**Recommendation:**
- Surface the trial-end date in the tier-change preview. Proration + trial-end + "you'll be charged X on Y" is the three-line summary a customer needs.
- Consider: should trial apply to *any* tier's first subscription, not just `indie`? Today, a customer who starts on free or starter and then upgrades to pro never sees a trial at all. That may be intentional — flag for product decision.
- **Tests to add:** (a) tier change during trial preserves `trial_end`; (b) `has_used_trial` gate prevents second trial after cancel; (c) downgrade during trial keeps the trial.

---

## 7. "Does changing tier break existing memories?" — safety check

**Verdict:** **No, not from this codebase.** The tier-change service updates the cap numbers in the DB but does not touch atom data. If a Team customer with 400k atoms downgrades to Pro (cap 100k), atoms persist; whether subsequent writes are blocked is decided in `mmpm-service` — there's no cleanup, archive, or delete on the compute side.

- Searches for `downgrade`, `delete atom`, `trim`, `prune` in the tier-change handlers — no hits.
- The three transition handlers (`shared_to_shared`, `shared_to_dedicated`, `dedicated_to_shared`) update DB + restart/provision containers, nothing else.

**Recommendation:**
- Decide the desired behaviour and document it: block new writes (read-only over-cap), or soft-expire oldest atoms, or bill overage. Document it in `atom-safety.mdx` so customers know.
- **Test:** downgrade a substrate whose atom count exceeds the new cap; assert old atoms are still readable, new writes are blocked with a clear error.

---

## Gaps the fast survey could not close

- Dashboard UI repo is not mounted, so multi-sub rendering and migrate-button presence are unverified.
- `mmpm-service` / core server is not mounted, so cap-enforcement mechanics and cache semantics are out of scope.
- DigitalOcean account quota behaviour is not simulated anywhere in the compute repo.
- Stripe's internal behaviour on trial preservation during a price change is assumed (common behaviour) but not confirmed against Stripe API docs.

---

## Ranked recommendations

1. **Write the `atom-safety.mdx` page + 422 error-row edit.** Low effort, high customer trust. (Half a day.)
2. **Add capacity-inquiry CTAs on non-Team tiers.** One link per tier card, routes to existing inquiry endpoint. (1–2 hours.)
3. **Ship the self-serve tier-change UI on the dashboard.** APIs are ready; missing only the front end. Include trial-preservation banner. (1–2 days.)
4. **Decide and document over-cap behaviour.** Product decision first, then code. (Half day product + 1 day code + tests.)
5. **Add a `limits_version` signal** so `mmpm-service` can react to tier changes without a restart. (1 day plus coordination with core repo.)
6. **DO-quota pre-check for Team tier** before billing. (Half day.)
