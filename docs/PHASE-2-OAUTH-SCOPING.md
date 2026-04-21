# Phase 2 — OAuth Login Implementation Scoping

**Status:** Ready to kick off
**Dependencies:** Phase 0 (TOTP/sudo strip) complete. Phase 1 (compute bridge + recent-auth + account_identities) complete.
**Sources:** `docs/ADR-003-OAUTH-LOGIN-PROVIDERS.md`, `docs/OAUTH-PROVIDERS-DESIGN.md`, `parametric-memory-compute/src/{middleware,api/auth,services}/*`
**Created:** 2026-04-20

---

## Summary

Compute side is complete — bridge routes built, HMAC middleware verified, `account_identities` + audit tables migrated, recent-auth gate on `/link` and `/unlink`. Everything is tested. The routes are NOT yet mounted in `src/app.ts` — that's a one-line change plus an integration test update, and it's the first thing Session 1 does.

Website side is greenfield for OAuth. The existing magic-link machinery (session cookie setter, `computeProxy`, CSRF, `/admin/security` scaffold) is reusable. There is no pre-existing HMAC-signing client — that's a Session 1 build.

No Playwright on the website. ADR-003 test plan assumes Playwright e2e; we either install it or run mocked integration tests in Vitest. **Decision needed before Session 4.**

---

## Pre-kickoff decisions (block before starting)

These need answers before we start coding. All five are <10 minutes of thought each.

| # | Decision | Default | Notes |
|---|----------|---------|-------|
| 1 | **Playwright or Vitest-only integration tests?** | Vitest mocks for Session 4, Playwright deferred to Phase 3 | ADR-003 wants Playwright. Cost of installing + configuring Playwright inside this phase: ~15K tokens + CI config. Vitest-only still catches the critical branches (state mismatch, PKCE mismatch, unverified email) via mocked provider HTTP. |
| 2 | **mTLS vs HMAC bridge** | Stick with HMAC | Compute is already built for HMAC. mTLS is an additive future ADR; moving now = rebuild. |
| 3 | **Admin auto-link behavior** | Monitor-and-alert in Phase 2; block-mode in future hardening | ADR-003 open question N6. Safer-but-simpler: log+alert for now, block later if ops sees abuse. |
| 4 | **GitHub access token storage** | No (smaller attack surface) | Matches ADR default. Phase 3 can revisit if integrations need it. |
| 5 | **Env var canonical name** | `COMPUTE_OAUTH_BRIDGE_SIGNING_KEY` | Compute's `src/config.ts:62` is source of truth. Both repos use the same name. One of the scoping agents proposed `MMPM_OAUTH_BRIDGE_SECRET` — do NOT use that. |

Additionally, before Session 1 you'll need to register OAuth apps:

- **Google Cloud Console** — one OAuth 2.0 Client ID per environment. Redirect URI: `https://parametric-memory.dev/api/auth/oauth/google/callback` (and `http://localhost:3000/...` for dev). Issued by you, not Claude — human-only per ground rules.
- **GitHub OAuth App** — same pattern. Settings → Developer settings → OAuth Apps → New.

---

## Session plan

Budget per session: ~180K tokens (opus). Total work: ~160K tokens of implementation + 50K of iteration/debug/fixes. Splitting into four sessions keeps each one under the 70% checkpoint rule with comfortable reserve.

### Session 1 — Foundations (~60K tokens, mixed sonnet/haiku)

Goal: bridge plumbing ready on both sides, no user-facing behavior yet.

| Task | Files | Tier | Est |
|------|-------|------|-----|
| Mount OAuth routes in compute `src/app.ts` | compute `src/app.ts` + integration test updates | sonnet | 5K |
| HMAC bridge client on website | website `src/lib/compute-bridge-signed.ts` + tests | sonnet | 10K |
| PKCE + state store | website `src/lib/auth/pkce-store.ts` + tests | sonnet | 6K |
| Return-to allow-list validator | website `src/lib/auth/return-to.ts` + tests | sonnet | 4K |
| Env var wiring + config validation | website `src/config.ts` (new file) | haiku | 3K |
| Hand user `.env.local` additions | (instructions only, human applies) | haiku | 1K |
| Unit tests for all four helpers | mirrors above | sonnet | 10K |
| Run tests, verify green, checkpoint | — | — | 5K |

**Gate before Session 2:** compute route mount merged, HMAC client round-trips to compute in a local integration test.

### Session 2 — Providers + Sign-in (~75K tokens, opus for callback route)

Goal: user can click "Sign in with Google" on `/login` and land on `/dashboard`.

| Task | Files | Tier | Est |
|------|-------|------|-----|
| AuthProvider types + errors | website `src/lib/auth/providers/types.ts` | sonnet | 4K |
| Google adapter (OIDC, jose JWKS) | website `src/lib/auth/providers/google.ts` + tests | sonnet | 12K |
| GitHub adapter (non-OIDC, /user/emails) | website `src/lib/auth/providers/github.ts` + tests | sonnet | 10K |
| Provider registry | website `src/lib/auth/providers/registry.ts` | haiku | 2K |
| `/api/auth/oauth/[provider]/start` route | website `src/app/api/auth/oauth/[provider]/start/route.ts` + tests | sonnet | 8K |
| `/api/auth/oauth/[provider]/callback` route | website `src/app/api/auth/oauth/[provider]/callback/route.ts` + tests | **opus** | 15K |
| LoginClient.tsx buttons (flag-gated) | website `src/app/login/LoginClient.tsx` + test updates | sonnet | 5K |
| Session rotation helper (extract from callback) | website `src/lib/auth/session-cookie.ts` | sonnet | 4K |
| Run full site test suite + manual local smoke | — | — | 5K |
| Checkpoint | — | — | 3K |

**Why opus for `/callback`:** error mapping + intent branching (signin vs link) + session rotation + cookie rotation + audit-log-awareness is the subtlest piece. Worth the cost to get it right once.

**Gate before Session 3:** fresh user can sign in with Google + with GitHub. Existing magic-link user auto-links on Google sign-in. Unverified provider email rejects cleanly.

### Session 3 — Link / Unlink + Account Settings (~55K tokens, sonnet)

Goal: logged-in user can manage connected providers from `/admin/security`.

| Task | Files | Tier | Est |
|------|-------|------|-----|
| `/api/auth/oauth/link` route | website `src/app/api/auth/oauth/link/route.ts` + tests | sonnet | 7K |
| `/api/auth/oauth/unlink` route | website `src/app/api/auth/oauth/unlink/route.ts` + tests | sonnet | 7K |
| `GET /api/auth/oauth/identities` proxy | website `src/app/api/auth/oauth/identities/route.ts` + tests | sonnet | 5K |
| Recent-auth 401 handler — redirect + retry | website `src/lib/auth/reauth-redirect.ts` + tests | sonnet | 8K |
| SecurityClient.tsx — provider list + link/unlink buttons | website `src/app/admin/security/SecurityClient.tsx` + test updates | sonnet | 15K |
| Confirmation dialog for unlink | reuse existing dialog pattern | sonnet | 4K |
| Local smoke: link GitHub to an account, unlink, observe audit rows | — | — | 5K |
| Checkpoint | — | — | 3K |

**Gate before Session 4:** logged-in user can link a second provider (recent-auth gate fires → re-auth → success) and unlink one (audit row written).

### Session 4 — Integration + Security Tests + Ship (~70K tokens, opus for harness)

Goal: all security invariants asserted, ADR-003 go/no-go checklist green, ship.

| Task | Files | Tier | Est |
|------|-------|------|-----|
| Integration test harness (decide Playwright vs Vitest per pre-kickoff #1) | website `tests/integration/oauth/*.test.ts` | **opus** (harness design) | 15K |
| Full round-trip tests: new-user, existing-user auto-link, link, unlink | as above | sonnet | 15K |
| Security tests: replay, stale state, cross-session callback, open redirect, admin auto-link alert | website `tests/security/oauth-*.test.ts` | sonnet | 20K |
| ADR-003 go/no-go walkthrough | — | sonnet | 5K |
| Release notes entry + ADR-003 status update (Proposed → Accepted) | website `docs/ADR-003-*.md` | haiku | 3K |
| Full suite run + manual smoke against staging | — | — | 10K |
| Hand user git commands to tag + ship | — | haiku | 2K |

**Ship criteria:** every checkbox in ADR-003 section "Security Go/No-Go Checklist" passes; CI green; manual smoke on staging confirms sign-in + link + unlink round-trip.

---

## Deferred (explicitly out of Phase 2)

These are documented, not forgotten:

- Apple login, SAML, device code flow — additive future ADRs
- Storing Google/GitHub access/refresh tokens — unnecessary attack surface for now
- Migrating magic-link accounts into `account_identities` — uniformity pass for Phase 3
- mTLS between website and compute — HMAC sufficient for Phase 2
- Playwright e2e suite on the website — probably Phase 3 regardless
- Admin auto-link in block-mode (vs monitor-and-alert)
- TOTP re-implementation — PL-3 pre-launch, git tag `totp-last-active`

---

## Critical contracts (lock in before coding)

Pulled forward from the exploration so we don't re-derive these under time pressure:

**HMAC message format** (order is immutable, newline-separated with `\n`, never `\r\n`):
```
${timestamp}\n${METHOD}\n${fullUrlPath}\n${sha256Hex(rawBody)}
```

- `fullUrlPath` = e.g. `/api/v1/auth/oauth/bridge/signin` (NOT router-relative `/bridge/signin`)
- empty body hashes as `sha256('')` = `e3b0c442...2b855`, NOT `sha256('{}')` or `sha256('null')`
- timestamp is Unix seconds in header, also seconds in signed message
- skew window ±5 min

**Bridge endpoint contract** (compute side, fully specced):

- `POST /api/v1/auth/oauth/bridge/signin` — no session, HMAC only. Returns `{outcome, accountId?, identityId?, sessionId?, rawSessionToken?, reason?}`. **Compute mints the session inside the same transaction as the identity row** (via `issueSessionForAccount`, the helper shared with the magic-link path) and returns `rawSessionToken` for the website to cookie as `mmpm_session`. `last_reauth_at` is auto-stamped by migration 075's `DEFAULT now()` — no separate `stampLastReauth` round-trip needed on fresh signin. Bundling session creation here closes the "identity created, session missing" gap the earlier contract would have left in the callback route.
- `POST /api/v1/auth/oauth/bridge/link` — session + recent-auth + HMAC. Returns `{outcome, identityId?, reason?}`. Stamps `last_reauth_at = now()` on success.
- `POST /api/v1/auth/oauth/bridge/unlink` — session + recent-auth + HMAC. Body `{identityId}`.
- `GET /api/v1/auth/oauth/identities` — session only, no HMAC. Returns `{identities: [{id, provider, emailAtLink, displayName, verifiedAt, createdAt, lastSeenAt}]}`. `provider_sub` intentionally NEVER returned.

**401 response shape for reauth_required** (the website must parse this and redirect):
```json
{
  "error": "This action requires you to sign in again",
  "code": "reauth_required",
  "reauthAgeSeconds": 423
}
```

**Soft-delete interaction** (ADR-003 rev 2026-04-19, recently implemented): if an account is soft-deleted, the auto-link branch does NOT match it. Returning user gets a fresh account. This is tested in `tests/integration/email-reuse-after-soft-delete.test.ts`.

---

## Session bootstrap for Session 1

When you start Session 1, bootstrap with objective: "Phase 2 OAuth foundations — mount compute routes, build HMAC client, build PKCE store and return-to validator on website." Load this doc + `docs/ADR-003-OAUTH-LOGIN-PROVIDERS.md` + `parametric-memory-compute/src/middleware/bridge-auth.ts` as the first three reads. Everything else is downstream.
