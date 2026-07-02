/**
 * Customer-lifecycle constants.
 *
 * Single source of truth for post-cancellation timing, referenced from the
 * dashboard, the docs, and the compute-side deprovisioning / snapshot timers.
 * Anything that hardcodes one of these values must import the constant instead.
 *
 * MODEL (owner decision 2026-07-01, supersedes DECISIONS.md D1 grace + D7
 * cold-storage): On cancellation, access runs to the end of the paid billing
 * period (or ends immediately if the customer cancels-now for a pro-rata refund
 * per Terms §5.4). At termination the instance is DEPROVISIONED and a
 * point-in-time SNAPSHOT is taken. There is NO free read-only grace period and
 * NO cold-storage tier. Recovery of the snapshot is a best-effort, PAID,
 * at-cost, discretionary service available only within
 * SNAPSHOT_RECOVERY_WINDOW_DAYS of termination; after that the snapshot is
 * permanently deleted. See Terms §6.1.
 */

/**
 * Days after termination during which a paid, at-cost, discretionary snapshot
 * recovery may be requested. After this window the snapshot is permanently
 * deleted and no recovery is possible.
 *
 * The compute-side snapshot-retention timer MUST match this value. If you
 * change it, update Terms §6.1, the dashboard copy, and the docs under
 * content/docs/ that describe cancellation.
 */
export const SNAPSHOT_RECOVERY_WINDOW_DAYS = 7;
