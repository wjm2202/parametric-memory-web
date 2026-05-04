/**
 * Unit tests for the reauth helper (src/lib/reauth.ts).
 *
 * Covers:
 *   1. readReauthFlag returns true only for 401 + JSON body with
 *      `code: "reauth_required"`.
 *   2. Other status codes (200, 403, 500) are never treated as reauth.
 *   3. 401 with non-JSON body returns false (defensive against HTML or
 *      empty payloads from nginx error pages).
 *   4. 401 with JSON body but missing `code` returns false.
 *   5. The body is read via res.clone() so callers can still consume it.
 *   6. buildReauthUrl uses the current location and is open-redirect safe.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  readReauthFlag,
  buildReauthUrl,
  REAUTH_REQUIRED_TITLE,
  REAUTH_REQUIRED_BODY,
  REAUTH_REQUIRED_CTA,
} from "./reauth";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function htmlResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── readReauthFlag ──────────────────────────────────────────────────────────

describe("readReauthFlag", () => {
  it("returns true for 401 + code: reauth_required", async () => {
    const res = jsonResponse(401, {
      error: "This action requires you to sign in again",
      code: "reauth_required",
      reauthAgeSeconds: 312,
    });
    expect(await readReauthFlag(res)).toBe(true);
  });

  it("returns false for 401 with a different code", async () => {
    // Other 401 reasons (session_expired, missing_session, etc) must NOT
    // trigger the reauth UI — they need their own surfaces.
    const res = jsonResponse(401, { error: "Session expired", code: "session_expired" });
    expect(await readReauthFlag(res)).toBe(false);
  });

  it("returns false for 401 with no code field at all", async () => {
    const res = jsonResponse(401, { error: "Authentication required" });
    expect(await readReauthFlag(res)).toBe(false);
  });

  it("returns false for non-401 statuses even when code matches", async () => {
    // Defensive: the helper is keyed off status code AND body. A drift
    // that returned `code: "reauth_required"` with status 403 should NOT
    // hijack the UX path — that would mask a different policy failure.
    expect(await readReauthFlag(jsonResponse(200, { code: "reauth_required" }))).toBe(false);
    expect(await readReauthFlag(jsonResponse(403, { code: "reauth_required" }))).toBe(false);
    expect(await readReauthFlag(jsonResponse(500, { code: "reauth_required" }))).toBe(false);
  });

  it("returns false for 401 with non-JSON body (nginx HTML error page)", async () => {
    const res = htmlResponse(401, "<html><body>401 Unauthorized</body></html>");
    expect(await readReauthFlag(res)).toBe(false);
  });

  it("returns false for 401 with empty body", async () => {
    const res = new Response("", { status: 401 });
    expect(await readReauthFlag(res)).toBe(false);
  });

  it("uses res.clone() so the caller can still read the body afterwards", async () => {
    // The dashboard's catch-all path may want to re-parse a non-reauth
    // 401's body for its own message. The helper must NOT consume the
    // original stream.
    const res = jsonResponse(401, { code: "reauth_required" });
    const flag = await readReauthFlag(res);
    expect(flag).toBe(true);

    // Original stream still readable — would throw if already consumed.
    const body = await res.json();
    expect(body.code).toBe("reauth_required");
  });
});

// ─── buildReauthUrl ──────────────────────────────────────────────────────────

describe("buildReauthUrl", () => {
  it("includes the current pathname + search as the redirect target", () => {
    vi.stubGlobal("window", {
      location: { pathname: "/admin", search: "?slug=polar-void" },
    });
    expect(buildReauthUrl()).toBe("/login?redirect=%2Fadmin%3Fslug%3Dpolar-void");
  });

  it("uses /admin as the safe fallback if pathname is suspicious (open-redirect guard)", () => {
    // `//evil.com` is a protocol-relative URL — LoginClient's redirect
    // guard rejects it. Mirror that here so the URL we hand off can never
    // bypass that guard.
    vi.stubGlobal("window", {
      location: { pathname: "//evil.com", search: "" },
    });
    expect(buildReauthUrl()).toBe("/login?redirect=%2Fadmin");
  });

  it("returns plain /login when window is unavailable (server render path)", () => {
    // The helper is safe to import server-side; only invocation paths
    // that touch window are client-only. A defensive call from a server
    // boundary should still produce a usable URL rather than throwing.
    // @ts-expect-error — deliberately remove window for this scenario
    delete (globalThis as { window?: unknown }).window;
    expect(buildReauthUrl()).toBe("/login");
  });
});

// ─── Copy ────────────────────────────────────────────────────────────────────

describe("copy constants", () => {
  it("exports non-empty strings for the three reauth surfaces", () => {
    // Smoke test — the values themselves are reviewable in source; this
    // test catches accidental empty-string regressions or typo'd renames.
    expect(REAUTH_REQUIRED_TITLE.length).toBeGreaterThan(0);
    expect(REAUTH_REQUIRED_BODY.length).toBeGreaterThan(0);
    expect(REAUTH_REQUIRED_CTA.length).toBeGreaterThan(0);
    // Body must explain WHY ("for your security") and what to do
    // ("sign in again"). The exact window length deliberately isn't
    // hard-coded in this string — it's now factor-aware on the server
    // (10 / 30 min). Consumers wanting precise wording read the 401's
    // `windowMs` field instead.
    expect(REAUTH_REQUIRED_BODY.toLowerCase()).toContain("for your security");
    expect(REAUTH_REQUIRED_BODY.toLowerCase()).toContain("sign in again");
  });
});
