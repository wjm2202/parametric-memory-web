# Journey Review — Returning User / Dashboard

**Date:** 2026-04-17
**Scope:** `/login` → magic-link email → `/auth/callback` → `/dashboard` → per-substrate `/admin?slug=…`
**Status:** Draft — findings to be consolidated into SPRINT-PLAN.md
**Companion docs:** `JOURNEY-REVIEW-SIGNUP-CHECKOUT.md`, `JOURNEY-REVIEW-BILLING-LIFECYCLE.md`, `JOURNEY-REVIEW-API-KEY-LIFECYCLE.md`

---

## Executive summary

A returning customer clicks a magic link in their email, lands on the dashboard, and sees their substrate(s), billing status, and admin controls. The flow is well-segmented: the website BFF handles CSRF and cookie management; the compute server owns session validation and business logic. Server-side hydration in `dashboard/page.tsx` prevents flash-of-unauthenticated-content and ensures the session is valid *before* any render.

**What works well:**
- Magic-link `/auth/callback` handles the Next.js `redirect()` throw pattern correctly (redirects live outside `try/catch`).
- Session cookie is `httpOnly`, `SameSite=lax`, `secure: !isLocalhost`.
- Public login endpoint never leaks account existence (always 200, email-level rate limit separate from IP-level).
- Ownership chokepoint `resolveOwnedSubstrate` returns 404 (not 403) to prevent existence-leak on per-substrate URLs (per ADR-002).

**Critical gaps:**
1. **Polling loops silently swallow 401** — dashboard polls `/api/substrates` every 10 s; on a 401 the fetch just `if (res.ok)` misses and the UI keeps showing stale data indefinitely. No redirect to `/login`.
2. **Two substrate endpoints can disagree** — dashboard hits `/api/substrates` (list, potentially cached); admin hits `/api/v1/substrates/:slug` (detail, fresh). Tabs can show conflicting statuses.
3. **Hardcoded support email** `entityone22@gmail.com` in the suspended-state CTA (looks like a dev placeholder).
4. **`past_due` billing status is invisible on the widget** — state exists in the API but is not rendered (collapses to normal "Active" card).
5. **Fragile response unwrapping** in admin — `data.substrate ?? data` assumes a specific shape with no validation.

---

## High-level flow

```
Browser                     Website BFF                    Compute
─────────────────────────────────────────────────────────────────────────

[Unauthenticated /login]
   │
   │ POST /api/auth/request-link
   ├────────────────────────► [verifyCsrfOrigin]
   │                          POST /api/v1/auth/request-link ──► 5/min IP + 3/hr email
   │                                                              always 200 (no leak)
   │
[magic-link email arrives]
   │
   │ GET /auth/callback?token=X
   ├────────────────────────► [no guard — GET is safe]
   │                          GET /api/auth/verify?token=X
   │                                → { sessionToken, accountId }
   │                          Set-Cookie: mmpm_session (httpOnly, lax, 30d)
   │                          redirect(/dashboard | /admin | saved)
   │
[Server component: /dashboard]
   │
   ├─ reads mmpm_session cookie (server-side)
   ├─ GET /api/auth/me                ──► /api/v1/auth/me
   ├─ GET /api/v1/substrates           ──► session chokepoint
   └─ render DashboardClient with SSR props
   │
[Client hydrates]
   │
   ├─ useEffect → GET /api/billing/status  (mount, once)
   └─ useEffect → setInterval(GET /api/substrates, 10s)   ◄── NO 401 GUARD
                                                          ◄── NO visibility check
                                                          ◄── NO abort on unmount race
   │
[Click substrate card → /admin?slug=X]
   │
   └─ Server component: getSubstrateDetail(slug)
         GET /api/v1/substrates/:slug  ──► ownership chokepoint → { substrate: {...} }
         unwrap: data.substrate ?? data
         render AdminClient
```

---

## Step-by-step trace

### 1. `/login` entrypoint

**File:** `src/app/login/LoginClient.tsx`

- Line 32–45: `RedirectCookieSetter()` — if the user arrived with `?redirect=/admin`, sets a single-use `mmpm_redirect` cookie (15 min, `lax`, must start with `/`, rejects `//` to prevent open redirect).
- Line 47–99: `LoginForm()` — POSTs `{ email }` to `/api/auth/request-link`. On 429, parses `X-RateLimit-Reset` and shows a human countdown. On any other non-OK, shows the body's `error` string.
- Line 93: sets `sent = true` regardless of whether the account exists — consistent with compute's silent-always-200 policy.

**File:** `src/app/api/auth/[...path]/route.ts`

- Line 47–48: all POST/DELETE/PATCH auth routes pass through `verifyCsrfOrigin`.
- Line 50–67: proxy to compute; **forwards rate-limit headers** (X-RateLimit-*) through to the browser.

**File:** `src/lib/csrf.ts`

- Line 43–50: `verifyCsrfOrigin` — compares `Origin` header against request URL; falls back to `Referer` if `Origin` is absent. Skips GET/HEAD/OPTIONS. Returns 403 on mismatch.

**Compute: `src/api/auth/routes.ts`**

- Line 49–78: `POST /api/v1/auth/request-link`
  - 5/min IP rate limit (in-memory)
  - 3/hr email rate limit (PG-backed, survives restart)
  - Line 56: basic regex email validation (not RFC 5321)
  - Line 72: always returns 200 — never reveals whether the account exists
  - Line 64–69: observability event only fires for *existing* accounts

### 2. Magic-link callback + session creation

**File:** `src/app/auth/callback/route.ts`

- Line 25–31: parse `token` query param or redirect to `/login?error=missing_token`.
- Line 41–62: call compute `/api/auth/verify?token=X`. **Critical pattern** (line 20–24): `redirect()` throws `NEXT_REDIRECT` internally; any call inside `try/catch` swallows the error. All redirects here live *outside* try/catch.
- Line 73–80: set `mmpm_session` httpOnly cookie — `secure: !isLocalhost`, `sameSite: "lax"`, `maxAge: 30d`.
- Line 86–98: resolve post-login redirect via the `mmpm_redirect` cookie (validates starts with `/` and not `//`); defaults to `/admin` on miss.
- Line 100: `redirect(destination)` — outside `try/catch`.

**Compute: `src/api/auth/routes.ts`**

- Line 93–151: `GET /api/v1/auth/verify?token=X`
  - 5/min rate limit on verify
  - Line 105: `authService.verifyMagicLink(token)` returns `null` on expired/invalid/used, else `{ rawSessionToken, accountId }`
  - Line 112–137: **TOTP branch is disabled** (commented out, marked `TOTP_DISABLED_2026_04_11`). Re-enable for production.
  - Line 146–151: response `{ ok: true, totpRequired: false, sessionToken, accountId }`

### 3. `/dashboard` server-component hydration

**File:** `src/app/dashboard/page.tsx`

- Line 67–75: reads `mmpm_session` cookie server-side. Missing → `redirect('/login?redirect=/dashboard')`.
- Line 39–50: `getAccount(sessionToken)` — `GET /api/auth/me` with `Authorization: Bearer ${token}`. Returns `null` on any non-OK (does *not* distinguish 401 from 5xx).
- Line 73–76: if `account` is null, clear cookie (`maxAge: 0`) and `redirect('/login?error=session_expired')`. Server-side redirect; the client never sees the error reason.
- Line 52–64: `getSubstrates()` — silent empty-array on non-OK (again, no 401 vs 5xx distinction).
- Line 80: pass `{ account, substrates }` to `DashboardClient` as props. **No streaming, no suspense boundary.**

**Compute: `src/api/auth/routes.ts`**

- Line 192–221: `GET /api/v1/auth/me` — returns `{ id, email, name, tier, status, balanceCents, createdAt }`. 404 if the account was deleted mid-session.

### 4. `DashboardClient.tsx` (client-side)

**File:** `src/app/dashboard/DashboardClient.tsx`

- Line 518–547: initialise `substrates` from SSR props. On mount, fetch `/api/billing/status`. **Silent failure** (lines 539–545) — no 401 handling, no retry; sets `billingError = true` on any failure.
- Line 549–566: **polling loop** — `setInterval(fetch('/api/substrates'), 10_000)`. Dependency array is `[]` (runs once on mount). No 401 handling. No `visibilitychange` pause. No `AbortController` on unmount.
- Line 81–114: `StatusBadge` — `running` emerald, `provisioning` blue, `read_only` amber, `suspended/cancelled` red, `provision_failed/destroyed` red/zinc. **Note:** `cancelled` uses the same red as `suspended` — visually ambiguous.
- Line 118–266: `BillingWidget` — enumerated in the billing-lifecycle review; three rendered states (payment-failed banner, suspended, cancelled) plus active/trialing card. `past_due` is not rendered (see billing review H1).
- Line 337–418: `SubstrateCard` — `isCancellable = INACTIVE_STATUSES.has(status) && hasActiveSubscription` (line 349). Line 360: links to `/admin?slug=${slug}`.
- Line 455–514: `PostCheckoutBanner` — appears on `?checkout=success`; polls every 2 s for 60 s, then hides regardless of substrate state. If provisioning takes longer than 60 s, banner vanishes and user is left with no signal.
- Line 568–575: `handleLogout()` — does not clear the polling interval before redirecting.

### 5. `/admin?slug=…` per-substrate page

**File:** `src/app/admin/page.tsx`

- Line 91–116: `AdminPage()` server component — reads `slug` from search params, redirects to `/dashboard` if missing.
- Line 68–85: `getSubstrateDetail()` — `GET /api/v1/substrates/:slug` with Bearer. **Line 81:** `return data.substrate ?? data;` — fragile unwrap. If compute returns `{ substrate: null }`, this returns `null`. No zod/runtime validation.

**File:** `src/app/admin/AdminClient.tsx`

- Line 67–83: `StatusBadge` — colours slightly diverge from dashboard's badge (e.g., `provision_failed` is blue here, red there).
- Line 86–121: `UsageBar` — handles `-1` as unlimited (`∞`); caps display at 100%; red warning on overage.
- Line 142–150: local state for rotation flow (detailed in `JOURNEY-REVIEW-API-KEY-LIFECYCLE.md`).

### 6. Compute endpoints used by this journey

- **`GET /api/v1/substrates`** (list) — `src/api/substrates/routes.ts`, session-auth, 60 req/min/account rate limit.
- **`GET /api/v1/substrates/:slug`** (detail) — ownership chokepoint via `resolveOwnedSubstrate` (404 on non-ownership per ADR-002). Response wrapped as `{ substrate: {...} }`.
- **`GET /api/v1/my-substrate`** (legacy single-substrate) — `src/api/my-substrate/route.ts`, still mounted; three branches: happy, provisioning-only, empty. Dashboard does not use it; still has active callers (e.g., `/api/my-substrate/claim-key`).
- **`GET /api/v1/billing/status`** — 60 s per-account in-memory cache (line 44–48); slug-scoped when `?slug=` present; attempts a 5 s `/health` probe on the substrate (line 175–193), falling back to `usageUnavailable = true` on timeout.

### 7. Session middleware

**Website BFF:** `src/lib/compute-proxy.ts` — line 87–178: `computeProxy()` guarantees the response is valid JSON (502 if parse fails, 502 on upstream 5xx).

**Compute:** `src/middleware/session-auth.ts`
- Line 23–39: `extractToken()` — prefers `Authorization: Bearer`, falls back to `mmpm_session` cookie.
- Line 48–68: `createSessionMiddleware()` — OPTIONAL (does not reject missing tokens; just attaches `req.session` if valid).
- Line 74–80: `requireSession()` — 401 if `req.session` is absent.

---

## UX findings

### High

**UX-1: No 401 handling in polling loops.** `DashboardClient.tsx:549–566` polls every 10 s; on 401 (session expired mid-session) the loop continues indefinitely showing stale data. User has no indication they should log back in.
**Fix:** `if (res.status === 401) { router.push('/login?error=session_expired'); return; }` inside the polling callback, then `clearInterval` to stop.

**UX-2: Hardcoded support email.** `DashboardClient.tsx:173` — `mailto:entityone22@gmail.com` on the suspended-state CTA. Appears to be a dev placeholder shipped to production. Every suspended customer is told to email the founder's personal account.
**Fix:** config constant (`SUPPORT_EMAIL = 'support@parametric-memory.dev'`) or use `account.email` + a support-inbox address.

**UX-3: PostCheckoutBanner disappears at 60 s regardless of provisioning state.** `DashboardClient.tsx:455–514`. If provisioning takes longer (dedicated tiers, DO capacity spikes), the banner vanishes and the user thinks checkout failed.
**Fix:** keep the banner visible until `substrates.length > 0` OR 5 minutes elapse, then show a "still provisioning" state with a support link.

**UX-4: `cancelled` and `suspended` share the same red.** `DashboardClient.tsx:81–114`. Two very different situations ("you cancelled intentionally" vs "your account was locked") look identical at a glance.
**Fix:** `cancelled` → zinc/neutral; `suspended` stays red.

### Medium

**UX-5: No empty state when billing status fails.** `DashboardClient.tsx:536–547` — on `billingError = true`, the widget is simply hidden. No "billing data unavailable" message.
**Fix:** show a small muted notice with a retry button.

**UX-6: "Manage billing" button shows even when `hasStripeCustomer = false`.** `DashboardClient.tsx:257–262` — click then 422 alert.
**Fix:** hide or disable when `!hasStripeCustomer`.

**UX-7: Trial vs renewal dates not clearly differentiated.** `BillingWidget.tsx:210–212` — shows `renewsAt` OR `trialEndsAt` depending on status, but no copy hint about what happens at that date.
**Fix:** "Trial ends on X — then $Y/mo" vs "Renews X — $Y".

**UX-8: Polling continues in background tabs.** No `visibilitychange` listener — 10 s polling wastes battery on mobile.
**Fix:** pause interval on `document.hidden = true`.

**UX-9: Admin page's `StatusBadge` colours diverge from dashboard's.** Minor inconsistency (e.g., `provision_failed` blue here, red there).
**Fix:** single shared component.

### Low

**UX-10: Logout doesn't clear polling interval immediately.** `DashboardClient.tsx:568–575`. Interval may fire post-redirect with an expired cookie.
**Fix:** `clearInterval(pollRef.current)` before redirect.

**UX-11: Rate-limit reset time is parsed client-side as seconds.** `LoginClient.tsx:72–74` — `parseInt(header) * 1000` assumes seconds. Header-format drift breaks display.
**Fix:** validate; header name should include unit (e.g., `X-RateLimit-Reset-Seconds`).

**UX-12: Redirect cookie lifetime (15 min) may mismatch magic-link TTL.** If the user takes >15 min to click the link, they land at the default (`/admin`) instead of their intended destination.

---

## Logic findings

### High

**L-1: `getAccount()` doesn't distinguish 401 from 5xx.** `page.tsx:40–50`. A compute 500 error is silently treated as "session expired" and the user is logged out.
**Impact:** transient compute failures look like auth bugs to the user; real 401s and 500s are indistinguishable in logs.
**Fix:** check `res.status`; only clear cookie on 401.

**L-2: Polling loop has empty deps `[]` and never retries billing.** `DashboardClient.tsx:549–566`. If the initial `/api/billing/status` fetch fails (`billingError = true`), polling doesn't re-attempt billing — user is stuck with no billing info for the session.
**Fix:** retry billing in the polling callback; or add a manual refresh control.

**L-3: `secure: !isLocalhost` cookie flag is request-hostname derived.** `auth/callback/route.ts:71–76`. In preview deployments or multi-region setups, the hostname check is brittle; cookie may silently drop on HTTPS if the check evaluates wrong.
**Fix:** use explicit env (`NODE_ENV === 'production'`) or domain-based logic.

**L-4: `data.substrate ?? data` unwrap is fragile.** `admin/page.tsx:81`. If compute ever returns a different shape (or an error wrapped differently), this passes the wrong thing to the client and breaks silently.
**Fix:** zod-validate the response at the BFF boundary.

**L-5: `BillingWidget` suspended state has no in-app reactivate.** `DashboardClient.tsx:153–182` — CTAs are "Choose a plan →" (to /pricing) and "Contact support". A suspended customer with payment issues has no one-click reactivate button.
**Fix:** if `substrate_subscriptions.status ∈ {past_due, incomplete}`, show "Update payment method" that opens the Stripe portal directly.

### Medium

**L-6: Two substrate endpoints can disagree.** Dashboard polls `/api/substrates` (list, possibly cached); admin reads `/api/v1/substrates/:slug` (detail, fresh). Status changes can show up on one surface seconds before the other.
**Fix:** share a single endpoint or ensure the list endpoint's cache TTL matches polling cadence.

**L-7: Compute-side CSRF relies solely on `SameSite=lax`.** Website BFF has CSRF origin check; compute does not. If a future client calls compute directly with cookies (not Bearer), CSRF is gated only by cookie `SameSite`.
**Fix:** add Origin/Referer check to state-changing compute routes, or document the Bearer-only invariant.

**L-8: In-memory billing-status cache is per-process.** `billing/status.ts:44–48`. If deployed multi-instance (PM2 cluster), caches diverge across workers — user may see flickering data.
**Fix:** Redis cache or accept the staleness budget and document.

**L-9: `/health` probe has no retry / circuit breaker.** `billing/status.ts:175–193` — 5 s timeout per poll; one slow substrate makes every poll slow.
**Fix:** cache the failure for 60 s; exponential backoff.

**L-10: Rotation stepper has no concurrent-rotation guard.** `AdminClient.tsx:147–149` — user can double-click "Rotate key".
**Fix:** disable the button once `keyRotating = true` (the state exists; the button needs `disabled={keyRotating}`).

### Low

**L-11: `getSubstrateDetail()` returns `null` on any error, blanking the admin page.** 404 and 500 look identical to the user.
**Fix:** render a distinct error state.

**L-12: Polling silently swallows non-JSON responses.** `DashboardClient.tsx:560–562` catch hides everything.
**Fix:** `console.error` at minimum so Sentry/ops tooling can see it.

**L-13: `hasActiveSubscription` is on `SubstrateSummary` but never rendered per-card.** Could surface as a per-substrate billing pill.

---

## Missing tests

### e2e (Playwright)

1. **Full login → dashboard → polling → logout flow.** Existing `dashboard-hydration.spec.ts` covers load-without-401 only. Missing: magic-link click → cookie set → hydration → first poll → logout.
2. **Session expiry during polling.** Expire the cookie mid-poll, assert the user is redirected to `/login?error=session_expired`.
3. **Logout clears polling interval.** Assert no network activity after redirect.
4. **PostCheckoutBanner timeout.** Provision a substrate that takes >60 s; verify the banner degrades gracefully.
5. **Dashboard ↔ admin consistency.** Update a substrate status mid-session; assert both surfaces agree within one polling cycle.
6. **Admin page renders distinct error state for 404 vs 500.**

### Integration (compute)

7. **`/api/v1/billing/status` health-probe timeout.** Mock substrate health with a 6 s delay; assert `usageUnavailable: true`, overall response still ≤6 s.
8. **CSRF origin check on auth routes.** Assert mismatched `Origin` returns 403.
9. **`/api/auth/me` returns 404 when account is deleted mid-session.** Delete the account row, call with a valid session; assert 404.
10. **Substrate list vs detail consistency under write load.** Perform a status transition, poll both endpoints, assert they converge within 5 s.

### Unit (website)

11. **`secure: !isLocalhost` cookie logic.** Test `localhost`, `127.0.0.1`, `parametric-memory.dev`, preview URLs.
12. **`BillingWidget` state transitions.** Render all five states; assert DOM.
13. **`data.substrate ?? data` unwrap** — test shapes `{substrate: X}`, `X` (legacy), `{substrate: null}`, `null`, `{error: "..."}`.

---

## Reference file list

### Website (Next.js)
- `src/app/login/page.tsx`, `src/app/login/LoginClient.tsx`
- `src/app/auth/callback/route.ts`
- `src/app/api/auth/[...path]/route.ts`
- `src/app/dashboard/page.tsx`, `src/app/dashboard/DashboardClient.tsx`
- `src/app/admin/page.tsx`, `src/app/admin/AdminClient.tsx`
- `src/app/api/billing/status/route.ts`, `src/app/api/billing/portal/route.ts`, `src/app/api/substrates/route.ts`
- `src/lib/compute-proxy.ts`, `src/lib/csrf.ts`

### Compute (Express + TS)
- `src/api/auth/routes.ts`
- `src/middleware/session-auth.ts`
- `src/api/substrates/routes.ts`
- `src/api/my-substrate/route.ts` (legacy)
- `src/api/billing/status.ts`
- `src/lib/substrate-ownership.ts`
- `src/app.ts`
- `src/api/docs/swagger-spec.ts`

### Tests
- `tests/e2e/journeys/dashboard-hydration.spec.ts` (exists)
- `tests/e2e/journeys/` (directory to extend)
- `tests/integration/`
