/**
 * route.test.ts — GET /api/auth/oauth/:provider/callback  (S2T7b.4)
 *
 * What this file tests
 * ────────────────────
 * The WIRING between the Next.js handler and the pure decision module
 * in `src/lib/auth/oauth-callback.ts`. The decision logic itself has
 * its own 50+-test suite (`oauth-callback.test.ts`); re-testing every
 * branch here would duplicate coverage at several times the setup
 * cost (cookies + rotateSessionCookie + redirect + notFound mocks per
 * case). Instead we mock `handleOauthCallback` to return canned results
 * and assert the handler:
 *
 *   1. Forwards raw URL segment + query params + state cookie + session
 *      cookie + hostname to the decision module unchanged.
 *   2. `not-found`                          ⇒ `notFound()` called, no
 *                                              cookie mutations.
 *   3. `redirect` with `clearStateCookie`   ⇒ `cookieStore.delete(state)`
 *                                              called BEFORE `redirect`.
 *   4. `redirect` with `sessionCookie`      ⇒ `rotateSessionCookie(...)`
 *                                              called with the exact
 *                                              descriptor values.
 *   5. `redirect` without `sessionCookie`   ⇒ NO rotateSessionCookie call
 *                                              (link success path — user
 *                                              stays on same session).
 *   6. `redirect(destination)` is always the last effect; no further
 *      cookie mutations after the sentinel fires.
 *
 * Next.js sentinel handling
 * ─────────────────────────
 * `redirect()` and `notFound()` throw `NEXT_REDIRECT` / `NEXT_NOT_FOUND`
 * in prod; we substitute tagged sentinel classes so tests can observe
 * "redirect was called with URL X" without needing a Next.js renderer.
 * Same pattern as `start/route.test.ts` — read that file first if any
 * of this is unclear.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ─── Sentinels ─────────────────────────────────────────────────────────────

class RedirectSentinel extends Error {
  constructor(public readonly url: string) {
    super(`[redirect] ${url}`);
    this.name = "RedirectSentinel";
  }
}
class NotFoundSentinel extends Error {
  constructor() {
    super("[notFound]");
    this.name = "NotFoundSentinel";
  }
}

// ─── Module mocks ──────────────────────────────────────────────────────────
// Hoisting: `vi.mock` factories run before any `import`. Anything the
// factory needs must come from `vi.hoisted(…)`.

const h = vi.hoisted(() => {
  return {
    handleOauthCallbackSpy: vi.fn(),
    rotateSessionCookieSpy: vi.fn(),
    // H4 belt-and-braces fixation defense: the route calls
    // `clearSessionCookie(cookieStore)` immediately before rotating on
    // signin success. Mocked so the real `cookieStore.delete(SESSION_COOKIE_NAME)`
    // never fires — that would push an extra entry onto `store.deletes`
    // and couple every test to the fixation-defense sequencing. Tests
    // that care about the ordering assert against `clearSessionCookieSpy`
    // directly.
    clearSessionCookieSpy: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSentinel(url);
  },
  notFound: () => {
    throw new NotFoundSentinel();
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/auth/oauth-callback", async () => {
  // Re-export the real STATE_COOKIE_NAME constant so the route file's
  // `cookieStore.get(STATE_COOKIE_NAME)` uses the production value.
  // Everything else is stubbed.
  const actual = await vi.importActual<typeof import("@/lib/auth/oauth-callback")>(
    "@/lib/auth/oauth-callback",
  );
  return {
    ...actual,
    handleOauthCallback: h.handleOauthCallbackSpy,
  };
});

vi.mock("@/lib/auth/session-rotation", async () => {
  // Preserve SESSION_COOKIE_NAME so `cookieStore.get(SESSION_COOKIE_NAME)`
  // in the route resolves to the same production constant. Stub
  // rotateSessionCookie so we can assert exact argument forwarding
  // without actually setting cookies.
  const actual = await vi.importActual<typeof import("@/lib/auth/session-rotation")>(
    "@/lib/auth/session-rotation",
  );
  return {
    ...actual,
    rotateSessionCookie: h.rotateSessionCookieSpy,
    clearSessionCookie: h.clearSessionCookieSpy,
  };
});

// ─── Imports that depend on the mocks above ────────────────────────────────

import { GET } from "./route";
import { cookies } from "next/headers";
import { STATE_COOKIE_NAME } from "@/lib/auth/oauth-callback";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-rotation";

const mockCookies = cookies as unknown as ReturnType<typeof vi.fn>;

// ─── Test fakes ────────────────────────────────────────────────────────────

interface CookieGet {
  value: string;
}

/**
 * Cookie store fake modelling the subset of Next's `cookies()` API the
 * route actually uses: `get(name)` → `{ value }` or undefined,
 * `delete(name)` tracked in a log, and `set(name, value, opts)` tracked
 * (not called by the route directly, but passed through to
 * `rotateSessionCookie` which we've mocked).
 */
function makeCookieStore(initial: Record<string, string> = {}) {
  const storage = new Map<string, string>(Object.entries(initial));
  const deletes: string[] = [];
  const sets: Array<{ name: string; value: string; options: unknown }> = [];
  return {
    storage,
    deletes,
    sets,
    get(name: string): CookieGet | undefined {
      const value = storage.get(name);
      return value !== undefined ? { value } : undefined;
    },
    set(name: string, value: string, options: unknown): void {
      sets.push({ name, value, options });
      storage.set(name, value);
    },
    delete(name: string): void {
      deletes.push(name);
      storage.delete(name);
    },
  };
}

/**
 * Minimal `NextRequest` — only the surfaces the route reads. A real
 * NextRequest needs a Request polyfill; this avoids that dependency.
 */
function makeRequest(
  opts: {
    hostname?: string;
    code?: string | null;
    state?: string | null;
    error?: string | null;
    errorDescription?: string | null;
  } = {},
): NextRequest {
  const params = new URLSearchParams();
  if (opts.code !== undefined && opts.code !== null) params.set("code", opts.code);
  if (opts.state !== undefined && opts.state !== null) params.set("state", opts.state);
  if (opts.error !== undefined && opts.error !== null) params.set("error", opts.error);
  if (opts.errorDescription !== undefined && opts.errorDescription !== null) {
    params.set("error_description", opts.errorDescription);
  }
  return {
    nextUrl: {
      hostname: opts.hostname ?? "parametric-memory.dev",
      searchParams: params,
    },
  } as unknown as NextRequest;
}

function makeCtx(provider: string) {
  return { params: Promise.resolve({ provider }) };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default cookie store for tests that don't override it.
  mockCookies.mockResolvedValue(makeCookieStore());
});

describe("GET /api/auth/oauth/:provider/callback — argument forwarding", () => {
  it("forwards raw query params, cookies, and hostname to handleOauthCallback", async () => {
    const store = makeCookieStore({
      [STATE_COOKIE_NAME]: "cookie-state-value",
      [SESSION_COOKIE_NAME]: "cookie-session-value",
    });
    mockCookies.mockResolvedValue(store);

    // Return not-found so the handler short-circuits before touching
    // cookies (other than the initial reads). We only want to inspect
    // what was passed to the decision module.
    h.handleOauthCallbackSpy.mockResolvedValue({ kind: "not-found" });

    await expect(
      GET(
        makeRequest({
          hostname: "parametric-memory.dev",
          code: "auth-code-123",
          state: "query-state-value",
          error: "access_denied",
          errorDescription: "user canceled",
        }),
        makeCtx("google"),
      ),
    ).rejects.toThrow(NotFoundSentinel);

    expect(h.handleOauthCallbackSpy).toHaveBeenCalledTimes(1);
    const [deps, args] = h.handleOauthCallbackSpy.mock.calls[0]!;

    // Deps — assert every required field is present. Catching a
    // regression that drops a dep is the point; exact references are
    // module singletons and not stable to assert.
    expect(deps).toHaveProperty("registry");
    expect(deps).toHaveProperty("store");
    expect(deps).toHaveProperty("bridgeClient");
    expect(deps).toHaveProperty("config");

    // Args — the pure values pulled off the request + cookies.
    expect(args).toEqual({
      providerId: "google",
      code: "auth-code-123",
      state: "query-state-value",
      providerError: "access_denied",
      providerErrorDescription: "user canceled",
      stateCookie: "cookie-state-value",
      // Full `Cookie` header string (name=value), not just the value.
      sessionCookie: `${SESSION_COOKIE_NAME}=cookie-session-value`,
      hostname: "parametric-memory.dev",
    });
  });

  it("forwards null for missing query params and absent cookies", async () => {
    // Empty cookie store — no state cookie, no session cookie. Every
    // query param absent too. The route must forward `null` for each,
    // letting the decision module own every "missing" branch.
    mockCookies.mockResolvedValue(makeCookieStore());
    h.handleOauthCallbackSpy.mockResolvedValue({ kind: "not-found" });

    await expect(GET(makeRequest(), makeCtx("google"))).rejects.toThrow(NotFoundSentinel);

    const [, args] = h.handleOauthCallbackSpy.mock.calls[0]!;
    expect(args.code).toBeNull();
    expect(args.state).toBeNull();
    expect(args.providerError).toBeNull();
    expect(args.providerErrorDescription).toBeNull();
    expect(args.stateCookie).toBeNull();
    expect(args.sessionCookie).toBeNull();
  });
});

describe("GET /api/auth/oauth/:provider/callback — result translation", () => {
  it("not-found → calls notFound(), no cookie mutations", async () => {
    const store = makeCookieStore({
      [STATE_COOKIE_NAME]: "some-value",
    });
    mockCookies.mockResolvedValue(store);
    h.handleOauthCallbackSpy.mockResolvedValue({ kind: "not-found" });

    await expect(GET(makeRequest(), makeCtx("facebook"))).rejects.toThrow(NotFoundSentinel);

    // Critical invariant: not-found MUST NOT clear the state cookie.
    // The branch collapses "error" with "route does not exist" —
    // touching the cookie would leak signal about the flag's state.
    expect(store.deletes).toHaveLength(0);
    expect(h.rotateSessionCookieSpy).not.toHaveBeenCalled();
  });

  it("redirect + clearStateCookie → deletes state cookie, then redirects", async () => {
    const store = makeCookieStore({
      [STATE_COOKIE_NAME]: "state-to-clear",
    });
    mockCookies.mockResolvedValue(store);
    h.handleOauthCallbackSpy.mockResolvedValue({
      kind: "redirect",
      destination: "/login?error=oauth_state",
      sessionCookie: null,
      pendingTokenCookie: null,
      clearStateCookie: true,
      reason: "state_mismatch",
    });

    const err = await GET(makeRequest(), makeCtx("google")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RedirectSentinel);
    expect((err as RedirectSentinel).url).toBe("/login?error=oauth_state");

    // State cookie was deleted; no session rotation happened.
    expect(store.deletes).toEqual([STATE_COOKIE_NAME]);
    expect(h.rotateSessionCookieSpy).not.toHaveBeenCalled();
  });

  it("redirect + sessionCookie → rotates session with exact descriptor, clears state, redirects", async () => {
    // Signin happy path. The decision module returned a fresh
    // SessionCookieDescriptor; the route must hand every attribute to
    // rotateSessionCookie. `name` isn't forwarded because
    // `rotateSessionCookie` owns the name constant — defense-in-depth
    // against a descriptor that accidentally named a different cookie.
    const store = makeCookieStore({
      [STATE_COOKIE_NAME]: "state-to-clear",
    });
    mockCookies.mockResolvedValue(store);
    h.handleOauthCallbackSpy.mockResolvedValue({
      kind: "redirect",
      destination: "/dashboard",
      sessionCookie: {
        name: SESSION_COOKIE_NAME,
        value: "fresh-session-token",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 2_592_000,
      },
      pendingTokenCookie: null,
      clearStateCookie: true,
      reason: "ok_signin",
    });

    const err = await GET(makeRequest(), makeCtx("google")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RedirectSentinel);
    expect((err as RedirectSentinel).url).toBe("/dashboard");

    // State cleared. `clearSessionCookieSpy` is mocked so it does NOT
    // push `SESSION_COOKIE_NAME` onto `store.deletes` — see the hoisted
    // block's comment on why that matters for this assertion.
    expect(store.deletes).toEqual([STATE_COOKIE_NAME]);

    // Session rotated with the descriptor's values.
    expect(h.rotateSessionCookieSpy).toHaveBeenCalledTimes(1);
    const [cookieStoreArg, token, options] = h.rotateSessionCookieSpy.mock.calls[0]!;
    expect(cookieStoreArg).toBe(store); // same cookie store ref
    expect(token).toBe("fresh-session-token");
    expect(options).toEqual({
      secure: true,
      maxAge: 2_592_000,
      sameSite: "lax",
      path: "/",
    });

    // H4 — the fixation-defense clear ran with the same store.
    expect(h.clearSessionCookieSpy).toHaveBeenCalledTimes(1);
    expect(h.clearSessionCookieSpy).toHaveBeenCalledWith(store);
  });

  it("signin success: clears existing session cookie BEFORE rotating (H4 fixation defense)", async () => {
    // Regression for the security-review H4 finding. If a refactor
    // drops the `clearSessionCookie(cookieStore)` call or moves it
    // AFTER `rotateSessionCookie`, an attacker-pre-planted cookie on a
    // divergent path can survive sign-in. vitest's `.mock.invocationCallOrder`
    // is a monotonically increasing counter shared across all spies in
    // the file — strictly-less-than is the canonical way to assert
    // ordering across multiple mocks.
    const store = makeCookieStore();
    mockCookies.mockResolvedValue(store);
    h.handleOauthCallbackSpy.mockResolvedValue({
      kind: "redirect",
      destination: "/dashboard",
      sessionCookie: {
        name: SESSION_COOKIE_NAME,
        value: "fresh-session-token",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 2_592_000,
      },
      pendingTokenCookie: null,
      clearStateCookie: true,
      reason: "ok_signin",
    });

    await GET(makeRequest(), makeCtx("google")).catch(() => {
      /* swallow RedirectSentinel */
    });

    expect(h.clearSessionCookieSpy).toHaveBeenCalledTimes(1);
    expect(h.rotateSessionCookieSpy).toHaveBeenCalledTimes(1);
    const clearOrder = h.clearSessionCookieSpy.mock.invocationCallOrder[0]!;
    const rotateOrder = h.rotateSessionCookieSpy.mock.invocationCallOrder[0]!;
    expect(clearOrder).toBeLessThan(rotateOrder);
  });

  it("link success does NOT call clearSessionCookie (rotation-free branch stays clean)", async () => {
    // Linking must never touch the session cookie. The `sessionCookie
    // !== null` guard in the route already prevents rotation; this test
    // pins that the H4 defense lives inside the same guard so it can't
    // accidentally fire on the link branch and forget the user's
    // already-signed-in session.
    const store = makeCookieStore({
      [STATE_COOKIE_NAME]: "state-to-clear",
      [SESSION_COOKIE_NAME]: "existing-session",
    });
    mockCookies.mockResolvedValue(store);
    h.handleOauthCallbackSpy.mockResolvedValue({
      kind: "redirect",
      destination: "/admin/security",
      sessionCookie: null,
      pendingTokenCookie: null,
      clearStateCookie: true,
      reason: "ok_link",
    });

    await GET(makeRequest(), makeCtx("google")).catch(() => {
      /* swallow RedirectSentinel */
    });

    expect(h.clearSessionCookieSpy).not.toHaveBeenCalled();
    expect(h.rotateSessionCookieSpy).not.toHaveBeenCalled();
  });

  it("redirect without sessionCookie (link success) → clears state, DOES NOT rotate session", async () => {
    // Critical divergence from signin: linking attaches an identity
    // to the existing account. The user's session cookie is unchanged.
    // Calling rotateSessionCookie here would mint a new session that
    // compute didn't authorise.
    const store = makeCookieStore({
      [STATE_COOKIE_NAME]: "state-to-clear",
    });
    mockCookies.mockResolvedValue(store);
    h.handleOauthCallbackSpy.mockResolvedValue({
      kind: "redirect",
      destination: "/admin/security",
      sessionCookie: null,
      pendingTokenCookie: null,
      clearStateCookie: true,
      reason: "ok_link",
    });

    const err = await GET(makeRequest(), makeCtx("google")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RedirectSentinel);
    expect((err as RedirectSentinel).url).toBe("/admin/security");

    expect(store.deletes).toEqual([STATE_COOKIE_NAME]);
    expect(h.rotateSessionCookieSpy).not.toHaveBeenCalled();
  });

  it("effect ordering: state cookie is cleared BEFORE redirect fires", async () => {
    // Pin this because if a refactor moves `redirect()` above
    // `cookieStore.delete(...)`, the delete never runs — NEXT_REDIRECT
    // short-circuits the function. Users would then land on /login
    // with the state cookie still in flight, causing the next callback
    // to state-mismatch instead of missing-state-cookie (wrong audit tag).
    const order: string[] = [];
    const store = {
      get(name: string): CookieGet | undefined {
        return name === STATE_COOKIE_NAME ? { value: "X" } : undefined;
      },
      set(): void {},
      delete(name: string): void {
        order.push(`delete:${name}`);
      },
    };
    mockCookies.mockResolvedValue(store);
    h.handleOauthCallbackSpy.mockResolvedValue({
      kind: "redirect",
      destination: "/login?error=oauth_state",
      sessionCookie: null,
      pendingTokenCookie: null,
      clearStateCookie: true,
      reason: "state_mismatch",
    });

    const err = await GET(makeRequest(), makeCtx("google")).catch((e: unknown) => {
      order.push("redirect-thrown");
      return e;
    });
    expect(err).toBeInstanceOf(RedirectSentinel);
    expect(order).toEqual([`delete:${STATE_COOKIE_NAME}`, "redirect-thrown"]);
  });
});

// ─── Sprint 9.5 — pending-token cookie wiring ─────────────────────────────
//
// The decision module (oauth-callback.ts) decides WHETHER to set a
// pending-token cookie; this route handler is responsible for the
// actual `cookieStore.set(name, value, options)` call. These tests pin
// the wiring: the descriptor fields go through verbatim, the cookie is
// delete-then-set (session-fixation defense), and no rotateSessionCookie
// call leaks through on this branch (which would mint a session before
// the user has typed their TOTP code).

describe("GET /api/auth/oauth/:provider/callback — pending-token cookie wiring", () => {
  const PENDING_NAME = "mmpm_pending_token";
  const PENDING_TOKEN = "abcd".repeat(16); // 64 hex chars

  it("redirect + pendingTokenCookie → sets cookie with exact descriptor, clears state, redirects", async () => {
    const store = makeCookieStore({
      [STATE_COOKIE_NAME]: "state-to-clear",
    });
    mockCookies.mockResolvedValue(store);
    h.handleOauthCallbackSpy.mockResolvedValue({
      kind: "redirect",
      destination: "/auth/two-factor",
      sessionCookie: null,
      pendingTokenCookie: {
        name: PENDING_NAME,
        value: PENDING_TOKEN,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      },
      clearStateCookie: true,
      reason: "ok_signin_pending_factor",
    });

    const err = await GET(makeRequest(), makeCtx("google")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RedirectSentinel);
    expect((err as RedirectSentinel).url).toBe("/auth/two-factor");

    // Session-fixation defense: cookie is deleted before set, even on
    // the pending fork. Order of deletes: state, then pending.
    expect(store.deletes).toEqual([STATE_COOKIE_NAME, PENDING_NAME]);

    // The pending cookie was set with every descriptor attribute.
    expect(store.sets).toHaveLength(1);
    expect(store.sets[0]!).toEqual({
      name: PENDING_NAME,
      value: PENDING_TOKEN,
      options: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      },
    });

    // Critically, NO session was rotated — the user has not yet
    // completed TOTP. A regression here is a permanent skip-2FA bug.
    expect(h.rotateSessionCookieSpy).not.toHaveBeenCalled();
    expect(h.clearSessionCookieSpy).not.toHaveBeenCalled();
  });

  it("redirect + pendingTokenCookie respects secure=false (dev / localhost)", async () => {
    // The decision module is what decides secure based on hostname,
    // but the route MUST forward whatever it receives without coercion.
    // A false-positive `secure: true` over plain HTTP would silently
    // drop the cookie and the user would see a dead 2FA prompt.
    const store = makeCookieStore();
    mockCookies.mockResolvedValue(store);
    h.handleOauthCallbackSpy.mockResolvedValue({
      kind: "redirect",
      destination: "/auth/two-factor",
      sessionCookie: null,
      pendingTokenCookie: {
        name: PENDING_NAME,
        value: PENDING_TOKEN,
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      },
      clearStateCookie: true,
      reason: "ok_signin_pending_factor",
    });

    await GET(makeRequest(), makeCtx("google")).catch(() => {
      /* swallow RedirectSentinel */
    });

    expect(store.sets[0]!.options).toMatchObject({ secure: false });
  });

  it("redirect with sessionCookie AND no pendingTokenCookie → only session is set, pending is NOT touched", async () => {
    // Mutual-exclusion guard: signin success path must not accidentally
    // also set a pending cookie. (The decision module enforces the
    // invariant, but this test pins the route's behaviour against a
    // future refactor that might broaden the conditional.)
    const store = makeCookieStore();
    mockCookies.mockResolvedValue(store);
    h.handleOauthCallbackSpy.mockResolvedValue({
      kind: "redirect",
      destination: "/admin",
      sessionCookie: {
        name: SESSION_COOKIE_NAME,
        value: "fresh-session",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 2_592_000,
      },
      pendingTokenCookie: null,
      clearStateCookie: true,
      reason: "ok_signin",
    });

    await GET(makeRequest(), makeCtx("google")).catch(() => {
      /* swallow RedirectSentinel */
    });

    // No pending cookie set or deleted on this branch.
    expect(store.sets).toHaveLength(0); // session cookie set is mocked away
    expect(store.deletes).not.toContain(PENDING_NAME);
  });

  it("redirect with no session AND no pending → neither cookie touched", async () => {
    // Error redirect branches (state mismatch, provider denied, etc.)
    // must leave the pending cookie alone — clearing it on every error
    // would invalidate a perfectly good in-flight TOTP login if the
    // user happened to retry an OAuth flow on another tab.
    const store = makeCookieStore({
      [PENDING_NAME]: "still-valid-from-magic-link",
    });
    mockCookies.mockResolvedValue(store);
    h.handleOauthCallbackSpy.mockResolvedValue({
      kind: "redirect",
      destination: "/login?error=oauth_state",
      sessionCookie: null,
      pendingTokenCookie: null,
      clearStateCookie: true,
      reason: "state_mismatch",
    });

    await GET(makeRequest(), makeCtx("google")).catch(() => {
      /* swallow RedirectSentinel */
    });

    // The pre-existing pending cookie survives.
    expect(store.deletes).not.toContain(PENDING_NAME);
    expect(store.storage.get(PENDING_NAME)).toBe("still-valid-from-magic-link");
    expect(store.sets).toHaveLength(0);
  });

  it("effect ordering: state delete → pending delete → pending set → redirect", async () => {
    // Pin the relative order so a refactor that hoists redirect() above
    // the cookie writes is caught. NEXT_REDIRECT short-circuits the
    // function, so any cookie write below it never fires — the user
    // would land on /auth/two-factor with no token set.
    const order: string[] = [];
    const store = {
      get(name: string): CookieGet | undefined {
        return name === STATE_COOKIE_NAME ? { value: "X" } : undefined;
      },
      set(name: string): void {
        order.push(`set:${name}`);
      },
      delete(name: string): void {
        order.push(`delete:${name}`);
      },
    };
    mockCookies.mockResolvedValue(store);
    h.handleOauthCallbackSpy.mockResolvedValue({
      kind: "redirect",
      destination: "/auth/two-factor",
      sessionCookie: null,
      pendingTokenCookie: {
        name: PENDING_NAME,
        value: PENDING_TOKEN,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      },
      clearStateCookie: true,
      reason: "ok_signin_pending_factor",
    });

    await GET(makeRequest(), makeCtx("google")).catch((e: unknown) => {
      if (e instanceof RedirectSentinel) order.push("redirect-thrown");
    });

    expect(order).toEqual([
      `delete:${STATE_COOKIE_NAME}`,
      `delete:${PENDING_NAME}`,
      `set:${PENDING_NAME}`,
      "redirect-thrown",
    ]);
  });
});
