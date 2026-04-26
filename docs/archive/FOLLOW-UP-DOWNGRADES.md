# FOLLOW-UP — Downgrade Flow

**Parent doc:** `PLAN-ADMIN-UPGRADE-FLOW.md`
**Status:** deferred — NOT in current sprint
**Created:** 2026-04-17
**Owner:** (to assign after upgrade sprint ships)

---

## 1. Why this is a separate doc

The upgrade sprint (S7a/b/c) covers **strictly upward** tier moves only — starter→indie→pro→team. Downgrades have different policy, UX, and billing questions that would bloat the upgrade sprint and slow it down. They're also lower-frequency: most paying customers either stay on their tier, upgrade, or cancel. Mid-life downgrades are rare enough to deserve their own scoped piece of work.

When we pick this up, start by reviewing the answers below against whatever has shipped in the intervening time.

---

## 2. Scope (when we eventually do this work)

| Transition | Included |
|---|---|
| pro → indie, pro → starter, indie → starter (shared_to_shared) | Yes |
| team → any shared tier (dedicated_to_shared) | Yes |
| Cancel (any tier → deprovisioned/free $1 state) | **No — owned by cancel/reactivate lifecycle, SM-6/SM-7/SM-8** |
| team → team-lower (future) (dedicated_to_dedicated downgrade) | Yes, if the tier exists |

---

## 3. Policy decisions we need before writing code

These are the real reason this is deferred. Each one needs a product call.

### 3.1 Proration behaviour

When a customer downgrades mid-cycle:
- **Option A — immediate effect, proration credit.** We call `stripe.subscriptions.update(..., { proration_behavior: 'create_prorations' })`. Stripe issues a prorated credit for the unused portion of the higher tier and charges nothing today. The credit applies to the next invoice. The new (lower) limits apply immediately.
- **Option B — end-of-cycle effect, no credit.** We call `stripe.subscriptions.update(..., { proration_behavior: 'none' })` and `cancel_at_period_end: false` but schedule the phase change. Customer keeps higher-tier limits until period end, then flips to the lower tier. No credit, no refund, no partial-month charge.
- **Option C — hybrid.** Shared→shared downgrades use Option B (end of cycle, no refund surprise). Dedicated→shared downgrades also use Option B because we can't start the 48h hold window mid-cycle anyway.

**Recommended stance when we revisit:** Option B across the board. Simpler to reason about, avoids refund-related support tickets, and matches how most SaaS handles downgrades.

### 3.2 48-hour hold window messaging

For `dedicated→shared`, the `substrate_migrations` machine already enforces a 48h hold on the old dedicated substrate before destroy. During those 48h, the customer is on a new shared substrate. If they realise they made a mistake, can they cancel the downgrade and return to the dedicated one? The code supports rollback (the service has a `rolled_back` terminal state) but we've never exposed it to the customer.

Decide: do we offer a "Undo downgrade" button during the 48h window, or is a downgrade final once committed and customers have to support-ticket us to reverse it?

### 3.3 Grace period interaction

If a customer is in `grace`/read-only (from a failed payment — see BILLING-LIFECYCLE review L-B4 / UX-B1), should they be able to downgrade? Today the UI allows it because there's no UI at all. When we ship upgrades we disable Change-plan while a tier-change is in flight; we'll need a similar guard for grace state. Probably disable downgrades too during grace — the fix should be updating the card, not downgrading.

### 3.4 "Are you sure?" copy

Downgrades touch the customer's data less (shared→shared) or a lot (dedicated→shared migrates everything off the private droplet). For dedicated→shared specifically, the warning must be unambiguous about the read-only window, the new shared endpoint (same slug, different actual host), and that their dedicated droplet will be destroyed after 48 hours.

### 3.5 Limit-exceeded check

If a customer's current usage exceeds the target tier's limits (e.g. 1.2M atoms stored on Pro, downgrading to Indie which caps at 500k), we either:
- Block the downgrade with a clear error ("You're using 1.2M atoms; Indie is capped at 500k. Reduce usage or pick a higher tier.")
- Allow the downgrade but put the substrate in a new `over_limit` state that rejects writes

Recommend **block** — forces the customer to consciously remove data rather than creating a confusing read-only-ish state that neither we nor they understand.

---

## 4. Technical delta vs. upgrades

Most of the machinery for upgrades applies directly. Deltas:

- `GET /billing/upgrade-options` → **rename** to `GET /billing/plan-options` or add a separate `downgrade-options` endpoint. Cleaner to generalise: one endpoint that returns both `upgrades[]` and `downgrades[]`, with each option tagged by direction.
- `POST /billing/upgrade` → generalise to `POST /billing/change-plan { targetTier }` that infers direction. Or add a sibling `/downgrade`. Naming is a taste call; prefer the generalised one.
- `ChangePlanSheet` already shows all tiers in principle — just needs to render tiers strictly below the current one with a "Downgrade" action instead of "Select", plus the downgrade-specific warning copy.
- Confirmation dialog needs "takes effect May 17, 2026" copy (Option B proration) vs. the immediate upgrade copy.
- For `dedicated→shared`, the migration pipeline already exists — this is the same pipeline upgrades use, reversed — but we haven't exercised it end-to-end in tests. Add a Playwright scenario J-06 for the downgrade happy path.
- No new key preservation work needed — the upgrade sprint's carry-forward column and provisioner hook cover both directions.

Estimate: **~2–3 sessions** once we pick it up, assuming the upgrade sprint fully lands first.

---

## 5. Open questions to resolve before starting

1. Proration policy — Option A, B, or C?
2. Undo-downgrade window — offer or not?
3. Downgrade gating in grace state — block or allow?
4. Limit-exceeded on target — block or over-limit state?
5. Endpoint naming — generalise `change-plan` or keep separate `upgrade`/`downgrade`?

Decisions get logged in this doc (add a §6 "Decisions captured" table mirroring the upgrade plan) before work starts.
