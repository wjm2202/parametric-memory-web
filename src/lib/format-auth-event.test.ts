/**
 * Tests for format-auth-event.ts.
 *
 * Pure-function table tests — one assertion per (event_kind, details) →
 * label mapping that the audit page relies on. Pinning these means a
 * future contributor changing the copy sees the test fail and updates
 * both deliberately, rather than drifting the user-facing strings out
 * of sync with the design.
 */

import { describe, it, expect } from "vitest";
import { formatAuthEvent, formatActorIp, type AuthEvent } from "./format-auth-event";
import { isAuthEventKind, type AuthEventKind } from "./auth-event-kinds";

function event(eventKind: string, details: Record<string, unknown> = {}): AuthEvent {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    occurredAt: "2026-04-29T12:00:00.000Z",
    eventKind,
    actorIp: null,
    actorUa: null,
    details,
  };
}

describe("formatAuthEvent — magic-link kinds", () => {
  it("magic_link_requested", () => {
    expect(formatAuthEvent(event("magic_link_requested"))).toBe("Requested a sign-in link");
  });
  it("magic_link_verified", () => {
    expect(formatAuthEvent(event("magic_link_verified"))).toBe("Signed in via email link");
  });
  it("magic_link_failed with rate_limited='ip'", () => {
    expect(formatAuthEvent(event("magic_link_failed", { rate_limited: "ip" }))).toMatch(
      /rate-limited/i,
    );
    expect(formatAuthEvent(event("magic_link_failed", { rate_limited: "ip" }))).toMatch(/network/i);
  });
  it("magic_link_failed with rate_limited='email'", () => {
    expect(formatAuthEvent(event("magic_link_failed", { rate_limited: "email" }))).toMatch(
      /rate-limited/i,
    );
    expect(formatAuthEvent(event("magic_link_failed", { rate_limited: "email" }))).toMatch(
      /email/i,
    );
  });

  // ─── SPRINT-11.M1 ─────────────────────────────────────────────────────
  //
  // The 'db_error' bucket was added in 2026-04-30 to surface fail-open
  // events from `pgEmailRateLimit`. The user's request was actually
  // ALLOWED (the limiter threw before deciding); the audit row exists
  // for ops to spot brief unbounded-rate windows. Copy emphasises
  // "operational signal" so it isn't mistaken for a user-facing throttle.
  it("magic_link_failed with rate_limited='db_error' renders the operational copy", () => {
    const label = formatAuthEvent(event("magic_link_failed", { rate_limited: "db_error" }));
    expect(label).toMatch(/Rate-limit database unreachable/i);
    expect(label).toMatch(/request allowed/i);
    expect(label).toMatch(/operational signal/i);
  });
});

describe("formatAuthEvent — OAuth kinds", () => {
  it("oauth_signin with google", () => {
    expect(formatAuthEvent(event("oauth_signin", { provider: "google" }))).toBe(
      "Signed in with Google",
    );
  });
  it("oauth_signin with github", () => {
    expect(formatAuthEvent(event("oauth_signin", { provider: "github" }))).toBe(
      "Signed in with GitHub",
    );
  });
  it("oauth_signin with requires_factor", () => {
    expect(
      formatAuthEvent(event("oauth_signin", { provider: "google", requires_factor: true })),
    ).toBe("Signed in with Google (two-factor required)");
  });
  it("oauth_link", () => {
    expect(formatAuthEvent(event("oauth_link", { provider: "google" }))).toBe(
      "Linked Google account",
    );
  });
  it("oauth_unlink", () => {
    expect(formatAuthEvent(event("oauth_unlink", { provider: "github" }))).toBe(
      "Unlinked GitHub account",
    );
  });
  it("oauth_auto_link", () => {
    expect(formatAuthEvent(event("oauth_auto_link", { provider: "google" }))).toMatch(
      /Linked Google account automatically/,
    );
  });
  it("oauth_rejected with reject_reason", () => {
    const label = formatAuthEvent(
      event("oauth_rejected", { provider: "google", reject_reason: "unverified_email" }),
    );
    expect(label).toMatch(/Google sign-in rejected/);
    expect(label).toMatch(/didn't verify/);
  });
  it("oauth_rejected with unknown reject_reason falls through", () => {
    // Forward-compat: a reason this file doesn't know about renders verbatim
    // so the audit row stays informative even before the website catches up.
    const label = formatAuthEvent(
      event("oauth_rejected", { provider: "google", reject_reason: "future_unknown_reason" }),
    );
    expect(label).toMatch(/future_unknown_reason/);
  });
  it("oauth_verify (internal — surfaced plainly if it appears)", () => {
    expect(formatAuthEvent(event("oauth_verify"))).toBe("Verified OAuth identity");
  });
});

describe("formatAuthEvent — factor lifecycle", () => {
  it("factor_enrolled (totp)", () => {
    expect(formatAuthEvent(event("factor_enrolled", { factor_kind: "totp" }))).toBe(
      "Enabled two-factor authentication (authenticator app)",
    );
  });
  it("factor_disabled (totp)", () => {
    expect(formatAuthEvent(event("factor_disabled", { factor_kind: "totp" }))).toBe(
      "Disabled two-factor authentication (authenticator app)",
    );
  });
  it("factor_verified", () => {
    expect(formatAuthEvent(event("factor_verified"))).toBe("Confirmed two-factor code");
  });
  it("factor_failed with attempts_remaining", () => {
    expect(
      formatAuthEvent(event("factor_failed", { reason: "totp_invalid", attempts_remaining: 4 })),
    ).toBe("Incorrect two-factor code (4 attempts remaining)");
  });
  it("factor_failed with attempts_remaining=1 uses singular", () => {
    expect(
      formatAuthEvent(event("factor_failed", { reason: "totp_invalid", attempts_remaining: 1 })),
    ).toBe("Incorrect two-factor code (1 attempt remaining)");
  });
  it("factor_failed with reason='totp_locked' overrides attempts_remaining", () => {
    expect(
      formatAuthEvent(event("factor_failed", { reason: "totp_locked", attempts_remaining: 0 })),
    ).toBe("Locked out after too many incorrect codes");
  });

  // ─── SPRINT-11.L1 — replay + invalid_input cases ─────────────────────
  //
  // Pre-L1, every wrong attempt rendered as "Incorrect two-factor code".
  // Now reasons are distinguished:
  //   - 'replay'        — user typed a correct-but-already-used code
  //                       (browser autofill is the typical cause).
  //   - 'invalid_input' — user typed something that didn't match either
  //                       6-digit or xxxx-xxxx format (no real attempt).
  //   - 'wrong_code' (default) — pure mistype, code didn't validate.
  //
  // Both new reasons surface attempts_remaining if present so the user
  // sees their lockout-window state regardless of the precise failure.

  it("factor_failed with reason='replay' renders 'already used'", () => {
    const label = formatAuthEvent(
      event("factor_failed", { reason: "replay", attempts_remaining: 3 }),
    );
    expect(label).toMatch(/already used/i);
    expect(label).toMatch(/3 attempts remaining/);
  });

  it("factor_failed with reason='replay' singular for attempts_remaining=1", () => {
    const label = formatAuthEvent(
      event("factor_failed", { reason: "replay", attempts_remaining: 1 }),
    );
    expect(label).toMatch(/1 attempt remaining/);
    expect(label).not.toMatch(/attempts remaining/);
  });

  it("factor_failed with reason='replay' and no attempts_remaining renders standalone", () => {
    expect(formatAuthEvent(event("factor_failed", { reason: "replay" }))).toBe(
      "Two-factor code already used (replay rejected)",
    );
  });

  it("factor_failed with reason='invalid_input' renders 'wrong format'", () => {
    const label = formatAuthEvent(
      event("factor_failed", { reason: "invalid_input", attempts_remaining: 4 }),
    );
    expect(label).toMatch(/wrong format/i);
    expect(label).toMatch(/4 attempts remaining/);
  });

  it("factor_failed with reason='invalid_input' and no attempts_remaining renders standalone", () => {
    expect(formatAuthEvent(event("factor_failed", { reason: "invalid_input" }))).toBe(
      "Two-factor code in wrong format",
    );
  });

  it("factor_failed without details still renders (default 'wrong_code' fallthrough)", () => {
    expect(formatAuthEvent(event("factor_failed"))).toBe("Incorrect two-factor code");
  });
  it("backup_code_used with code_index", () => {
    // code_index is positional 0..9 — render as #1..#10 for the user.
    expect(formatAuthEvent(event("backup_code_used", { code_index: 0 }))).toBe(
      "Used backup code #1",
    );
    expect(formatAuthEvent(event("backup_code_used", { code_index: 9 }))).toBe(
      "Used backup code #10",
    );
  });
  it("backup_codes_regenerated with count", () => {
    expect(formatAuthEvent(event("backup_codes_regenerated", { count: 10 }))).toMatch(
      /Regenerated 10 backup codes/,
    );
  });
});

describe("formatAuthEvent — session / identity", () => {
  it("session_created", () => {
    expect(formatAuthEvent(event("session_created"))).toBe("New session started");
  });
  it("session_revoked", () => {
    expect(formatAuthEvent(event("session_revoked"))).toBe("Signed out");
  });
  it("recent_auth_stamped", () => {
    expect(formatAuthEvent(event("recent_auth_stamped"))).toBe("Confirmed identity");
  });
  it("account_deleted", () => {
    expect(formatAuthEvent(event("account_deleted", { soft: true }))).toBe("Deleted account");
  });
});

describe("formatAuthEvent — graceful fallback", () => {
  it("unknown event_kind renders 'Unknown event (kind)' verbatim", () => {
    expect(formatAuthEvent(event("future_unknown_kind"))).toBe(
      "Unknown event (future_unknown_kind)",
    );
  });
  it("backfilled rows render normally — backfilled_from marker is ignored", () => {
    // Sprint 1 backfill marks rows with details.backfilled_from. The
    // formatter must NOT expose that to the user — the row should look
    // identical to a freshly-written one of the same kind.
    const fresh = formatAuthEvent(event("oauth_link", { provider: "google" }));
    const backfilled = formatAuthEvent(
      event("oauth_link", {
        provider: "google",
        backfilled_from: "account_identity_audit",
      }),
    );
    expect(backfilled).toBe(fresh);
  });
});

describe("SPRINT-11.M4 — AuthEventKind exhaustiveness", () => {
  // The 19 declared kinds — alphabetised, mirrors auth-event-kinds.ts.
  // If this list drifts from the union, the cross-repo parity test on
  // the compute side fails; the loop below is the website-side
  // counterpart that asserts the formatter handles every literal.
  const ALL_KINDS: readonly AuthEventKind[] = [
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
  ];

  it("formats every known AuthEventKind without throwing or returning the unknown-kind fallback", () => {
    for (const kind of ALL_KINDS) {
      const label = formatAuthEvent(event(kind));
      // Sanity: every known kind has its own case branch — none should
      // hit the "Unknown event (kind)" fallback.
      expect(label).not.toMatch(/^Unknown event \(/);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("an unknown wire kind still falls through to formatUnknownEvent", () => {
    // Forward-compat: compute may ship a new kind before the website
    // redeploys. The narrower rejects it and the formatter renders
    // a graceful unknown-kind row.
    expect(formatAuthEvent(event("future_unknown_kind"))).toBe(
      "Unknown event (future_unknown_kind)",
    );
  });

  it("isAuthEventKind accepts every declared kind", () => {
    for (const kind of ALL_KINDS) {
      expect(isAuthEventKind(kind)).toBe(true);
    }
  });

  it("isAuthEventKind rejects strings and non-strings outside the union", () => {
    expect(isAuthEventKind("future_unknown_kind")).toBe(false);
    expect(isAuthEventKind("")).toBe(false);
    expect(isAuthEventKind(null)).toBe(false);
    expect(isAuthEventKind(undefined)).toBe(false);
    expect(isAuthEventKind(42)).toBe(false);
    expect(isAuthEventKind({})).toBe(false);
    // Trailing whitespace must not pass — the wire shape is exact.
    expect(isAuthEventKind("oauth_signin ")).toBe(false);
  });
});

describe("formatActorIp", () => {
  it("returns null for null / empty", () => {
    expect(formatActorIp(null)).toBeNull();
    expect(formatActorIp(undefined)).toBeNull();
    expect(formatActorIp("")).toBeNull();
  });
  it("strips trailing /32 (IPv4 unicast canonicalisation)", () => {
    expect(formatActorIp("198.51.100.42/32")).toBe("198.51.100.42");
  });
  it("strips trailing /128 (IPv6 unicast canonicalisation)", () => {
    expect(formatActorIp("2001:db8::1/128")).toBe("2001:db8::1");
  });
  it("leaves non-/32 CIDR notation alone (real subnet)", () => {
    // The audit feed should never receive a real subnet — every row is
    // a single host. But if it does (e.g. a future code path that stores
    // a /24 deliberately), don't strip the suffix.
    expect(formatActorIp("198.51.100.0/24")).toBe("198.51.100.0/24");
  });
  it("passes through plain IPs unchanged", () => {
    expect(formatActorIp("198.51.100.42")).toBe("198.51.100.42");
    expect(formatActorIp("2001:db8::1")).toBe("2001:db8::1");
  });
});
