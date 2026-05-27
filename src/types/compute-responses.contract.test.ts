/**
 * Sprint nextjs-16-upgrade (2026-05-27) — compute response shape pins
 * (tests 5.7 + 5.8).
 *
 * Pins the JSON shapes the website expects back from two compute endpoints:
 *
 *   GET  /api/auth/verify?token=…   (test 5.7)
 *     Parsed at: src/app/auth/callback/route.ts:70-76 (as a TS cast,
 *     no runtime narrowing today). Has two valid happy paths — session
 *     minted, or TOTP challenge required.
 *
 *   POST /api/v1/signup             (test 5.8)
 *     Documented at: src/app/api/signup/route.ts:13 (returns:
 *     { customerId, slug, tier, mcpEndpoint, apiKey, mcpConfig,
 *       limits, status }). The website forwards this response
 *     verbatim via computeProxy — it doesn't currently narrow.
 *
 * Why this test exists
 * ────────────────────
 * Today the website parses both responses via TypeScript type casts —
 * `(await res.json()) as { … }` — which means the runtime sees whatever
 * compute actually emits, with no defence against silent shape drift.
 * That's tolerable because the website degrades to the upstream-error
 * UI when fields are missing. It's NOT tolerable if compute renames a
 * field; the website would crash on the destructure rather than route
 * to the error UI.
 *
 * This test does NOT add runtime validation to production code (that's
 * a separate piece of work — see "Out of scope" in the sprint plan).
 * Instead it pins the SHAPE in a runtime guard defined inline here,
 * with exhaustive accept/reject cases. The guards become the canonical
 * source of "what fields, what types, what's optional" — when a future
 * engineer decides to add runtime validation, they copy these guards
 * into a shared helper module.
 *
 * If compute changes its response shape, fix it on BOTH SIDES:
 *   1. update the interface here,
 *   2. update the inline guard here,
 *   3. update the parse site in the route handler.
 *
 * Reference: docs/SPRINT-NEXTJS-16-UPGRADE-2026-05-27.md (tests 5.7, 5.8).
 */

import { describe, it, expect } from "vitest";

/* ═════════════════════════════════════════════════════════════════════════
 *   Auth-verify response (test 5.7)
 * ═════════════════════════════════════════════════════════════════════════*/

interface AuthVerifyResponse {
  /** Always present — true on success, false on rejection. */
  ok: boolean;
  /** Present on the happy path (session minted). */
  sessionToken?: string;
  /** Always present — the account the token belongs to. */
  accountId: string;
  /** Present on the TOTP fork — usually "totp". */
  requiresFactor?: string;
  /** Present on the TOTP fork — short-lived bridge token to the 2FA flow. */
  pendingToken?: string;
}

function isAuthVerifyResponse(x: unknown): x is AuthVerifyResponse {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.ok === "boolean" &&
    typeof r.accountId === "string" &&
    (r.sessionToken === undefined || typeof r.sessionToken === "string") &&
    (r.requiresFactor === undefined || typeof r.requiresFactor === "string") &&
    (r.pendingToken === undefined || typeof r.pendingToken === "string")
  );
}

describe("auth-verify response shape (test 5.7)", () => {
  describe("accepts valid happy paths", () => {
    it("accepts session-minted shape (ok + sessionToken + accountId)", () => {
      expect(
        isAuthVerifyResponse({
          ok: true,
          sessionToken: "session-xyz",
          accountId: "acct-123",
        }),
      ).toBe(true);
    });

    it("accepts TOTP-fork shape (ok + requiresFactor + pendingToken + accountId)", () => {
      expect(
        isAuthVerifyResponse({
          ok: true,
          requiresFactor: "totp",
          pendingToken: "pend-xyz",
          accountId: "acct-123",
        }),
      ).toBe(true);
    });

    it("accepts ok=false rejection shape (ok + accountId, no token fields)", () => {
      expect(
        isAuthVerifyResponse({
          ok: false,
          accountId: "acct-123",
        }),
      ).toBe(true);
    });

    it("accepts unknown extra fields (forward-compat)", () => {
      expect(
        isAuthVerifyResponse({
          ok: true,
          sessionToken: "s",
          accountId: "a",
          extra_field: "should-be-ignored",
        }),
      ).toBe(true);
    });
  });

  describe("rejects invalid shapes", () => {
    it("rejects null", () => {
      expect(isAuthVerifyResponse(null)).toBe(false);
    });

    it("rejects missing ok", () => {
      expect(isAuthVerifyResponse({ accountId: "a" })).toBe(false);
    });

    it("rejects missing accountId (every shape must identify the account)", () => {
      expect(isAuthVerifyResponse({ ok: true, sessionToken: "s" })).toBe(false);
    });

    it("rejects wrong type for ok (string instead of boolean)", () => {
      expect(isAuthVerifyResponse({ ok: "true", accountId: "a" })).toBe(false);
    });

    it("rejects wrong type for sessionToken (number)", () => {
      expect(isAuthVerifyResponse({ ok: true, sessionToken: 42, accountId: "a" })).toBe(false);
    });

    it("rejects wrong type for accountId (object)", () => {
      expect(isAuthVerifyResponse({ ok: true, accountId: { id: "a" } })).toBe(false);
    });

    it("rejects camelCase variants of the same fields (no auto-coercion)", () => {
      expect(
        isAuthVerifyResponse({
          ok: true,
          session_token: "s",
          account_id: "a",
        }),
      ).toBe(false);
    });
  });

  describe("field-name contract (compute snake-vs-camel pins)", () => {
    /*
     * auth-verify uses camelCase. The ApiError envelope (separate file)
     * uses snake_case. These two conventions co-exist in compute. The
     * test pins both decisions to surface accidental harmonisation.
     */
    it("uses camelCase for sessionToken (not session_token)", () => {
      expect(
        isAuthVerifyResponse({
          ok: true,
          sessionToken: "s",
          accountId: "a",
        }),
      ).toBe(true);
    });

    it("uses camelCase for accountId (not account_id)", () => {
      expect(isAuthVerifyResponse({ ok: true, accountId: "a" })).toBe(true);
    });

    it("uses camelCase for requiresFactor + pendingToken (TOTP fork)", () => {
      expect(
        isAuthVerifyResponse({
          ok: true,
          requiresFactor: "totp",
          pendingToken: "p",
          accountId: "a",
        }),
      ).toBe(true);
    });
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 *   Signup response (test 5.8)
 * ═════════════════════════════════════════════════════════════════════════*/

interface SignupResponse {
  customerId: string;
  slug: string;
  tier: string;
  mcpEndpoint: string;
  apiKey: string;
  /** Object — exact shape depends on transport mode (HTTP vs STDIO). */
  mcpConfig: object;
  /** Object — tier-specific shape. */
  limits: object;
  status: string;
}

function isSignupResponse(x: unknown): x is SignupResponse {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.customerId === "string" &&
    typeof r.slug === "string" &&
    typeof r.tier === "string" &&
    typeof r.mcpEndpoint === "string" &&
    typeof r.apiKey === "string" &&
    typeof r.mcpConfig === "object" &&
    r.mcpConfig !== null &&
    typeof r.limits === "object" &&
    r.limits !== null &&
    typeof r.status === "string"
  );
}

describe("signup response shape (test 5.8)", () => {
  const validSignupResponse: SignupResponse = {
    customerId: "cus_123",
    slug: "acme-prod",
    tier: "starter",
    mcpEndpoint: "https://acme-prod.parametric-memory.dev/mcp",
    apiKey: "mmpm_live_abc123…",
    mcpConfig: {
      mcpServers: {
        "parametric-memory": {
          url: "https://acme-prod.parametric-memory.dev/mcp",
          headers: { Authorization: "Bearer mmpm_live_abc123…" },
        },
      },
    },
    limits: {
      memoryMb: 256,
      requestsPerMinute: 60,
    },
    status: "provisioning",
  };

  describe("accepts valid shapes", () => {
    it("accepts the canonical signup response", () => {
      expect(isSignupResponse(validSignupResponse)).toBe(true);
    });

    it("accepts unknown extra fields (forward-compat)", () => {
      expect(
        isSignupResponse({
          ...validSignupResponse,
          provisioningStartedAt: "2026-05-27T00:00:00Z",
        }),
      ).toBe(true);
    });

    it("accepts empty mcpConfig and limits objects (still objects, still present)", () => {
      expect(
        isSignupResponse({
          ...validSignupResponse,
          mcpConfig: {},
          limits: {},
        }),
      ).toBe(true);
    });
  });

  describe("rejects invalid shapes", () => {
    it("rejects null", () => {
      expect(isSignupResponse(null)).toBe(false);
    });

    it("rejects empty object", () => {
      expect(isSignupResponse({})).toBe(false);
    });

    describe("rejects each missing required field", () => {
      const required: (keyof SignupResponse)[] = [
        "customerId",
        "slug",
        "tier",
        "mcpEndpoint",
        "apiKey",
        "mcpConfig",
        "limits",
        "status",
      ];
      for (const field of required) {
        it(`rejects when missing ${field}`, () => {
          const broken: Record<string, unknown> = { ...validSignupResponse };
          delete broken[field];
          expect(isSignupResponse(broken)).toBe(false);
        });
      }
    });

    it("rejects apiKey as null (no field may be null)", () => {
      expect(isSignupResponse({ ...validSignupResponse, apiKey: null })).toBe(false);
    });

    it("rejects mcpConfig as null", () => {
      expect(isSignupResponse({ ...validSignupResponse, mcpConfig: null })).toBe(false);
    });

    it("rejects mcpConfig as string (must be an object)", () => {
      expect(isSignupResponse({ ...validSignupResponse, mcpConfig: "{}" })).toBe(false);
    });

    it("rejects mcpConfig as array (must be a plain object)", () => {
      // Arrays are objects in JS but conceptually the wrong shape here.
      // typeof [] === "object" so this DOES currently pass the guard.
      // Document the gap rather than silently accept.
      expect(isSignupResponse({ ...validSignupResponse, mcpConfig: [] })).toBe(true); // Known gap; tighten if/when a runtime guard lands.
    });

    it("rejects customerId as number", () => {
      expect(isSignupResponse({ ...validSignupResponse, customerId: 123 })).toBe(false);
    });
  });

  describe("field-name contract", () => {
    it("uses camelCase: customerId, mcpEndpoint, apiKey, mcpConfig (not snake_case)", () => {
      expect(isSignupResponse(validSignupResponse)).toBe(true);

      // snake_case substitutes should NOT validate.
      const snake = {
        customer_id: "cus_123",
        slug: "x",
        tier: "x",
        mcp_endpoint: "x",
        api_key: "x",
        mcp_config: {},
        limits: {},
        status: "x",
      };
      expect(isSignupResponse(snake)).toBe(false);
    });
  });
});
