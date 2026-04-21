/**
 * session-rotation.test.ts — ADR-003 Phase 2 OAuth, T5.
 *
 * Behavioural contract:
 *   1. Attribute set matches the magic-link handler exactly (httpOnly,
 *      secure, SameSite=Lax, Path=/, Max-Age=30d default).
 *   2. `secure` is the explicit control; the helper neither derives
 *      nor overrides it — the caller's boolean wins.
 *   3. Two consecutive calls with different tokens replace, not
 *      append. (This is Next.js's `cookies().set()` semantics; we
 *      assert it so a future refactor that breaks the contract fails
 *      loudly here.)
 *   4. Clear emits a `.delete(name)` — the canonical Max-Age=0 path.
 *   5. Empty / non-string tokens throw before any cookie is written.
 *   6. Caller options (maxAge, path, domain, sameSite) pass through.
 *   7. `isSecureHost` matches the magic-link handler's localhost check.
 *
 * Test fake
 * ─────────
 * `FakeCookieStore` captures every `set` / `delete` call as an
 * ordered log. That lets the "replaces, not appends" test assert
 * that after two sets with the same name only ONE value survives in
 * the observable state — the same thing a real browser would do.
 *
 * We could test against Next.js's real `cookies()` via integration,
 * but the helper's API is deliberately structural so it works with
 * any minimal fake. Integration with the real Next runtime belongs in
 * the T7 callback test, not here.
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  SESSION_COOKIE_NAME,
  DEFAULT_SESSION_MAX_AGE_SECONDS,
  rotateSessionCookie,
  clearSessionCookie,
  isSecureHost,
  type SessionCookieStore,
} from "./session-rotation";

// ─── Test fake ─────────────────────────────────────────────────────────────

type CookieOpts = Parameters<SessionCookieStore["set"]>[2];
type SetOp = { op: "set"; name: string; value: string; options: CookieOpts };
type DeleteOp = { op: "delete"; name: string };
type Op = SetOp | DeleteOp;

class FakeCookieStore implements SessionCookieStore {
  calls: Op[] = [];

  set(name: string, value: string, options: CookieOpts): void {
    this.calls.push({ op: "set", name, value, options });
  }

  delete(name: string): void {
    this.calls.push({ op: "delete", name });
  }

  /**
   * Resolve the current observable cookie value — the last set that
   * wasn't superseded by a subsequent delete. Returns `undefined` for
   * "no cookie" (either never set, or deleted last).
   */
  current(name: string): string | undefined {
    let value: string | undefined = undefined;
    for (const call of this.calls) {
      if (call.name !== name) continue;
      if (call.op === "set") value = call.value;
      if (call.op === "delete") value = undefined;
    }
    return value;
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("rotateSessionCookie", () => {
  let store: FakeCookieStore;

  beforeEach(() => {
    store = new FakeCookieStore();
  });

  it("sets the session cookie with the full magic-link attribute set", () => {
    rotateSessionCookie(store, "session-token-abc", { secure: true });

    expect(store.calls).toHaveLength(1);
    const call = store.calls[0];
    expect(call.op).toBe("set");
    if (call.op !== "set") throw new Error("unreachable");

    expect(call.name).toBe(SESSION_COOKIE_NAME);
    expect(call.name).toBe("mmpm_session"); // literal check — name is a wire contract
    expect(call.value).toBe("session-token-abc");
    expect(call.options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: DEFAULT_SESSION_MAX_AGE_SECONDS,
    });
  });

  it("honours secure=false for localhost (the footgun case)", () => {
    // The whole reason `secure` is a required option: passing true here
    // on an HTTP dev server would drop the cookie silently.
    rotateSessionCookie(store, "dev-token", { secure: false });

    const call = store.calls[0];
    if (call.op !== "set") throw new Error("unreachable");
    expect(call.options.secure).toBe(false);
  });

  it("always sets httpOnly=true regardless of caller options", () => {
    // Callers can't pass httpOnly through SessionCookieOptions. The
    // attribute is hard-coded because a session cookie readable from
    // JavaScript would be a full-blown XSS escalation vector.
    rotateSessionCookie(store, "token", { secure: true });
    rotateSessionCookie(store, "token", { secure: false });

    for (const call of store.calls) {
      if (call.op !== "set") throw new Error("unreachable");
      expect(call.options.httpOnly).toBe(true);
    }
  });

  it("replaces, does not append, on a second rotation of the same cookie", () => {
    // Models: a user signs in via magic-link (old-token), then finishes
    // linking Google. We re-rotate with a fresh token. The browser
    // should end up with ONE cookie, the new value.
    rotateSessionCookie(store, "old-token", { secure: true });
    rotateSessionCookie(store, "new-token", { secure: true });

    expect(store.calls).toHaveLength(2); // both set calls observed
    expect(store.current(SESSION_COOKIE_NAME)).toBe("new-token");
  });

  it("passes through a custom maxAge", () => {
    rotateSessionCookie(store, "token", { secure: true, maxAge: 60 });
    const call = store.calls[0];
    if (call.op !== "set") throw new Error("unreachable");
    expect(call.options.maxAge).toBe(60);
  });

  it("passes through a custom path", () => {
    rotateSessionCookie(store, "token", { secure: true, path: "/app" });
    const call = store.calls[0];
    if (call.op !== "set") throw new Error("unreachable");
    expect(call.options.path).toBe("/app");
  });

  it("passes through a custom domain when supplied", () => {
    rotateSessionCookie(store, "token", {
      secure: true,
      domain: ".parametric-memory.dev",
    });
    const call = store.calls[0];
    if (call.op !== "set") throw new Error("unreachable");
    expect(call.options.domain).toBe(".parametric-memory.dev");
  });

  it("omits the domain attribute entirely when not supplied", () => {
    // Setting `domain: undefined` and omitting the key are NOT the
    // same in Next's cookies API — an explicit undefined shows up in
    // some framework codepaths. We want a clean omission.
    rotateSessionCookie(store, "token", { secure: true });
    const call = store.calls[0];
    if (call.op !== "set") throw new Error("unreachable");
    expect(Object.prototype.hasOwnProperty.call(call.options, "domain")).toBe(false);
  });

  it("passes through a custom sameSite", () => {
    rotateSessionCookie(store, "token", {
      secure: true,
      sameSite: "strict",
    });
    const call = store.calls[0];
    if (call.op !== "set") throw new Error("unreachable");
    expect(call.options.sameSite).toBe("strict");
  });

  it("rejects an empty sessionToken before touching the cookie store", () => {
    expect(() => rotateSessionCookie(store, "", { secure: true })).toThrow(/non-empty string/);
    expect(store.calls).toHaveLength(0);
  });

  it("rejects a non-string sessionToken", () => {
    expect(() =>
      // @ts-expect-error — runtime guard exists for JS callers too
      rotateSessionCookie(store, null, { secure: true }),
    ).toThrow(/non-empty string/);
    expect(() =>
      // @ts-expect-error — runtime guard exists for JS callers too
      rotateSessionCookie(store, undefined, { secure: true }),
    ).toThrow(/non-empty string/);
    expect(store.calls).toHaveLength(0);
  });
});

describe("clearSessionCookie", () => {
  it("calls delete with the session cookie name", () => {
    const store = new FakeCookieStore();
    clearSessionCookie(store);

    expect(store.calls).toHaveLength(1);
    expect(store.calls[0]).toEqual({ op: "delete", name: SESSION_COOKIE_NAME });
  });

  it("leaves no observable cookie value after a prior rotation", () => {
    // Users logging out should leave no ghost token behind.
    const store = new FakeCookieStore();
    rotateSessionCookie(store, "existing", { secure: true });
    expect(store.current(SESSION_COOKIE_NAME)).toBe("existing");

    clearSessionCookie(store);
    expect(store.current(SESSION_COOKIE_NAME)).toBeUndefined();
  });
});

describe("isSecureHost", () => {
  it("returns false for localhost (HTTP dev server)", () => {
    expect(isSecureHost("localhost")).toBe(false);
  });

  it("returns false for 127.0.0.1 (HTTP dev server)", () => {
    expect(isSecureHost("127.0.0.1")).toBe(false);
  });

  it("returns true for real production hostnames", () => {
    expect(isSecureHost("parametric-memory.dev")).toBe(true);
    expect(isSecureHost("memory.kiwi")).toBe(true);
    expect(isSecureHost("app.parametric-memory.dev")).toBe(true);
  });

  it("returns true for arbitrary non-localhost strings (defensive default)", () => {
    // A misconfigured proxy could report an unexpected hostname. We
    // default to secure=true for anything we don't recognise — the
    // worst case is a session cookie that requires HTTPS, which is
    // the right default for everything that isn't the dev loopback.
    expect(isSecureHost("staging.example.com")).toBe(true);
    expect(isSecureHost("some-random-host")).toBe(true);
  });
});
