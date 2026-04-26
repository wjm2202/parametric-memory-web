# Sprint: Substrate List Redesign

**Status:** Planning → awaiting approval
**Created:** 2026-04-12
**Memory task:** `v1.task.website_substrate_list_redesign`
**Decision memo atoms:** `website_dashboard_vs_admin_roles`, `website_decommissioned_detail_policy`, `website_legacy_proxy_cutover`, `website_multi_substrate_scope`

---

## Why

Compute already exposes a proper multi-substrate contract at `/api/v1/substrates/*` (session-auth, slug-scoped, rate-limited 60/60s). The mmpm-website still consumes the legacy single-substrate BFFs (`/api/v1/my-substrate`, `/api/compute/instances`) and assumes one substrate per account throughout the UI. Every new substrate feature — reactivate, usage, per-slug billing, key rotation — is being built into the new contract and has to be patched back into the old single-substrate dashboard afterwards. This sprint cuts the website over to the new contract in one PR and rebuilds `/dashboard` and `/admin` around the list-then-detail model.

## Locked decisions

1. **Route model.** `/dashboard` is a read-only glance grid of all substrates with live badges on active ones. `/admin` is an administrative list of all substrates grouped by active vs decommissioned. Both navigate to `/admin/[slug]` on card click. `/admin/[slug]` holds every management action. Dashboard has no action buttons, anywhere.
2. **Decommissioned detail.** `/admin/[slug]` for a substrate in `deprovisioned | destroyed | provision_failed` is read-only (final usage snapshot, timestamps, tier at decommission, MCP endpoint shown greyed). The single action exposed is **Reactivate**, visible only when `status=deprovisioned` AND `grace_period_ends_at > now` AND the Stripe subscription is still reactivatable. No data export, no hard purge.
3. **Legacy cutover.** One PR. Delete `/api/my-substrate/*`, `/api/compute/[...path]`, `/api/substrate/[...path]`, `/api/checkout` Next.js proxies. Replace with new `/api/substrates/*` and `/api/billing/*` proxies that forward to `/api/v1/substrates/*` and `/api/v1/billing/*` on compute. Compute's legacy shims stay for other clients but the website stops using them.
4. **Multi-substrate scope.** List UI correctly handles N substrates but empty states and copy are optimized for 0-or-1 (current reality). No filter chips, search, or pagination yet.

---

## Target route map

| Route | Purpose | Auth | Data source |
|-------|---------|------|-------------|
| `/dashboard` | Read-only glance grid, all substrates | session cookie | `GET /api/substrates` |
| `/admin` | Admin list, grouped active vs decommissioned | session cookie | `GET /api/substrates` |
| `/admin/[slug]` | Per-substrate detail + management | session cookie | `GET /api/substrates/[slug]`, `GET /api/substrates/[slug]/usage`, `GET /api/billing/status?slug=[slug]` |
| `/admin/security` | Account-level security settings (unchanged) | session cookie | `GET /api/auth/me` |

## Compute endpoints consumed (new contract)

| Endpoint | Used by | Notes |
|---|---|---|
| `GET /api/v1/substrates` | /dashboard, /admin | list owned by account — includes decommissioned |
| `GET /api/v1/substrates/:slug` | /admin/[slug] | single substrate detail |
| `GET /api/v1/substrates/:slug/usage` | /admin/[slug] | atoms/bootstraps/storage used vs limits |
| `POST /api/v1/substrates/:slug/rotate-key` | /admin/[slug] | start rotation job |
| `GET /api/v1/substrates/:slug/key-rotation/status` | /admin/[slug] | poll job (2s interval, 7 phases) |
| `POST /api/v1/substrates/:slug/claim-key` | /admin/[slug] | one-shot reveal |
| `POST /api/v1/substrates/:slug/cancel` | /admin/[slug] | Stripe period-end cancel |
| `POST /api/v1/substrates/:slug/reactivate` | /admin/[slug] | clears `cancel_at_period_end`; also used for grace-window revive |
| `POST /api/v1/substrates/:slug/deprovision` | /admin/[slug] | soft delete |
| `GET /api/v1/billing/status?slug=X` | /admin/[slug] | substrate-scoped billing snapshot |
| `POST /api/v1/billing/substrate-checkout` | /admin/[slug] | tier upgrade |
| `POST /api/v1/billing/portal` | /admin/[slug] | Stripe billing portal |
| `GET /api/auth/me` | all pages (SSR) | session validation |

## Next.js proxy routes to create

| File | Forwards to | Methods |
|---|---|---|
| `src/app/api/substrates/route.ts` | `{COMPUTE}/api/v1/substrates` | GET |
| `src/app/api/substrates/[slug]/route.ts` | `{COMPUTE}/api/v1/substrates/:slug` | GET |
| `src/app/api/substrates/[slug]/usage/route.ts` | `{COMPUTE}/api/v1/substrates/:slug/usage` | GET |
| `src/app/api/substrates/[slug]/rotate-key/route.ts` | `{COMPUTE}/api/v1/substrates/:slug/rotate-key` | POST |
| `src/app/api/substrates/[slug]/key-rotation/status/route.ts` | `{COMPUTE}/api/v1/substrates/:slug/key-rotation/status` | GET |
| `src/app/api/substrates/[slug]/claim-key/route.ts` | `{COMPUTE}/api/v1/substrates/:slug/claim-key` | POST |
| `src/app/api/substrates/[slug]/cancel/route.ts` | `{COMPUTE}/api/v1/substrates/:slug/cancel` | POST |
| `src/app/api/substrates/[slug]/reactivate/route.ts` | `{COMPUTE}/api/v1/substrates/:slug/reactivate` | POST |
| `src/app/api/substrates/[slug]/deprovision/route.ts` | `{COMPUTE}/api/v1/substrates/:slug/deprovision` | POST |
| `src/app/api/billing/substrate-checkout/route.ts` | `{COMPUTE}/api/v1/billing/substrate-checkout` | POST |
| `src/app/api/billing/status/route.ts` (already exists — update to accept `?slug=`) | `{COMPUTE}/api/v1/billing/status` | GET |
| `src/app/api/billing/portal/route.ts` (already exists — leave) | `{COMPUTE}/api/v1/billing/portal` | POST |

Every proxy forwards the `mmpm_session` cookie as a Bearer token and translates non-2xx into a structured error body. Shared helper `src/lib/computeProxy.ts` is already present — extend it if anything is missing rather than duplicating.

## Proxy routes to delete

- `src/app/api/my-substrate/` (all handlers)
- `src/app/api/compute/[...path]/route.ts`
- `src/app/api/substrate/[...path]/route.ts`
- `src/app/api/checkout/` if used only for tier upgrade (confirm during execution)

## Component extraction

All reusable pieces currently live inline in `DashboardClient.tsx` (1,561 lines) and `AdminClient.tsx`. Extract to `src/components/substrate/`:

| Component | Used by | Responsibility |
|---|---|---|
| `<SubstrateCard>` | /dashboard, /admin | Slug, tier pill, status chip, health badges (active only), https badge, subtle click affordance |
| `<SubstrateList>` | /dashboard, /admin | Grid wrapper + empty state + loading skeleton + group headers (admin only) |
| `<HealthBadges>` | SubstrateCard, /admin/[slug] | Droplet / substrate-reachable / HTTPS — three pill badges |
| `<StatusBadge>` | Everywhere | Color-coded chip off the status enum |
| `<TierPill>` | Everywhere | Tier label from `@/config/tiers` |
| `<MCPServerBlock>` | /admin/[slug] | MCP endpoint URL + copy, Claude Desktop config JSON + copy, greyed variant for decommissioned |
| `<UsageBars>` | /admin/[slug] | Atoms, bootstraps/month, storage — colored per utilization |
| `<KeyRotationPanel>` | /admin/[slug] | Rotation trigger, 7-phase stepper, claim-key modal, new-key reveal |
| `<TierUpgradeSection>` | /admin/[slug] | Upgrade pills + consent modal + Stripe checkout redirect |
| `<BillingWidget>` | /admin/[slug] | Payment status snapshot from `GET /api/billing/status?slug=` |
| `<DangerZone>` | /admin/[slug] | Cancel subscription, Reactivate, Deprovision — each with confirm modal |
| `<DecommissionedBanner>` | /admin/[slug] | Amber banner when status is decommissioned, showing dates + grace window + reactivate button if eligible |

Nothing here is new functionality — it's a cleanup pass. Each component gets a single responsibility and a unit test.

## Page composition

### /dashboard
```
<PageShell>
  <PageHeader title="Your substrates" />
  <SubstrateList variant="glance">
    {substrates.map(s => (
      <Link href={`/admin/${s.slug}`}>
        <SubstrateCard substrate={s} showActions={false} />
      </Link>
    ))}
  </SubstrateList>
</PageShell>
```

### /admin
```
<PageShell>
  <PageHeader title="Manage substrates" action={<NewSubstrateLink />} />
  <Section title="Active">
    <SubstrateList variant="admin">
      {active.map(s => <Link .../>)}
    </SubstrateList>
  </Section>
  <Section title="Decommissioned" collapsed={decommissioned.length === 0}>
    <SubstrateList variant="admin">
      {decommissioned.map(s => <Link .../>)}
    </SubstrateList>
  </Section>
</PageShell>
```

### /admin/[slug]
```
<PageShell>
  <BreadCrumb items={[{label:"Admin", href:"/admin"}, {label:slug}]} />
  {isDecommissioned && <DecommissionedBanner substrate={s} />}
  <HeroBlock>
    <TierPill /> <StatusBadge /> <HealthBadges />
    {active && <BillingWidget />}
  </HeroBlock>
  {active && <MCPServerBlock substrate={s} />}
  {active && <UsageBars usage={usage} />}
  {active && <KeyRotationPanel substrate={s} />}
  {active && <TierUpgradeSection substrate={s} />}
  <DangerZone substrate={s} />  {/* renders different buttons by status */}
</PageShell>
```

## Migration order (within the PR)

1. Extract components one at a time, each with its unit test, all still powered by the legacy BFFs. Verify current dashboard/admin still work after each extraction.
2. Add new proxy routes under `src/app/api/substrates/*` and `src/app/api/billing/substrate-checkout`.
3. Add the three new pages (`/dashboard` rewrite, `/admin` rewrite, new `/admin/[slug]`) wired to the new proxies.
4. Flip all existing references: remove inline logic from `DashboardClient.tsx` and `AdminClient.tsx`.
5. Delete legacy proxies. Run full test suite.
6. `gitnexus_detect_changes` pre-commit; commit; `npx gitnexus analyze` post-merge.

## Test plan

Per the repo convention and user preference ("we write tests for everything we make"):

**Unit (vitest + @testing-library/react)** — one file per component in `src/components/substrate/__tests__/`:
- `SubstrateCard.test.tsx` — renders slug, tier, status chip, health badges only when active, renders as a link
- `StatusBadge.test.tsx` — every enum value produces a recognisable label and color class
- `HealthBadges.test.tsx` — three pills, handles partial health data, handles unknown gracefully
- `MCPServerBlock.test.tsx` — URL copy, Claude Desktop JSON copy, greyed variant when `disabled`
- `UsageBars.test.tsx` — percentage math, >80% color flip, missing limits → unavailable state
- `KeyRotationPanel.test.tsx` — full state machine (idle → rotating → pending → ready → claimed) with mocked fetch
- `TierUpgradeSection.test.tsx` — disabled when at max tier, opens consent modal, redirects to Stripe session url
- `DangerZone.test.tsx` — buttons match substrate status (active shows cancel+deprovision, decommissioned+in-grace shows reactivate, decommissioned+out-of-grace shows nothing)
- `DecommissionedBanner.test.tsx` — dates rendered, reactivate shown/hidden based on `grace_period_ends_at`

**Proxy routes (vitest, mocked fetch)** — one per new proxy in `src/app/api/substrates/__tests__/`:
- Forwards the session cookie as Bearer
- Passes through 2xx JSON untouched
- Maps 4xx/5xx to a structured error body
- Query-param and path-param safety (URL-encoded slug)

**End-to-end (Playwright)** — `tests/e2e/substrate-list-redesign.spec.ts`:
1. Log in with magic link (existing fixture)
2. Land on `/dashboard` → see a card → click it → land on `/admin/[slug]`
3. On detail page: rotate key → poll succeeds → claim modal → new key shown
4. On detail page: deprovision → redirected back → card now in decommissioned group on `/admin`
5. Reactivate (if grace-window fixture is seeded) → card returns to active group on next visit

**Regression pass** — run the existing dashboard Playwright specs against the new `/admin/[slug]` page, adjusting selectors. Anything that relied on a hard-coded single-substrate assumption gets deleted rather than ported.

## Risk & rollback

| Risk | Mitigation |
|---|---|
| Legacy proxies still referenced somewhere hidden | `gitnexus_impact` on each deleted file before removal; `rg -l my-substrate\|api/compute\|/api/substrate` after the refactor, must return zero |
| New proxies mis-forward auth | Proxy unit tests cover header mapping; E2E test actually hits compute dev instance |
| `/api/v1/my-substrate` GET is still the legacy BFF and is NOT shimmed | We don't use it — verified by proxy audit — but call it out so compute-side team doesn't break us by renaming |
| Component extraction changes visible styling | Each extraction is commit-scoped; visual diff screenshot before/after |
| Multi-substrate list with 0 entries looks broken | Explicit empty state: "You don't have any substrates yet. [Create one]" linking to `/signup` or `/pricing` |
| Key rotation 7-phase state machine has subtle bugs when reused | Full state machine unit test before extraction lands |

## Out of scope (deferred)

- Filter chips, search, pagination on list views
- Data export for decommissioned substrates
- Hard-purge button
- Per-substrate security settings at `/admin/[slug]/security`
- Changes to `/admin/security` (stays as account-level)
- Any changes to compute itself — this sprint is website-only

## Estimated effort

| Phase | Work | Rough tokens | Tier |
|---|---|---|---|
| Component extraction (13 components + tests) | ~60K | sonnet |
| New proxy routes + tests | ~20K | sonnet |
| Page composition (3 pages) | ~30K | sonnet |
| Legacy deletion + full test pass | ~15K | haiku |
| Documentation + release note entry | ~5K | haiku |
| **Total** | **~130K** | mostly sonnet |

Fits in a single session with checkpointing at 70%. Opus not required.

## Approval

This doc is the agreement. Changes to the decisions above need a new round of AskUserQuestion, not a drive-by edit.
