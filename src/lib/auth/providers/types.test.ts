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
  // SPRINT-11.H3 (2026-04-30): the previous version of this test froze
  // a 7-element list including "already_linked", which compute does NOT
  // emit as a wire rejection (it's an audit-row metadata field on a
  // SUCCESSFUL idempotent re-link path — see `oauth-service.ts:788`
  // returning `{ outcome: 'linked' }`, never 'rejected'). Compute's
  // wire-rejected set is the seven below. The companion parity test on
  // the compute side (`tests/unit/oauth-rejection-reasons-parity.test.ts`)
  // grep-extracts every `outcome: 'rejected', reason: '<x>'` literal
  // from oauth-service.ts and asserts that source matches the same set.
  // Both sides are independently locked down — drift on either fails its
  // own preflight.
  it("contains exactly the wire rejections compute emits", () => {
    expect([...REJECTION_REASONS].sort()).toEqual(
      [
        "ambiguous_email_match",
        // H2: distinct from `unverified_email`. Triggered when the
        // provider-evidence re-verification on compute fails (bad
        // signature, wrong iss/aud, email_verified=false, email/sub
        // mismatch, GitHub 401, etc.).
        "evidence_invalid",
        "identity_not_found",
        "identity_taken_by_another_account",
        // SPRINT-11.H3: compute's RejectionCode union declares this for
        // the unlink-last-method guard. Forward-compat: shipping the
        // website's narrower with this reason accepted now means
        // compute can ship the runtime check without lockstep redeploys.
        "last_auth_method",
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
    // SPRINT-11.H3 (2026-04-30): use a reason actually in REJECTION_REASONS
    // — `already_linked` was removed (see types.ts:456 historical note).
    expect(
      isLinkOutcome({ outcome: "rejected", reason: "provider_already_linked_to_this_account" }),
    ).toBe(true);
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

// ─── SPRINT-11.M6 — TODO marker tripwires ────────────────────────────────
//
// `requiredFactor: "totp"` is pinned to a literal at two sites in
// `providers/types.ts` (the `pending_factor` variant of `SigninOutcome`,
// and the `isSigninOutcome` runtime narrower). Both pins MUST widen
// when WebAuthn lands — see compute's `FactorKind` for the upstream
// declaration. SPRINT-11.M6 (2026-04-30) added explicit
// `TODO(webauthn-sprint):` markers above each pin so that a future
// WebAuthn-sprint contributor finds them via grep and updates them in
// lockstep.
//
// This test is the tripwire: it fails if either marker is removed
// without doing the actual widening work. If the WebAuthn sprint runs
// and the literals widen, this test should be deleted alongside the
// markers — it has served its purpose.

import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("SPRINT-11.M6 — webauthn-sprint TODO markers in providers/types.ts", () => {
  // Resolve relative to this test file. `__dirname` is the working
  // pattern used by other source-grep tests in this repo (see
  // `src/app/signup/SignupClient.m7.test.ts` and
  // `src/app/__tests__/mobile-typography.test.tsx`). Vitest provides
  // it as an ESM shim. `import.meta.url` was tried first but Vite's
  // transform pipeline doesn't always emit a `file:` scheme, so
  // `fileURLToPath` blew up at suite-load.
  const sourcePath = join(__dirname, "types.ts");

  it("both pin sites carry a TODO(webauthn-sprint) marker", () => {
    const src = readFileSync(sourcePath, "utf8");
    const matches = src.match(/TODO\(webauthn-sprint\)/g) ?? [];
    // Two pins → at least two markers. Allow more (a future contributor
    // adding a third pin should also tag it).
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
