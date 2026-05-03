/**
 * Customer-lifecycle constants.
 *
 * Single source of truth for the grace-period / cold-storage / cancellation
 * timing values referenced from the dashboard, the docs, and the compute-side
 * deprovisioning timers. Anchored to DECISIONS.md D1 (grace) and D7 (cold
 * storage).
 *
 * Anything that hardcodes one of these values (e.g. "Memory preserved for 30
 * days") is a Sprint-1 violation — import the constant instead. The
 * `check-docs-vs-canonical.ts` Guard 2 enforces that every "preserved for
 * N days" / "wind-down" / "grace period" mention in MDX matches what's here.
 */

/**
 * Grace period after subscription cancellation, in days. Per D1 (locked
 * 2026-05-03). The substrate stays read-only for this many days after the
 * subscription is cancelled — the customer can read their atoms, export
 * data, and resubscribe to restore writes; after this window expires, the
 * substrate is deprovisioned.
 *
 * Compute-side deprovisioning timer MUST match. If you change this value,
 * update DECISIONS.md D1 with the new value and rerun the Sprint 1
 * grandfathering query (audit-baselines/2026-05-03/baseline-db-runbook,
 * Q3) to identify any in-flight cancellations whose badge promised the
 * old value.
 */
export const GRACE_PERIOD_DAYS = 30;

/**
 * Cold-storage retention after grace period ends, in days. Per D7 (cold
 * storage tier). After grace ends without resubscription, atoms migrate
 * from the live droplet to a cold-storage droplet for this many additional
 * days; after that they are permanently deleted.
 *
 * Customer-facing: "preserved for 30 days, then 30 more days in cold
 * storage". Resubscribe at any time during EITHER window restores writes.
 *
 * NOT YET WIRED — S2.11 builds the cold-storage infrastructure. This
 * constant is declared here so docs/dashboard can begin referencing it.
 */
export const COLD_STORAGE_RETENTION_DAYS = 30;
