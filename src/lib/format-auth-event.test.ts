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
  it("factor_failed without details still renders", () => {
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
