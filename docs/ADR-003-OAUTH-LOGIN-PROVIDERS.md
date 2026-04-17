# ADR-003: Pluggable OAuth Login Providers (Google + GitHub) Alongside Magic Link

**Status:** Proposed
**Date:** 2026-04-14
**Deciders:** Entity One
**Related:**
- `src/app/api/auth/[...path]/route.ts` (current auth proxy)
- `src/app/auth/callback/route.ts` (current magic link callback)
- `src/middleware.ts` (cookie-presence gate on `/admin`, `/dashboard`)
- `mmpm-compute/src/api/auth/routes.ts` (`request-link`, `verify`, `me`, `logout`)
- `mmpm-compute/src/middleware/session-auth.ts` (bearer + `mmpm_session` cookie)
- Migration `022_create-auth-tables.sql` (`magic_link_tokens`, `auth_sessions`)
- Migration `001_create-accounts.sql` (`accounts.email UNIQUE`)
- ADR-002 multi-substrate (account → N substrates model)
**Supersedes:** none

---

## Context

Today mm-website logs users in with a single method: a magic link emailed via Resend. The website is a thin proxy — it holds a cookie, forwards it as a bearer token, and compute is the source of truth for accounts and sessions.

We now want to add **"Sign in with Google"** and **"Sign in with GitHub"**, and we want the design to generalise so adding Microsoft, Apple, or an enterprise SSO later is a single adapter file and a config entry, not a refactor. Security is the top constraint — OAuth login is one of the easiest features to get subtly wrong in ways that become account-takeover vulnerabilities.

### Three grounded discoveries from the code (via three advisor agents)

**1. Compute — not the website — owns accounts and sessions.** The website has no users table and no session table. `request-link` → email → `/auth/callback?token=…` → website calls `GET {COMPUTE_URL}/api/auth/verify?token=…` → compute hashes the token (`SHA-256`), looks it up in `auth_sessions`, upserts `accounts` if new, returns a fresh 256-bit session token → website sets `mmpm_session` as an `HttpOnly; Secure; SameSite=Lax` cookie with 30-day `Max-Age`. Every subsequent request goes through `src/app/api/compute/[...path]/route.ts` or `src/app/api/auth/[...path]/route.ts`, both of which forward the cookie as `Authorization: Bearer ${sessionToken}`. **Sessions are opaque, server-validated tokens — not JWTs.** Compute's `createSessionMiddleware()` hashes the token, selects from `auth_sessions`, and attaches `{ accountId, sessionId }` to the request. No JWT claims, no user profile embedded — just a pointer.

   This is excellent news. It means **the session format is auth-method-agnostic today** — compute does not care *how* a session was born. It only cares that a valid row exists in `auth_sessions`. OAuth can reuse the exact same session primitive.

**2. `accounts.email` is `UNIQUE` and there is no identities table.** Magic link creates an account on first verify via `verifyMagicLink()` (`auth-service.ts:180–189`). `accounts` has one row per email. No column records *how* the user signs in. There is no `account_identities` table. This means: today, account ↔ email is 1:1, and there is no place to record "this Google `sub=117293…` belongs to this account". We need one new table.

**3. `mmpm_oauth_provider.ts` is not what it looks like.** A memory atom referenced an `OAuthProvider` class with in-memory state. After investigation, this is in mmpm-compute and implements the **OAuth 2.1 server** role for MCP clients — it authorises third-party tools to call compute's MCP API. It is unrelated to **user login** (the OAuth *client* role where we call Google/GitHub). We should not touch it. They are different concerns and will share no code.

### Forces at play

- **Magic link must keep working untouched.** Existing users have `mmpm_session` cookies and expect them to keep working. The migration must be purely additive.
- **Compute is deployed independently.** Every schema change to compute is a migration + deploy + website deploy. We want the smallest possible compute footprint.
- **Security ceiling is set by the weakest link.** OAuth adds an entirely new class of attacks (CSRF on callback, state/nonce replay, unverified-email account takeover, open redirect on `returnTo`). A loose implementation here is worse than no OAuth at all.
- **Verified email is mandatory.** The advisor's threat model is unambiguous: auto-linking OAuth to an existing magic-link account based on an unverified provider email is an account-takeover primitive. Google returns `email_verified`; GitHub does not return an ID token at all and requires a second call to `/user/emails` to discover the verified primary.
- **The team writes tests for everything.** This is codified in user preferences. Every route added must ship with unit, integration, and negative security tests.
- **Pluggable ≠ generic.** A full generic OIDC framework is overkill for two providers today. But hardcoding Google and GitHub directly will bite us when the third provider request comes in. The target is a narrow `AuthProvider` interface with two concrete adapters and a registry keyed by string — nothing more.

### Non-goals

- Becoming a generic OIDC relying party for arbitrary providers.
- Storing Google/GitHub access tokens for later API use (no feature requires this today).
- Social features that depend on a GitHub username beyond sign-in.
- SCIM / SAML / enterprise SSO (future ADR).
- Replacing or deprecating magic link.

---

## Decision

Adopt a **single, narrow `AuthProvider` interface** on the website, with three concrete adapters (`magic_link`, `google`, `github`), a provider registry keyed by slug, and **one new compute endpoint + one new compute table** to cleanly separate *"which identity is this"* from *"which account does it belong to"*.

Seven locked decisions:

1. **Interface lives on the website.** The `AuthProvider` interface and the two OAuth adapters live in `src/lib/auth/providers/`. Magic link is refactored into `src/lib/auth/providers/magic-link.ts` **as a second pass** — shipping OAuth must not block on refactoring the existing flow. The existing `request-link` / `verify` paths keep working as-is; the new provider interface wraps them.

2. **Flow: Authorization Code with PKCE (S256) only.** No implicit flow, no client credentials, no resource owner password. PKCE verifier is 64 bytes of `crypto.getRandomValues`, base64url-encoded, stored server-side keyed by `state`, **TTL 5 min** (shared with the `state` entry), single-use. Applies to both Google and GitHub (GitHub supports PKCE as of 2022).

3. **Identities live on compute in a new `account_identities` table.** Because compute owns `accounts` and `auth_sessions`, the identity mapping belongs there too. Schema:

   ```sql
   CREATE TABLE account_identities (
     id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     provider        TEXT NOT NULL CHECK (provider IN ('google','github','magic_link')),
     provider_sub    TEXT NOT NULL,   -- google: id_token.sub; github: user.id (as string)
     email_at_link   TEXT NOT NULL,   -- verified email observed at link time (audit)
     created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
     last_used_at    TIMESTAMPTZ,
     UNIQUE (provider, provider_sub),          -- one identity → one account
     UNIQUE (account_id, provider)             -- one account → one identity per provider
   );
   CREATE INDEX idx_account_identities_account ON account_identities(account_id);
   ```

   The two `UNIQUE` constraints together enforce the account-linking model: you cannot reuse a Google `sub` across accounts, and an account cannot have two Google identities. `magic_link` is included as a `provider` value so a future pass can backfill existing magic-link users and treat every auth source uniformly. Until that backfill happens, `account_identities` only contains OAuth rows.

4. **One new compute endpoint: `POST /api/auth/oauth/complete`.** This is the OAuth analogue of `verify`. Body:

   ```json
   {
     "provider": "google" | "github",
     "provider_sub": "string",
     "verified_email": "string",   // REQUIRED, verified at website
     "display_name": "string | null"
   }
   ```

   It is **authenticated server-to-server** between the website and compute with a shared secret (`COMPUTE_OAUTH_BRIDGE_TOKEN` env var on both sides, sent as `X-Compute-Bridge: <token>`). It is **never** called by a browser. Compute uses it to: (a) look up `account_identities` by `(provider, provider_sub)`; (b) if found, load the account and issue a session; (c) if not found, look up `accounts.email = verified_email`; (d) if an account exists for that email, insert an `account_identities` row linking it; (e) if no account exists, create one (same code path as `verifyMagicLink`'s on-the-fly creation, minus the magic link), insert the identity, provision Stripe customer; (f) always return `{ sessionToken, accountId }`. Compute, not the website, is the transactional boundary for the "find or create account + identity + session" trio.

5. **Account linking rule: auto-link by verified email.** If the user arrives via OAuth with a verified email that already has an account, they are auto-linked and signed in. **No manual confirmation on first sign-in.** The safety for this path is the advisor's mandatory `email_verified` check — which we enforce before calling compute, not inside compute. The *add-a-provider* flow (user is already logged in and visits `/dashboard/auth-methods` to add a provider to an existing account) is a different code path with an **elevated session** requirement — see decision 6.

6. **Elevated ("sudo") session for account-mutation endpoints.** Adding, removing, or swapping an auth method is a sensitive operation. We re-use the existing `sudo_sessions` pattern (already referenced in memory: `token_hash`, `action` enum, 5-min TTL, SHA-256) and introduce three actions: `oauth_link`, `oauth_unlink`, `oauth_swap`. Before hitting `POST /api/auth/oauth/link` on the website, the user must have a valid sudo session for the `oauth_link` action. The sudo session is minted by a fresh magic-link re-auth (or for providers, re-authenticating with the same provider that protects the account). This prevents a stolen `mmpm_session` cookie from being used to silently attach a provider the attacker controls.

7. **`SameSite=Lax` cookies and `state` bound to a pre-flight cookie.** The session cookie stays `HttpOnly; Secure; SameSite=Lax; Path=/`. The OAuth `state` parameter is bound to a short-lived pre-flight cookie set by `POST /api/auth/oauth/:provider/start` — `mmpm_oauth_state` (`HttpOnly; Secure; SameSite=Lax; Max-Age=600`). On `/api/auth/oauth/:provider/callback`, the handler requires both the query `state` and the cookie `state` to match the server-side PKCE store entry. Mismatch → 400 with opaque error. Single-use: delete the server-side entry after one successful exchange. This eliminates CSRF-on-callback, cross-session callback (open in tab A, complete in tab B), and state replay in one move.

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
  slug: "google" | "github" | "magic_link";
  beginLoginRedirect(ctx: AuthProviderContext): URL;
  completeLoginFromCallback(params: URLSearchParams, ctx: AuthProviderContext): Promise<OAuthIdentity>;
}

// Registry
export const providers: Record<string, AuthProvider> = {
  google: googleProvider,
  github: githubProvider,
  // magic_link added in pass 2; not required for initial OAuth ship
};
```

Adapters are the only place that know provider-specific quirks (Google's `id_token` + JWKS verification vs GitHub's two-call `/user` + `/user/emails` dance). Everything else — route handlers, PKCE store, sudo gate, session minting — is provider-agnostic.

---

## Consequences

### Positive

- **Magic link is untouched on day one.** The existing flow keeps working; OAuth is purely additive. Zero risk of regressing paying customers.
- **Compute's session model doesn't change.** `createSessionMiddleware()` still does `raw → SHA-256 → auth_sessions lookup → attach accountId`. Every existing `/api/compute/*` route works for OAuth users the moment they get their first session cookie.
- **Adding Microsoft later is ~200 lines.** A third adapter file, a third provider config entry, a third registered redirect URI. No new endpoints on compute, no new tables, no new route handlers.
- **Audit story is strong.** Every login writes an `account_identities.last_used_at`. The `email_at_link` column preserves the verified email at the moment of linking even if the user later changes it on the provider. Combined with the existing `auth_sessions` row, we can answer "how did this session come into being" for any session.
- **IDOR surface on account linking is small.** `account_identities` has `UNIQUE (provider, provider_sub)` — the same Google `sub` cannot be silently reassigned. `UNIQUE (account_id, provider)` — an account cannot accumulate duplicate identities per provider. Two constraints enforce most of the model.

### Negative / risks accepted

- **The `POST /api/auth/oauth/complete` bridge token is a shared secret.** If it leaks, an attacker who can reach compute over the network can mint sessions for arbitrary emails. Mitigation: it is stored in both services' env, never logged, rotated on any suspected compromise, and compute binds the endpoint to the website's source IP/hostname via Traefik middleware. Post-launch hardening: replace with mTLS (ADR-004 candidate).
- **Google/GitHub rate limits.** `/user/emails` has a GitHub rate limit (60/hr unauthenticated, 5000/hr authenticated — we use authenticated, so fine unless we're hammered). Google's JWKS endpoint is cached by `jose`. Not expected to bind in practice.
- **Account linking is auto on first OAuth sign-in.** This is a deliberate trade-off: manual confirmation blocks the "happy path" where 99% of users expect sign-in to "just work" if the email matches. The safety comes from `email_verified`. Users who want stricter behaviour can explicitly create an OAuth-only account with a fresh email.
- **The `magic_link` provider row is not yet backfilled.** For the first pass, `account_identities` only contains OAuth rows. Existing magic-link users keep working via the old `accounts.email` → `auth_sessions` path. A future ADR will cover the backfill (trivial: one INSERT per account with `provider='magic_link'`, `provider_sub=accounts.id::text`).

### Explicitly not done

- Storing Google/GitHub access or refresh tokens.
- Account deletion cascade for `account_identities` (handled by the existing `ON DELETE CASCADE`).
- CLI / MCP clients signing in via OAuth — different concern, see the existing MCP OAuth server in compute.

---

## Alternatives considered

### 1. Use Auth.js (NextAuth) and throw away the custom magic link

**Why rejected.** Auth.js brings its own session model, its own cookie names, its own DB adapter, and expects to own the users table. Our users table is in compute, not the website's Next.js DB. Wiring Auth.js to treat compute as the authoritative store means building a custom adapter — which is the same amount of code as our interface, but now in Auth.js's vocabulary instead of ours. We would also be signing up for Auth.js's upgrade treadmill for a surface area we don't use. Single biggest cost: Auth.js would replace the working magic-link flow, putting existing paying customers on an untested code path on day one. **Rejected — too much blast radius for too little code savings.**

### 2. Use Lucia

**Why rejected.** Lucia is smaller and more à-la-carte than Auth.js, which is the right shape. But Lucia v3 was deprecated in 2024 and is no longer maintained. Adopting an unmaintained auth library is a security downgrade by definition. **Rejected — maintenance risk.**

### 3. Hardcode Google and GitHub routes directly, no interface

**Why rejected.** Two provider implementations is exactly the inflection point where an abstraction earns its keep: one is too few to generalise, three is too late. Every provider we add without an interface is another copy of PKCE/state/nonce/sudo/session-mint code. The interface is ~40 lines. **Rejected — the abstraction pays for itself at the second provider.**

### 4. Generic OIDC framework keyed on config only

**Why rejected.** GitHub is not an OIDC provider — it does not issue ID tokens. A pure OIDC framework cannot model GitHub without an escape hatch. Once you have the escape hatch, you have the adapter pattern. **Rejected — does not fit the problem.**

### 5. Store identities on the website, not compute

**Why rejected.** The website has no database of its own. Adding one for this purpose creates a second source of truth for "which account exists", which will drift. The compute advisor was explicit: compute owns accounts. Identities belong next to accounts. **Rejected — two databases, two problems.**

---

## Test plan (summary)

Full test plan in [`OAUTH-PROVIDERS-DESIGN.md`](./OAUTH-PROVIDERS-DESIGN.md#test-plan). Headlines:

- **Unit (website):** PKCE verifier/challenge round-trip; state cookie binding; Google ID token verification rejects bad `iss`/`aud`/`exp`/`nonce`/`email_verified=false`; GitHub `/user/emails` response parser rejects no-verified-primary; provider registry returns 404 for unknown provider; `returnTo` open-redirect allow-list rejects `javascript:` / external hosts / protocol-relative URLs.
- **Unit (compute):** `POST /api/auth/oauth/complete` requires the bridge token; upsert-identity happy path; existing-account auto-link; new-account creation with Stripe side-effect; rejects unknown provider; `UNIQUE (provider, provider_sub)` conflict returns 409.
- **Integration (website + mock provider):** Full round-trip against a fixture OIDC server (`oauth2-mock-server` or equivalent) running in Testcontainers; full round-trip against a fixture GitHub API; callback fails on state mismatch; callback fails on PKCE verifier mismatch; callback fails on `email_verified=false` (Google); callback fails on no verified primary email (GitHub).
- **E2E:** Existing magic-link user signs in with Google (same verified email) → lands on `/dashboard`, session works, `account_identities` has a row. New user signs in with GitHub (brand-new email) → account + Stripe customer created, `account_identities` has a row. Logged-in user adds GitHub via `/dashboard/auth-methods` → sudo gate fires, second magic link required, then link succeeds.
- **Negative / security:** Replay of captured `code`; stale `state` (>5 min); cross-session callback (open in browser A, complete in browser B); unverified email attack (mock provider returns `email_verified=false`); attempt to link a provider sub that is already linked to a different account → 409; attempt to hit `POST /api/auth/oauth/complete` from a browser → rejected on missing `X-Compute-Bridge`.
- **Property (optional, high-value):** For any `state`, `nonce`, `pkce_verifier` of correct shape, round-trip through encoding, storage, retrieval, and verification. Drives out subtle bugs in the PKCE store.

---

## Rollout

1. **Pass 1 — compute-side (one migration, one endpoint):** migration `NNN_account_identities.sql`, `POST /api/auth/oauth/complete` route, unit tests, integration tests. Deploy. No behaviour change for users.
2. **Pass 2 — website-side (feature-flagged):** `AuthProvider` interface, Google + GitHub adapters, PKCE store, new routes under `/api/auth/oauth/*`, sign-in buttons on `/login` behind `NEXT_PUBLIC_OAUTH_ENABLED` flag. Deploy to staging.
3. **Pass 3 — security review + E2E:** run the full negative-test suite against staging; have the security checklist signed off before flipping the flag.
4. **Pass 4 — production flip:** enable `NEXT_PUBLIC_OAUTH_ENABLED` in prod, monitor `oauth_signin` log events for 72h, watch for `unverified_email` rejections and 4xx spikes.
5. **Pass 5 (later):** refactor magic link into the `AuthProvider` interface for uniformity; backfill `account_identities` with `provider='magic_link'` rows; retire the ad-hoc `magic_link_tokens` table only after 30 days of successful OAuth traffic.

---

## Security go/no-go checklist

Copy into the PR description. All must be checked before merge.

- [ ] PKCE S256 implemented; verifier 64 bytes `crypto.getRandomValues`; single-use; TTL 5 min.
- [ ] `state` 32+ bytes random; bound to pre-flight `mmpm_oauth_state` cookie; single-use; TTL 5 min (shared store entry with PKCE verifier).
- [ ] `nonce` generated for Google; verified against `id_token.nonce`; mismatch → reject.
- [ ] Google `id_token`: signature via JWKS (`jose.jwtVerify` with remote JWKS), `iss`, `aud`, `exp`, `iat`, `nonce`, **`email_verified === true`** all checked; library is `jose` (actively maintained).
- [ ] GitHub: `/user/emails` called with the access token; primary-AND-verified row required; unverified/no-primary rejected with a clear user-facing error.
- [ ] `returnTo` allow-list whitelist-only (`/dashboard`, `/admin`, `/`); reject external hosts, protocol-relative, `javascript:`, `data:`.
- [ ] Session rotation on successful OAuth: new `mmpm_session` cookie issued, any pre-flight cookies cleared.
- [ ] Cookies: `HttpOnly; Secure; SameSite=Lax; Path=/`. Confirm via response header assertion in tests.
- [ ] Sudo gate (`oauth_link`, `oauth_unlink`, `oauth_swap`) required for `/api/auth/oauth/link` and `/api/auth/oauth/unlink`.
- [ ] `POST /api/auth/oauth/complete` requires `X-Compute-Bridge` shared secret; reject otherwise with 401; bridge secret never logged, separate per environment.
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
