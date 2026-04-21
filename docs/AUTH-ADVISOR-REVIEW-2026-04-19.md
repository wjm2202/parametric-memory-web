# Auth System — Independent Advisor Review

**Date:** 2026-04-19
**Reviewer:** Advisor pass (independent of ADR-003 authors)
**Scope:** `mmpm-compute` + `mmpm-website` authentication, end-to-end
**Deliverable goal:** Professional second opinion on current auth, and a simplified path to Google + GitHub login with magic link demoted to fallback.
**Status:** Advisory — no code changed, no deploys triggered.

---

## 1. TL;DR

The current magic-link auth is **quietly well-built** — opaque 256-bit sessions, SHA-256 at rest, a write-throttle so sessions don't hammer Postgres, compute as the single source of truth, and a clean Bearer proxy from the website. The cryptographic primitives and session lifecycle are fine; nothing here is load-bearing garbage.

What's *not* fine is everything around it. Removed-but-still-present features (TOTP, sudo) are sitting as dead migrations and dead route modules. The OAuth story has been designed on paper (ADR-003, 2026-04-14) but the design leans on a pattern (`sudo_sessions`) that was deleted five days before the ADR was written, trusts a shared-secret bridge header whose binding rules are undefined, and auto-links accounts by email without a server-side re-check.

My recommendation is:

> **Clean up first, then add OAuth.** Treat "make it simple" as a first-class deliverable, not a side-effect. Ship in three phases, with a go/no-go gate between each. OAuth becomes primary, magic link stays as a one-button fallback, and the dead TOTP/sudo code gets removed before any new auth code lands.

Email cost drops naturally once OAuth is primary — no special engineering needed. Keeping magic link alive (not deprecating it) costs essentially nothing because it's already built and its failure modes are already known.

---

## 2. How this review was done

Two independent investigators were dispatched in parallel. One mapped the current auth surface in code (file paths, migrations, route handlers, middleware, cookie read/write sites). The other read `docs/ADR-003-OAUTH-LOGIN-PROVIDERS.md` and `docs/OAUTH-PROVIDERS-DESIGN.md` critically, with no brief to agree with them. I then synthesised both. Nothing in this doc is based on my own untested memory of the codebase; every file path and line reference here was confirmed by one of the sub-agent reports.

No `.env` files were read. No git state was changed. Investigation was read-only.

---

## 3. Current state — what we actually have

### 3.1 Data model (compute)

Three tables carry the entire user identity + session story today:

| Table | Migration | Purpose |
|---|---|---|
| `accounts` | `001_create-accounts.sql` | Identity root. `email` is `UNIQUE`. Carries tier, balance, status. |
| `magic_link_tokens` | `022_create-auth-tables.sql` | Single-use tokens. `token_hash` (SHA-256), TTL, `used_at` for idempotency. |
| `auth_sessions` | `022_create-auth-tables.sql` | Opaque session store. `token_hash` unique, `expires_at` rolling 30d, `last_used_at`. |

There is **no `account_identities` table** and **no OAuth-linkage scaffold** in the live schema. The `ops-mcp/src/oauth_provider.ts` file is an OAuth 2.1 *server* for MCP clients — a completely separate concern from user login. Do not let anyone "repurpose" it for browser login.

Disabled-but-live artefacts still in the schema:

- `account_totp`, `totp_backup_codes`, `totp_pending_sessions` (migration 034)
- `sudo_sessions` (migration 057)

These are columns and indexes carrying real bytes on prod with no runtime consumer. They should be dropped in a follow-up migration before OAuth tables land, so new engineers don't read them as current design.

### 3.2 Session lifecycle (compute)

The mechanism is correct:

1. **Issue.** `auth-service.ts` lines 192-202 generates a 256-bit hex token, hashes it SHA-256, inserts into `auth_sessions` with 30-day expiry, returns the raw token exactly once.
2. **Validate.** `middleware/session-auth.ts` lines 48-67 accepts the token from `Authorization: Bearer` (preferred, website uses this) or from the `mmpm_session` cookie (fallback). Hashes and looks up.
3. **Refresh.** `auth-service.ts` lines 229-262 is write-throttled (SEC-4): it only updates `last_used_at` / `expires_at` when the session has less than 15 days of runway. Read-only the rest of the time. This is the right call for high-volume Postgres hygiene.
4. **Revoke.** `logout()` (lines 269-276) sets `expires_at = now()` via hash lookup. The website additionally clears the cookie at `src/app/api/auth/[...path]/route.ts:74-80`.

### 3.3 Website surface (Next.js)

Light and sensible:

- `src/app/api/auth/[...path]/route.ts` — proxy to compute auth endpoints.
- `src/app/api/compute/[...path]/route.ts` — proxy for everything else, forwards the Bearer.
- `src/app/auth/callback/route.ts` — handles the magic-link click (`?token=...` → session cookie).
- `src/middleware.ts` — edge check on `/admin` and `/dashboard`. Cookie-presence only, no role check.

The cookie is `mmpm_session`, `HttpOnly; Secure; SameSite=Lax; Max-Age=30d`. The cookie is **read or written in 44 files** across the website. Most of those are indirect server-component / route-handler reads via a `getSessionToken()` helper; two places actually mutate it (callback sets it, logout clears it). This is fine but worth knowing: if the cookie format ever changes, the blast radius is 44 files.

### 3.4 Trust model between website and compute

Today:

- Website holds the raw session token as a cookie.
- Website forwards it to compute as `Authorization: Bearer` on every proxied call.
- Compute is the only actor that sees the hash and the DB.

This is a clean **split-trust** model for a 2-tier product. The website never needs long-term write access to auth tables. **Do not erode this for OAuth.** (See §5 — the existing ADR partially erodes it.)

### 3.5 Dev / test hooks — the good kind

The E2E fixture at `tests/e2e/fixtures/auth.ts` mints magic-link tokens *directly in the DB* rather than via an exposed dev-only endpoint. It:

- Refuses to run if `NODE_ENV === 'production'`.
- Refuses to run if `DATABASE_URL` is not localhost.
- Requires `DEV_LOGIN_EMAIL` to be set (no hardcoded identity).
- Asserts no TOTP enrolment on the fixture account.

There is **no `/api/auth/dev-magic-link`** HTTP endpoint exposed on compute — my memory had that wrong. This is a better pattern than a dev endpoint and should be preserved when OAuth lands (no `/api/auth/dev-oauth-complete`, etc.).

---

## 4. Risks in the current system, ranked

Severity scale: `critical` (blocks anything), `high` (must address before OAuth), `medium` (address during OAuth), `low` (can defer).

### R1 — Dead auth code is still mounted [high]

`src/api/auth/totp-routes.ts` and `src/api/auth/sudo.ts` are present in the tree. `auth/routes.ts:112-138` has a large commented TOTP_DISABLED_2026_04_11 block. Migrations 034 and 057 are live. The only thing keeping this from being runnable is that routes aren't mounted.

This is a liability because: (a) a well-meaning engineer could re-mount them, (b) a security scan will pick up the code and ask questions, (c) the ADR-003 authors clearly read this as "we have sudo" and designed on top of it. Fix: delete the route files (as a separate, reviewed change), add a migration that drops the disabled tables, and let git history carry the TOTP/sudo code for future reference.

### R2 — 44 files read or reference the `mmpm_session` cookie [medium]

Most are legitimate server-component reads, but this is exactly the kind of sprawl that makes cookie-format changes (e.g. renaming, adding a prefix, moving to a signed JWT) terrifying. A single `getSessionToken(req)` helper should be the *only* place that names the cookie. If that helper already exists in `src/lib/compute-proxy.ts` (it does), the other call sites should be migrated to it; if it doesn't, it should be created and enforced via an ESLint rule.

### R3 — No OAuth scaffolding, but ADR-003 assumes schema decisions that aren't in code [medium]

The ADR-003 document describes an `account_identities` table; it does not exist. This is not wrong — it's proposed — but it means the next migration can still re-open the design, which is the point of this review.

### R4 — Middleware is cookie-presence only on `/admin` [medium]

`src/middleware.ts` gates `/admin` on the cookie being present. The actual authorization (is this user an admin?) happens later. That's acceptable *if* every admin route does its own role check, and *not* acceptable if even one forgets. A follow-up pass to map every `/admin/*` route and confirm the downstream check is there is worth a sprint item — but this is pre-existing, not new OAuth work.

### R5 — No rate limiting documented on the OAuth callback surface [medium, future]

Not yet a risk because OAuth isn't shipped. But the existing design doc says "reuse existing middleware" without specifying the limits, and auth callbacks are a classic attack surface (credential stuffing, brute-force on state tokens). Needs concrete numbers before launch.

### R6 — No key-rotation story for any auth secret [low]

`COMPUTE_OAUTH_BRIDGE_TOKEN` (proposed), OAuth client secrets (proposed), Resend API key (current), session signing key (implicit — we don't sign sessions, we hash them, so this one doesn't apply but the general point does). There's no runbook for "what if a secret leaks"? That's a gap worth a separate ADR regardless of OAuth.

### R7 — No provider-outage fallback in the OAuth design [low]

If Google JWKS is unreachable, users can't log in. Magic link will be our fallback — and this is one of the strongest arguments for keeping it around. Worth calling out explicitly in the user-facing docs.

---

## 5. Assessment of the existing ADR-003

The ADR and its companion design doc are thoughtful and well-written. They got the big shape right: pluggable `AuthProvider` interface, `account_identities` table with sensible uniqueness constraints, PKCE S256, state cookie, nonce for OIDC. That's ~80% of the work.

The remaining 20% has issues serious enough that I would not ship as written.

### 5.1 It depends on a pattern that no longer exists [critical blocker]

The ADR proposes that add-a-provider and remove-a-provider flows be gated by `sudo_sessions`. Sudo was removed in M-0B on 2026-04-09. The ADR was written 2026-04-14. The ADR does not acknowledge this.

Two options:

- **(a) Reintroduce sudo** for account-mutating actions. Clean, proven pattern, but reverses a recent simplification.
- **(b) Replace sudo with a lightweight re-auth** — require a fresh magic-link click or an OAuth re-consent dance within 5 minutes before any `link`/`unlink` mutation. No new table, no new concept.

I'd pick (b). It's simpler, it uses what we already have, and the UX is no worse than sudo was. The rule is: *adding or removing an identity on an existing account requires a fresh login action in the last 5 minutes.* Enforce this in compute, not just on the website, and log every mutation to a new `account_identity_audit` table so a compromised website can't silently reshape identities without leaving a trail.

### 5.2 `X-Compute-Bridge` is a shared secret with undefined binding [high]

The ADR proposes a shared-secret header between website and compute. The only guard is a Traefik middleware that binds the caller to the website's IP/hostname. That middleware is not specified — config rules, rotation schedule, what happens if the website is compromised, none of it.

Pragmatic short-term fix: the shared secret is acceptable **iff**:

- It lives in the secrets store (not plain env vars visible to every process).
- It rotates on a schedule (quarterly at minimum), with both-key-valid overlap window.
- The Traefik binding is by source IP **and** by an HMAC of request body + timestamp (prevents replay and prevents a leaked header alone from being enough).
- The OAuth-complete endpoint is the *only* compute endpoint that accepts this header, and it is rate-limited aggressively (e.g. 10/min/IP).

Longer-term: mTLS between website and compute. The ADR names this as "ADR-004 candidate" — that work should be scheduled, not aspirational.

### 5.3 Auto-link by verified email has no server-side re-check [high]

The ADR's safety argument is "the adapter verifies `email_verified` before calling compute." That's fine if the adapter has no bugs. If the adapter has a bug, an attacker who controls an unverified email at a provider can link to the matching account.

Defence in depth: compute should itself check that the incoming `verified_email` field matches a value the provider confirmed via the `id_token` or via a direct profile fetch performed by compute itself, **not** by trusting the website. The cost is one extra HTTPS call per first-time OAuth sign-in. Worth it.

### 5.4 Uniqueness constraints on `account_identities` leave a gap [medium]

`UNIQUE(provider, provider_sub)` + `UNIQUE(account_id, provider)` enforce "one account per provider identity" and "one identity per provider per account." They do not enforce "one email per verified account." A partial unique index on `LOWER(email_at_link)` where `verified_at IS NOT NULL` plugs the gap. Cheap to add, and it's a database-level backstop even if application logic drifts.

### 5.5 Logout does not revoke identity links [medium]

Today's logout kills the session row. With OAuth, if an attacker planted an identity link during a compromise, logout won't undo it. The session-details page should list linked identities and allow one-click unlink without needing a separate re-auth (unless that's the *only* identity, in which case block the unlink).

### 5.6 Everything else the existing ADR mentioned is fine

Pluggable adapter interface, PKCE S256, state cookie binding, 5-minute TTL, nonce for Google, opaque session tokens unchanged — all correct. This review is not proposing a rewrite, just a revision.

---

## 6. Recommended design — simplified, OAuth-first

### 6.1 Shape

Two OAuth providers (`google`, `github`) and magic link, all implemented against one `AuthProvider` interface. OAuth is the primary UI; magic link is a *"sign in with email"* link below the two provider buttons — same visual weight as the links are on every mainstream SaaS product.

One new compute table:

```
account_identities (
  id              UUID PK,
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,              -- 'google' | 'github'
  provider_sub    TEXT NOT NULL,              -- stable user id from provider
  email_at_link   TEXT NOT NULL,              -- LOWER()'d at write
  display_name    TEXT,
  verified_at     TIMESTAMPTZ,                -- when compute confirmed verified_email
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX identities_provider_sub   ON account_identities(provider, provider_sub);
CREATE UNIQUE INDEX identities_account_prov   ON account_identities(account_id, provider);
CREATE UNIQUE INDEX identities_verified_email ON account_identities(LOWER(email_at_link))
  WHERE verified_at IS NOT NULL;
```

And one audit table, because security-sensitive mutations should never be silent:

```
account_identity_audit (
  id              UUID PK,
  account_id      UUID NOT NULL,
  action          TEXT NOT NULL,              -- 'link' | 'unlink' | 'auto_link'
  provider        TEXT NOT NULL,
  actor_ip        INET,
  actor_ua        TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6.2 Endpoints (compute)

Four endpoints, one new table scan pattern each:

- `POST /api/auth/oauth/complete` — website calls after callback. Body includes `provider`, `provider_sub`, `id_token` (so compute can re-check), `code` (so compute can exchange if needed). Server re-verifies `email_verified`. Issues a session. Writes audit row. Returns `{ account_id, session_token }`.
- `POST /api/auth/oauth/link` — logged-in user adds a provider. Requires re-auth within 5 minutes (replaces sudo).
- `POST /api/auth/oauth/unlink` — logged-in user removes a provider. Requires re-auth. Refuses if it would leave zero authenticated paths.
- `GET /api/auth/identities` — returns the user's linked providers for the session-details UI.

### 6.3 Bridge header

Keep `X-Compute-Bridge` for `/oauth/complete` specifically, but harden:

- Secret in secrets store, not env.
- HMAC header (`X-Compute-Bridge-Sig`) signing `timestamp|body` with a 60-second freshness window.
- Rate limited 10/min/IP at the compute edge.
- Rotation runbook committed to `/docs/runbooks/auth-secrets-rotation.md`.

mTLS is a follow-up, not a blocker.

### 6.4 Website UX

One sign-in screen, three buttons in this order:

```
[  Continue with Google  ]
[  Continue with GitHub  ]
────────── or ──────────
  Sign in with email →
```

The "sign in with email" link flips to the existing magic-link form. Existing users with active `mmpm_session` cookies see nothing change — the migration is additive.

Dashboard gets a "Sign-in methods" section showing linked providers, with a **Disconnect** button next to each (gated by re-auth) and an **Add provider** button. Simple. No separate "security" page yet — add one later when we bring back 2FA as an opt-in.

### 6.5 What we explicitly do NOT build in v1

- **Apple Sign-In.** Good for iOS apps, irrelevant for our initial audience. Add later if inbound demand justifies.
- **Enterprise SSO (SAML / OIDC to a customer's IdP).** Sells in pro/enterprise tier; defer until the second paid customer asks.
- **Passkeys / WebAuthn.** Great UX, wrong battle for a 6-month-old product. Revisit Q3.
- **Bringing back TOTP or sudo.** No. We removed them 10 days ago. Building OAuth is not a reason to re-litigate that decision.

---

## 7. Test strategy

Tests for everything we make — per your standing rule. Minimum:

**Unit (Vitest, `tests/unit/`):**

- `AuthProvider.google` — mocked token exchange, verifies `id_token` signature, rejects expired / wrong-aud / missing-email-verified.
- `AuthProvider.github` — mocked `/user` + `/user/emails`, picks the primary verified email, rejects if none verified.
- PKCE store — 5-minute TTL, single-use consumption, state/verifier/nonce round-trip.
- `account_identities` upsert logic — auto-link hits the right index, unlink refuses last identity.

**Integration (Testcontainers Postgres, `tests/integration/`):**

- Full OAuth complete flow against real DB: new user, existing magic-link user (auto-link), existing OAuth user (sign-in, no new row).
- Unique-index violations are caught and translated to HTTP 409 with a user-safe message.
- Audit rows written for every link/unlink/auto-link.
- Re-auth window enforcement: mutation within 5 min succeeds, 6 min fails.

**E2E (Playwright, extend `tests/e2e/`):**

- Google and GitHub flows using provider *sandbox* OAuth clients (not prod). One happy-path test per provider.
- Magic link unchanged — existing tests must still pass. This is the regression gate.
- Identity management on the dashboard: link, unlink, blocked-last-method case.
- Logout revokes session server-side (check DB state, not just cookie absence).

**Security (`tests/security/`):**

- Bridge header must be present and HMAC-valid — tamper tests cover missing, wrong secret, replayed timestamp.
- Rate limit on `/oauth/complete` — 11th request in a minute gets 429.
- `verified_email: false` from a provider is rejected server-side even if the adapter bugged and passed it through.
- `account_identities.provider_sub` collision across accounts triggers a 409, never silently merges.

**Manual pre-launch:**

- Real Google + GitHub prod OAuth clients in staging, walk a new account through sign-up, link, unlink, sign-in, logout, magic-link fallback, provider outage simulation.

---

## 8. Phased rollout with go/no-go gates

Three phases. Each has an explicit gate — do not advance on momentum.

### Phase 0 — Clean house (0.5 sprint)

Before any new auth code, pay off the debt.

- Drop `totp-routes.ts`, `sudo.ts`, and the `TOTP_DISABLED` comment block in `auth/routes.ts`. (Human runs the `rm` — per ground rules.)
- New migration to drop `account_totp`, `totp_backup_codes`, `totp_pending_sessions`, `sudo_sessions`.
- Introduce single `getSessionToken()` helper (if not already) and migrate the remaining ~40 cookie callsites.
- Deploy. Verify magic-link still works end-to-end.

**Gate to Phase 1:** all existing auth E2E tests green, prod dashboard metrics flat, no 5xx spike.

### Phase 1 — Compute-side OAuth plumbing, no user exposure (1 sprint)

- Migration for `account_identities` and `account_identity_audit`.
- `POST /api/auth/oauth/complete`, `/link`, `/unlink`, `GET /identities` behind a feature flag (`AUTH_OAUTH_ENABLED=false` in prod).
- Bridge header + HMAC + rate limit + secret rotation runbook.
- Full unit + integration test suite.

**Gate to Phase 2:** security review sign-off on the bridge model; manual test of the compute endpoints from staging; bridge-secret rotation rehearsed once.

### Phase 2 — Website-side UI, staging-only (1 sprint)

- `AuthProvider` adapters for Google and GitHub.
- Sign-in page redesign (two buttons + email fallback).
- Dashboard identity-management section.
- E2E tests against provider sandboxes.

**Gate to Phase 3:** staging soak for 72 hours with internal users. Zero auth-related 5xx. Sandbox OAuth clients verified.

### Phase 3 — Production flip (0.5 sprint)

- Feature flag flipped on prod. Magic-link path left intact.
- Dashboard visibility: watch sign-in success rate, email volume, new-account rate for 72 hours.
- Rollback path: flip flag off. No data loss because `account_identities` is additive.

**Gate to success:** email volume drops by ≥50% over 30 days, no auth-related Sev2+ incidents, p95 sign-in latency stays within 10% of pre-launch baseline.

---

## 9. Decision checklist for you

These are the calls that need you, not me, before Phase 1 starts:

1. **Re-auth vs sudo for identity mutations.** My recommendation is "require a fresh login action in the last 5 minutes" and skip reintroducing `sudo_sessions`. Agree?
2. **Bridge header hardening vs mTLS.** Short-term HMAC + rotation, mTLS as ADR-004 scheduled for Q3. Agree, or do you want mTLS in v1?
3. **Drop disabled TOTP/sudo tables now.** Separate migration, separate PR, in Phase 0. OK to proceed?
4. **Scope of providers in v1.** Google + GitHub only. No Apple, no SAML, no passkeys. Agree?
5. **What "fallback only" means visually.** My suggestion is a de-emphasised "sign in with email" link below the two buttons, not hidden, not a dropdown. OK?
6. **Feature-flag name.** I proposed `AUTH_OAUTH_ENABLED`. Fine, or use an existing flag system?
7. **Email-cost target.** Do you have a number in mind (e.g. "cut Resend bill by 70%")? Having a measurable target helps define Phase 3 success.

---

## 10. Appendix — File inventory (confirmed 2026-04-19)

**Compute (`parametric-memory-compute/`)**

- `src/services/auth-service.ts` — core service (`requestMagicLink`, `verifyMagicLink`, `validateSession`, `logout`)
- `src/middleware/session-auth.ts` — session extraction + validation
- `src/middleware/auth.ts` — API-key validation (separate from session auth)
- `src/api/auth/routes.ts` — POST `/request-link`, GET `/verify`, POST `/logout`, GET `/me`
- `src/api/auth/totp-routes.ts` — disabled, pending deletion
- `src/api/auth/sudo.ts` — disabled, pending deletion
- `ops-mcp/src/oauth_provider.ts` — OAuth 2.1 **server** for MCP clients (unrelated to user login)
- `migrations/001_create-accounts.sql`
- `migrations/022_create-auth-tables.sql`
- `migrations/034_drop_account_credentials_add_totp.sql` — pending drop
- `migrations/057_sudo-sessions.sql` — pending drop
- `tests/e2e/fixtures/auth.ts` — DB-level dev magic-link minting, production-guarded
- `tests/security/authz-idor.test.ts`, `tests/security/session-routes.test.ts`

**Website (`mmpm-website/`)**

- `src/app/api/auth/[...path]/route.ts` — proxy
- `src/app/api/compute/[...path]/route.ts` — compute proxy with Bearer forwarding
- `src/app/auth/callback/route.ts` — magic-link cookie set
- `src/middleware.ts` — edge cookie-presence check on `/admin` and `/dashboard`
- `src/lib/compute-proxy.ts` — shared proxy utility
- `docs/ADR-003-OAUTH-LOGIN-PROVIDERS.md` — existing design (review above)
- `docs/OAUTH-PROVIDERS-DESIGN.md` — existing companion doc

---

*End of review. Next step: read §9 decision checklist and come back to me with answers. I'll turn the yes-es into a concrete Phase-0 migration plus a revised ADR.*
