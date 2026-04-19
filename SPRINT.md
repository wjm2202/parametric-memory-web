# Sprint 2026-W17 — Tier Migration, Capacity UX & Atom Safety Docs

## Sprint Metadata

| Field | Value |
|---|---|
| **Sprint ID** | `2026-W17` |
| **Sprint name** | Tier Migration, Capacity UX & Atom Safety Docs |
| **Start** | Monday 2026-04-20 |
| **End** | Friday 2026-04-24 (5 working days) |
| **Review / demo** | Monday 2026-04-27 |
| **Derived from** | `mmpm-website/ADVISOR_REVIEW_tier-caps-docs.md` (2026-04-19) |
| **Owner** | Entity One |
| **Repos touched** | `mmpm-website`, `parametric-memory-compute` |
| **Total items** | 3 (all P0) |

### Sprint goal

> Close the three most visible customer-facing gaps surfaced in the advisor review: customers should be able to understand why sensitive atoms are rejected, contact us for more capacity from any tier, and change their tier from the dashboard without filing a support ticket.

### Success criteria (sprint-level)

1. `/docs/api/atom-safety` is live on `parametric-memory.dev` and linked from the atoms API error table.
2. Every tier card on the pricing page has a functioning "Need more capacity? Talk to us →" CTA routing to the capacity-inquiry endpoint.
3. A logged-in customer can see their current tier on `/dashboard`, preview a proration for any target tier, and execute an upgrade or downgrade — all without leaving the UI.
4. Every sprint item ships with the tests listed in its test plan, green in CI.

### What's out of scope (explicit)

These items were identified in the advisor review but deferred to a future sprint — do not pull them in unless a P0 item finishes early:

- Over-cap policy decision (block writes vs soft-expire vs bill overage) — needs product decision first.
- `limits_version` signal for `mmpm-service` cache invalidation — requires coordination with the core repo.
- DO account-quota pre-check for Team tier.
- Pricing page copy clarifying shared vs dedicated infrastructure per tier.
- Multi-subscription dashboard rendering audit.

### Risks & mitigations (sprint-level)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Stripe webhook behaviour on mid-trial tier change differs from assumptions in advisor review | Medium | High | Item C's test plan includes a live-Stripe integration test covering mid-trial upgrade. Run against Stripe test mode before merge. |
| `mmpm-service` caches per-tier limits and won't reflect the new cap without a restart | Medium | Medium | Out-of-scope to fix this sprint (see `limits_version` in deferred). Mitigation for this sprint: Item C's UI shows a "limits update within ~60s" banner, and we document the caveat. |
| Docs deploy pipeline fails mid-sprint | Low | Low | Pipeline has a health check; roll back via previous Docker tag. Cicd-web-deploy skill handles this. |

### Dependencies (external to the sprint)

- **Stripe test mode** — need valid test keys for Item C integration tests.
- **Testcontainers Postgres** — existing infra, no action needed.
- **mmpm-service** — Item A links to safety behaviour that lives in the core repo; if the error shape is different from what we document, we update the docs, not the server.

### Meta — sprint plan conventions

- All items are **P0** this sprint. If we add work mid-sprint, it's **P1** and explicitly flagged.
- Sizes are rough t-shirts: **S** = <½ day, **M** = ½–1 day, **L** = 1–2 days.
- An item is **Ready** when its "Important to know before starting" section has been read and no open questions remain.
- An item is **Done** when all its test-plan checks pass in CI, the change is deployed to `parametric-memory.dev` (or the relevant prod surface), and the "Acceptance criteria" checklist is green.
- Git commits, pushes, tags, merges, file deletions, `.env` edits, and live-DB ops are **human-only** per ground rules. Claude produces the work and the commands; the human runs them.

---

## Item A — `/docs/api/atom-safety` docs page

| Field | Value |
|---|---|
| **ID** | `2026-W17-A` |
| **Title** | Ship the "Why we block sensitive atoms" docs page |
| **Priority** | P0 |
| **Size** | M (½ – 1 day) |
| **Owner** | TBD |
| **Status** | Ready |
| **Depends on** | Nothing |
| **Blocks** | Nothing (but Item C's UI may link to it) |
| **Repo(s)** | `mmpm-website` only |

### Important to know before starting

1. **Framework**: Next.js 15 + `next-mdx-remote`. Docs MDX files live in `content/docs/`. Navigation comes from `src/config/docs-nav.ts`.
2. **Current state of coverage**: grep across `content/docs/` for `sensitive | secret | 422 | blocked | PII` returned **one** unrelated match. The topic is genuinely absent, not lightly covered.
3. **Error table to update**: `content/docs/api/atoms.mdx:84–93` currently lists 413 and 429. Add a 422 row pointing to the new page.
4. **Source of truth for 422 semantics**: lives in the `mmpm-service` (core) repo, not mounted here. Before writing the error-shape example, ask someone with the core repo open to paste the actual `{ error, pattern, field }` shape so the docs match reality. If they don't match, update the docs — not the server.
5. **Build & deploy**: push to `main` triggers `.github/workflows/deploy.yml` → Docker build → SSH deploy to production droplet → health check. ~2–3 min end-to-end. No manual step. Use the `cicd-web-deploy` skill if you need to debug.
6. **Style guide**: short sentences, no marketing fluff, honest about what we detect and what we don't — customers should not treat this as a DLP layer.

### Affected files / suggested edits

- New file: `content/docs/api/atom-safety.mdx`
- Edit: `src/config/docs-nav.ts` — add `{ title: "Atom safety & blocking", slug: "api/atom-safety" }` under the API Reference section.
- Edit: `content/docs/api/atoms.mdx` — add a `422 | sensitive_content_rejected | …` row to the error table with a link to the new page.

### Suggested outline for the new page

1. Why we block sensitive atoms (trust + liability + the long-lived nature of memory).
2. What we detect (patterns, entropy — honest about limitations).
3. The API response (422 + error shape).
4. How to remediate (sanitise upstream; reference secrets indirectly; redact before checkpoint).
5. What we do not store — even transiently.
6. Related: link to privacy page.

### Acceptance criteria

- [ ] New MDX file exists and renders at `/docs/api/atom-safety` on prod.
- [ ] Nav config updated; the page appears in the sidebar under API Reference.
- [ ] `atoms.mdx` error table includes the 422 row linking to the new page.
- [ ] Page passes the snapshot test in the docs repo.
- [ ] An e2e test posts a known-bad atom through the public API and asserts the 422 response matches the documented shape.
- [ ] Deployed to `parametric-memory.dev` and health check green.

### Test plan

- **Unit / snapshot**: MDX snapshot test for `atom-safety.mdx` — ensures it builds and the rendered HTML matches baseline.
- **Unit**: nav-config test that asserts the new slug is present exactly once and is reachable from the sidebar tree.
- **Integration**: link-checker CI step (if one exists; add if not) — ensures the `atoms.mdx` → `atom-safety` link resolves.
- **E2E (against Stripe test mode not needed here)**: submit a payload containing an AWS key-looking string to the atoms endpoint; assert HTTP 422, assert body matches the documented shape. Can run against a disposable mmpm-service test instance, not prod.

### Rollout

1. Open PR; run CI.
2. Merge to `main` (human).
3. Watch `.github/workflows/deploy.yml` run; check `parametric-memory.dev/docs/api/atom-safety` loads.
4. Post the link in the team channel. Done.

---

## Item B — Capacity-inquiry CTAs on all tiers

| Field | Value |
|---|---|
| **ID** | `2026-W17-B` |
| **Title** | Extend "Need more capacity? Talk to us →" CTA to every pricing tier |
| **Priority** | P0 |
| **Size** | S (<½ day) |
| **Owner** | TBD |
| **Status** | Ready |
| **Depends on** | Nothing |
| **Blocks** | Nothing |
| **Repo(s)** | `mmpm-website` primarily; minor server route rename in same repo |

### Important to know before starting

1. **Current state**: only the Team tier has a contact form (`src/app/pricing/TeamInquiryForm.tsx:59` — "Talk to us →"). Pro, Indie, Starter, Free have no way to signal "I'm hitting limits, need more".
2. **Existing endpoint**: `/api/team-inquiry` receives the Team form posts. We'll generalise it to `/api/capacity-inquiry` accepting a `tier` field so the same backend handles every tier.
3. **Backend already has a waitlist**: `src/api/capacity/routes.ts:134–165` (`POST /waitlist`) in the compute repo. This sprint item is **NOT** wiring up to that — the waitlist is triggered when *shared host* capacity exceeds 75%. This sprint is about giving customers a way to say *"my tier's limits aren't enough, quote me something custom"*, which is a different signal.
4. **Do not delete** the existing `TeamInquiryForm.tsx` without confirming it is no longer referenced from any page other than `pricing` — file deletion is human-only anyway; hand the rm command over if the refactor produces dead code.
5. **Copy**: per the advisor review, pricing page should also make shared-vs-dedicated explicit for Pro vs Team. That copy change is **out of scope** for this sprint (deferred item) — flag it if you notice it while editing, don't fix it here.

### Affected files / suggested edits

- Rename/generalise: `src/app/pricing/TeamInquiryForm.tsx` → `CapacityInquiryForm.tsx` (component accepts a `tier` prop).
- Edit: `src/app/pricing/page.tsx` — render the form, pre-filled with `tier`, from every tier card's footer.
- Rename route: `/api/team-inquiry` → `/api/capacity-inquiry`. Keep `/api/team-inquiry` as a thin redirect for 30 days to avoid breaking bookmarks.
- Update email template (wherever the inquiry is sent) to include `tier` in the subject line.

### Acceptance criteria

- [ ] Every tier card on `/pricing` has a visible "Need more capacity? Talk to us →" link.
- [ ] Clicking it opens the inquiry form with the correct tier pre-filled and non-editable.
- [ ] Form submission hits `/api/capacity-inquiry` successfully, returns 200, and delivers an email containing the tier + customer-provided fields.
- [ ] Old `/api/team-inquiry` endpoint still works (returns 200) and forwards to the new endpoint — log a deprecation warning.
- [ ] No visual regression on the pricing page (screenshot diff).

### Test plan

- **Unit**: component test for `CapacityInquiryForm` — renders with each tier prop, validates required fields, disables the tier field when pre-filled.
- **Integration**: API test — POST to `/api/capacity-inquiry` with each valid tier, assert 200 + downstream side effect (mock email sender asserts call). POST with invalid tier → 400.
- **Integration (backcompat)**: POST to `/api/team-inquiry` asserts 200 and identical downstream effect to `/api/capacity-inquiry?tier=team`.
- **E2E (Playwright or similar)**: on the pricing page, click each tier's capacity CTA, fill the form, submit, assert success toast.
- **Visual**: screenshot diff of `/pricing` before/after to catch layout breakage.

### Rollout

1. Open PR; run CI.
2. Merge (human); auto-deploy.
3. Manual smoke test: open `/pricing`, try the form from each tier card, confirm email arrives.
4. Watch inbox for the first week — expect an uptick in Pro/Indie inquiries.

---

## Item C — Self-serve tier change on the dashboard

| Field | Value |
|---|---|
| **ID** | `2026-W17-C` |
| **Title** | Dashboard UI for tier preview + upgrade/downgrade |
| **Priority** | P0 |
| **Size** | L (1–2 days) |
| **Owner** | TBD |
| **Status** | Ready — but has the most pre-reading of the three items |
| **Depends on** | Backend APIs (already shipped, see below) |
| **Blocks** | Customers currently emailing support to change tier |
| **Repo(s)** | Primarily `mmpm-website` (the dashboard Next.js app). No compute repo changes expected. |

### Important to know before starting

1. **Backend is ready — do not re-invent it**. Three endpoints already exist in `parametric-memory-compute`:
   - `GET /api/v1/substrates/:slug/upgrade/tiers` (`src/api/.../upgrade-handlers.ts:165`) → available target tiers + prices.
   - `GET /api/v1/substrates/:slug/upgrade/preview?tier=<target>` (`upgrade-handlers.ts:270+`) → proration preview + what the trial does.
   - `POST /api/v1/substrates/:slug/upgrade` (`upgrade-handlers.ts:485`) → executes the change; calls `stripe.subscriptions.update` with `proration_behavior: 'create_prorations'` at `upgrade-handlers.ts:594–604`.
2. **Tier → substrate shape** (confirmed by advisor review, and the reason nothing visible happened when you tested Pro):
   - free, starter, indie, **pro** → **shared** Docker container.
   - **team** → **dedicated** `s-2vcpu-4gb` droplet.
   - The UI must show this distinction clearly — e.g. a "dedicated infrastructure" badge on Team — so customers know why the upgrade to Team takes longer to provision than shared-tier changes.
3. **Trial semantics are non-obvious** and need surfacing in the preview:
   - 14-day trial applies to **`indie` only** at initial checkout.
   - Write-once per account: `accounts.has_used_trial` set on `subscription.created` with status=trialing. Once burned, never re-granted.
   - Tier change during a trial **preserves** `trial_end` — Stripe doesn't reset it on price change.
   - The preview endpoint should already return whether the customer is mid-trial and when the trial ends. If it doesn't, that's a backend gap to file separately (but the UI can compute from `renewsAt` + subscription status).
4. **Cap update latency caveat**: when tier changes, the `substrates` row gets new `max_atoms` / `max_bootstraps_month` immediately and the container restarts. But `mmpm-service` may cache tier limits briefly — show a banner: *"Your new limits will be active within ~60 seconds."* This is a known gap; the real fix (`limits_version` signal) is deferred.
5. **Multi-subscription safety**: `GET /api/v1/substrates` returns an **array** (see `src/api/substrates/routes.ts:222`, ordered running→provisioning→read_only→suspended). If the dashboard today only shows one, this sprint does **not** fix that — but don't make it worse. The tier-change UI must be scoped to a specific substrate slug, not a global "my subscription".
6. **Shared-to-dedicated transitions take longer** — the tier-change worker provisions a new dedicated droplet for Team. Surface the expected wait time in the preview ("Upgrading to Team spins up a dedicated droplet; allow up to 10 minutes").
7. **Crash recovery** exists in `src/workers/tier-change-worker.ts:37–42` (15-min timeout on a hung tier change). The UI should poll substrate status after POST, and if the change is still `pending` after 10 minutes, show *"Still working on it — we'll email you when it's ready. You can leave this page."*

### Affected files / suggested edits

- New: `src/app/dashboard/subscription/page.tsx` (or equivalent route) — current tier card, list of target tiers, CTA to change.
- New: `src/app/dashboard/subscription/change/page.tsx` — preview flow (select target → call preview endpoint → show proration + trial status + provisioning note → confirm → POST).
- New: API proxy handlers under `src/app/api/substrates/[slug]/upgrade/*` to forward authenticated requests to the compute backend.
- New: polling hook for tier-change status after POST.
- Shared UI: `ProrationSummary`, `TrialBanner`, `DedicatedInfraBadge` components.

### Acceptance criteria

- [ ] Authenticated customer can view their current tier + limits on `/dashboard/subscription`.
- [ ] Can click "Change tier", see the list of available target tiers, and preview the proration + trial status for any of them without committing.
- [ ] Preview page surfaces: new price, proration amount, trial-end date if applicable, provisioning note (especially for Team), limits-update caveat.
- [ ] Confirm → POST → UI polls status and shows a success state once the tier change completes (or the 10-min "we'll email you" fallback).
- [ ] On failure, a clear error with a path to capacity-inquiry (links to Item B).
- [ ] Change scoped to a single substrate slug; multi-substrate accounts see a substrate picker.
- [ ] No destructive action is possible without an explicit "Yes, change my tier" confirmation modal.

### Test plan

- **Unit**: components render with representative preview payloads (upgrade, downgrade, trial-active, dedicated-target, insufficient-funds).
- **Unit**: polling hook — simulate success, pending (keep polling), timeout (show fallback).
- **Integration**: mocked backend — preview endpoint variants (all 5 tiers, mid-trial, not-trial, shared→dedicated, dedicated→shared); confirm the UI state is correct for each.
- **Integration** (`parametric-memory-compute`, Testcontainers): a scenario test that preloads an account at `indie` mid-trial, POSTs upgrade to `pro`, asserts:
  - `substrates.max_atoms` = 100000 immediately after,
  - `stripe.subscriptions.update` called with correct proration_behavior,
  - `accounts.has_used_trial` unchanged,
  - `trial_end` on the subscription preserved.
- **Integration** (Stripe test mode): actual upgrade of a test subscription, assert webhook received, DB row updated, Stripe subscription reflects new price.
- **E2E (Playwright)**: log in as seeded account, navigate to dashboard → subscription → change → pro → preview → confirm → see success state within 30s.
- **Regression**: snapshot of the current dashboard to catch unintended changes elsewhere.

### Rollout

1. Feature-flag the new route so it can ship dark, then opened to internal accounts first.
2. Open PR; CI green (unit + integration).
3. Merge; auto-deploy.
4. Manually exercise upgrade & downgrade against a Stripe-test test account.
5. Flip the feature flag for 10% of customers; monitor 24h.
6. 100% rollout; remove flag next sprint.

---

## Daily rhythm

- Standup (async or sync) each morning covering: done yesterday / doing today / blocked.
- Friday: half-day buffer + sprint review. Anything not green by end-of-day Friday rolls to next sprint with an explicit "why".
- No scope creep from deferred items — if you find yourself fixing shared-vs-dedicated pricing copy while in Item B, stop, note it, move on.
