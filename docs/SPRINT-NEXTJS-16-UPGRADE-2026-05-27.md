# SPRINT: Next.js 15.5.15 → 16.2.6 Upgrade

**Date drafted:** 2026-05-27
**Trigger:** Next.js May 7 2026 coordinated security release — 13 advisories (middleware bypass × 4, DoS × 3, SSRF, cache poisoning × 2, XSS × 2, RSC DoS upstream). 15.5.15 is below the patched floor of 15.5.18.
**Status:** Planning. Sprint not yet started. No code changes proposed by this document — execution is gated on review of this plan.

---

## 1. Executive summary

The mmpm-website codebase is in an unusually good position for a Next.js major upgrade. The previous team kept ahead of the v15 deprecation curve: every `cookies()` call is already `await`-ed, every `params`/`searchParams` page prop is already `Promise<…>`, no server actions are used, no Cache Components surface (`revalidateTag`, `updateTag`, `cacheTag`, `unstable_*`) is touched, and every outbound `fetch()` either passes `cache: "no-store"` explicitly or uses an explicit `next: { revalidate }` opt-in. This means the v16 surface area to fix is small and well-bounded.

The compute backend (`parametric-memory-compute`) is **Express 5, not Next.js**. The v16 upgrade therefore has no migration component on the compute side. The wire-level contract between the two services is highly disciplined (every outbound `fetch` explicitly sets cache, every cookie attribute is explicit, the HMAC bridge has a tight signing protocol). The risk on the compute interface is bounded to "verify, don't migrate."

**Total identified work:** five medium-risk changes, fourteen low-risk changes, eleven new tests, one architecture follow-up (next-mdx-remote was archived by HashiCorp on 9 April 2026 — not blocking, but should be migrated before launch). Estimated 2–3 working days for upgrade + tests + verification.

**Recommended target:** `next@16.2.6` directly. Skip the 15.5.18 stepping-stone. Pre-launch timing means there is no production traffic to protect, so the "decouple security from migration" argument that would normally favor a patch-first sequence does not apply.

---

## 2. Why we're doing this now

Three forces converge on now:

The May 2026 security release patches 13 advisories on 15.x. Four of them are auth-bypass shapes against `middleware.ts`, exactly the file pattern this codebase uses to gate `/admin` and `/dashboard`. The current middleware is a cookie-presence redirect (real auth runs at the page level), which structurally insulates against most of the bypass shapes, but the Edge runtime gadgetry the advisories target is broader than just route gating. Closing the CVE window before launch removes a class of "researcher hits parametric-memory.dev with a scanner" embarrassment.

Pre-launch is the cheapest possible time to do a major framework upgrade. No rollback risk, no customer impact, no support load, no SOC2-style change-management overhead. The next opportunity that cheap doesn't come back.

The 15.x line will continue to get critical security patches for a window, but Vercel's pattern is to wind that down once a major has been out for two cycles. 16.2.6 is current LTS as of this writing. Going to 16 buys a longer support runway and gets the codebase onto the surface that future patches will land on first.

---

## 3. Risk register

### Medium-risk items (5)

**M1 — `middleware.ts` → `proxy.ts` rename.** v16 deprecates the `middleware.ts` filename and the `middleware` named export in favor of `proxy.ts` and `proxy`. The `edge` runtime is **not supported** for `proxy`; Node.js runtime is forced. Codemod `npx @next/codemod@canary upgrade latest` claims to do this rename, but the rename is load-bearing for our auth-gate, so confirm by hand.

*Files:* `src/middleware.ts:17` (rename function + filename), `src/middleware.ts:36-48` (matcher config — syntax unchanged). Any deploy-pipeline grep for `middleware.ts` needs updating.

**M2 — `next/image` config defaults flip.** `next.config.ts:7-9` sets only `formats`. In v16 the silent defaults change: `minimumCacheTTL` 60s → 4 hours, `imageSizes` no longer includes 16, `qualities` now `[75]` only, `maximumRedirects` becomes 3, local IP blocked. The two `<Image>` callsites (`src/app/page.tsx:178`, `src/app/blog/[slug]/page.tsx:188`) don't pass `quality` or query strings so most defaults don't bite, but the 4h cache TTL on blog cover images is a behavior change worth being explicit about.

*Fix:* lock the values we want in `next.config.ts` explicitly before upgrade, so the defaults are visible in the diff rather than invisible.

**M3 — Turbopack default for production builds.** `next build` in v16 defaults to Turbopack. `next.config.ts` has no `webpack` block, no `turbopack` block, no `experimental` block, so the build will silently switch builders. Our bundle includes `@react-three/fiber`, `three` (with `transpilePackages: ["three"]`), Tailwind v4 PostCSS, MDX-remote with `rehype-pretty-code` + `shiki` — a non-trivial bundle graph. CVE-2026-45109 was also Turbopack-specific in 15.5.16/15.5.17; 15.5.18 + 16.2.6 carry the full fix.

*Mitigation:* do a `next build --turbopack` smoke build on **current 15.5.15** as a pre-upgrade dry-run, so any bundling issue is isolated from the upgrade itself. If something breaks in Turbopack we don't yet understand, we have `next build --webpack` as an escape hatch on v16 (still supported).

**M4 — CSS `scroll-behavior: smooth` regression.** `src/app/globals.css:70` sets `scroll-behavior: smooth` globally. In v15 Next overrode this to `auto` during SPA route transitions to avoid visible scroll delay; v16 no longer does this. On long pages, every internal nav will smooth-scroll. Easy to miss until someone clicks a link in a customer demo.

*Fix:* add `data-scroll-behavior="smooth"` to the `<html>` element in `src/app/layout.tsx`, or scope the CSS rule away from `html`. Pre-upgrade or alongside the bump — either works.

**M5 — `next lint` removed; ESLint flat config migration.** `package.json:15` declares `"lint": "next lint"`. v16 removes this command entirely and `next build` no longer runs lint. The `preflight` chain (`package.json:26`) calls `npm run lint` and will fail until the script is updated to `eslint .`. Additionally, v16 ships native flat config from `eslint-config-next@16`; the current `@eslint/eslintrc@^3.0.0` FlatCompat shim can be dropped for cleaner config (transitional shim still works, so this can be a follow-up if time-pressed).

*Files:* `package.json:15` (`lint` script), `package.json:26` (`preflight` chain), `eslint.config.mjs` (rewrite to direct flat imports), `package.json:67` (remove `@eslint/eslintrc` once shim is gone).

### Low-risk items (notable)

- All ~50 `cookies()` call sites already use `await` — zero behaviour change.
- All `params` / `searchParams` page props already typed as `Promise<…>` and awaited.
- `next/font` (`src/app/layout.tsx:2,16-35`) — no documented v16 API changes.
- `next/navigation` usages (~20 files) — no signature changes in v16.
- `next/script` — not imported anywhere. The two `dangerouslySetInnerHTML` JSON-LD blocks are raw React, so the v16 `next/script` `beforeInteractive` XSS hardening does not apply.
- 35 `route.ts` handlers — all already use `await cookies()`, `Promise<{params}>`, `NextRequest`/`NextResponse`. No v16 shape changes documented.
- No `'use server'` server actions exist — none of the v16 server-action changes apply (no `revalidateTag('foo', 'max')` second-arg requirement bites us).
- Default fetch caching — every fetch is explicit. Two sites use `next: { revalidate: 30|60 }` (`src/lib/knowledge-api.ts:114,249`) — both explicit opt-ins, behaviour identical in v16.
- `output: "standalone"` in `next.config.ts:4` — still supported (Adapter API is the long-term replacement but not required for the upgrade).
- `transpilePackages: ["three"]` (`next.config.ts:56`) — supported by both webpack and Turbopack.
- `src/app/sitemap.ts:5` — synchronous, no `generateSitemaps`, no `id` param, unaffected by the v16 async-id change.
- No `opengraph-image.*` / `twitter-image.*` / `icon.*` / `apple-icon.*` route handlers — OG declared via `metadata.openGraph.images` only.

### Dependency-side items

| Package | Current | Target | Reason | Risk |
|---|---|---|---|---|
| `next` | 15.5.15 | 16.2.6 | This sprint | M (the whole sprint) |
| `eslint-config-next` | 15.5.12 | 16.2.6 | Must match Next major | M (flat config rewrite) |
| `@react-three/fiber` | 9.6.0 | 9.6.1 | React 19.2 reconciler fix (9.6.0 silent rendering bugs on 19.2.x) | M (rendering correctness) |
| `framer-motion` | 12.36 | 12.40 | Strict-mode fixes for R19 (drag, layout, opacity) | L |
| `@stripe/react-stripe-js` | 6.3.0 | 6.4.0 | R19 peer range polish | L |
| `@vitejs/plugin-react` | 4.7.0 | 6.0.2 | Two majors behind; R19 jsx-runtime + Activity support; Fast Refresh under R19.2 unreliable on v4 | M |
| `tailwind-merge` | 3.5.0 | 3.6.0 | Minor patch | L |
| `zustand` | 5.0.11 | 5.0.13 | Patch | L |
| `resend` | 6.12.2 | 6.12.4 | Patch | L |
| `next-mdx-remote` | 6.0.0 | **hold** | Repo archived by HashiCorp 2026-04-09; no future fixes. v6 works under v16 but plan a migration to `@next/mdx` or an actively-maintained fork before launch. | M as a follow-up; **not blocking this sprint** |
| `eslint` | 9.39.4 | hold | ESLint 10 exists (Feb 2026) but `eslint-config-next@16` peer-targets 9. Don't chase. | L |
| `typescript` | 5.9.3 | hold | Don't chase TS just for this. | L |

Verify-needed before upgrade (`npm view <pkg> version` then assess): `@stripe/stripe-js`, `shiki`, `sonner`, `jose`, `tailwindcss` minor, `remark-gfm`, `clsx`. None are blockers; opportunistic bumps.

Transitive watch items: `@next/swc-darwin-arm64`, `@next/eslint-plugin-next`, `styled-jsx` (Next 16 bundles its own — check for duplicates with `npm ls styled-jsx` after upgrade), `caniuse-lite` (refresh with `npx update-browserslist-db@latest`). The `postcss` override at `package.json:88-90` should be preserved.

### Architecture follow-ups (not in this sprint)

- **next-mdx-remote archived.** Plan migration to `@next/mdx` (in-repo MDX) or `@content-collections/mdx` (CMS/remote-loaded MDX). Decide based on whether blog content will move to a CMS or stay in-repo.
- **JWKS endpoint.** Compute fetches `https://parametric-memory.dev/.well-known/jwks.json` (`compute/src/workers/substrate-provisioner.ts:158`). No file at `mmpm-website/public/.well-known/jwks.json` (only `actions.json`). Either nginx serves this from elsewhere, or it lives on a different host. Confirm during this sprint (single grep in nginx config) and either document or move into the website's `public/`.
- **`ApiError` envelope duplication.** Byte-identical copy at `src/types/api-error.ts` and `compute/src/types/api-error.ts`. The comment acknowledges "no monorepo yet." Drift here is a silent contract break. Either pull into a shared package, or add a contract test that reads both files and compares (see Section 5).

---

## 4. Sprint sequencing

The sprint is structured as four phases, each with a clear exit gate. Do not advance until the prior gate is clean.

### Phase 1 — Pre-upgrade hardening (≈ half a day)

Everything that can be done before the bump, so the upgrade itself has the smallest possible blast radius.

1.1 Add `data-scroll-behavior="smooth"` to `<html>` in `src/app/layout.tsx`. *(M4 mitigation, prevents post-upgrade nav regression.)*

1.2 Lock image config defaults explicitly in `next.config.ts:7-9`: add `minimumCacheTTL`, `qualities`, `imageSizes`, `maximumRedirects` with the v15 values we currently rely on, so the v16 defaults flip is invisible.

1.3 Add the eight wire-contract tests listed in Section 5 against `next@15.5.15`. They should all pass green on the current version. Any red here is a bug in the test, not the framework.

1.4 Add the four middleware-bypass regression tests listed in Section 5. These should all pass green on 15.5.15 (because the threat model is "redirect-only gate, page-level auth"), but they will also lock the behaviour against any v16 surprise.

1.5 Run `next build --turbopack` on **current** 15.5.15 as a dry-run. If Turbopack produces a working bundle on 15.5.15, the v16 bundler default switch is safe. If it fails, surface the failure now and decide whether to fix or to add `--webpack` to the v16 scripts.

1.6 Run `npx update-browserslist-db@latest` to refresh `caniuse-lite`.

**Gate 1:** all tests green on 15.5.15. `next build --turbopack` succeeds. PR opened with pre-upgrade hardening only.

### Phase 2 — The upgrade itself (≈ half a day)

2.1 `git checkout -b nextjs-16-upgrade` (human).

2.2 Run `npx @next/codemod@canary upgrade latest`. Review every change. Expected codemod work:
- Bumps `next` to 16.2.6 in `package.json`.
- Bumps `eslint-config-next` to 16.2.6.
- Renames `src/middleware.ts` to `src/proxy.ts`; renames `export function middleware` to `export function proxy`.
- Removes `next lint` command; replaces with `eslint .` in scripts.
- Migrates `experimental.turbopack` → `turbopack` (we have neither, but harmless).
- Strips any `unstable_` prefixes (we have none).

2.3 Verify by hand: middleware → proxy rename completed. The matcher exclusion list at `src/proxy.ts:46` (post-rename) is unchanged. Function exports `proxy`, not `middleware`.

2.4 Bump `@react-three/fiber` to 9.6.1 in the same change (M3 dep fix — React 19.2 reconciler).

2.5 Bump `framer-motion` to 12.40.0 and `@vitejs/plugin-react` to 6.0.2.

2.6 Bump `@stripe/react-stripe-js` to 6.4.0, `tailwind-merge` to 3.6.0, `zustand` to 5.0.13, `resend` to 6.12.4 (opportunistic patch/minor catches).

2.7 If preflight type-checks fail because `tsc --noEmit` cold doesn't see `.next/types`, change `package.json:16` from `rm -rf .next/types && tsc --noEmit` to `next typegen && tsc --noEmit`.

2.8 Migrate `eslint.config.mjs` off the `FlatCompat` shim to direct flat imports from `eslint-config-next`. Remove `@eslint/eslintrc` from `devDependencies`. (Optional in this sprint if time-pressed; legacy shim still works.)

**Gate 2:** `npm install` clean. `npm ls next` shows 16.2.6. `npm ls styled-jsx` shows a single copy. Lockfile diff reviewed.

### Phase 3 — Verification (≈ half a day)

3.1 `npm run preflight` — format, lint, typecheck, guards, test, build. Must be all-green.

3.2 `npm run e2e:smoke` against a local v16 build. All public-route smoke tests pass.

3.3 `npm run e2e:authed` if available. Validates the `/admin` and `/dashboard` redirect gate and authenticated flows.

3.4 The eight wire-contract tests from Phase 1.3 still pass on v16. Any red here is a real wire regression — investigate before merge.

3.5 The four middleware-bypass tests from Phase 1.4 still pass. Plus the new positive-case test (`mmpm_session` cookie present → next() instead of redirect).

3.6 Manual smoke: hit `/`, `/blog`, `/blog/[any-slug]`, `/docs`, `/pricing`, `/admin` (logged out → redirect), `/dashboard` (logged out → redirect). Check console for warnings.

3.7 Lighthouse pass on `/blog/[slug]` — confirm the new 4h image cache TTL is acceptable (or that we locked it down in Phase 1.2).

3.8 Verify the JWKS architecture follow-up: where does `https://parametric-memory.dev/.well-known/jwks.json` resolve from? Document in `docs/runbooks/`.

**Gate 3:** all green. Sign-off ready.

### Phase 4 — Deploy + monitor (timing flexible)

4.1 Merge to `main` (human, per ground rules).

4.2 Deploy via the `cicd-web-deploy` skill / existing pipeline.

4.3 Monitor for 24 hours: error rates, 500/502 counts, Stripe webhook success rate (recall: webhooks land on compute, not website — but billing flows depend on website state), bridge-signed call success rate.

4.4 Close the loop: tombstone the `v1.state.*` atom in MMPM that records the old Next version, store an event atom for the upgrade.

**Gate 4:** 24h clean. Sprint complete.

---

## 5. New tests to add

All tests are in addition to existing coverage. Twelve files total. Numbers below match the cross-references in Section 4.

> **Phase 1 actuals — see Section 10.** During execution, two changes from this plan were made:
> - Test 5.3 (Playwright redirect smoke) was deferred to Phase 3 — its highest value is verifying the `middleware.ts` → `proxy.ts` rename wired up, which is a Phase 2 change.
> - Test 5.10's cross-repo byte-equality was replaced with comprehensive runtime guard tests on the LOCAL `isApiError`. The original would have either broken in CI (filesystem dep on `MMPM_COMPUTE_REPO`) or silently skipped, giving false confidence. The shared-package architecture fix remains the long-term solution (Section 8). A cosmetic prettier-style drift between the two repos was surfaced during this work and documented.

### Middleware-bypass regression suite (Phase 1.4)

**5.1 `src/middleware.test.ts`** (new file) — exercises `src/middleware.ts` (becomes `src/proxy.ts` post-upgrade — update import path then).

Each case constructs a `NextRequest` and asserts behaviour. With no `mmpm_session` cookie:

- **App Router segment-prefetch bypass shape.** `GET /admin/security` with headers `Next-Router-Prefetch: 1`, `RSC: 1`. Must redirect to `/login?redirect=%2Fadmin%2Fsecurity`. (Not return 200/204 prefetch payload.)
- **Pages-Router i18n default-locale prefix shape.** `GET /en-US/admin` and `GET /en/admin`. **Phase 1 finding:** this codebase does NOT configure i18n in `next.config.ts`, so the CVE shape doesn't apply — `/en-US/admin` resolves to a 404 before reaching the middleware. The tests now pin "passes through middleware (no i18n configured)" with a comment block explaining what to do if i18n is ever added. No matcher change needed today.
- **Dynamic-route param injection shape.** `GET /admin/..%2Fpublic`, `GET /admin/%2e%2e/login`, `GET /admin//double-slash`. **Phase 1 finding:** `%2e%2e` is normalised by the WHATWG URL parser BELOW the middleware layer — the resulting pathname is `/login`, not `/admin/...`. The test was reframed to pin both the URL-parser normalisation AND the resulting middleware passthrough. The `..%2F` and `//double-slash` variants are NOT normalised and reach middleware as `/admin/...`, where the prefix check catches them.
- **Prefetch-incomplete-fix follow-up shape.** `POST /admin/anything` with `Next-Action: <fake-id>` header. Must redirect (server-action invocations on protected routes without a session cookie must not execute).

Positive case: each path **with** a non-empty `mmpm_session` cookie value must produce `NextResponse.next()`.

**5.2 `src/middleware.matcher.test.ts`** — snapshot the matcher regex from the `config.matcher` array. This locks the exclusion list against silent edits. Any code review that touches the matcher will then have to acknowledge a snapshot change.

**5.3 `e2e/smoke/middleware-redirects.spec.ts` (DEFERRED to Phase 3)** — Playwright counterpart. Hit `/admin`, `/dashboard`, `/admin/security/audit` without `storageState`. Assert 307 redirect to `/login?redirect=...`. **Why deferred:** the e2e's unique value is verifying that Next.js actually invokes middleware on these request shapes — a known-yes on 15.5.15 (the unit tests already cover function logic). The failure mode the e2e protects against is "after the `middleware.ts` → `proxy.ts` rename in Phase 2, did Next still wire up the gate?" That's a Phase 3 verification, not a Phase 1 hardening. Write this test as part of Phase 3.

### Wire-contract tests (Phase 1.3)

All under `src/lib/__tests__/` or alongside the file they pin. All use mocked `fetch`. Tests pin **exact bytes on the wire** — assert against golden strings, not parsed-then-reserialized JSON. The goal is to catch v16 regressions instantly.

**5.4 `compute-bridge-signed.contract.test.ts`** — golden file of the HMAC bridge request. Pin clock, pin nonce randomness (inject `now` and override `randomBytes`). Assert: the four request headers' exact names and values (`X-Compute-Bridge-Timestamp`, `X-Compute-Bridge-Nonce`, `X-Compute-Bridge-Signature`, plus `Content-Type`); the signed message string byte-for-byte (`${timestamp}\n${METHOD}\n${path}\n${sha256hex(body)}\n${nonce}`); `init.body` is the exact JSON string the test computed sha256 over. Run for each of: signin (POST + body, no cookie), link (POST + body + cookie), unlink (POST + body + cookie), identities (GET + cookie, no body, no Content-Type field).

**5.5 `compute-proxy.contract.test.ts`** — extend the existing test file. Add golden assertions: outbound `Content-Type: application/json` always present; `cache: "no-store"` always present; when inbound has `x-forwarded-for: 1.2.3.4`, outbound carries `X-Forwarded-For: 1.2.3.4`; when upstream returns non-JSON HTML, response is 502 with body `{ error: "upstream_error", message: "Invalid response from compute service" }`; 5xx upstream remapped to 502; 4xx preserved.

**5.6 `session-cookie.contract.test.ts`** — render the magic-link callback and the TOTP login-verify route through Next's test harness. Assert: `Set-Cookie: mmpm_session=<token>; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=2592000` (Secure dropped only on localhost); `mmpm_pending_token` identical except `Max-Age=600`. Verifies v16 doesn't silently change defaults to `SameSite=Strict` or add `Partitioned`.

**5.7 `auth-verify-shape.contract.test.ts`** — schema-pin the response shape from compute's `/api/auth/verify`: `{ ok: boolean, sessionToken?: string, accountId: string, requiresFactor?: string, pendingToken?: string }`. Pin both happy paths (session minted) and the TOTP fork (pendingToken returned).

**5.8 `signup-response-shape.contract.test.ts`** — pin the `/api/v1/signup` response shape. The website doesn't currently type-narrow this; codify it before v16 changes anything.

**5.9 `memory-events-sse.contract.test.ts`** — mocked upstream SSE source. Assert outbound headers (`Accept: text/event-stream`, `Cache-Control: no-cache`), response headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache, no-store, must-revalidate`, `Connection: keep-alive`, `X-Accel-Buffering: no`), and that aborting the inbound request also aborts the upstream.

**5.10 `src/types/api-error.contract.test.ts`** — **Reframed in Phase 1.** Original plan: read `compute/src/types/api-error.ts` at test time and compare byte-for-byte. Replaced because a filesystem dependency on a sibling repo either skips silently in CI (false confidence) or breaks if the env-var path is wrong. **New shape:** exhaustive runtime guard tests of the LOCAL `isApiError` — accepts valid envelopes (minimal + fully populated + partial + extras), rejects invalid inputs (null, primitives, arrays, empty, null-proto), rejects each required field missing (parameterised over the four), rejects wrong types for required + optional fields, and explicitly pins the snake_case field names against camelCase substitutes. **Finding:** the two `api-error.ts` files DO differ today — purely cosmetic (single vs double quotes, prettier config divergence), no semantic drift. Recorded as a cleanup follow-up. The architectural fix (shared package) remains in Section 8 out-of-scope.

**5.11 `fetch-cache-defaults.test.ts`** — unit test importing each cache-bearing helper (`computeProxy`, `bridgeClient.call`, the raw fetch sites at `callback/route.ts:61` and `login-verify/route.ts:108`) and asserting the `init` passed to `fetch` contains the expected `cache`/`next` keys. Prevents a future regression where someone deletes `cache: "no-store"` "because v16 makes it the default."

**5.12 `next-config-images-defaults.test.ts`** — small test that imports `next.config.ts` and asserts the locked-in values from Phase 1.2 (`minimumCacheTTL`, `qualities`, `imageSizes`, `maximumRedirects`). Pins the explicit values so a future engineer doesn't quietly drop them and pick up the v16 defaults.

---

## 6. Verification checklist (Phase 3 expanded)

This is the manual walkthrough after preflight + e2e are green. Tick each:

- [ ] `npm run lint` — zero new violations from v16's expanded `next/core-web-vitals` rules.
- [ ] `npm run typecheck` — `tsc --noEmit` exits 0 cold (or after `next typegen` if the script was updated).
- [ ] `npm run guard:testids`, `guard:actions`, `guard:llms-txt` — all three pass.
- [ ] `npm run test` — full vitest suite green. Spot-check the `vi.mock("next/navigation", …)` and `vi.mock("next/headers", …)` sites in `src/app/api/auth/oauth/[provider]/start/route.test.ts:76,85`, `…/callback/route.test.ts:75,84`, `src/app/api/csrf-wiring.test.ts:34`, plus all `src/app/api/*/route.test.ts` files. v16 split `next/headers` cookies API into sync vs async variants — confirm the mocks still match the runtime shape.
- [ ] `npm run build` — produces standalone output. If Turbopack fails on the bundle graph, fall back to `next build --webpack` and add `--webpack` to the script as a temporary workaround. File an issue against the Turbopack failure regardless.
- [ ] `npm run e2e:smoke` against `E2E_BASE_URL=http://localhost:3000` — public pages and `/login` render; testids in `docs/DUAL-ACCESSIBILITY.md` still resolve.
- [ ] `npm run e2e:authed` — authenticated flows pass.
- [ ] `src/app/__tests__/seo-headers.test.ts` — passes (this test imports `next.config.ts:headers()` callback; canary for the `next.config` contract).
- [ ] `e2e/auth.setup.ts` — storage-state capture still writes `mmpm_session` to `e2e/.auth/user.json`.
- [ ] `npm ls styled-jsx` — single copy.
- [ ] `npm ls @next/swc-darwin-arm64` (and any other platform binaries on CI) — refreshed to 16.2.x.
- [ ] Manual: `/admin` redirects to `/login?redirect=%2Fadmin` (logged out).
- [ ] Manual: `/admin` returns the admin page (logged in).
- [ ] Manual: `/blog/[any-slug]` renders MDX, code blocks have shiki highlighting, cover image loads.
- [ ] Manual: `/pricing` checkout flow opens Stripe Embedded Checkout (interface #11 → returns to `/billing/return` → interface #12).
- [ ] Manual: SPA navigation between long pages — no smooth-scroll delay (M4 verification).
- [ ] No console warnings on `/` or `/blog/[slug]` in production build.

---

## 7. Rollback plan

This is a pre-launch upgrade with no production traffic, so rollback risk is minimal. But for procedural completeness:

- All work happens on a branch. If Phase 3 verification fails irrecoverably, the branch is dropped and we stay on 15.5.15.
- The 15.5.15 version still has open CVE exposure (the 13 May 2026 advisories). If we drop the v16 branch, the fallback is `npm install next@15.5.18 eslint-config-next@15.5.18 --save-exact` — a patch-only stepping stone that closes the CVEs without the major bump. This was the original Plan A in the discussion that produced this sprint.
- Database schema is not touched by this upgrade. No migration to roll back.
- Stripe webhooks land on compute, not website. Customer state is not at risk from a website rollback.
- The shared `ApiError` envelope and HMAC bridge contract are version-stable across this upgrade (verified in the wire-contract review). No coordinated rollback needed on the compute side.

---

## 8. Out of scope

These are real follow-ups but not part of this sprint, to keep the diff bounded:

- **next-mdx-remote migration** to `@next/mdx` or an actively-maintained fork. The current package was archived 2026-04-09 and works fine under v16; migrate before launch in a separate sprint.
- **Adapter API adoption.** v16 makes the Adapter API stable. Today we use `output: "standalone"`. The Adapter API is the long-term replacement but adopting it is a deploy-pipeline change, not a code change in this codebase.
- **Sharing the `ApiError` shape** between repos via a real package (monorepo, internal npm, or workspace). The 5.10 contract test closes the immediate drift risk; the structural fix is its own piece of work.
- ~~**JWKS hosting.** Confirm where `parametric-memory.dev/.well-known/jwks.json` resolves from.~~ **Phase 1 finding: resolved, no gap.** The website serves `/.well-known/jwks.json` from `public/.well-known/jwks.json` (Ed25519 public key, kid `mmpm-snapshot-signing-v1`). The Next.js config emits ACAO + CORS preflight + 5-min cache headers on this path (`next.config.ts:66-75`). Compute's substrate-provisioner passes the URL into every customer substrate as `MMPM_JWKS_URI` (`substrate-provisioner.ts:158, :874`); substrates verify Merkle snapshots against this published key. Architecture is consistent. Test 5.13 (`src/app/__tests__/jwks-public.test.ts`) pins structural validity.
- **ESLint 10.** Available since Feb 2026 but `eslint-config-next@16` targets 9. Hold.
- **TypeScript 5.10+ chase.** Not needed for v16.

---

## 9. Sign-off

This document is a plan, not an execution. No code has changed. Phase 1 begins on explicit "go." The sprint is targeted at 2–3 working days end-to-end including the new tests.

**Open questions for the team before kickoff:**

1. Confirm pre-launch status — should this sprint close the CVE window now, or wait for a launch-blocker review?
2. Confirm doc location is acceptable — `docs/SPRINT-NEXTJS-16-UPGRADE-2026-05-27.md` follows existing convention.
3. Confirm the wire-contract tests should land in Phase 1 (so they pass on 15.5.15 first) versus Phase 2 (alongside the upgrade). Phase 1 is recommended.
4. Confirm the `npx @next/codemod@canary upgrade latest` strategy versus hand-migration. Codemod is recommended for safety + auditability — the diff is large but reviewable.

---

## 10. Phase 1 actuals (2026-05-27 execution log)

Pre-launch status confirmed → Phase 1 executed in a single session on branch `nextjs-16-upgrade` (cut from `web_upgrade` after stripe refactor merged). All Phase 1 work landed on this branch; no commits yet (sprint commits at logical checkpoints, human-only per ground rules).

### Code changes (M2 + M4 mitigations)

- **`src/app/layout.tsx`** — added `data-scroll-behavior="smooth"` on `<html>`. Restores the v15 SPA-transition behaviour that v16 removed. Inline comment cross-references this doc.
- **`next.config.ts`** — image config: explicit pins on `minimumCacheTTL: 14400` (4h, matches v16 default deliberately), `imageSizes: [16, 32, 48, …]` (keeps 16 for the homepage favicon at width=24), `qualities: [75]` (matches what we render). Inline comment cross-references this doc and the pinning test.

### Tests added (Phase 1 sum: 133 tests across 9 files, all green on 15.5.15)

| File | Tests | Sprint test | Notes |
|---|---|---|---|
| `src/app/__tests__/next-config-images-defaults.test.ts` | 5 | 5.12 | Pins each image config value. |
| `src/middleware.test.ts` | 13 | 5.1 | Bypass regression suite — see refinements in Section 5. |
| `src/middleware.matcher.test.ts` | 7 | 5.2 | Snapshot + structural pins on the matcher regex. |
| `src/app/__tests__/jwks-public.test.ts` | 8 | 5.13 | Structural validity of `public/.well-known/jwks.json`. |
| `src/types/api-error.contract.test.ts` | 25 | 5.10 | Reframed — see Section 5. |
| `src/lib/fetch-cache-defaults.test.ts` | 8 | 5.11 | Pins `cache: "no-store"` on `computeProxy`, `bridgeClient.call`, `fetchAllAtoms`, and `next: { revalidate: 30 }` on `fetchAtomGraph`. |
| `src/app/__tests__/session-cookie.contract.test.ts` | 18 | 5.6 | `mmpm_session` + `mmpm_pending_token` `Set-Cookie` byte shape; v16-default-flip guards (Strict / Partitioned absent). |
| `src/types/compute-responses.contract.test.ts` | 33 | 5.7 + 5.8 | Auth-verify + signup response shape runtime guards. |
| `src/app/api/memory/events/route.contract.test.ts` | 16 | 5.9 | SSE proxy wire contract — outbound headers, signal propagation, response headers, error paths. |

### Tests NOT YET written (intentional deferrals)

- **Test 5.3** — Playwright e2e middleware-redirect smoke. Deferred to Phase 3 because its highest-value scenario is verifying the `middleware.ts` → `proxy.ts` rename wired up correctly.
- **Tests 5.4 + 5.5** — full HMAC bridge golden-file contract test and compute-proxy contract extension. The existing `compute-bridge-signed.test.ts` + `compute-bridge-signed.security.test.ts` + `compute-proxy.test.ts` files (pre-existing) already cover wire-format correctness; the gap that 5.4/5.5 would close is "exact bytes" pinning, which is incremental hardening rather than a regression net. Can be added as polish during Phase 2 if time permits, or deferred to a separate cleanup sprint.

### Other Phase 1 work

- **Turbopack dry-run on 15.5.15:** `npx next build --turbopack` succeeded cleanly. The v16 default-bundler switch is safe; we will not be debugging Turbopack issues compounded with v16 changes.
- **`caniuse-lite` refresh:** 1.0.30001778 → 1.0.30001793. "No target browser changes" — CSS output won't shift; the database is just fresher for upcoming builds.

### Findings surfaced during Phase 1 (not in the original plan)

- **URL normalisation defeats `%2e%2e` injection at the platform layer.** The WHATWG URL parser collapses encoded dot-segments before middleware sees them. Test 5.1 case 3a was reframed from "middleware redirects this" to "URL parser normalises this; middleware correctly passes through the resulting `/login`." Documented in `src/middleware.test.ts` with rationale.
- **i18n CVE shape (test 5.1 case 2) does not apply to this codebase today.** No i18n config in `next.config.ts`, so `/en-US/admin` resolves to a 404. Tests now pin "passes through middleware" with an inline comment block telling future engineers what to do if i18n is ever added.
- **`api-error.ts` cosmetic drift between repos.** The website uses double quotes, compute uses single quotes — prettier configs diverged. No semantic drift. Cleanup is a follow-up; the shared-package fix in Section 8 is the long-term answer.
- **JWKS architecture confirmed and documented** (see Section 8 entry).

### Phase 1 exit gate

Phase 1 is done when `npm run preflight` is fully green on 15.5.15. That run is the next action item — Step 16 of the execution log.
