# Cancellation / Data-Retention Policy Change

**Date:** 2026-07-01 · **Owner-directed.** Supersedes locked decisions D1 (grace) + D7 (cold storage).

## New model (owner-chosen)

On cancellation, access runs to the **end of the paid billing period** (or ends immediately if the customer cancels-now for a pro-rata refund). At termination the instance is **deprovisioned and a point-in-time snapshot is taken**. There is **no free read-only grace period** and **no cold-storage tier**. The only post-termination recovery is a **paid, at-cost, quoted-first, discretionary** service, available **within 7 days** of termination (subject to good standing, no ToS breach, technical feasibility; not guaranteed). After 7 days the snapshot is **permanently deleted**.

## Done (this pass, verified tsc 0 / testids 0)

- **Terms §6.1** rewritten to the new model (deprovision + snapshot; no grace; 7-day at-cost paid recovery; permanent deletion). Also fixed the contradicting mentions: §9.3 (Data Deletion), the payment-failure clause (§5.x line ~146), and the summary-table rows (Auto-Renewal, retention).
- **FAQ "Can I cancel?"** — the false "**preserved for 90 days**" claim replaced in both `PricingClient.tsx` and `pricing/page.tsx` (JSON-LD).

## Remaining — coupled, must be applied together (not done here)

These share the canonical config + a docs guard, so they must change in lockstep and be verified with `node scripts/check-docs-vs-canonical.ts`:

1. **`src/config/lifecycle.ts`** — replace `GRACE_PERIOD_DAYS` (30) + `COLD_STORAGE_RETENTION_DAYS` (30) with `SNAPSHOT_RECOVERY_WINDOW_DAYS = 7`; rewrite the header comment to the new model.
2. **`src/app/dashboard/DashboardClient.tsx`** (lines ~14, 175, 272) — drop the `GRACE_PERIOD_DAYS` import; change both cancellation toasts/messages to the new model, e.g. *"Subscription cancelled. Access continues until period end, then your instance is deprovisioned and snapshotted; paid at-cost recovery is available for 7 days after."*
3. **6 MDX docs** referencing the old model — `content/docs/`: `payment-failures.mdx`, `customer-lifecycle.mdx`, `self-service-guide.mdx`, `subscription/cancel.mdx`, `spend-caps.mdx`, `limits.mdx`. Update every "grace period / 30-day wind-down / 90-day / cold storage / preserved for N days" mention to the new model.
4. **`src/app/privacy/page.tsx:230`** — "Backups retained for 30 days" → align (no long-term backups; snapshot recovery only, 7 days).
5. **Docs guard** — `scripts/check-docs-vs-canonical.ts` Guard 2 enforces MDX matches `lifecycle.ts`. Rerun after 1+3; update the guard if it hardcodes the old constant names.

## ⚠️ Critical: the code must change to match the new Terms

The Terms now describe a policy the **compute code does not yet implement**. Today the compute deprovisioning flow uses a **30-day read-only grace** (per `lifecycle.ts` / DECISIONS D1). The new Terms promise: **immediate deprovision + snapshot at termination, 7-day snapshot retention, then deletion**, with a **paid at-cost recovery** path. Until `parametric-memory-compute` implements this (deprovision timer → snapshot job → 7-day retention/purge → an ops recovery+billing process), the site's Terms are ahead of the product — the same literature-vs-logic gap this sprint has been closing, now inverted. This is a compute workstream, not a copy change, and should be scheduled before the new Terms are relied upon.

## Also update
- `DECISIONS.md` D1/D7 — mark superseded by this policy (2026-07-01).
