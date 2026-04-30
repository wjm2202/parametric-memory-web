/**
 * format-auth-event — map auth_events rows to human-readable labels.
 *
 * Used by `/admin/security/audit` to render the feed and by
 * `SecurityClient` to surface a "last sign-in" line on the security card.
 * Pure functions, no I/O, no React — server components, client components,
 * and tests all import from here.
 *
 * Single source of truth for "what does event X look like to a user".
 * Localisation hook: today every label is hard-coded English; the
 * function shape (input → string) means a future i18n pass can swap
 * the implementation without touching callers.
 *
 * ## Event kinds covered
 *
 * The full union from migration 080's `auth_events_event_kind_check`:
 *
 *   magic_link_requested, magic_link_verified, magic_link_failed,
 *   oauth_signin, oauth_link, oauth_unlink, oauth_auto_link, oauth_verify,
 *   oauth_rejected,
 *   factor_enrolled, factor_disabled, factor_verified, factor_failed,
 *   backup_code_used, backup_codes_regenerated,
 *   session_created, session_revoked,
 *   recent_auth_stamped, account_deleted.
 *
 * Unknown kinds (a future event added in compute before this file is
 * updated) fall through to `formatUnknownEvent`, which renders the kind
 * verbatim with a hint that the website is out of date. That's a
 * graceful degrade — the feed still works, the row just looks technical.
 *
 * ## Backfilled-row handling
 *
 * Sprint 1's migration 080 backfilled `account_identity_audit` rows
 * into `auth_events` with `details.backfilled_from = 'account_identity_audit'`.
 * The formatter ignores that marker — backfilled rows render exactly
 * like fresh ones for their kind. The marker exists for forensics,
 * not for the user.
 *
 * ## Why one big switch instead of a registry / map
 *
 * Each branch needs subtly different access into `details` (factor_failed
 * peeks at `attempts_remaining` AND `reason`, oauth_rejected at `reject_reason`,
 * etc.). A switch keeps the per-kind logic colocated and readable. A
 * registry would hide that variance behind a generic shape and force
 * either a giant `details` type union or `unknown` casts at every call
 * site. The switch is verbose but the verbosity is the documentation.
 */

/**
 * The raw event shape returned by GET /api/auth/audit. Mirror of the
 * compute-side `AuditEventResponse` interface in `audit-routes.ts`.
 */
export interface AuthEvent {
  id: string;
  occurredAt: string;
  eventKind: string;
  actorIp: string | null;
  actorUa: string | null;
  details: Record<string, unknown>;
}

/**
 * Map an event to a single-line user label. Never throws; unknown kinds
 * fall through to a technical-but-readable fallback.
 */
export function formatAuthEvent(event: AuthEvent): string {
  const d = event.details;

  switch (event.eventKind) {
    // ─── Magic-link flow ────────────────────────────────────────────
    case "magic_link_requested":
      return "Requested a sign-in link";
    case "magic_link_verified":
      return "Signed in via email link";
    case "magic_link_failed": {
      // details.rate_limited is 'ip' | 'email' on this kind.
      const bucket = pickString(d.rate_limited);
      if (bucket === "ip")
        return "Sign-in attempt rate-limited (too many requests from your network)";
      if (bucket === "email")
        return "Sign-in attempt rate-limited (too many requests for this email)";
      return "Sign-in attempt rate-limited";
    }

    // ─── OAuth ──────────────────────────────────────────────────────
    case "oauth_signin": {
      const provider = pickString(d.provider) ?? "an OAuth provider";
      const requiresFactor = d.requires_factor === true;
      return requiresFactor
        ? `Signed in with ${formatProvider(provider)} (two-factor required)`
        : `Signed in with ${formatProvider(provider)}`;
    }
    case "oauth_link": {
      const provider = pickString(d.provider) ?? "an OAuth provider";
      return `Linked ${formatProvider(provider)} account`;
    }
    case "oauth_unlink": {
      const provider = pickString(d.provider) ?? "an OAuth provider";
      return `Unlinked ${formatProvider(provider)} account`;
    }
    case "oauth_auto_link": {
      const provider = pickString(d.provider) ?? "an OAuth provider";
      return `Linked ${formatProvider(provider)} account automatically (matched by verified email)`;
    }
    case "oauth_verify":
      // Internal — compute's evidence re-verification step. Not normally
      // surfaced to users; if it shows up, render plainly.
      return "Verified OAuth identity";
    case "oauth_rejected": {
      const provider = pickString(d.provider);
      const reason = pickString(d.reject_reason);
      const head = provider
        ? `${formatProvider(provider)} sign-in rejected`
        : "Sign-in attempt rejected";
      return reason ? `${head}: ${humaniseRejectReason(reason)}` : head;
    }

    // ─── Factor lifecycle ───────────────────────────────────────────
    case "factor_enrolled":
      return `Enabled two-factor authentication (${formatFactorKind(d.factor_kind)})`;
    case "factor_disabled":
      return `Disabled two-factor authentication (${formatFactorKind(d.factor_kind)})`;
    case "factor_verified":
      return "Confirmed two-factor code";
    case "factor_failed": {
      const reason = pickString(d.reason);
      if (reason === "totp_locked" || reason === "locked_out") {
        return "Locked out after too many incorrect codes";
      }
      const remaining = pickNumber(d.attempts_remaining);
      if (remaining !== null) {
        const word = remaining === 1 ? "attempt" : "attempts";
        return `Incorrect two-factor code (${remaining} ${word} remaining)`;
      }
      return "Incorrect two-factor code";
    }
    case "backup_code_used": {
      const idx = pickNumber(d.code_index);
      return idx !== null ? `Used backup code #${idx + 1}` : "Used a backup code";
    }
    case "backup_codes_regenerated": {
      const count = pickNumber(d.count);
      return count !== null
        ? `Regenerated ${count} backup codes (previous codes invalidated)`
        : "Regenerated backup codes (previous codes invalidated)";
    }

    // ─── Session / identity ─────────────────────────────────────────
    case "session_created":
      // We deliberately do NOT distinguish "via magic link" vs "via OAuth"
      // here — the immediately preceding event in the timeline already
      // tells that story (`magic_link_verified` or `oauth_signin`). This
      // row is the closing event for the chain.
      return "New session started";
    case "session_revoked":
      return "Signed out";
    case "recent_auth_stamped":
      return "Confirmed identity";

    case "account_deleted":
      return "Deleted account";

    // ─── Unknown kind — graceful fallback ──────────────────────────
    default:
      return formatUnknownEvent(event.eventKind);
  }
}

/**
 * Defensive INET formatter — strip a trailing /32 (or /128 for IPv6)
 * if compute ever forgets the `host(actor_ip)` projection. See the
 * Sprint 7 plan's "actor_ip serialisation gotcha" note.
 *
 * Today GET /api/auth/audit always projects via `host(actor_ip)` so
 * this function should never have to do real work. It exists as
 * belt-and-braces so the audit page can NEVER render `198.51.100.42/32`
 * to a user.
 */
export function formatActorIp(ip: string | null | undefined): string | null {
  if (!ip || ip.length === 0) return null;
  return ip.replace(/\/(32|128)$/, "");
}

// ─── Internal helpers ─────────────────────────────────────────────

/** Defensive type narrowing — value-may-be-string-or-number-or-anything. */
function pickString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function pickNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** "google" → "Google", "github" → "GitHub". Anything else passes through. */
function formatProvider(provider: string): string {
  switch (provider) {
    case "google":
      return "Google";
    case "github":
      return "GitHub";
    default:
      // Capitalise the first letter — keeps unknown providers readable.
      return provider.length > 0 ? provider[0].toUpperCase() + provider.slice(1) : provider;
  }
}

function formatFactorKind(kind: unknown): string {
  if (kind === "totp") return "authenticator app";
  if (kind === "webauthn") return "passkey";
  // Any other value means compute introduced a new factor before this
  // file was updated — render plainly so the row is still useful.
  return typeof kind === "string" && kind.length > 0 ? kind : "unknown factor";
}

/**
 * Map compute's machine-readable rejection reasons to user-facing copy.
 * Mirror of the rejection-reason vocabulary in
 * `parametric-memory-compute/src/services/oauth-service.ts`. If compute
 * adds a new reason, this falls through to the verbatim string — the
 * row stays informative even before the website catches up.
 */
function humaniseRejectReason(reason: string): string {
  switch (reason) {
    case "unverified_email":
      return "the provider didn't verify your email";
    case "identity_taken_by_another_account":
      return "this provider account is already linked to another account";
    case "provider_already_linked_to_this_account":
      return "this provider was already linked";
    case "ambiguous_email_match":
      return "we couldn't tell which account to use";
    case "evidence_invalid":
      return "the provider's response failed verification";
    case "identity_not_found":
      return "no matching identity was found";
    default:
      return reason;
  }
}

/**
 * Fallback for an event_kind this file doesn't know about. Keep the kind
 * verbatim so a developer can grep for it; surface to the user as
 * "Unknown event (kind)" so they at least see a row.
 */
function formatUnknownEvent(kind: string): string {
  return `Unknown event (${kind})`;
}
