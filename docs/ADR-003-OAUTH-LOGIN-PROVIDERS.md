# ADR-003: Pluggable OAuth Login Providers (Google + GitHub) Alongside Magic Link

**Status:** Accepted (revised)
**Date:** 2026-04-19 (initial draft 2026-04-14)
**Deciders:** Entity One
**Supersedes:** The 2026-04-14 draft of this ADR. Phases, auth-gate pattern, and the identity-table shape were revised in the 2026-04-19 advisor review (see [`AUTH-ADVISOR-REVIEW-2026-04-19.md`](./AUTH-ADVISOR-REVIEW-2026-04-19.md)). Anything that conflicts with the text below is out of date.
**Related:**
- `src/app/api/auth/[...path]/route.ts` (website → compute auth proxy)
- `src/app/auth/callback/route.ts` (magic-link callback)
- `src/middleware.ts` (cookie-presence gate on `/admin`, `/dashboard`)
- `mmpm-compute/src/api/auth/routes.ts` (`request-link`, `verify`, `me`, `logout`)
- `mmpm-compute/src/api/auth/oauth-routes.ts` (new — bridge + identities endpoints)
- `mmpm-compute/src/services/oauth-service.ts` (new)
- `mmpm-compute/src/services/auth-service.ts`
- `mmpm-compute/src/middleware/session-auth.ts`
- `mmpm-compute/src/middleware/bridge-auth.ts` (new)
- `mmpm-compute/src/middleware/recent-auth.ts` (new)
- Migrations `073_drop-totp-sudo.sql`, `074_create-account-identities.sql`, `075_auth-sessions-add-last-reauth.sql`
- ADR-002 multi-substrate (account → N substrates)

---

## Context

Today mm-website logs users in with a single method: a magic link emailed via Resend. The website is a thin proxy — it holds a cookie, forwards it as a bearer token, and compute is the source of truth for accounts and sessions.

We want to add **"Sign in with Google"** and **"Sign in with GitHub"**. The design must generalise so adding Microsoft, Apple, or SAML later is a single adapter + one config entry, not a refactor. Security is the top constraint — OAuth login is one of the easiest features to get subtly wrong in ways that become account-takeover vulnerabilities.

### Three grounded discoveries from the code

**1. Compute — not the website — owns accounts and sessions.** The website has no users table and no session table. `request-link` → email → `/auth/callback?token=…` → website calls `GET {COMPUTE_URL}/api/auth/verify?token=…` → compute hashes the token (SHA-256), looks it up in `auth_sessions`, upserts `accounts` if new, returns a 256-bit opaque session token → website sets `mmpm_session` as an `HttpOnly; Secure; SameSite=Lax; Path=/` cookie with 30-day `Max-Age`. Every subsequent request goes through a Next proxy that forwards the cookie as `Authorization: Bearer ${sessionToken}`. **Sessions are opaque, server-validated tokens — not JWTs.** `createSessionMiddleware()` hashes the token, selects from `auth_sessions`, and attaches `{ accountId, sessionId }` to the request. No JWT claims, no user profile embedded.

This is excellent news. It means **the session format is auth-method-agnostic today** — compute does not care *how* a session was born. OAuth can reuse the exact same session primitive.

**2. `accounts.email` is `UNIQUE` and there is no identities table.** Magic link creates an account on first verify via `verifyMagicLink()` (`auth-service.ts`). `accounts` has one row per email. No column records *how* the user signs in. We need one new table — and it is an OAuth-identities table, not a general "auth methods" table. Magic link is not stored there; it is already modelled by `magic_link_tokens` + `accounts.email`.

**3. `mmpm_oauth_provider.ts` in compute is the OAuth *server* for MCP clients.** It authorises third-party tools to call compute's MCP API. It is unrelated to user login (the OAuth *client* role where we call Google/GitHub). We do not touch it. They are different concerns and will share no code.

### Forces at play

- **Pre-launch.** We have no paying users yet. The migration does not need a backwards-compat story for existing data — Phase 0 drops dead tables outright. This is the critical premise that lets the design be clean rather than accreted.
- **Magic link stays.** Keep it as a fallback login method. It is also our "reset a lost OAuth" path.
- **Compute is deployed independently.** Every schema change is a migration + deploy + website deploy. Keep the compute footprint tight.
- **Security ceiling is the weakest link.** OAuth adds an entirely new class of attacks (CSRF on callback, state/nonce replay, unverified-email takeover, open redirect on `returnTo`). Loose implementation is worse than no OAuth.
- **Verified email is mandatory.** Auto-linking OAuth to an existing magic-link account based on an *unverified* provider email is an account-takeover primitive. Google returns `email_verified`. GitHub does not issue an ID token and requires a second call to `/user/emails` to discover the verified primary. Both checks happen at the website AND are re-asserted at compute before any linkage is written.
- **The team writes tests for everything.** Codified in user preferences. Every route added ships with unit, integration, and negative security tests.
- **Pluggable ≠ generic.** A full OIDC framework is overkill for two providers. Hardcoding them will bite when the third arrives. Target: narrow `AuthProvider` interface, two concrete adapters, a registry keyed by slug.
- **SAML is next, not now.** The identity schema has SAML-shaped future-compat baked in so adding it is additive (no CHECK narrowing), but no SAML code ships in this ADR.

### Non-goals

- Becoming a generic OIDC relying party for arbitrary providers.
- Storing Google/GitHub access tokens for later API use.
- SCIM / SAML / enterprise SSO (future ADR — the table schema is compatible with it).
- Replacing magic link.
- Sudo-scoped tokens. The `sudo_sessions` pattern is removed (Phase 0) and replaced with the simpler "recent re-auth" rule (see decision 6).

---

## Decision

Adopt a **single narrow `AuthProvider` interface** on the website, with three concrete adapters (`magic_link`, `google`, `github`), a provider registry keyed by slug, and a new compute-side surface: **two tables (`account_identities`, `account_identity_audit`), one column on `auth_sessions` (`last_reauth_at`), a service (`oauth-service`), and four endpoints (bridge/signin, bridge/link, bridge/unlink, identities)**.

### Seven locked decisions

1. **Interface lives on the website.** The `AuthProvider` interface and the two OAuth adapters live in `src/lib/auth/providers/`. Magic link stays in its current shape for Phase 1; a later pass may wrap it in the same interface for uniformity but that is not required for OAuth to ship. The existing `request-link` / `verify` paths keep working as-is.

2. **Flow: Authorization Code with PKCE (S256) only.** No implicit flow, no client credentials, no ROPC. PKCE verifier is 64 bytes of `crypto.getRandomValues`, base64url-encoded, stored server-side keyed by `state`, **TTL 5 min**, single-use. Applies to both Google and GitHub (GitHub supports PKCE as of 2022).

3. **Identities live on compute in `account_identities`.** Because compute owns `accounts` and `auth_sessions`, the identity mapping belongs there too. The schema (migration 074):

   ```sql
   CREATE TABLE account_identities (
     id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     provider        TEXT NOT NULL,
     provider_sub    TEXT NOT NULL,
     email_at_link   TEXT NOT NULL,                   -- LOWER()'d by app on write
     display_name    TEXT,
     verified_at     TIMESTAMPTZ,                      -- when compute confirmed email_verified
     created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
     last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

     CONSTRAINT account_identities_provider_check
       CHECK (provider ~ '^(google|github|saml:[a-z0-9_-]+)$')
   );

   CREATE UNIQUE INDEX uq_account_identities_provider_sub
     ON account_identities (provider, provider_sub);

   CREATE UNIQUE INDEX uq_account_identities_account_provider
     ON account_identities (account_id, provider);

   CREATE UNIQUE INDEX uq_account_identities_verified_email
     ON account_identities (LOWER(email_at_link))
     WHERE verified_at IS NOT NULL;
   ```

   The three uniqueness invariants enforce the account-linking model at the DB layer:
   - **U1:** `(provider, provider_sub)` — a single external identity belongs to at most one account. A leaked OAuth token cannot be silently reassigned to another account.
   - **U2:** `(account_id, provider)` — an account has at most one identity per provider. Retries cannot accumulate stale Google rows on a single account.
   - **U3:** `LOWER(email_at_link) WHERE verified_at IS NOT NULL` — no two accounts may claim the same *verified* email. This is the defence-in-depth guard against a bug in the auto-link path.

   The CHECK regex accepts `google`, `github`, and `saml:<tenant>` so future SAML is purely additive — no CHECK-narrowing migration required when SAML lands. `magic_link` is deliberately **not** a provider value: magic-link auth is modelled by `accounts.email` + the existing `magic_link_tokens` table.

   An append-only audit table (`account_identity_audit`) records every `link`, `unlink`, `auto_link`, `verify`, and `rejected` event with actor IP/UA, timestamp, and reason. No FK to `accounts` — audit rows survive account deletion.

4. **Four compute endpoints.**

   - `POST /api/v1/auth/oauth/bridge/signin` — server-to-server from the website after a fresh OAuth completion. Body: `{ provider, providerSub, email, emailVerified, displayName? }`. Compute independently refuses if `emailVerified !== true`. Decides: (a) sign-in existing identity, (b) auto-link by verified email, or (c) create a new account. Returns `{ outcome, accountId, identityId }`. The website issues the session in the response path (standard `mmpm_session` cookie).

   - `POST /api/v1/auth/oauth/bridge/link` — server-to-server. Requires the caller's session (bearer forwarded by the website) **and** recent re-auth (see decision 6). Connects a new provider to the currently-signed-in account.

   - `POST /api/v1/auth/oauth/bridge/unlink` — same auth requirements; removes an identity by id.

   - `GET /api/v1/auth/oauth/identities` — session-auth only. Returns the identity list for the settings UI. No bridge signature required (it's read-only, and the session bearer is sufficient).

   All `bridge/*` endpoints additionally require an HMAC-SHA256 signature on every request — see decision 7.

5. **Account linking rule: auto-link by verified email, with server-side recheck.** If the user arrives via OAuth with a verified email that matches *exactly one* existing account, compute auto-links and signs them in. If zero accounts match, compute creates one. If more than one matches (shouldn't happen because `accounts.email` is unique, but the guard is there), compute refuses with `ambiguous_email_match`. **Compute re-checks `emailVerified` itself** — the website's assertion is not enough on its own. An unverified provider response is rejected with `rejected{reason: 'unverified_email'}`.

6. **Recent re-auth gate (replaces sudo).** The old `sudo_sessions` table is dropped (migration 073). In its place, a new column `auth_sessions.last_reauth_at` (migration 075) is stamped at every successful magic-link verify and every successful OAuth sign-in. Sensitive endpoints are gated by a `requireRecentAuth()` middleware that refuses the request with `401 {code: "reauth_required"}` if `now() - last_reauth_at > 5 minutes`. On rejection, the website redirects the user through magic-link or their current OAuth provider, the column is stamped, and the action retries.

   Applies to: `oauth/bridge/link`, `oauth/bridge/unlink`, account deletion, subscription cancellation, API-key rotation. (Account delete + cancel + rotate-keys were the only other `sudo_sessions` actions, so the migration is 1:1.)

7. **Bridge authentication: HMAC-SHA256 over the request, not a shared bearer token.** The compute/website channel is authenticated by two headers the website adds to every bridge call:
   - `X-Compute-Bridge-Timestamp`: unix seconds; rejected if outside ±5 min of compute's clock.
   - `X-Compute-Bridge-Signature`: hex SHA-256 HMAC of `${timestamp}\n${METHOD}\n${path}\n${sha256(rawBody)}`, keyed by a managed-store value shared by both services.

   Using an HMAC over the full request (with timestamp + method + path + body hash) prevents replays, cross-endpoint replay (a valid `/link` signature cannot be replayed against `/unlink`), and body tampering under an otherwise-valid signature. The signing key is injected via env var (`COMPUTE_OAUTH_BRIDGE_SIGNING_KEY`), validated at boot to be ≥32 chars, and never written to logs. Compute's config.ts refuses to start if `AUTH_OAUTH_ENABLED=true` and the key is missing — no silent fallback to "no bridge auth".

8. **`SameSite=Lax` cookies and `state` bound to a pre-flight cookie.** The session cookie stays `HttpOnly; Secure; SameSite=Lax; Path=/`. The OAuth `state` parameter is bound to a short-lived pre-flight cookie set by `POST /api/auth/oauth/:provider/start` — `mmpm_oauth_state` (`HttpOnly; Secure; SameSite=Lax; Max-Age=600`). On `/api/auth/oauth/:provider/callback`, the handler requires both the query `state` and the cookie `state` to match the server-side PKCE store entry. Mismatch → 400 with opaque error. Single-use: delete the server-side entry after one successful exchange.

### Pluggable adapter shape (condensed)

```ts
// src/lib/auth/providers/types.ts
export interface AuthProviderContext {
  returnTo: string;            // validated against allow-list before flow starts
  pkce: { verifier: string; challenge: string };
  state: string;
  nonce: string | null;        // required for OIDC providers, null otherwise
}

export interface OAuthIdentity {
  provider: "google" | "github";
  providerSub: string;
  verifiedEmail: string;       // MUST be verified or the adapter throws
  displayName: string | null;
}

export interface AuthProvider {
  slug: "google" | "github";
  beginLoginRedirect(ctx: AuthProviderContext): URL;
  completeLoginFromCallback(
    params: URLSearchParams,
    ctx: AuthProviderContext
  ): Promise<OAuthIdentity>;
}

export const providers: Record<string, AuthProvider> = {
  google: googleProvider,
  github: githubProvider,
};
```

Adapters are the only place that know provider-specific quirks (Google's `id_token` + JWKS verification vs GitHub's two-call `/user` + `/user/emails` dance). Everything else — route handlers, PKCE store, recent-auth gate, session minting — is provider-agnostic.

---

## Consequences

### Positive

- **Magic link stays.** Existing paying customers (once there are any) see no change. OAuth is purely additive.
- **Compute's session model is unchanged.** `createSessionMiddleware()` still does `raw → SHA-256 → auth_sessions lookup → attach accountId`. The new `last_reauth_at` column is a *read* for the middleware gate, not a change to session identity.
- **Adding a third provider is ~200 lines.** A third adapter file, a third provider config entry, a third registered redirect URI. No new endpoints on compute, no new tables.
- **SAML is a free future upgrade.** The CHECK regex accepts `saml:<tenant>` today. A future SAML adapter writes `provider = 'saml:acme-corp'` and every existing invariant, index, and audit path applies unchanged.
- **Audit story is strong.** `account_identity_audit` records every mutation and every rejected attempt with IP + UA + reason. The website cannot silently rewrite a user's auth methods without being observable server-side.
- **IDOR surface is small.** Three unique indexes, one CHECK constraint, and every service call wrapped in a `FOR UPDATE` transaction.

### Negative / risks accepted

- **The bridge HMAC key is a shared secret.** If it leaks, an attacker who can reach compute on the network can forge bridge calls. Mitigation: stored in a managed store, never logged, rotated on any suspected compromise, and compute binds the bridge endpoints via Traefik middleware to the website's source IP/hostname. Post-launch: consider mTLS (future ADR).
- **Google/GitHub rate limits.** `/user/emails` has a GitHub rate limit (authenticated calls get 5000/hr — fine). Google's JWKS endpoint is cached by `jose`. Not expected to bind.
- **Account linking is auto on first OAuth sign-in.** Manual confirmation blocks the "happy path" 99% of users expect. The safety is: (a) website verifies `email_verified`; (b) compute *re-verifies* `email_verified` itself; (c) U3 partial unique index prevents two accounts from both claiming the same verified email; (d) the auto-link path refuses if the target account already has an identity for this provider.

### Explicitly not done

- Storing Google/GitHub access or refresh tokens.
- Backfilling existing magic-link accounts as rows in `account_identities`. They aren't OAuth identities; they stay represented by `accounts.email` + `magic_link_tokens`.
- CLI / MCP clients signing in via OAuth — different concern, see the existing MCP OAuth server in compute.
- SAML — designed-for but not implemented.

---

## Alternatives considered

### 1. Use Auth.js (NextAuth) and throw away the custom magic link

**Rejected.** Auth.js brings its own session model, cookie names, DB adapter, and expects to own the users table. Our users table is in compute. Wiring Auth.js to treat compute as the authoritative store means writing a custom adapter — the same amount of code as our interface, but now in Auth.js's vocabulary. We would also sign up for its upgrade treadmill. Biggest cost: replaces the working magic-link flow, putting customers on an untested code path on day one.

### 2. Use Lucia

**Rejected.** Lucia v3 was deprecated in 2024 and is no longer maintained. Adopting an unmaintained auth library is a security downgrade by definition.

### 3. Hardcode Google and GitHub routes directly, no interface

**Rejected.** Two provider implementations is exactly the inflection point where an abstraction earns its keep: one is too few to generalise, three is too late. Every provider added without an interface is another copy of PKCE/state/nonce/recent-auth/session-mint code. The interface is ~40 lines.

### 4. Generic OIDC framework keyed on config only

**Rejected.** GitHub is not an OIDC provider — it does not issue ID tokens. A pure OIDC framework cannot model GitHub without an escape hatch. Once you have the escape hatch, you have the adapter pattern.

### 5. Keep `sudo_sessions` as the gate for identity mutations

**Rejected.** The sudo table had two dead endpoints and was about to add a third (OAuth link) with the same "short-lived action token" pattern. The `last_reauth_at` column on `auth_sessions` gives the same guarantee (fresh proof of identity within 5 minutes) without a separate table, separate reaper, separate token-generation code, or the sudo-token-in-body anti-pattern. Dropping `sudo_sessions` in the same PR also removes the TOTP tables, which have been unmounted since 2026-04-09.

### 6. Store identities on the website, not compute

**Rejected.** The website has no database of its own. Adding one for this purpose creates a second source of truth for "which account exists", which will drift. Compute owns accounts. Identities belong next to accounts.

---

## Test plan (summary)

Full test plan in [`OAUTH-PROVIDERS-DESIGN.md`](./OAUTH-PROVIDERS-DESIGN.md#test-plan). Headlines:

- **Unit (website):** PKCE round-trip; state cookie binding; Google ID token verification rejects bad `iss`/`aud`/`exp`/`nonce`/`email_verified=false`; GitHub `/user/emails` parser rejects no-verified-primary; provider registry returns 404 for unknown provider; `returnTo` allow-list rejects `javascript:` / external hosts / protocol-relative URLs.
- **Unit (compute):** HMAC-SHA256 bridge signature verification (happy path, missing, wrong key, replay, body tamper, method swap, path swap); recent-auth middleware (fresh, expired, session expired). See `tests/unit/bridge-auth.test.ts`.
- **Integration (compute):** `oauth-service` against Testcontainers Postgres — every branch of signin/link/unlink/list, plus the CHECK regex U4 rejection path. See `tests/integration/oauth-service.test.ts`.
- **Integration (website + mock provider):** Full round-trip against a fixture OIDC server; callback fails on state mismatch, PKCE verifier mismatch, `email_verified=false`, no verified primary email.
- **E2E:** Existing magic-link user signs in with Google (same verified email) → auto-linked. New user signs in with GitHub → account created. Logged-in user adds GitHub via settings → recent-auth gate fires, fresh magic-link re-auth required, link succeeds.
- **Negative / security:** Replay of captured `code`; stale `state` (>5 min); cross-session callback; unverified-email attack; U1 collision (existing provider_sub on a different account) → 409; bridge call without signature → 401; bridge call after the ±5-min window → 401.

---

## Rollout

Pre-launch — no existing customer data, no rolling-upgrade constraint. The phases are sequenced by cleanliness, not by compatibility.

1. **Phase 0 — drop dead weight.** Migration `073_drop-totp-sudo.sql` removes `account_totp`, `totp_backup_codes`, `totp_pending_sessions`, and `sudo_sessions`. `src/config.ts` demotes `TOTP_ENCRYPTION_KEY` from `required()` to `optional()` so the server boots without it.
2. **Phase 1a — compute schema.** Migration `074_create-account-identities.sql` creates the two identity tables and their uniqueness invariants. Migration `075_auth-sessions-add-last-reauth.sql` adds the recent-auth timestamp column. `init.sql` is synced.
3. **Phase 1b — compute code.** `oauth-service.ts`, `oauth-routes.ts`, `bridge-auth.ts`, `recent-auth.ts`, plus the `AUTH_OAUTH_ENABLED` and `COMPUTE_OAUTH_BRIDGE_SIGNING_KEY` config entries. Unit + integration tests. Deploy to staging with the flag off.
4. **Phase 2 — website adapters.** `AuthProvider` interface, Google + GitHub adapters, PKCE store, new routes under `/api/auth/oauth/*`, sign-in buttons on `/login` behind `NEXT_PUBLIC_OAUTH_ENABLED`. Deploy to staging.
5. **Phase 3 — security review + E2E.** Run the full negative-test suite against staging; sign off the security checklist before flipping the flag.
6. **Phase 4 — production flip.** Enable both flags in prod, monitor `oauth_signin` events for 72h, watch for `unverified_email` rejections and 4xx spikes.

---

## Security go/no-go checklist

Copy into the PR description. All must be checked before merge.

- [ ] PKCE S256 implemented; verifier 64 bytes `crypto.getRandomValues`; single-use; TTL 5 min.
- [ ] `state` 32+ bytes random; bound to `mmpm_oauth_state` cookie; single-use; TTL 5 min (shared store entry with PKCE verifier).
- [ ] `nonce` generated for Google; verified against `id_token.nonce`; mismatch → reject.
- [ ] Google `id_token`: JWKS via `jose.jwtVerify`, `iss`, `aud`, `exp`, `iat`, `nonce`, **`email_verified === true`** all checked.
- [ ] GitHub: `/user/emails` called with the access token; primary-AND-verified row required.
- [ ] Compute **independently re-checks** `emailVerified` in `signinOrLinkByVerifiedClaims`. Website assertion alone does not link.
- [ ] `returnTo` allow-list whitelist-only (`/dashboard`, `/admin`, `/`); reject external hosts, protocol-relative, `javascript:`, `data:`.
- [ ] Session rotation on successful OAuth: new `mmpm_session` cookie issued.
- [ ] Cookies: `HttpOnly; Secure; SameSite=Lax; Path=/`.
- [ ] Recent-auth gate (`requireRecentAuth`) mounted on `/bridge/link`, `/bridge/unlink`, account-deletion, subscription-cancellation, and API-key rotation.
- [ ] Bridge endpoints require `X-Compute-Bridge-Timestamp` + `X-Compute-Bridge-Signature`; HMAC-SHA256; signing key ≥32 chars; boot fails closed if flag on and key missing.
- [ ] No tokens, codes, state, nonce, PKCE verifiers, session tokens, or bridge secrets appear in server logs (grep asserting absence is part of CI).
- [ ] OAuth client IDs and secrets per-environment; redirect URIs exactly registered; no wildcards; no localhost in prod.
- [ ] Rate limit on `/api/auth/oauth/:provider/callback` (reuse existing rate-limit middleware, 100 req / IP / 10 min).
- [ ] All unit, integration, E2E, and negative security tests passing in CI.
- [ ] ADR-003 linked from the PR.

---

## References

- RFC 6749 (OAuth 2.0 Framework)
- RFC 6819 (OAuth 2.0 Threat Model)
- RFC 7636 (PKCE)
- RFC 9700 (OAuth 2.0 Security Best Current Practice — 2025)
- OpenID Connect Core 1.0
- [`OAUTH-PROVIDERS-DESIGN.md`](./OAUTH-PROVIDERS-DESIGN.md) — detailed design, sequence diagrams, endpoint specs, full test plan
- [`AUTH-ADVISOR-REVIEW-2026-04-19.md`](./AUTH-ADVISOR-REVIEW-2026-04-19.md) — advisor review that drove this revision
