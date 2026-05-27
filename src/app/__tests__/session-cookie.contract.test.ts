/**
 * Sprint nextjs-16-upgrade (2026-05-27) — session cookie contract (test 5.6).
 *
 * Pins the exact Set-Cookie attributes for the two cookies this codebase
 * mints:
 *   - `mmpm_session`  — 30-day authenticated session, set in
 *                       src/app/auth/callback/route.ts:123-129 and
 *                       src/app/api/auth/factors/totp/login-verify/route.ts:171-176.
 *   - `mmpm_pending_token` — 10-minute pending-token cookie for the TOTP
 *                       challenge fork, set in callback/route.ts:105-111.
 *
 * Why pin this at the cookie-serializer level rather than at the route
 * handler? Two reasons.
 *
 * (1) Forward-compat for Next.js 16. Any change to Next's cookie API
 *     defaults (SameSite tightening to Strict, automatic Partitioned
 *     attribute, Priority hints, etc.) flows through `cookies().set()`
 *     and `NextResponse.cookies.set()` identically. By passing the exact
 *     options object the route handlers use into NextResponse.cookies.set
 *     and asserting on the resulting Set-Cookie header, we catch any
 *     platform-level default flip.
 *
 * (2) Route handlers are tested elsewhere. The full magic-link and TOTP
 *     login flows have their own route.test.ts coverage. This file
 *     focuses on the cookie's wire format, not on whether the right
 *     branch sets the right cookie.
 *
 * Reference: docs/SPRINT-NEXTJS-16-UPGRADE-2026-05-27.md (test 5.6).
 */

import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";

/* ─── Constants — MUST mirror the route handlers ────────────────────────── */

// These values appear in src/app/auth/callback/route.ts and
// src/app/api/auth/factors/totp/login-verify/route.ts. They are duplicated
// here because the route files declare them as module-private constants
// (not exported). If you change either constant in a route file, you MUST
// also change it here, and code review surfaces the drift.
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 2,592,000 — 30 days
const PENDING_MAX_AGE = 10 * 60; // 600 — 10 minutes

const SESSION_COOKIE = "mmpm_session";
const PENDING_COOKIE = "mmpm_pending_token";

/* ─── Helpers ───────────────────────────────────────────────────────────── */

/**
 * Build a NextResponse and write the cookie using the EXACT options shape
 * the route handlers use, then return the Set-Cookie header (single value).
 *
 * The `secure` parameter mirrors the route handlers' `!isLocalhost`
 * boolean — they drop Secure on localhost (because the browser silently
 * discards Secure cookies over HTTP). The test exercises both branches.
 */
function setSessionCookie(secure: boolean): string {
  const res = NextResponse.next();
  res.cookies.set(SESSION_COOKIE, "test-session-token", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  const value = res.headers.get("set-cookie");
  if (value === null) throw new Error("No Set-Cookie header on response");
  return value;
}

function setPendingCookie(secure: boolean): string {
  const res = NextResponse.next();
  res.cookies.set(PENDING_COOKIE, "test-pending-token", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: PENDING_MAX_AGE,
  });
  const value = res.headers.get("set-cookie");
  if (value === null) throw new Error("No Set-Cookie header on response");
  return value;
}

/** Case-insensitive substring matcher — Set-Cookie attribute names are
 *  case-insensitive per RFC 6265 §5.2, so the test should be tolerant. */
function containsAttribute(header: string, attr: string): boolean {
  return header.toLowerCase().includes(attr.toLowerCase());
}

/* ─── mmpm_session — production (Secure) ────────────────────────────────── */

describe("mmpm_session — production attributes (Secure path)", () => {
  const header = setSessionCookie(true);

  it("starts with the cookie name=value (mmpm_session=<token>)", () => {
    expect(header.startsWith(`${SESSION_COOKIE}=test-session-token`)).toBe(true);
  });

  it("carries Path=/", () => {
    expect(containsAttribute(header, "Path=/")).toBe(true);
  });

  it("carries Max-Age=2592000 (30 days)", () => {
    expect(containsAttribute(header, `Max-Age=${SESSION_MAX_AGE}`)).toBe(true);
  });

  it("carries HttpOnly", () => {
    expect(containsAttribute(header, "HttpOnly")).toBe(true);
  });

  it("carries SameSite=Lax", () => {
    expect(containsAttribute(header, "SameSite=Lax")).toBe(true);
  });

  it("carries Secure", () => {
    expect(containsAttribute(header, "Secure")).toBe(true);
  });

  it("does NOT carry SameSite=Strict (v16 forward-compat: defaults must not tighten)", () => {
    expect(containsAttribute(header, "SameSite=Strict")).toBe(false);
  });

  it("does NOT carry Partitioned (v16 forward-compat: defaults must not auto-add CHIPS)", () => {
    expect(containsAttribute(header, "Partitioned")).toBe(false);
  });

  it("does NOT carry Domain= (we want host-only cookies)", () => {
    expect(containsAttribute(header, "Domain=")).toBe(false);
  });
});

/* ─── mmpm_session — localhost (no Secure) ──────────────────────────────── */

describe("mmpm_session — localhost attributes (Secure dropped)", () => {
  const header = setSessionCookie(false);

  it("carries HttpOnly + SameSite=Lax + Path=/", () => {
    expect(containsAttribute(header, "HttpOnly")).toBe(true);
    expect(containsAttribute(header, "SameSite=Lax")).toBe(true);
    expect(containsAttribute(header, "Path=/")).toBe(true);
  });

  it("does NOT carry Secure (localhost dev over HTTP)", () => {
    // RFC 6265 §5.2.5: Secure attribute name on its own; check we don't
    // emit `; Secure;` or `; Secure$`. Case-insensitive.
    expect(/;\s*secure(\b|;|$)/i.test(header)).toBe(false);
  });

  it("still carries Max-Age=2592000", () => {
    expect(containsAttribute(header, `Max-Age=${SESSION_MAX_AGE}`)).toBe(true);
  });
});

/* ─── mmpm_pending_token — same shape, shorter Max-Age ──────────────────── */

describe("mmpm_pending_token — production attributes", () => {
  const header = setPendingCookie(true);

  it("starts with the cookie name=value (mmpm_pending_token=<token>)", () => {
    expect(header.startsWith(`${PENDING_COOKIE}=test-pending-token`)).toBe(true);
  });

  it("carries HttpOnly + SameSite=Lax + Secure + Path=/", () => {
    expect(containsAttribute(header, "HttpOnly")).toBe(true);
    expect(containsAttribute(header, "SameSite=Lax")).toBe(true);
    expect(containsAttribute(header, "Secure")).toBe(true);
    expect(containsAttribute(header, "Path=/")).toBe(true);
  });

  it("carries Max-Age=600 (10 minutes) — much shorter than session", () => {
    expect(containsAttribute(header, `Max-Age=${PENDING_MAX_AGE}`)).toBe(true);
    expect(containsAttribute(header, `Max-Age=${SESSION_MAX_AGE}`)).toBe(false);
  });
});

/* ─── Constant pins (drift guard) ───────────────────────────────────────── */

describe("Cookie Max-Age constants — drift guard", () => {
  it("SESSION_MAX_AGE is exactly 30 days in seconds", () => {
    expect(SESSION_MAX_AGE).toBe(2_592_000);
  });

  it("PENDING_MAX_AGE is exactly 10 minutes in seconds", () => {
    expect(PENDING_MAX_AGE).toBe(600);
  });

  it("SESSION_MAX_AGE is much longer than PENDING_MAX_AGE (≥ 4000× ratio)", () => {
    // Sanity check that someone hasn't accidentally swapped the two.
    expect(SESSION_MAX_AGE / PENDING_MAX_AGE).toBeGreaterThanOrEqual(4000);
  });
});
