# Critical findings consolidated — from 4 parallel advisor agents (2026-05-03)

This file is the synthesis source the final report draws from. Each finding cites the source advisor (4a docs / 4b stripe-tiers-pricing / 4c dashboard-vs-docs / 4d seo-aeo) and at least one file path/line.

---

## 🔴 BLOCKERS — material customer harm or revenue loss

### B1. 14-day free trial promised in actions.json — does not exist (4b)
- `public/.well-known/actions.json` `agentNotes.freeTrial`: "All paid plans include a 14-day free trial. Card required at signup; no charge until day 15."
- `PricingCTA.tsx` L43: `/** @deprecated Trial period is not configured in Stripe — do not use. */`
- Stripe verification: every Stripe price returned `trial_period_days: null`.
- Reality: Starter has a 30-day money-back guarantee only.
- **Customer impact:** AI agent reads manifest, tells customer "you have 14 free days" → customer is charged on day 1.
- **Fix:** Remove `freeTrial` from actions.json or replace with `moneyBackGuarantee` for Starter.

### B2. Team CTA goes to inquiry form, not Stripe Checkout (4b)
- `tiers.ts` L182+: `team.publiclySold = true`, `team.cta = "Get Team"` — implies self-serve.
- `pricing/page.tsx` L261: renders `<CapacityInquiryForm tier="team" variant="primary" />` instead of `PricingCTA`.
- Stripe Team product+price exist & active but no active subs in sample.
- **Customer impact:** Customer who wants to buy Team cannot self-serve; submits a form. Branch logic that checks `tier.publiclySold` reaches the wrong conclusion.
- **Fix:** Either set `publiclySold: false` for team OR wire Team card to PricingCTA like other tiers.

### B3. Grace period: dashboard says 90 days, docs say 30 days (4c, N2)
- `DashboardClient.tsx` L137, L234: "Memory is preserved for 90 days"
- `cancel.mdx` L10/L22/L24, `customer-lifecycle.mdx` L30, `self-service-guide.mdx` L166: "30-day grace period"
- **Customer impact:** Material data-loss risk. Customer sees 90-day badge, defers export, finds data gone after 30 days.
- **Fix:** Identify the source of truth (compute backend) and align both surfaces.

### B4. Team multi-substrate promise vs maxSubstrates: 1 (4a, 4c, N3)
- `plans-and-trial.mdx` L51: Team gets "up to 5 independent memory substrates"
- `tiers.ts` L198: `maxSubstrates: 1` for Team
- `tiers.test.ts` L21–23: CI test asserts every canonical tier has `maxSubstrates === 1`
- `limits.mdx` L19, `self-service-guide.mdx` L104: 1 substrate
- **Customer impact:** Team tier sold with promise platform cannot fulfil.
- **Fix:** Remove the "5 substrates" claim from plans-and-trial.mdx; OR if multi-substrate is shipping soon, raise the cap and update the CI test.

### B5. Key rotation: docs say "contact support", UI is self-service (4c, R1)
- `your-instance.mdx` L61: "Self-service key rotation is not yet available in the Dashboard. Contact support."
- `authentication.mdx` L38: claims rotation IS dashboard self-service.
- `AdminClient.tsx` ~L934: `admin-rotate-key` button → POST `/api/substrates/:slug/rotate-key` — self-service IS live.
- **Customer impact:** Paying customers misdirected to support for something they can do themselves; support cost; perception of broken product.
- **Fix:** Update your-instance.mdx L61 to describe the in-dashboard rotation flow (button location, retry behaviour).

### B6. Spend Cap dashboard UI does not exist (4c, R5)
- `spend-caps.mdx` L53–63 + `self-service-guide.mdx` L133: "Dashboard → Billing → Spend Caps → Set Cap" form
- Reality: zero spend-cap UI in DashboardClient.tsx or AdminClient.tsx.
- Stripe portal does not expose internal compute caps either.
- **Customer impact:** An entire doc section describes a UI that doesn't exist.
- **Fix:** Either build the spend-cap UI OR remove/rewrite the doc section to reflect "platform ceilings only; contact support for custom caps."

### B7. Upgrade flow docs are wrong — not via Stripe Portal anymore (4c, R2)
- `upgrade.mdx` L14–18, `downgrade.mdx` L14–18, `self-service-guide.mdx` L82: 5-step "Dashboard → Billing → Manage Subscription" → Stripe Portal upgrade.
- Reality: upgrade is in-dashboard via `ChangePlanButton` → `ChangePlanSheet` → `ConfirmUpgradeDialog` → POST `/api/billing/upgrade`.
- **Customer impact:** Every upgrade instruction is wrong — customer follows portal flow, finds no upgrade option there.
- **Fix:** Rewrite upgrade.mdx and downgrade.mdx around the new in-dashboard flow.

### B8. Cancel flow docs describe portal path; admin has native modal (4c, R3, N5)
- `cancel.mdx` L14–18: 5 steps via Stripe Portal, "choose immediate or at period-end"
- Reality: `AdminClient.tsx` ~L1003 has native `CancelModal` → POST `/api/substrates/:slug/cancel` (period-end only, no immediate option).
- `cancel/route.ts` L6: confirms `cancel_at_period_end`.
- **Customer impact:** Customer can't find the "cancel immediately" option that docs promise; alternate native flow is undocumented.
- **Fix:** Document the in-admin cancel flow; remove "immediate cancel" promise unless feature is added.

---

## 🟠 HIGH — high-friction or high-confusion

### H1. Tier ID `indie` / display "Solo" / Stripe "Solo" — triple split (4b)
- DB & compute use `indie`; UI shows "Solo"; Stripe product is "Parametric Memory — Solo" with no `metadata.tier_id`.
- Any join from `tier_id='indie'` against Stripe metadata silently fails.
- **Fix (low risk):** Add `metadata: { tier_id: "indie" }` to Stripe product `prod_UDWIoYrBd178SU`.

### H2. Free tier name: Stripe "Free" vs tiers.ts "Basic" (4b)
- Stripe product `prod_UDWIPBM9Hws5Jh` named "Parametric Memory — Free"; tiers.ts `name: "Basic"`.
- Webhook handlers mapping product name → tier may fail.
- **Fix:** Rename Stripe product to "Parametric Memory — Basic".

### H3. Nine orphaned legacy products active in Stripe (4b)
- `prod_UAnf*` family (old Starter $9, Solo $29, Team $79, Enterprise $299/$499) still active.
- Names collide with current products at different prices ("Solo" exists at both $9 and $29).
- Plus 9 `myproduct` Stripe CLI test artefacts.
- **Customer impact:** None directly, but MRR reports double-count, billing reconciliation scripts misclassify.
- **Fix:** Archive the legacy `prod_UAnf*` products and `myproduct` artefacts in Stripe.

### H4. Downgrades not implemented in dashboard (4c, R4)
- `upgrade-options/route.ts` L9: "Only strictly higher tiers are returned in Phase 1 — downgrades are deferred."
- `downgrade.mdx` describes "Change Plan → choose lower tier" — no such option appears.
- **Fix:** Either ship downgrade UI OR update docs to point to Stripe Portal as the only downgrade path.

### H5. publiclySold deployment mismatch — shared promised, dedicated provisioned (4a, 4c, 4d)
- `tiers.ts` L66/86: Starter & Solo `deployment: "shared"`.
- `tiers.ts` L54 comment: "compute provisions dedicated droplets only — shared cluster support is the gating work."
- llms.txt + actions.json claim shared.
- **Customer impact:** Today: better than promised (everyone gets dedicated). Future: silent breach if shared cluster ships.
- **Fix:** Either ship shared cluster support OR update marketing copy + tiers.ts to "dedicated" for all tiers.

### H6. Claim Key navigation path fabricated (4c, R6, N6)
- `your-instance.mdx` L32–37: "Dashboard → Settings → API Key → Click Claim Key"
- Reality: Claim Key lives in `/admin?slug=<slug>` MCP Connection section. No `/dashboard/settings` exists.
- **Fix:** Update doc to "Dashboard → click your substrate card → MCP Connection → Claim Key".

### H7. "My Substrate" usage stats not on dashboard (4c, R7)
- `your-instance.mdx` L23–29: claims dashboard shows Atoms used, Bootstraps this month
- Reality: dashboard shows substrate cards (slug, tier badge, status, renewal). Usage counts are on `/admin?slug=...`, not `/dashboard`.
- **Fix:** Either add usage counts to dashboard OR rewrite doc to point to admin page.

### H8. In-dashboard upgrade flow undocumented (4c, D4)
- `ChangePlanSheet`, `ConfirmUpgradeDialog` with proration preview — entirely absent from docs.
- **Fix:** Document the new in-dashboard upgrade flow.

### H9. Reactivate button (cancels pending cancel-at-period-end) undocumented (4c, D2)
- `AdminClient.tsx` ~L564: Reactivate button.
- Docs only mention "resubscribe" (creates new subscription) — different operation.
- **Fix:** Add doc section distinguishing reactivate vs resubscribe.

### H10. 2FA setup undocumented (4c, D6)
- Full TOTP enrolment / backup codes / disable wizard at `/admin/security/two-factor`.
- No doc page describes 2FA.
- **Fix:** Add docs page for security/2FA.

### H11. API path prefix inconsistent: /api/v1/atoms vs /atoms (4a, finding 5)
- `cancel.mdx` L30, L59: `GET /api/v1/atoms`
- All other API ref docs: unprefixed `POST /atoms`, `POST /recall`, etc.
- **Fix:** Pick one (likely the prefixed version is correct given route mounts) and standardise across all API docs.

### H12. Bootstrap counter reset: billing date vs calendar 1st (4a, finding 4)
- `limits.mdx` L44: resets on "your billing cycle date"
- `self-service-guide.mdx` L60: resets on "the 1st of each calendar month regardless of your billing date"
- **Customer impact:** Subscriber on the 15th sees very different behaviour depending on which is true.
- **Fix:** Verify against compute backend, then align both docs.

### H13. Team RAM: 4GB (upgrade.mdx) vs 2GB (self-service-guide.mdx) (4a, finding 3)
- `upgrade.mdx` L41: "2 vCPU, 4 GB RAM"
- `self-service-guide.mdx` L64: "2,048 MB and 2 full CPU cores" (= 2GB)
- 2× discrepancy.
- **Fix:** Verify actual droplet spec; align both pages.

---

## 🟡 MEDIUM — credibility / clarity

### M1. actions.json says "Six tiers" — 4d says correct, 4b says inflated (CONFLICT in advisors)
- 4b advisor: pricing page renders 4 self-serve tiers; "Six" overcounts because it includes contact-sales enterprise.
- 4d advisor: 6 publicly-sold tiers per llms.txt's "4 paid + 2 enterprise".
- **Resolution:** Both are technically right; "Six tiers from $3/mo" is misleading because the enterprise tiers are NOT "from $3/mo" — they start at $299. Recommended copy: "Four self-serve plans from $3/mo plus two enterprise tiers."

### M2. Metered overage charge not disclosed on /pricing (4b)
- Every active subscription carries flat tier price + `price_1TF5JWKPmxRibChZ7g36TKHC` (Atom Overage, metered).
- /pricing says "Flat monthly subscription — no per-query costs."
- `tiers.ts` `maxMonthlyCents` caps exposure but is never disclosed publicly.
- **Fix:** Add footer note: "Atom overages billed per-atom up to your plan's monthly spend cap of $X."

### M3. 30-day money-back guarantee only on Starter, FAQ scopes correctly (4b)
- Starter feature list mentions it; Solo/Pro/Team do not.
- FAQ correctly limits it to Starter.
- Minor messaging gap; consider extending guarantee or footnoting.

### M4. Trial cancellation grace inconsistency (4a, finding 10)
- `plans-and-trial.mdx` L68: trial cancel → "read-only status" before deprovisioning.
- `cancel.mdx` L83 + `self-service-guide.mdx` L172: trial cancel → immediate deprovision.
- **Fix:** Verify and align (likely the immediate-deprovision version is correct).

### M5. 48-hour dedicated droplet retention contradiction (4a, finding 6)
- `customer-lifecycle.mdx` L51 + `self-service-guide.mdx` L98: kept 48 hours after migration.
- `downgrade.mdx` L47: "destroyed" with no window.
- **Fix:** Confirm actual behaviour; align downgrade.mdx.

### M6. Resubscribe button label: docs vs UI (4c, N8)
- `cancel.mdx` L70–71: "click Resubscribe"
- `DashboardClient.tsx` ~L231: button is "Choose a plan →" linking to /pricing
- **Fix:** Update doc label.

### M7. Manage Subscription button label inconsistency (4c, N1)
- Docs say "Manage Subscription"; UI says "Manage billing →" (dashboard) or "Billing" (subheader).
- **Fix:** Single source of truth in copy.

### M8. memory-atoms.mdx interface comment misleads on atom value size (4a, finding under memory-atoms)
- L18 interface annotation: "UTF-8 string up to 64KB" — accurate only for Pro/Team.
- Starter caps at 4KB; Solo at 16KB.
- **Fix:** Clarify the comment or move tier-specific limits closer to interface.

### M9. Provisioning time inconsistencies (~5min vs 3-5min) (4a, finding 9)
- Same fact stated three ways across docs. Standardise.

### M10. Deprovision Substrate flow undocumented (4c, D3)
- Free-tier-only "type 'destroy'" confirmation modal.
- No doc reference.

### M11. Trial terms missing cancellation deadline (4d, finding 5)
- llms.txt and actions.json say "no charge until day 15" but don't say "cancel before day 15 to avoid charge."
- Best-practice clarity gap.

---

## 🔵 LOW — polish

### L1. Pricing page meta description omits enterprise tiers (4d)
- Lists Starter/Solo/Pro/Team only; Enterprise tiers absent from meta.
- **Fix:** "Plans from $3/mo; enterprise options available."

### L2. Legal pages missing from sitemap (4d, finding 6)
- /privacy, /terms, /dpa, /aup, /copyright not in sitemap.ts hardcoded routes.
- **Fix:** Add routes.

### L3. Possible orphaned docs files (4d, finding 1)
- 23 files on disk; nav config mentions ~18 slugs.
- Reconcile.

### L4. Missing actions.json entries for /knowledge and /visualise (4d, finding 4)
- Agents must navigate DOM to discover.
- **Fix:** Add `view-substrate` and `explore-knowledge` actions.

### L5. CompetitorComparison "Dedicated instance" row could mislead (4b)
- Header scopes correctly to Pro tier; row label could be misread for all tiers.
- Acceptable as-is.

### L6. Auth audit feed at /admin/security/audit undocumented (4c, D5)
- Low-risk; consider mentioning.

### L7. Inline payment-failure CTA in dashboard undocumented (4c, D8)
- Customer benefits from finding it; fine to leave undocumented since it's contextual.
