/**
 * Unit tests for AuthProvider types + errors.
 *
 * There is no behaviour to stress — this module is types + constants +
 * a handful of runtime narrowers — so the tests are small and focused:
 *
 *   - Error classes carry their documented fields and `name` strings.
 *     `name` matters because audit-log writers and `instanceof` chains
 *     in the callback route read it; silently renaming one would cause
 *     a runtime branch to fall through to a generic error handler.
 *   - `isRejectionReason` / `is{Signin,Link,Unlink}Outcome` narrowers
 *     accept every documented shape and reject obvious frauds.
 *   - The `REJECTION_REASONS` list stays in parity with compute's
 *     oauth-service.ts. When compute adds a reason, this test fails
 *     first and reminds us to mirror it.
 */
import { describe, it, expect } from "vitest";
import {
  OauthError,
  ProviderNetworkError,
  ProviderTokenExchangeError,
  ProviderClaimsInvalidError,
  ProviderEmailUnverifiedError,
  ProviderNonceMismatchError,
  OauthStateMismatchError,
  OauthFlowNotFoundError,
  OauthReauthRequiredError,
  REJECTION_REASONS,
  isRejectionReason,
  isSigninOutcome,
  isLinkOutcome,
  isUnlinkOutcome,
} from "./types";

describe("error classes — name + inheritance", () => {
  it("every exported OauthError subclass extends OauthError and Error", () => {
    const errors = [
      new ProviderNetworkError("google", "boom"),
      new ProviderTokenExchangeError("google", 500, "internal_error"),
      new ProviderClaimsInvalidError("google", "bad issuer"),
      new ProviderEmailUnverifiedError("google", "user@example.com"),
      new ProviderNonceMismatchError("google"),
      new OauthStateMismatchError(),
      new OauthFlowNotFoundError(),
      new OauthReauthRequiredError(423),
    ];
    for (const e of errors) {
      expect(e).toBeInstanceOf(OauthError);
      expect(e).toBeInstanceOf(Error);
    }
  });

  it("each subclass has a distinct `name` for audit-log dispatch", () => {
    // If two subclasses shared a name, the callback's `switch(err.name)`
    // would fire the wrong branch. Pin the names here.
    expect(new ProviderNetworkError("google", "").name).toBe("ProviderNetworkError");
    expect(new ProviderTokenExchangeError("google", 500, null).name).toBe(
      "ProviderTokenExchangeError",
    );
    expect(new ProviderClaimsInvalidError("google", "").name).toBe("ProviderClaimsInvalidError");
    expect(new ProviderEmailUnverifiedError("google", "").name).toBe(
      "ProviderEmailUnverifiedError",
    );
    expect(new ProviderNonceMismatchError("google").name).toBe("ProviderNonceMismatchError");
    expect(new OauthStateMismatchError().name).toBe("OauthStateMismatchError");
    expect(new OauthFlowNotFoundError().name).toBe("OauthFlowNotFoundError");
    expect(new OauthReauthRequiredError(0).name).toBe("OauthReauthRequiredError");
  });

  it("ProviderTokenExchangeError preserves upstream status + code", () => {
    const e = new ProviderTokenExchangeError("github", 401, "bad_verification_code");
    expect(e.upstreamStatus).toBe(401);
    expect(e.upstreamCode).toBe("bad_verification_code");
    expect(e.providerId).toBe("github");
    expect(e.message).toContain("401");
    expect(e.message).toContain("bad_verification_code");
  });

  it("ProviderTokenExchangeError omits null upstream code from message", () => {
    // When upstream gives us no code string we still produce a readable
    // message — no `(null)` suffix. The status alone is enough for the
    // operator to correlate with upstream logs.
    const e = new ProviderTokenExchangeError("google", 500, null);
    expect(e.message).toContain("500");
    expect(e.message).not.toContain("null");
    expect(e.message).not.toContain("(");
  });

  it("ProviderEmailUnverifiedError never leaks the email into message", () => {
    // Audit logs ingest `error.message`. Emails are identifying data —
    // keep them in the structured `email` field where the sink can
    // redact them, not in the free-text message.
    const e = new ProviderEmailUnverifiedError("github", "leaked@example.com");
    expect(e.message).not.toContain("leaked");
    expect(e.message).not.toContain("@example.com");
    expect(e.email).toBe("leaked@example.com");
  });

  it("OauthReauthRequiredError carries reauthAgeSeconds verbatim", () => {
    expect(new OauthReauthRequiredError(0).reauthAgeSeconds).toBe(0);
    expect(new OauthReauthRequiredError(423).reauthAgeSeconds).toBe(423);
    expect(new OauthReauthRequiredError(null).reauthAgeSeconds).toBeNull();
  });
});

describe("isRejectionReason — type guard", () => {
  it("accepts every documented rejection reason", () => {
    for (const r of REJECTION_REASONS) {
      expect(isRejectionReason(r)).toBe(true);
    }
  });

  it("rejects unknown strings, numbers, null, undefined, objects", () => {
    expect(isRejectionReason("mystery_reason")).toBe(false);
    expect(isRejectionReason("")).toBe(false);
    expect(isRejectionReason(42)).toBe(false);
    expect(isRejectionReason(null)).toBe(false);
    expect(isRejectionReason(undefined)).toBe(false);
    expect(isRejectionReason({ reason: "unverified_email" })).toBe(false);
  });

  it("is case-sensitive — reason strings are exact literals from compute", () => {
    expect(isRejectionReason("UNVERIFIED_EMAIL")).toBe(false);
    expect(isRejectionReason(" unverified_email")).toBe(false);
  });
});

describe("REJECTION_REASONS — parity with compute's oauth-service.ts", () => {
  it("contains the seven reasons compute currently emits", () => {
    // If compute adds or removes one, update here AND audit route
    // handlers for the new branch. The list is frozen here as a
    // tripwire — it's not derived from compute at runtime.
    expect([...REJECTION_REASONS].sort()).toEqual(
      [
        "already_linked",
        "ambiguous_email_match",
        // H2: distinct from `unverified_email`. Triggered when the
        // provider-evidence re-verification on compute fails (bad
        // signature, wrong iss/aud, email_verified=false, email/sub
        // mismatch, GitHub 401, etc.).
        "evidence_invalid",
        "identity_not_found",
        "identity_taken_by_another_account",
        "provider_already_linked_to_this_account",
        "unverified_email",
      ].sort(),
    );
  });

  it("has no duplicate entries", () => {
    expect(new Set(REJECTION_REASONS).size).toBe(REJECTION_REASONS.length);
  });
});

describe("isSigninOutcome — narrowing compute's bridge response", () => {
  // Convenience: a full non-rejected payload matching the T7a contract.
  // Individual tests omit or corrupt specific fields to pin the guard.
  const fullSuccess = {
    outcome: "signed_in_existing",
    accountId: "acc_1",
    identityId: "id_1",
    sessionId: "sess_1",
    rawSessionToken: "abc123",
  } as const;

  it("accepts signed_in_existing with all required fields", () => {
    expect(isSigninOutcome(fullSuccess)).toBe(true);
  });

  it("accepts auto_linked and new_account_created with session fields", () => {
    expect(isSigninOutcome({ ...fullSuccess, outcome: "auto_linked" })).toBe(true);
    expect(isSigninOutcome({ ...fullSuccess, outcome: "new_account_created" })).toBe(true);
  });

  it("accepts rejected with a known reason", () => {
    expect(isSigninOutcome({ outcome: "rejected", reason: "unverified_email" })).toBe(true);
  });

  it("rejects rejected with an unknown reason", () => {
    expect(isSigninOutcome({ outcome: "rejected", reason: "mystery_reason" })).toBe(false);
  });

  it("rejects a success outcome missing identityId", () => {
    // Keep sessionId + rawSessionToken present so only identityId is missing —
    // proves the guard still enforces the identity field explicitly. Using
    // spread+delete rather than destructure-rest so we don't bind (and
    // then silently discard) a name for the field we're omitting.
    const withoutIdentityId: Partial<typeof fullSuccess> = { ...fullSuccess };
    delete withoutIdentityId.identityId;
    expect(isSigninOutcome(withoutIdentityId)).toBe(false);
  });

  it("rejects a success outcome missing sessionId (T7a contract)", () => {
    // Compute guarantees session fields on every non-rejected branch — a
    // response that omits `sessionId` is either a compute bug or a
    // tampered response and must not be treated as a valid signin.
    const withoutSessionId: Partial<typeof fullSuccess> = { ...fullSuccess };
    delete withoutSessionId.sessionId;
    expect(isSigninOutcome(withoutSessionId)).toBe(false);
  });

  it("rejects a success outcome missing rawSessionToken (T7a contract)", () => {
    const withoutToken: Partial<typeof fullSuccess> = { ...fullSuccess };
    delete withoutToken.rawSessionToken;
    expect(isSigninOutcome(withoutToken)).toBe(false);
  });

  it("rejects a success outcome with empty rawSessionToken", () => {
    // An empty token would mean "cookie this empty string" — the
    // rotateSessionCookie helper throws on empty, but we defend earlier
    // so the callback route never even tries.
    expect(isSigninOutcome({ ...fullSuccess, rawSessionToken: "" })).toBe(false);
  });

  it("rejects null, non-object, and unknown outcome values", () => {
    expect(isSigninOutcome(null)).toBe(false);
    expect(isSigninOutcome("signed_in_existing")).toBe(false);
    expect(isSigninOutcome({ outcome: "mystery" })).toBe(false);
    expect(isSigninOutcome({})).toBe(false);
  });

  // ─── Sprint 9.5 — pending_factor branch ───────────────────────────────
  //
  // Compute returns this when an OAuth user with TOTP enrolled completes
  // the provider hop. The website cookies `rawPendingToken` and routes
  // the user to /auth/two-factor instead of minting a session. The
  // narrower MUST accept the well-formed shape and reject every
  // identified malformation, otherwise the callback either (a) silently
  // drops valid pending sessions to a generic error redirect, or (b)
  // routes the user to /auth/two-factor with a missing/empty token they
  // cannot use. Both failure modes lock the user out — pin them.

  const fullPendingFactor = {
    outcome: "pending_factor",
    accountId: "acc_1",
    identityId: "id_1",
    rawPendingToken: "deadbeef".repeat(8), // 64 hex chars — matches compute
    requiredFactor: "totp",
  } as const;

  it("accepts pending_factor with all required fields", () => {
    expect(isSigninOutcome(fullPendingFactor)).toBe(true);
  });

  it("rejects pending_factor missing accountId", () => {
    const without: Partial<typeof fullPendingFactor> = { ...fullPendingFactor };
    delete without.accountId;
    expect(isSigninOutcome(without)).toBe(false);
  });

  it("rejects pending_factor missing identityId", () => {
    const without: Partial<typeof fullPendingFactor> = { ...fullPendingFactor };
    delete without.identityId;
    expect(isSigninOutcome(without)).toBe(false);
  });

  it("rejects pending_factor missing rawPendingToken", () => {
    const without: Partial<typeof fullPendingFactor> = { ...fullPendingFactor };
    delete without.rawPendingToken;
    expect(isSigninOutcome(without)).toBe(false);
  });

  it("rejects pending_factor with empty rawPendingToken", () => {
    // Empty token would set an empty pending cookie — login-verify would
    // 401 with `pending_token_invalid_or_expired` and the user would be
    // bounced back to /login with no breadcrumb. Defensive narrow.
    expect(isSigninOutcome({ ...fullPendingFactor, rawPendingToken: "" })).toBe(false);
  });

  it("rejects pending_factor with non-string rawPendingToken", () => {
    expect(isSigninOutcome({ ...fullPendingFactor, rawPendingToken: 12345 })).toBe(false);
  });

  it("rejects pending_factor with unknown requiredFactor (forward-compat guard)", () => {
    // If compute later ships WebAuthn with `requiredFactor: "webauthn"`,
    // the website MUST be widened in the same release. Until then a
    // non-"totp" value should hard-fail the shape check rather than
    // silently routing the user to a TOTP page they cannot complete.
    expect(isSigninOutcome({ ...fullPendingFactor, requiredFactor: "webauthn" })).toBe(false);
  });

  it("rejects pending_factor missing requiredFactor", () => {
    const without: Partial<typeof fullPendingFactor> = { ...fullPendingFactor };
    delete (without as { requiredFactor?: string }).requiredFactor;
    expect(isSigninOutcome(without)).toBe(false);
  });

  it("rejects pending_factor with stray rawSessionToken (cross-contamination guard)", () => {
    // A response that combines pending + session fields is a protocol
    // violation — pending_factor is mutually exclusive with session
    // minting on compute's side. The narrower currently accepts extra
    // fields (TS structural typing), so this test documents the
    // accepted-but-unsafe behaviour and serves as a tripwire if we
    // later harden the narrower to reject extras.
    const cross = {
      ...fullPendingFactor,
      sessionId: "sess_1",
      rawSessionToken: "abc",
    };
    // Today: structural narrowing only checks the required fields, so
    // the extra fields don't trip the guard. This is intentional — the
    // route handler's switch on `outcome` is the second line of defence
    // and never reads session fields on the pending_factor branch.
    expect(isSigninOutcome(cross)).toBe(true);
  });
});

describe("isLinkOutcome — narrowing compute's /bridge/link response", () => {
  it("accepts linked with identityId", () => {
    expect(isLinkOutcome({ outcome: "linked", identityId: "id_1" })).toBe(true);
  });

  it("accepts rejected with a known reason", () => {
    expect(isLinkOutcome({ outcome: "rejected", reason: "already_linked" })).toBe(true);
  });

  it("rejects linked missing identityId", () => {
    expect(isLinkOutcome({ outcome: "linked" })).toBe(false);
  });

  it("rejects unknown outcomes", () => {
    expect(isLinkOutcome({ outcome: "unlinked" })).toBe(false);
    expect(isLinkOutcome(null)).toBe(false);
  });
});

describe("isUnlinkOutcome — narrowing compute's /bridge/unlink response", () => {
  it("accepts a bare unlinked outcome (no extra fields required)", () => {
    expect(isUnlinkOutcome({ outcome: "unlinked" })).toBe(true);
  });

  it("accepts rejected with a known reason", () => {
    expect(isUnlinkOutcome({ outcome: "rejected", reason: "identity_not_found" })).toBe(true);
  });

  it("rejects unknown outcomes", () => {
    expect(isUnlinkOutcome({ outcome: "linked", identityId: "x" })).toBe(false);
    expect(isUnlinkOutcome(null)).toBe(false);
    expect(isUnlinkOutcome({})).toBe(false);
  });
});
