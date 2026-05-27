/**
 * Sprint nextjs-16-upgrade (2026-05-27) — ApiError contract guard (test 5.10).
 *
 * Pins the runtime behaviour of the `ApiError` envelope and the
 * `isApiError` type guard. This is the JSON shape the website expects
 * back from every compute backend route — both happy-path payloads and
 * error envelopes flow through `isApiError` before the website's UI or
 * AI clients render them.
 *
 * ── Scope ──
 *
 * This file tests only WHAT THIS REPO can know on its own:
 *   - the local module exports the expected interface + helpers
 *   - `isApiError` correctly accepts every valid envelope shape
 *   - `isApiError` correctly rejects every invalid shape we can imagine
 *     a misbehaving upstream sending (renamed fields, wrong types,
 *     null prototype, missing optionals)
 *
 * ── Out of scope (intentionally) ──
 *
 * Cross-repo byte equality with `parametric-memory-compute/src/types/
 * api-error.ts` is NOT tested here. A test that reads a sibling repo's
 * file via env-var path would either silently skip in CI (false
 * confidence) or break if the path was wrong. The architectural fix is
 * a shared package (out-of-scope item in
 * docs/SPRINT-NEXTJS-16-UPGRADE-2026-05-27.md). Until that lands, the
 * defence is: this guard, plus compute's own tests pinning the same
 * shape on its side, plus the fact that any runtime drift will
 * surface immediately as an `isApiError() === false` rejection in
 * production — caught by upstream-error handling rather than silently
 * crashing the UI.
 */

import { describe, it, expect } from "vitest";
import { apiError, isApiError, type ApiError } from "./api-error";

/* ─── Sample valid envelopes ─────────────────────────────────────────── */

const minimalEnvelope: ApiError = {
  error_code: "compute_unreachable",
  human_message: "We couldn't reach the memory service. Try again shortly.",
  ai_message: "Compute backend unreachable. Retry the request.",
  next_action: "Retry in 10 seconds.",
};

const fullEnvelope: ApiError = {
  ...minimalEnvelope,
  remediation_url: "https://parametric-memory.dev/status",
  detail: "ECONNREFUSED 10.0.0.1:3100",
};

describe("ApiError — local module shape", () => {
  it("exports the runtime helpers", () => {
    expect(typeof apiError).toBe("function");
    expect(typeof isApiError).toBe("function");
  });

  it("apiError() is an identity helper that returns its input", () => {
    const returned = apiError(minimalEnvelope);
    expect(returned).toBe(minimalEnvelope);
  });
});

describe("isApiError — accepts valid envelopes", () => {
  it("accepts the minimal four-required-field envelope", () => {
    expect(isApiError(minimalEnvelope)).toBe(true);
  });

  it("accepts the envelope with both optional fields populated", () => {
    expect(isApiError(fullEnvelope)).toBe(true);
  });

  it("accepts an envelope with only remediation_url populated", () => {
    expect(
      isApiError({
        ...minimalEnvelope,
        remediation_url: "https://parametric-memory.dev/billing",
      }),
    ).toBe(true);
  });

  it("accepts an envelope with only detail populated", () => {
    expect(isApiError({ ...minimalEnvelope, detail: "stack trace…" })).toBe(true);
  });

  it("accepts an envelope with extra unknown fields (forward compat)", () => {
    expect(
      isApiError({
        ...minimalEnvelope,
        // upstream may add fields the website doesn't know yet — these MUST
        // not cause the guard to reject; the website ignores what it doesn't
        // recognise.
        trace_id: "abc-123",
        recovered: false,
      }),
    ).toBe(true);
  });
});

describe("isApiError — rejects invalid inputs", () => {
  it("rejects null", () => {
    expect(isApiError(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isApiError(undefined)).toBe(false);
  });

  it("rejects primitives (string, number, boolean)", () => {
    expect(isApiError("error")).toBe(false);
    expect(isApiError(500)).toBe(false);
    expect(isApiError(false)).toBe(false);
  });

  it("rejects arrays", () => {
    expect(isApiError([])).toBe(false);
    expect(isApiError([minimalEnvelope])).toBe(false);
  });

  it("rejects empty object", () => {
    expect(isApiError({})).toBe(false);
  });

  describe("rejects envelopes missing each required field", () => {
    const required: (keyof ApiError)[] = [
      "error_code",
      "human_message",
      "ai_message",
      "next_action",
    ];
    for (const field of required) {
      it(`rejects an envelope missing ${field}`, () => {
        const broken: Record<string, unknown> = { ...minimalEnvelope };
        delete broken[field];
        expect(isApiError(broken)).toBe(false);
      });
    }
  });

  describe("rejects envelopes where a required field has the wrong type", () => {
    it("error_code as number", () => {
      expect(isApiError({ ...minimalEnvelope, error_code: 500 })).toBe(false);
    });

    it("human_message as null", () => {
      expect(isApiError({ ...minimalEnvelope, human_message: null })).toBe(false);
    });

    it("ai_message as object", () => {
      expect(isApiError({ ...minimalEnvelope, ai_message: {} })).toBe(false);
    });

    it("next_action as array", () => {
      expect(isApiError({ ...minimalEnvelope, next_action: ["retry"] })).toBe(false);
    });
  });

  describe("rejects envelopes where an optional field has the wrong type", () => {
    it("remediation_url as number (must be string-or-undefined)", () => {
      expect(isApiError({ ...minimalEnvelope, remediation_url: 42 })).toBe(false);
    });

    it("detail as boolean (must be string-or-undefined)", () => {
      expect(isApiError({ ...minimalEnvelope, detail: false })).toBe(false);
    });
  });

  it("accepts a null-prototype object as long as the required fields are present (security-tolerant)", () => {
    // JSON.parse() produces ordinary objects, but defensive parsers
    // sometimes hand us null-prototype objects. The guard should treat
    // them the same as ordinary objects.
    const nullProto = Object.assign(Object.create(null), minimalEnvelope);
    expect(isApiError(nullProto)).toBe(true);
  });
});

describe("isApiError — field name pins (compute contract)", () => {
  /*
   * If compute ever renames one of these fields, the website's runtime
   * narrowing will start returning false on every error envelope and the
   * upstream-error UI path will degrade. The field NAMES are the contract.
   * These tests pin them explicitly so renaming any one of them on this
   * side surfaces as a clear test failure rather than as a silent runtime
   * regression in production.
   */
  it("uses snake_case field names (error_code, human_message, ai_message, next_action)", () => {
    // Build the envelope as a Record so we can assert by string key without
    // TypeScript narrowing eating the keys we're verifying.
    const e: Record<string, string> = {
      error_code: "x",
      human_message: "x",
      ai_message: "x",
      next_action: "x",
    };
    expect(isApiError(e)).toBe(true);
    // And the camelCase equivalents must NOT be accepted as substitutes.
    expect(
      isApiError({
        errorCode: "x",
        humanMessage: "x",
        aiMessage: "x",
        nextAction: "x",
      }),
    ).toBe(false);
  });

  it("uses snake_case for the optional fields too (remediation_url, detail)", () => {
    expect(
      isApiError({
        ...minimalEnvelope,
        remediation_url: "/foo",
        detail: "bar",
      }),
    ).toBe(true);
    // camelCase variants are extra fields, not the optional ones — the
    // guard accepts them (forward compat) but the website's typed handlers
    // would not see them as the documented optionals.
    expect(
      isApiError({
        ...minimalEnvelope,
        remediationUrl: "/foo",
        detailMessage: "bar",
      }),
    ).toBe(true); // guard accepts; but documented contract NAMES are snake_case
  });
});
