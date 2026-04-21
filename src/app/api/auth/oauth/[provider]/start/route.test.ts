/**
 * route.test.ts — GET /api/auth/oauth/:provider/start  (S2T6.5)
 *
 * What this file tests
 * ────────────────────
 * The WIRING between the Next.js handler and the pure decision module
 * in `src/lib/auth/oauth-start.ts`. The decision logic itself has its
 * own 25-test suite (`oauth-start.test.ts`); re-testing every branch
 * here would be duplicate coverage at twice the setup cost (real
 * cookies/redirect/notFound mocks per case).
 *
 * Instead, we mock `startOauthFlow` to return canned results and assert
 * the handler:
 *
 *   1. Forwards raw URL segment + query params + hostname to the
 *      decision module unchanged.
 *   2. Translates `not-found`      ⇒ `notFound()` is called (404).
 *   3. Translates `invalid-intent` ⇒ Response(400, text/plain) with
 *      the message body.
 *   4. Translates `redirect`       ⇒ cookies().set(…) mirrors every
 *      field of the cookie descriptor, then `redirect(authorizeUrl)`
 *      is called with the exact URL from the decision module.
 *
 * Next.js sentinel handling
 * ─────────────────────────
 * `redirect()` and `notFound()` from next/navigation both work by
 * throwing special `NEXT_REDIRECT` / `NEXT_NOT_FOUND` errors. In prod
 * Next's renderer catches these; in unit tests they escape the handler
 * and are our assertion hook. We mock both to throw a tagged sentinel
 * (`RedirectSentinel`, `NotFoundSentinel`) so:
 *
 *   - We can `await expect(GET(...)).rejects.toThrow(...)` to observe
 *     that the call happened.
 *   - The test assertion is explicit about which sentinel fired rather
 *     than accidentally passing on a generic `Error`.
 *
 * This matches the "keep redirect() outside try/catch" rule in
 * `src/app/auth/callback/route.ts` — the handler itself doesn't catch
 * these, so the thrown sentinel reaches the test runner.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ─── Sentinels ─────────────────────────────────────────────────────────────

/** Thrown by the mocked `redirect()`. Captures the URL it was called with. */
class RedirectSentinel extends Error {
  constructor(public readonly url: string) {
    super(`[redirect] ${url}`);
    this.name = "RedirectSentinel";
  }
}

/** Thrown by the mocked `notFound()`. No payload — the call itself is the signal. */
class NotFoundSentinel extends Error {
  constructor() {
    super("[notFound]");
    this.name = "NotFoundSentinel";
  }
}

// ─── Module mocks ──────────────────────────────────────────────────────────
// NOTE on hoisting: vi.mock factories run BEFORE any `import` in the test
// file, even imports written above them. We can't reference hoisted
// variables from the factory unless we wrap them in `vi.hoisted()` —
// which we do for the startOauthFlow spy so tests can program its
// return value per case.

const h = vi.hoisted(() => {
  return {
    startOauthFlowSpy: vi.fn(),
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

vi.mock("@/lib/auth/oauth-start", () => ({
  startOauthFlow: h.startOauthFlowSpy,
}));

// The route also imports these, but they're passed as inert deps — the
// mocked `startOauthFlow` never touches them. We still need the imports
// to resolve; default Vitest behaviour (no mock) is fine.

// ─── Imports that depend on the mocks above ────────────────────────────────

import { GET } from "./route";
import { cookies } from "next/headers";

const mockCookies = cookies as unknown as ReturnType<typeof vi.fn>;

// ─── Test fakes ────────────────────────────────────────────────────────────

interface SetCall {
  name: string;
  value: string;
  options: Record<string, unknown>;
}

function makeCookieStore() {
  const setCalls: SetCall[] = [];
  return {
    setCalls,
    set(name: string, value: string, options: Record<string, unknown>): void {
      setCalls.push({ name, value, options });
    },
    // `get` / `delete` aren't used by this route but we stub them so a
    // runtime reference doesn't explode.
    get: vi.fn(),
    delete: vi.fn(),
  };
}

/**
 * Build a `NextRequest`-shaped object with just the two surfaces the
 * route reads — `nextUrl.hostname` and `nextUrl.searchParams.get(key)`.
 * A full NextRequest would require a Request polyfill; we only touch
 * these two fields.
 */
function makeRequest(
  opts: {
    hostname?: string;
    intent?: string | null;
    returnTo?: string | null;
  } = {},
): NextRequest {
  const params = new URLSearchParams();
  if (opts.intent !== undefined && opts.intent !== null) params.set("intent", opts.intent);
  if (opts.returnTo !== undefined && opts.returnTo !== null) params.set("returnTo", opts.returnTo);
  return {
    nextUrl: {
      hostname: opts.hostname ?? "parametric-memory.dev",
      searchParams: params,
    },
  } as unknown as NextRequest;
}

/** Resolved `params` promise per Next.js 15 App Router convention. */
function makeCtx(provider: string) {
  return { params: Promise.resolve({ provider }) };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default cookie store — tests that care about cookies override below.
  mockCookies.mockResolvedValue(makeCookieStore());
});

describe("GET /api/auth/oauth/:provider/start — argument forwarding", () => {
  it("forwards provider slug, intent, returnTo, and hostname to startOauthFlow", async () => {
    // Return not-found so the handler short-circuits before touching
    // cookies — we only want to inspect what was PASSED to the decision
    // module. Swallow the sentinel the same way prod would.
    h.startOauthFlowSpy.mockReturnValue({ kind: "not-found" });

    await expect(
      GET(
        makeRequest({
          hostname: "parametric-memory.dev",
          intent: "link",
          returnTo: "/dashboard",
        }),
        makeCtx("google"),
      ),
    ).rejects.toThrow(NotFoundSentinel);

    expect(h.startOauthFlowSpy).toHaveBeenCalledTimes(1);
    const [deps, args] = h.startOauthFlowSpy.mock.calls[0]!;
    // Deps object — we don't assert exact references (those are module
    // singletons), only that every required field is present. Catching
    // a regression that drops a dep is the point.
    expect(deps).toHaveProperty("registry");
    expect(deps).toHaveProperty("store");
    expect(deps).toHaveProperty("generateCredentials");
    expect(deps).toHaveProperty("now");
    expect(deps).toHaveProperty("config");
    // Args — the pure values pulled off the request.
    expect(args).toEqual({
      providerId: "google",
      intent: "link",
      returnTo: "/dashboard",
      hostname: "parametric-memory.dev",
    });
  });

  it("forwards intent=null when the query param is absent", async () => {
    // `searchParams.get("intent")` returns `null` when unset — the
    // decision module then defaults to "signin". We're asserting that
    // the route doesn't helpfully "fix up" the absent case before
    // calling startOauthFlow (which would hide a decision-module bug).
    h.startOauthFlowSpy.mockReturnValue({ kind: "not-found" });
    await expect(GET(makeRequest(), makeCtx("google"))).rejects.toThrow(NotFoundSentinel);
    const [, args] = h.startOauthFlowSpy.mock.calls[0]!;
    expect(args.intent).toBeNull();
    expect(args.returnTo).toBeNull();
  });
});

describe("GET /api/auth/oauth/:provider/start — result translation", () => {
  it("not-found → calls notFound() (Next.js 404 sentinel)", async () => {
    h.startOauthFlowSpy.mockReturnValue({ kind: "not-found" });
    await expect(GET(makeRequest(), makeCtx("facebook"))).rejects.toThrow(NotFoundSentinel);
    // The cookie store must NOT have been written — notFound short-circuits.
    const store = await mockCookies.mock.results[0]?.value;
    expect(store?.setCalls ?? []).toHaveLength(0);
  });

  it("invalid-intent → 400 text/plain with the message body", async () => {
    h.startOauthFlowSpy.mockReturnValue({
      kind: "invalid-intent",
      message: 'intent must be "signin" or "link" (got "signup")',
    });

    const res = await GET(makeRequest({ intent: "signup" }), makeCtx("google"));

    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe('intent must be "signin" or "link" (got "signup")');
    // No cookie written on a rejection branch.
    const store = await mockCookies.mock.results[0]?.value;
    expect(store?.setCalls ?? []).toHaveLength(0);
  });

  it("redirect → sets the state cookie then 302s to the authorize URL", async () => {
    const store = makeCookieStore();
    mockCookies.mockResolvedValue(store);

    h.startOauthFlowSpy.mockReturnValue({
      kind: "redirect",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=XYZ",
      cookie: {
        name: "mmpm_oauth_state",
        value: "state-value-XYZ",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 300,
      },
    });

    // Single invocation — capture the sentinel so we can assert its
    // URL payload AND the cookie-store state from one call. Calling
    // GET twice would double the setCalls log and hide the "cookie
    // was set exactly once per request" invariant.
    const err = await GET(makeRequest(), makeCtx("google")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RedirectSentinel);
    // Redirect URL matches the decision module's output byte-for-byte.
    expect((err as RedirectSentinel).url).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth?state=XYZ",
    );

    // Cookie written with every attribute from the descriptor.
    expect(store.setCalls).toHaveLength(1);
    expect(store.setCalls[0]).toEqual({
      name: "mmpm_oauth_state",
      value: "state-value-XYZ",
      options: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 300,
      },
    });
  });

  it("redirect path propagates cookie.secure=false for localhost (dev)", async () => {
    const store = makeCookieStore();
    mockCookies.mockResolvedValue(store);

    h.startOauthFlowSpy.mockReturnValue({
      kind: "redirect",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=XYZ",
      cookie: {
        name: "mmpm_oauth_state",
        value: "state-value-XYZ",
        httpOnly: true,
        secure: false, // simulates isSecureHost("localhost") === false
        sameSite: "lax",
        path: "/",
        maxAge: 300,
      },
    });

    await expect(GET(makeRequest({ hostname: "localhost" }), makeCtx("google"))).rejects.toThrow(
      RedirectSentinel,
    );

    expect(store.setCalls[0]?.options.secure).toBe(false);
  });
});
