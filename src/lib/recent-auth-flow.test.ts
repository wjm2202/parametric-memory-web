/**
 * Tests for recent-auth-flow.
 *
 * Coverage:
 *   1. canonicaliseNext returns the input when it's on the allow-list.
 *   2. canonicaliseNext returns the default for unknown / hostile inputs.
 *   3. triggerRecentAuthFlow sets the mmpm_redirect cookie before firing
 *      the request-link call.
 *   4. triggerRecentAuthFlow POSTs to /api/auth/request-link with the email.
 *   5. 200 → ok: true.
 *   6. 429 → errorCode: 'rate_limited' with a human message.
 *   7. 400 → errorCode: 'validation'.
 *   8. Network error → errorCode: 'network'.
 *   9. Unknown 5xx → errorCode: 'unknown'.
 *  10. A hostile `next` value gets canonicalised to the default before
 *      being written to the cookie — defence in depth.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { canonicaliseNext, triggerRecentAuthFlow } from "./recent-auth-flow";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  // Reset cookie between tests — jsdom doesn't auto-clear.
  document.cookie = "mmpm_redirect=;path=/;max-age=0";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.cookie = "mmpm_redirect=;path=/;max-age=0";
});

function mockResponse(status: number): void {
  (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  });
}

// ─── canonicaliseNext ─────────────────────────────────────────────────────────

describe("canonicaliseNext", () => {
  it.each([
    ["/admin/security", "/admin/security"],
    ["/admin/security/two-factor", "/admin/security/two-factor"],
    ["/admin/security/two-factor/disable", "/admin/security/two-factor/disable"],
    ["/admin/security/two-factor/regenerate", "/admin/security/two-factor/regenerate"],
  ])("allow-list pass-through for %s", (input, expected) => {
    expect(canonicaliseNext(input)).toBe(expected);
  });

  it.each([
    "/admin/billing",
    "/admin",
    "/dashboard",
    "https://evil.com/x",
    "//evil.com",
    "/admin/security/../../etc",
    "javascript:alert(1)",
    "",
  ])("falls back to /admin/security for hostile or unknown %s", (input) => {
    expect(canonicaliseNext(input)).toBe("/admin/security");
  });
});

// ─── triggerRecentAuthFlow — cookie + request ─────────────────────────────────

describe("triggerRecentAuthFlow — happy path", () => {
  it("sets mmpm_redirect cookie and POSTs to /api/auth/request-link", async () => {
    mockResponse(200);
    const result = await triggerRecentAuthFlow({
      email: "alice@example.com",
      next: "/admin/security/two-factor",
    });

    expect(result.ok).toBe(true);
    expect(document.cookie).toContain("mmpm_redirect=");
    expect(decodeURIComponent(document.cookie)).toContain("/admin/security/two-factor");
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/request-link",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "alice@example.com" }),
        credentials: "same-origin",
      }),
    );
  });

  it("hostile `next` gets canonicalised before being written to cookie", async () => {
    mockResponse(200);
    await triggerRecentAuthFlow({
      email: "alice@example.com",
      next: "https://evil.com/steal",
    });
    // Decoded cookie value should be the safe default, not the attacker URL.
    expect(decodeURIComponent(document.cookie)).toContain("/admin/security");
    expect(document.cookie).not.toContain("evil.com");
  });
});

// ─── triggerRecentAuthFlow — error mapping ────────────────────────────────────

describe("triggerRecentAuthFlow — error mapping", () => {
  it("429 → rate_limited", async () => {
    mockResponse(429);
    const result = await triggerRecentAuthFlow({
      email: "alice@example.com",
      next: "/admin/security",
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("rate_limited");
    expect(result.errorMessage).toMatch(/few minutes/i);
  });

  it("400 → validation", async () => {
    mockResponse(400);
    const result = await triggerRecentAuthFlow({
      email: "garbage",
      next: "/admin/security",
    });
    expect(result.errorCode).toBe("validation");
  });

  it("500 → unknown", async () => {
    mockResponse(500);
    const result = await triggerRecentAuthFlow({
      email: "alice@example.com",
      next: "/admin/security",
    });
    expect(result.errorCode).toBe("unknown");
  });

  it("fetch reject → network", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError("offline"));
    const result = await triggerRecentAuthFlow({
      email: "alice@example.com",
      next: "/admin/security",
    });
    expect(result.errorCode).toBe("network");
  });
});
