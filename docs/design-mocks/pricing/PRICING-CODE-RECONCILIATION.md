# Pricing — Code Reconciliation (what we ACTUALLY provision & charge)

**Date:** 2026-07-01 · **Stakes:** HIGH (billing + advertising-claim accuracy)
**Verified against:** `parametric-memory-compute/` (mounted) + `mmpm-website/src/config/tiers.ts`
**Status:** Audit complete — **decisions needed before building the pricing mock.**

This is the ground truth for Page 2. Every number on the pricing page must trace to code below, not to the current marketing copy. File:line citations are to `parametric-memory-compute/src` unless noted.

---

## TL;DR — 4 accuracy liabilities, ranked

1. **Starter & Solo are SHARED hosting, not dedicated.** Only Pro/Team get their own droplet. The universal "dedicated / never a shared row / zero shared infrastructure" claims (homepage *and* pricing) are false for the two cheapest tiers.
2. **Team "Unlimited bootstraps" is false.** Compute caps Team at 20,000/month.
3. **Undisclosed provisioning fee** (⅓ of first period, non-refundable) on shared→dedicated **upgrades**.
4. **Atom limits are soft** — over-limit atoms are **billed at $0.001/atom** up to the spend cap; the page presents them as a flat allowance.

Items 1–2 are false claims (fix required). Items 3–4 are material non-disclosures (disclose or confirm not-live).

---

## Finding 1 — Hosting model (HIGH) 🔴

`types/substrate-tier.ts` `SUBSTRATE_TIERS`:

| Tier | hostingModel | Droplet | DO cost/mo |
|------|-------------|---------|-----------|
| free / Basic | **shared** | — | — |
| Starter $5 | **shared** | — | — |
| Solo $9 (`indie`) | **shared** | — | — |
| Professional $29 (`pro`) | **dedicated** | `s-1vcpu-2gb` | $12 |
| Team $79 (`team`) | **dedicated** | `s-2vcpu-4gb` | $24 |

`substrate-provisioner.ts:525` branches on `hostingModel`; shared tiers pack multiple tenants per host. The website's `src/config/tiers.ts` `deployment` field **already** marks starter+indie `shared` and pro+team `dedicated` — it's the *copy* that overreaches.

**Copy this breaks (all currently claim universal dedicated):**
- Homepage (just shipped): proof band "Zero · shared infrastructure"; capabilities "A dedicated instance means zero contention — no shared cluster, no noisy neighbours"; pricing preview "Every plan is your own instance — never a shared row"; hero/final "your own Merkle tree — not a row in someone else's database"; FAQ JSON-LD "Every customer gets a dedicated instance with their own Merkle tree."
- Pricing page + `layout.tsx` JSON-LD likely mirror this.

**Decision A (blocks both pages):** how do we honestly frame Starter/Solo? Options in the questions below. This also means **Page 1 needs a follow-up correction** — flagging it now.

## Finding 2 — Team "Unlimited bootstraps" is false (HIGH) 🔴

- Compute `SUBSTRATE_TIERS.team.maxBootstrapsPerMonth = 20000` ("667/day — bounded to prevent runaway automation loops").
- Website `tiers.ts` team = `-1` (unlimited) + feature **"Unlimited bootstraps"**; homepage Team card = "Unlimited sessions".

**Fix:** `tiers.ts` team → `20000`; copy → "20,000 bootstraps/month" (≈667/day). (Also minor, not sold: free tier drift — compute 200 atoms/30/10 MB vs website 500/100/50 MB.)

## Finding 3 — Undisclosed provisioning fee on dedicated upgrades (HIGH) 🟠

`services/billing-advisor.ts` `PROVISIONING_FEE_FRACTION = 1/3`:
- A **one-time, non-refundable** fee = `round(⅓ × first-period charge)` is added **only when upgrading a shared substrate to a dedicated tier** (Starter/Solo → Pro/Team), via `add_invoice_items` on the atomic `subscriptions.update` (`upgrade-handlers.ts:470,755`; `tier-change-billing.ts:148`).
- **Fresh** Pro/Team checkout adds **no** fee (`checkout/session-route.ts` has 0 `add_invoice_items`).
- Withheld from cancellation refunds (`refund-unused-portion.ts`).
- Gated on env `STRIPE_PROVISIONING_FEE_PRODUCT_ID` (**human-only to confirm it's live in prod**).

**Gap:** nothing on pricing or terms mentions an upgrade provisioning fee. If live, it must be disclosed (e.g. "upgrading to a dedicated plan includes a one-time setup fee equal to ⅓ of the first month").

## Finding 4 — Atom limits are soft (metered overage) (HIGH) 🟠

`types/substrate-tier.ts` `ATOM_OVERAGE_UNIT_PRICE_CENTS = 0.1` → **$0.001 per atom over the tier limit**, metered via Stripe (`config/stripe-substrate.ts` `getOveragePriceId`, meter `pm_atom_overage_count`), capped by the tier's monthly spend cap.

So "1,000 atoms" (Starter) is **not a wall** — you can exceed it and pay $0.001/atom until the **$9/mo** cap. The page shows atoms as a flat allowance with no mention of overage or the soft-limit+cap model. Gated on env `STRIPE_PRICE_ATOM_OVERAGE` + `STRIPE_METER_ATOM_OVERAGE` (**human-only to confirm live**).

**Gap:** disclose the "included atoms, then $0.001/atom to your spend cap" model, or confirm overage is not live and the limit is hard.

---

## What's ACCURATE (protect these)

- **Spend caps** — `platform-ceilings.ts` `DEFAULT_CEILINGS`: $2 / $9 / $15 / $50 / $120 — **match** website `maxMonthlyCents` exactly.
- **Instance ceilings** (`maxSubstrates`) — 1 / 1 / 2 / 3 / 5 — **match** exactly (free/starter 1, Solo 2, Pro 3, Team 5).
- **Per-tier atom/bootstrap/storage** for Starter, Solo, Pro — **match**. (Team storage 10 GB matches; only Team bootstraps + free differ, Finding 2.)
- **Enterprise Cloud $299 / Self-Hosted $499** — contact-sales, **not** wired into compute billing (`tiers.ts ENTERPRISE_TIERS`; `getStripePriceId` covers only free/starter/indie/pro/team). Homepage's "Talk to us" collapse is correct.
- **Basic $1 tier** — `publiclySold: false`; our "never advertise the $1 tier" holds.
- **One subscription = one substrate**, monthly; cancellation → read-only grace → deprovision.

## Confirmed by reading the code (2026-07-01)

- **Prices — CONFIRMED.** `SUBSTRATE_TIERS.amountCents` = 500 / 900 / 2900 / 7900 → **$5 / $9 / $29 / $79**; `scripts/setup-stripe-products.ts` writes these as the Stripe `unit_amount`. Drift: unsold Basic/free tier is `amountCents: 300` ($3) in compute vs `$1` in website `tiers.ts`.
- **Overage — CONFIGURED.** `setup-stripe-products.ts` `setupOveragePrice()` creates the metered product + price at **$0.001/atom** (`unit_amount_decimal`, `usage_type: metered`) backed by meter `pm_atom_overage_count`; `.env.example` has `STRIPE_PRICE_ATOM_OVERAGE` + `STRIPE_METER_ATOM_OVERAGE`. Safe to disclose Finding 4.
- **Provisioning fee — mandatory-or-error (not optional).** `upgrade-handlers.ts:755` always builds the fee line for a dedicated upgrade; `buildProvisioningFeeInvoiceItem` **throws** and the upgrade returns 500 `provisioning_fee_not_configured` (line 812) if `STRIPE_PROVISIONING_FEE_PRODUCT_ID` is unset. So if Pro/Team upgrades work in prod, the ⅓ fee IS charged → disclosing it (Finding 3) is correct.

## Ops gaps to close (human-only — live `.env` / setup)

- **`STRIPE_PROVISIONING_FEE_PRODUCT_ID` is NOT created by `setup-stripe-products.ts` and NOT in `.env.example`.** It must be set manually in prod — **if unset, every shared→dedicated upgrade 500s.** Confirm it's set (or dedicated upgrades are broken today).
- `.env.example` is **stale**: missing `STRIPE_PRODUCT_STARTER` / `STRIPE_PRICE_STARTER_MONTHLY` and `STRIPE_PRICE_FREE_MONTHLY`. Prod almost certainly has Starter's price (it's sold), but the template should be updated.

---

## Decisions needed before the pricing mock

- **A. Hosting/"dedicated" framing** (also fixes Page 1): scope "dedicated" to Pro/Team and describe Starter/Solo honestly (e.g. "isolated tenant on shared infrastructure"), or drop the universal claim, or hold pricing until all tiers are dedicated (product change).
- **B. Team bootstraps:** change "Unlimited" → "20,000/month" (fix `tiers.ts` + copy). Confirm.
- **C. Provisioning fee:** confirm live, and disclose the upgrade fee (pricing + terms) or not.
- **D. Overage model:** confirm live, and present "included atoms then $0.001/atom to your cap", or state limits are hard.
