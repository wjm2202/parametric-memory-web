/**
 * Auth event-kind literal union — website mirror.
 *
 * SPRINT-11.M4 (2026-04-30) — single source of truth for the website's
 * understanding of which `event_kind` values arrive on the wire from
 * compute's `auth_events` rows. Mirrors the compute-side declaration at
 * `parametric-memory-compute/src/auth/audit-event-kinds.ts` exactly.
 *
 * The compute repo's `tests/unit/auth-event-kinds-parity.test.ts` reads
 * BOTH this file AND `compute/migrations/080_totp-and-auth-events.sql`
 * from disk and asserts the three sets (DB CHECK constraint, compute
 * literal union, website literal union) all agree. Drift in any
 * direction fails CI.
 *
 * Why not import from compute directly? Different repos, different
 * publish boundaries — `@mmpm/compute` is not a published package the
 * website consumes. Cross-repo file-content parity (per SPRINT-11.H3's
 * `oauth-rejection-reasons-parity.test.ts` template) is the project's
 * established drift-catcher pattern.
 *
 * Ordering: alphabetised — matches compute. A future addition shows up
 * as a single-line insertion rather than a re-shuffle. The
 * alphabetised order is what the parity test uses to compare emitted
 * vs. expected lists.
 */

/**
 * The 19 `event_kind` literals the website knows how to render. Mirrors
 * the compute-side `AuthEventKind` union and the
 * `auth_events_event_kind_check` CHECK constraint in compute migration
 * 080.
 *
 * Adding a new kind requires:
 *
 *   1. An additive migration on the compute side that ALTERs the CHECK
 *      constraint.
 *   2. The new literal added to compute's
 *      `src/auth/audit-event-kinds.ts` in alphabetical order.
 *   3. The new literal added to this file in alphabetical order.
 *   4. A `case` added to `formatAuthEvent`'s switch (the
 *      `never`-returning default makes a missing case a compile error).
 */
export type AuthEventKind =
  | "account_deleted"
  | "backup_code_used"
  | "backup_codes_regenerated"
  | "factor_disabled"
  | "factor_enrolled"
  | "factor_failed"
  | "factor_verified"
  | "magic_link_failed"
  | "magic_link_requested"
  | "magic_link_verified"
  | "oauth_auto_link"
  | "oauth_link"
  | "oauth_rejected"
  | "oauth_signin"
  | "oauth_unlink"
  | "oauth_verify"
  | "recent_auth_stamped"
  | "session_created"
  | "session_revoked";

/**
 * O(1) runtime set used by `isAuthEventKind`. Kept decoupled from the
 * literal union so the parity test can spot a drifted narrower (a kind
 * added to the union without a matching set entry).
 */
const AUTH_EVENT_KINDS: ReadonlySet<string> = new Set<string>([
  "account_deleted",
  "backup_code_used",
  "backup_codes_regenerated",
  "factor_disabled",
  "factor_enrolled",
  "factor_failed",
  "factor_verified",
  "magic_link_failed",
  "magic_link_requested",
  "magic_link_verified",
  "oauth_auto_link",
  "oauth_link",
  "oauth_rejected",
  "oauth_signin",
  "oauth_unlink",
  "oauth_verify",
  "recent_auth_stamped",
  "session_created",
  "session_revoked",
]);

/**
 * Type predicate — returns true iff `value` is one of the 19
 * declared `AuthEventKind` literals. Drives the
 * exhaustiveness-checked switch in `format-auth-event.ts`: a wire
 * payload carrying a string this predicate rejects falls through to
 * the unknown-kind formatter (graceful degrade for forward-compat
 * deploys where compute ships before the website).
 */
export function isAuthEventKind(value: unknown): value is AuthEventKind {
  return typeof value === "string" && AUTH_EVENT_KINDS.has(value);
}
