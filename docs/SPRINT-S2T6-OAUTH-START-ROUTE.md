# Sprint S2T6 — OAuth Start Route

**Status:** Planned
**Phase:** Phase 2 OAuth · Session 2 · Task 6
**Parent:** [`docs/PHASE-2-OAUTH-SCOPING.md`](./PHASE-2-OAUTH-SCOPING.md)
**Related ADR:** [`docs/ADR-003-OAUTH-LOGIN-PROVIDERS.md`](./ADR-003-OAUTH-LOGIN-PROVIDERS.md)
**Created:** 2026-04-20
**Owner:** entityone22
**Tier:** mostly sonnet (one haiku item, no opus)
**Size:** ~400 LOC production · ~600 LOC tests · ~8K tokens
**Gate:** all five items green · `tsc --noEmit` clean · full vitest suite passing · `pnpm build` succeeds

---

## 1. Summary

This sprint delivers `/api/auth/oauth/[provider]/start` — the entry point a user hits when they click "Sign in with Google" (or GitHub) on the login page. The route generates fresh PKCE + state + nonce credentials, stores the pending OAuth flow under the state key (single-use, 5 min TTL), sets the `mmpm_oauth_state` cookie, and 302-redirects to the provider's authorization endpoint. The callback (T7) is deliberately NOT in scope; this sprint produces the machinery T7 will consume.

One contract change is baked in: `OauthFlow.intent` is added so the callback can branch between `/bridge/signin` and `/bridge/link` without a second cookie carrying duplicated TTL/consume semantics.

## 2. Pre-requisites

All must be green before execution:

| Dep | Artefact | Status |
|-----|----------|--------|
| S1 foundations | `pkce-store`, `return-to`, `compute-bridge-signed` | Complete |
| S2T1 | `providers/types.ts` (error taxonomy, claims shape) | Complete |
| S2T2 | `providers/google.ts` (OIDC + jose JWKS) | Complete |
| S2T3 | `providers/github.ts` (non-OIDC + /user/emails) | Complete |
| S2T4 | `providers/registry.ts` + `redirectUriFor()` | Complete |
| S2T5 | `session-rotation.ts` — provides `isSecureHost()` | Complete (this session) |
| Env | `AUTH_OAUTH_ENABLED=true`, both provider client pairs set, `COMPUTE_OAUTH_BRIDGE_SIGNING_KEY` ≥32 chars | Human-managed, confirm before execution |
| OAuth apps | Google (dev+prod) and GitHub (dev+prod) registered with redirect URIs matching `redirectUriFor()` output | Complete; prod Google still needs "publish" — see task #15 |
| Next.js | `next@^15.2.0` — `params` arrives as `Promise<...>` in route handlers | Confirmed |

## 3. High-level architecture

```
Browser                       /start route                  Store / Registry          Provider
───────                       ────────────                  ────────────────          ────────
GET /api/auth/oauth/google/
  start?intent=signin&
  returnTo=/admin
                    ─────────► startOauthFlow(deps, args)
                                │
                                │ config.authOauthEnabled? ──── false ──► 404
                                │ registry.get(providerId) ─── null ───► 404
                                │ validate intent ──────── bad ────────► 400
                                │ validateReturnTo(raw) ── null ──► fallback "/admin"
                                │ generateFlowCredentials(id)
                                │ store.put(state, flow {intent, …})    ─────► in-mem Map, 5 min TTL
                                │ provider.buildAuthorizeUrl(...)        ─────► Google adapter (cached)
                                ◄────────────────────────────────────        authorize URL string
                              Set-Cookie: mmpm_oauth_state=<state>;
                                HttpOnly; Secure; SameSite=Lax;
                                Path=/; Max-Age=300
                    ◄───────── 302 Location: <authorize URL>

302 ───► accounts.google.com/o/oauth2/v2/auth?client_id=…&state=…&code_challenge=…&nonce=…
```

Nothing in T6 reads the session cookie, calls compute, or persists to Postgres. It's pure "set up the dance". Every moving part that could fail (provider config missing, bad intent, hostile returnTo) has a defined outcome before the cookie is set — callers with bad input never trigger a Set-Cookie.

## 4. Sprint items

### T6.1 — Extend `OauthFlow` with `intent`

| Metadata | Value |
|----------|-------|
| **Files** | `src/lib/auth/pkce-store.ts` (add field) · `src/lib/auth/pkce-store.test.ts` (update fixtures) |
| **Depends on** | None — additive to existing code |
| **Blocks** | T6.2, T6.3, T6.4 |
| **Size** | ~15 LOC production · ~10 LOC test edits |
| **Tier** | haiku |
| **Scope risk** | Low — additive field, no behaviour change to existing code paths |

**Why it exists.** The callback route (T7) branches on intent: `signin` hits `/bridge/signin`; `link` hits `/bridge/link` (the latter requires a recent session and a recent-auth gate on the compute side). The intent is chosen at `/start` when the user clicks a button, not at `/callback` on return from the provider. Without this field the callback can't distinguish the two flows without a second cookie — extra TTL/consume semantics to keep in lockstep with the main state cookie, more attack surface, no upside.

**How it works.** `OauthFlow` is the struct stored under `state` in the in-memory single-use map owned by `pkce-store.ts`. Adding a required `intent: OauthIntent` field means every `store.put()` callsite must supply it — the TypeScript compiler enforces the contract. `OauthIntent` is already defined in `src/lib/auth/providers/types.ts` as `"signin" | "link"`.

**Gotchas.**

- `pkce-store.ts` does not currently import from `providers/types.ts`. Adding `import type { OauthIntent } from "./providers/types"` creates a new dependency edge — verified non-circular because `providers/types` is a leaf (no imports from `auth/*`).
- The module-level `oauthFlowStore` singleton doesn't need code changes; only the struct shape widens.
- `OauthFlow` currently has five fields (`verifier`, `nonce`, `provider`, `returnTo`, `createdAt`). Adding `intent` as the sixth: keep field order grouped by concern — I suggest placing `intent` adjacent to `provider` so the "what are we doing with which provider" pair reads together.

**Tests.**

- No new tests. The contract change is compile-time enforced.
- Update `pkce-store.test.ts` fixture `put()` calls to include `intent: "signin"` (expect 2–4 call sites to edit).
- Behavioural coverage of intent lives in T6.3 (`oauth-start.test.ts`) and T7 (`callback/route.test.ts`).

**Verification.**

```bash
cd ~/mmpm-website
npx tsc --noEmit
pnpm vitest run src/lib/auth/pkce-store.test.ts
```

Expected: clean typecheck; all pkce-store tests green.

**Rollback.** Remove the field; strike the import; delete the added fixture properties. ~10-line revert.

---

### T6.2 — Pure decision logic `startOauthFlow()`

| Metadata | Value |
|----------|-------|
| **Files** | `src/lib/auth/oauth-start.ts` (new) |
| **Depends on** | T6.1 (uses `OauthFlow.intent`) · S2T5 (`isSecureHost`) |
| **Blocks** | T6.3, T6.4 |
| **Size** | ~150 LOC production |
| **Tier** | sonnet |
| **Scope risk** | Medium — the decision surface is the whole thing; off-by-ones here show up as security bugs |

**Why it exists.** Separating the decision from the Next.js runtime means every branch can be unit-tested with no request context, no `next/headers`, no `next/navigation`. Same pattern as S2T5's `session-rotation.ts` — the route file becomes a thin adapter and the logic is trivially fuzzable. This also makes diffing behaviour vs the magic-link callback straightforward during review.

**API surface.**

```ts
export interface StartFlowDeps {
  registry: ProviderRegistry;
  store: OauthFlowStore;
  generateCredentials: (providerId: string) => FlowCredentials;
  now: () => number;
  config: Pick<Config, "authOauthEnabled" | "publicSiteUrl">;
}

export interface StartFlowArgs {
  providerId: string;      // raw URL segment — untrusted
  intent: string | null;   // raw query param — untrusted
  returnTo: string | null; // raw query param — untrusted
  hostname: string;        // request.nextUrl.hostname (post-proxy)
}

export type StartFlowResult =
  | { kind: "not-found" }
  | { kind: "invalid-intent"; message: string }
  | { kind: "redirect"; authorizeUrl: string; cookie: StateCookieDescriptor };

export interface StateCookieDescriptor {
  name: "mmpm_oauth_state";
  value: string;            // = flow state token
  httpOnly: true;
  secure: boolean;          // derived via isSecureHost(hostname)
  sameSite: "lax";          // needed for top-level redirect back from provider
  path: "/";
  maxAge: 300;              // seconds — matches OAUTH_FLOW_TTL_MS / 1000
}

export function startOauthFlow(
  deps: StartFlowDeps,
  args: StartFlowArgs,
): StartFlowResult;
```

**Decision precedence** (order matters; each rule short-circuits):

1. `deps.config.authOauthEnabled === false` → `not-found`
2. `deps.registry.get(providerId) === null` → `not-found` (catches both unknown and unconfigured)
3. `intent !== null && intent !== "signin" && intent !== "link"` → `invalid-intent`
4. `intent === null` → coerce to `"signin"` (default)
5. `validateReturnTo(returnTo) ?? "/admin"` — null falls back silently
6. Generate credentials; `store.put(state, flow)`; build authorize URL; return `redirect`

Rule 2's collapsing of "unknown provider" and "unconfigured provider" to the same `not-found` is intentional: externally indistinguishable, gives no signal about which providers are configured.

**Gotchas.**

- **returnTo failure is silent.** A hostile `returnTo=//evil.com` falls back to `/admin`, not a 400. An attacker shouldn't get useful error signal; the audit log records the fallback. If we wanted to surface errors to legitimate callers with typos we'd want a separate validation step upstream — out of scope.
- **TTL unit confusion.** `cookie.maxAge: 300` is seconds (Next.js cookie API). `OAUTH_FLOW_TTL_MS: 300_000` is milliseconds (Node convention). Both must stay in lockstep. T6.3 has an explicit test asserting `cookie.maxAge * 1000 === OAUTH_FLOW_TTL_MS`.
- **Hostname is post-proxy.** `request.nextUrl.hostname` reflects whatever the reverse proxy populated from `X-Forwarded-Host`. In prod, Traefik strips client-supplied values before they hit Next; this can't be spoofed. In dev behind no proxy, it's the real Host.
- **`generateCredentials` is injected.** The production singleton is imported directly in T6.4; T6.3 tests pass a deterministic stub (e.g. `() => ({ verifier: "v-fixed", challenge: "c-fixed", state: "s-fixed", nonce: "n-fixed" })`) so exact cookie/URL values can be asserted without mocking `node:crypto`.
- **`now` is injected** for consistency with the pattern, but T6 barely uses it — the flow's `createdAt` is the only consumer. Tests can pin a fixed `now` for deterministic `createdAt` assertions.
- **Config slice.** `Pick<Config, "authOauthEnabled" | "publicSiteUrl">` keeps the dep narrow — no temptation to reach for unrelated config fields. If a future flag lives here, widen the Pick explicitly.

**Tests.** Full coverage in T6.3 — see that item.

**Verification (this item alone, compile-only).**

```bash
npx tsc --noEmit
```

**Rollback.** Delete the file; nothing imports it yet.

---

### T6.3 — Unit tests for `startOauthFlow`

| Metadata | Value |
|----------|-------|
| **Files** | `src/lib/auth/oauth-start.test.ts` (new) |
| **Depends on** | T6.2 |
| **Blocks** | T6.4 (route handler relies on green logic tests before wiring) |
| **Size** | ~300 LOC · ~16 tests |
| **Tier** | sonnet |
| **Scope risk** | Low — testing the decision surface built in T6.2 |

**Coverage matrix.**

| # | Case | Input | Expected |
|---|------|-------|----------|
| 1 | Flag off | `config.authOauthEnabled = false` | `{ kind: "not-found" }` |
| 2 | Unknown provider | `providerId = "facebook"` | `{ kind: "not-found" }` |
| 3 | Unconfigured provider | registry returns `null` for "google" | `{ kind: "not-found" }` |
| 4 | Invalid intent | `intent = "unlink"` | `{ kind: "invalid-intent" }` |
| 5 | Intent = signin | all valid | `redirect`; flow stored with `intent: "signin"` |
| 6 | Intent = link | all valid | `redirect`; flow stored with `intent: "link"` |
| 7 | Intent missing | `intent = null` | `redirect`; default `"signin"` |
| 8 | returnTo valid | `returnTo = "/admin"` | stored verbatim |
| 9 | returnTo hostile | `returnTo = "//evil.com"` | falls back to `/admin` (no error) |
| 10 | returnTo missing | `returnTo = null` | default `/admin` |
| 11 | Secure=true | `hostname = "parametric-memory.dev"` | `cookie.secure === true` |
| 12 | Secure=false | `hostname = "localhost"` | `cookie.secure === false` |
| 13 | Cookie value = state | happy path | `store.consume(cookie.value)` returns the put flow |
| 14 | TTL lockstep | happy path | `cookie.maxAge * 1000 === OAUTH_FLOW_TTL_MS` |
| 15 | Challenge forwarded | stub provider | `buildAuthorizeUrl` called with the generated challenge |
| 16 | Nonce per-provider | Google vs GitHub fake | Google receives non-null nonce; GitHub receives null |

**Fake shapes.**

- `FakeOauthFlowStore` — mirror T5's `FakeCookieStore`: `calls: Op[]` log, `current(state)` resolver that walks the log.
- `FakeAuthProvider` — implements `AuthProvider`; records calls to `buildAuthorizeUrl`; returns a canned URL (`"https://provider.test/auth?fake=1"`) so the test doesn't assert on provider string formats.
- `FakeProviderRegistry` — `get(id)` returns one of the fakes or `null`; lets each test pin exactly which providers are "configured".
- `fixedCredentials(): FlowCredentials` — replaces `generateFlowCredentials` with deterministic values.

**Gotchas.**

- Tests assert the cookie descriptor shape exactly (matching T5). If someone adds a new attribute (say `domain`), the test fails visibly — intentional.
- The TTL-lockstep assertion (#14) is cheap insurance against the ms-vs-s unit confusion called out in T6.2 gotchas.
- Don't test `validateReturnTo` semantics here — that's owned by `return-to.test.ts`. This item only verifies that the fallback edge is wired (hostile input → default).

**Verification.**

```bash
pnpm vitest run src/lib/auth/oauth-start.test.ts
```

Expected: 16 tests passed, 0 skipped.

---

### T6.4 — Route handler

| Metadata | Value |
|----------|-------|
| **Files** | `src/app/api/auth/oauth/[provider]/start/route.ts` (new) |
| **Depends on** | T6.2 · S2T5 (`isSecureHost` via `startOauthFlow`) · pkce-store singleton · registry singleton |
| **Blocks** | T6.5 · T7 · S2T8 (LoginClient buttons target this URL) |
| **Size** | ~80 LOC |
| **Tier** | sonnet |
| **Scope risk** | Medium — Next.js runtime integration, redirect() throw semantics, cookie setting outside tests |

**Why thin.** Everything interesting is T6.2. This file's job is "pull Next.js query/params/cookies → call pure logic → apply result". Matches the magic-link callback's structure (`src/app/auth/callback/route.ts`) and pins the same NEXT_REDIRECT comment.

**Skeleton** (illustrative — final version TBD in code review):

```ts
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { config } from "@/config";
import { oauthFlowStore, generateFlowCredentials } from "@/lib/auth/pkce-store";
import { registry } from "@/lib/auth/providers/registry";
import { startOauthFlow } from "@/lib/auth/oauth-start";

/**
 * /api/auth/oauth/[provider]/start (GET)
 *
 * NEXT_REDIRECT: redirect() throws a special sentinel. Must NOT sit inside
 * a try/catch block — see src/app/auth/callback/route.ts for the same warning.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider: providerId } = await params;

  const result = startOauthFlow(
    {
      registry,
      store: oauthFlowStore,
      generateCredentials: generateFlowCredentials,
      now: Date.now,
      config,
    },
    {
      providerId,
      intent: request.nextUrl.searchParams.get("intent"),
      returnTo: request.nextUrl.searchParams.get("returnTo"),
      hostname: request.nextUrl.hostname,
    },
  );

  if (result.kind === "not-found") {
    return new Response(null, { status: 404 });
  }
  if (result.kind === "invalid-intent") {
    return new Response(result.message, { status: 400 });
  }

  const cookieStore = await cookies();
  cookieStore.set(result.cookie.name, result.cookie.value, {
    httpOnly: result.cookie.httpOnly,
    secure: result.cookie.secure,
    sameSite: result.cookie.sameSite,
    path: result.cookie.path,
    maxAge: result.cookie.maxAge,
  });

  redirect(result.authorizeUrl);
}
```

**Gotchas.**

- **Next 15 params shape.** `params` is `Promise<{ provider: string }>` — must `await`. Older Next used plain objects; package.json confirms `next@^15.2.0` so the Promise form is required.
- **`redirect()` outside try/catch.** Load-bearing. A try/catch swallows the NEXT_REDIRECT sentinel and the redirect silently fails. Copy the comment from `src/app/auth/callback/route.ts:19–24` verbatim.
- **Cookie set before redirect.** Next's cookies API accumulates mutations across the request lifecycle; `redirect()` flushes the response with all accumulated `Set-Cookie` headers. Order is "set cookie, then redirect", never the reverse.
- **Silent 404.** `new Response(null, { status: 404 })`, not `new Response("Not found")` — matches the "unknown and unconfigured providers are indistinguishable" policy.
- **400 body is fine.** Invalid intent is a caller bug, not an attack surface — a short text explanation (e.g. `"intent must be 'signin' or 'link'"`) is helpful for devs integrating the UI.

**Verification.**

```bash
npx tsc --noEmit
pnpm build
```

`pnpm build` catches Next.js route-manifest errors (missing default export, wrong handler signature) that `tsc` doesn't see.

**Rollback.** Delete the file; Next's route manifest drops the endpoint.

---

### T6.5 — Route smoke test

| Metadata | Value |
|----------|-------|
| **Files** | `src/app/api/auth/oauth/[provider]/start/route.test.ts` (new) |
| **Depends on** | T6.4 |
| **Blocks** | None — final sprint item |
| **Size** | ~120 LOC · 2–3 tests |
| **Tier** | sonnet |
| **Scope risk** | Low — happy-path smoke; decision logic owned by T6.3 |

**What it tests.** Not the decision tree — that's T6.3. This confirms the glue:

1. Next's `params` Promise is unwrapped correctly
2. Query params flow into `startOauthFlow` args
3. The cookie descriptor returned by the logic is translated to `cookies().set()` faithfully
4. `redirect()` is called (by observing the NEXT_REDIRECT throw) with the expected URL

**Pattern.** Mock `next/headers` (capturing cookie sets) and `next/navigation` (capturing redirect calls) via `vi.mock()`. Assert against the mocks rather than the real Next runtime.

```ts
// Sketch — not final
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: cookieSetSpy }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`NEXT_REDIRECT ${url}`); },
}));
```

**Test list.**

- **Happy path:** Google signin → cookie set with correct descriptor → redirect thrown with authorize URL.
- **404 path:** flag off → `response.status === 404` → no cookie set → no redirect thrown.
- *(optional)* 400 path: intent=`"unlink"` → `response.status === 400` → no cookie set.

**Gotchas.**

- `redirect()` throws — test must `expect(() => GET(...)).toThrow(/NEXT_REDIRECT/)` (or use async form with rejected promise). If the mock is absent, the real `redirect()` throws with "called outside of a request context" which is a useless error.
- Don't re-test the decision logic. Double-testing here means double maintenance when T6.2 changes.

**Verification.**

```bash
pnpm vitest run src/app/api/auth/oauth/\[provider\]/start/route.test.ts
```

Note the bracket escapes — the path contains Next.js dynamic segments.

---

## 5. Gate criteria (sprint done when)

1. All five items' individual verification commands green.
2. `npx tsc --noEmit` exits 0 across the website repo.
3. `pnpm vitest run` — full suite green, no new skipped tests.
4. `pnpm build` succeeds (route manifest clean).
5. `LoginClient` (S2T8) unblocked — it can hit `/api/auth/oauth/google/start?intent=signin` and observe a 302 to Google.
6. Task list updated: T6 marked completed; T7 unblocked.
7. Memory checkpoint with:
   - `v1.fact.oauth_flow_carries_intent` — `member_of` `v1.other.hub_mmpm_core`
   - `v1.procedure.oauth_start_pure_logic_pattern` — `member_of` `v1.other.hub_memory_procedures`, `references` T5's session-rotation pattern
   - `v1.state.phase_2_oauth_t6_complete` — tombstone any `_t6_in_progress`

## 6. Ship sequence

Execute in order. Gate between each = typecheck + targeted tests green before proceeding.

| # | Do | Gate | Commit? |
|---|----|------|---------|
| 1 | Write T6.1 | `tsc --noEmit` + `pkce-store.test.ts` green | Yes (one commit) |
| 2 | Write T6.2 | `tsc --noEmit` only (no tests yet) | No |
| 3 | Write T6.3 | `oauth-start.test.ts` green | Yes (T6.2 + T6.3 together) |
| 4 | Write T6.4 | `tsc --noEmit` + `pnpm build` | No |
| 5 | Write T6.5 | `route.test.ts` + full suite green | Yes (T6.4 + T6.5 together) |

Three commits total. Keeps the diff reviewable; lets an early failure (e.g. T6.3 uncovering a logic bug in T6.2) not drag uncommitted work across.

Per HARD RULE #1 — Claude never runs `git commit`. All commit commands will be handed to the human with reasoning.

## 7. Risk log

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Circular import `pkce-store` → `providers/types` | Very low | Build breaks | Verified at planning — `providers/types` has no imports from `auth/*` |
| Next.js 15 param-shape drift | Low | Route returns 500 | Confirmed `^15.2.0` in package.json; route tests catch if shape changes |
| `redirect()` accidentally wrapped in try/catch | Medium (mechanical error) | Silent redirect failure; every error path 200s | Hand-pin the comment from magic-link callback; route test asserts the throw |
| State cookie attributes drift from T5 session cookie | Low | UX regressions, occasional dropped cookies | Manual diff of attribute sets during review; `sameSite: "lax"` is identical |
| TTL ms-vs-s confusion | Medium (classic unit bug) | Cookies outlive store entries (or vice versa) | Explicit test #14 in T6.3 asserts `cookie.maxAge * 1000 === OAUTH_FLOW_TTL_MS` |
| returnTo validator bypass via encoding | Low | Open redirect | Already covered in `return-to.test.ts`; T6 uses the validated output verbatim |
| Intent field missing from an existing `store.put()` caller we didn't find | Low | Typecheck fails | Intentional — compiler flags it |

## 8. Explicitly deferred out of T6

- **S2T7 callback route** — consumes the flow store and T5's session rotation; next sprint.
- **S2T8 LoginClient buttons** — UI binding to `/start`; depends on T6 shipping.
- **Integration tests with real Google/GitHub** — Session 4; needs Playwright or Vitest-mock harness decision (pre-kickoff #1).
- **Rate limiting on `/start`** — Phase 3 hardening; low priority because the endpoint is side-effect-free before cookie set.
- **Multi-tab OAuth** — user opens two tabs, starts OAuth in both; currently the second state overwrites the first in the in-memory map. Acceptable for MVP; revisit if it becomes a support burden.

## 9. Pointers

- Existing magic-link cookie pattern to mirror: `src/app/auth/callback/route.ts` lines 69–80
- Session rotation helper contract (T5): `src/lib/auth/session-rotation.ts` — pure-logic pattern to emulate
- PKCE store API: `src/lib/auth/pkce-store.ts` — `generateFlowCredentials`, `OauthFlow`, `oauthFlowStore`
- Return-to validator: `src/lib/auth/return-to.ts` — `validateReturnTo(raw) ?? "/admin"`
- Provider registry + `redirectUriFor()`: `src/lib/auth/providers/registry.ts`
- HMAC bridge contract (consumed by T7, not T6): `docs/PHASE-2-OAUTH-SCOPING.md` §"Critical contracts"

---

*This sprint plan is the design of record for S2T6. If implementation diverges, update this document in the same PR and capture the reasoning in the "Risk log" and "Deferred" sections.*
