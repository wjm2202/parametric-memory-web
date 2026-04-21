# OAuth Rollout Runbook — Phases 0 and 1

**Scope:** the exact commands to run, in order, to land the compute-side
half of ADR-003 (OAuth, revised 2026-04-19) on both your local dev DB and
production. Everything below is human-operated — Claude does not touch
git, `.env`, `psql`, or deletion. Treat this document as the checklist
for your first pass.

**What this landed:**
- Migration 073: drops dead TOTP + sudo tables.
- Migration 074: creates `account_identities` + audit.
- Migration 075: adds `auth_sessions.last_reauth_at`.
- `src/config.ts`: `TOTP_ENCRYPTION_KEY` demoted to `optional()`; adds
  `AUTH_OAUTH_ENABLED` + `COMPUTE_OAUTH_BRIDGE_SIGNING_KEY`.
- New service: `src/services/oauth-service.ts`.
- New middleware: `src/middleware/bridge-auth.ts`, `src/middleware/recent-auth.ts`.
- New routes: `src/api/auth/oauth-routes.ts`.
- Tests: `tests/integration/oauth-service.test.ts`, `tests/unit/bridge-auth.test.ts`.
- `init.sql` synced.
- `tests/integration/test-pool.ts` updated to truncate the new tables.
- ADR-003 rewritten in place.

The website-side adapters (PKCE, Google/GitHub providers, sign-in buttons)
are *not* in this pass — they are Phase 2. What's here is the compute
foundation they will call.

---

## Pre-flight: one-time setup

All commands assume you are in the `parametric-memory-compute` repo root
on your Mac (`/Users/.../parametric-memory-compute`). None of these
touch the database; they just verify what's on disk.

### 1. Review the diff

**Why:** sanity-check that the files you expect are staged.
**Where:** compute repo root, local.
**Safe:** read-only.

```bash
git status
git diff --stat
```

You should see, roughly:
- `migrations/073_drop-totp-sudo.sql` (new)
- `migrations/074_create-account-identities.sql` (new)
- `migrations/075_auth-sessions-add-last-reauth.sql` (new)
- `src/config.ts` (modified)
- `src/services/oauth-service.ts` (new)
- `src/middleware/bridge-auth.ts` (new)
- `src/middleware/recent-auth.ts` (new)
- `src/api/auth/oauth-routes.ts` (new)
- `tests/integration/oauth-service.test.ts` (new)
- `tests/unit/bridge-auth.test.ts` (new)
- `init.sql` (modified)
- `tests/integration/test-pool.ts` (modified)

### 2. Check migration numbering

**Why:** no gaps, no duplicates.
**Where:** compute repo root, local.
**Safe:** read-only.

```bash
ls migrations/*.sql | tail -8
```

You should see 068–072 followed cleanly by 073, 074, 075. If there is
already a 073 or higher from another branch, stop and rebase; do NOT
renumber without reviewing both diffs.

---

## Phase A — Local verification

The goal here is to prove both migrations apply cleanly AND the new tests
pass against a real Postgres on your machine, before you touch anything
remote.

### A1. Start the local Docker Postgres

**Why:** the compute repo's npm db scripts target the local Docker DB;
this is the DB the app talks to on `NODE_ENV=development`.
**Where:** compute repo root, local.
**Safe:** starts a container; no production impact.

```bash
docker compose up -d postgres
```

Verify it's healthy:

```bash
docker compose ps postgres
```

### A2. Run the migrations

**Why:** applies 073, 074, 075 to the local DB.
**Where:** compute repo root, local.
**Safe:** local DB only. **Use `npm`, not `pnpm`** (see project
CLAUDE.md — pnpm's shim causes node-pg-migrate to silently run DOWN
immediately after UP).

```bash
npm run db:migrate
```

Expected output ends with three "migrating" lines and "Migrations complete".
If it stops earlier, the most common cause is a schema drift from a
previous branch — nuke and reseed with:

```bash
# Only if the migrations fail mid-run — otherwise skip.
docker compose down -v   # drops the volume; you lose local DB data
docker compose up -d postgres
npm run db:migrate
```

### A3. Run the new tests

**Why:** proves the service enforces every invariant from ADR-003 §3 and
the bridge-auth middleware actually refuses replays / body tampering /
skew. `tests/unit/bridge-auth.test.ts` has no DB dependency;
`tests/integration/oauth-service.test.ts` uses Testcontainers Postgres.
**Where:** compute repo root, local.
**Safe:** reads + writes a fresh per-worker test DB; doesn't touch the
Docker compose DB.

```bash
npx vitest run tests/unit/bridge-auth.test.ts tests/integration/oauth-service.test.ts
```

You should see every test pass. Particularly important ones:
- "rejects replay of a /link signature against /unlink"
- "rejects body tampering under an otherwise-valid signature"
- "refuses to link an identity already owned by a different account"
- "accepts google, github, and saml:tenant, rejects anything else"

If any of these fail: stop. Do not deploy. They are the reason this
design is safe.

### A4. Run the full existing test suite

**Why:** proves the migration changes didn't break a neighbour — for
example, `schema.test.ts` checks `init.sql` is loadable, and
`session-write-throttle.test.ts` exercises `auth_sessions`.
**Where:** compute repo root, local.
**Safe:** read/write against per-worker test DBs.

```bash
npx vitest run
```

### A5. Boot the server locally to prove config works

**Why:** confirms `src/config.ts` changes didn't accidentally require a
missing env var.
**Where:** compute repo root, local.
**Safe:** starts a dev server on `$PORT` (default 3100).

```bash
npm run dev
```

Watch the logs:
- You should see no warning about `TOTP_ENCRYPTION_KEY` — it's now
  optional, and its absence from `.env.local` is silent by design.
- You should *not* see "AUTH_OAUTH_ENABLED requires
  COMPUTE_OAUTH_BRIDGE_SIGNING_KEY" — because the flag defaults to false.

Ctrl-C to stop.

### A6. Smoke-test the boot-time guard

**Why:** prove that turning the OAuth flag on without the signing key
actually refuses to start. This is the single most important safety
property of the config change.
**Where:** compute repo root, local. **You need to add a line to
`.env.local` yourself** — Claude cannot touch `.env` files per the
Ground Rules.

Add to `.env.local`:

```
AUTH_OAUTH_ENABLED=true
# Leave COMPUTE_OAUTH_BRIDGE_SIGNING_KEY unset.
```

Run:

```bash
npm run dev
```

Expected: the server fails to start with
`AUTH_OAUTH_ENABLED=true requires COMPUTE_OAUTH_BRIDGE_SIGNING_KEY to be
set to at least 32 characters`. If it boots silently, something is wrong
— stop and check the bottom of `src/config.ts`.

Once verified, **remove `AUTH_OAUTH_ENABLED=true`** from `.env.local`
(or set it to `false`). You don't want to ship the Phase 2 flag flipped
on locally yet.

---

## Phase B — Staging deploy

Nothing in this runbook changes staging behaviour from a user's
perspective (routes are 404 while the flag is off). It just gets the
schema and code into place so Phase 2 can wire up the website.

### B1. Commit and push

**Why:** get the diff onto your branch and open a PR.
**Where:** compute repo root, local. **Human-only** — Claude does not
run git commands that mutate history or the remote.

Suggested commit message (you're the one who'll actually run this):

```
feat(auth): Phase 0+1 of ADR-003 — drop TOTP/sudo, add OAuth identities

- migrations/073: drop dead account_totp, totp_backup_codes,
  totp_pending_sessions, and sudo_sessions tables
- migrations/074: create account_identities + account_identity_audit
  with U1-U4 invariants (unique (provider, sub); unique
  (account, provider); unique verified-email; CHECK regex for SAML
  future-compat)
- migrations/075: add auth_sessions.last_reauth_at for the recent-auth
  gate that replaces sudo_sessions
- config: demote TOTP_ENCRYPTION_KEY from required() to optional();
  add AUTH_OAUTH_ENABLED and COMPUTE_OAUTH_BRIDGE_SIGNING_KEY with
  boot-time guard
- service: src/services/oauth-service.ts (signinOrLinkByVerifiedClaims,
  linkIdentityToAccount, unlinkIdentity, listIdentities, with full
  audit trail on every mutation and rejection)
- middleware: HMAC-SHA256 bridge-auth with method/path/body/timestamp
  binding; requireRecentAuth gate
- routes: /api/v1/auth/oauth/{bridge/signin,bridge/link,bridge/unlink,
  identities} (404 when flag off)
- tests: unit (bridge-auth) + integration (oauth-service)
- init.sql synced
- ADR-003 rewritten in place
```

### B2. Set the staging env vars

**Why:** production only flips `AUTH_OAUTH_ENABLED=true` once Phase 2
ships. For now, staging should keep it `false` too, but you want the
signing key already provisioned so the Phase 2 deploy is a single
variable flip, not a secrets-management scramble.
**Where:** your staging env management UI or secrets store.
**Safe:** only adds a new secret; does not enable the flow.

Generate the signing key on your Mac:

```bash
openssl rand -hex 32
```

Copy the output. In staging env:
- `AUTH_OAUTH_ENABLED=false`
- `COMPUTE_OAUTH_BRIDGE_SIGNING_KEY=<that-hex-value>`

Do NOT commit the key. Do NOT send it to Claude — keep it in your
password manager + the staging env only.

### B3. Deploy and run migrations

**Why:** ship the code and schema to staging. Production uses
`scripts/run-migrations.cjs` which splits the UP/DOWN sections
correctly (pnpm-free path).
**Where:** your staging deploy pipeline.
**Safe:** the three migrations are additive: 073 drops unused tables
(nobody reads them since 2026-04-09); 074 creates new tables; 075 adds
a column with a safe default + backfill. All three have DOWN sections
verified to exactly reverse UP.

Run the pipeline as you would any other compute deploy.

After deploy, confirm the migrations landed. From a host with read-only
Postgres access:

```sql
SELECT name FROM pgmigrations
 WHERE name LIKE '07%'
 ORDER BY name;
```

Expected output includes `073_drop-totp-sudo`,
`074_create-account-identities`, `075_auth-sessions-add-last-reauth`.

### B4. Confirm the routes 404

**Why:** with the flag off, the new routes must not respond. This
verifies the `if (!deps.enabled)` short-circuit in `oauth-routes.ts`.
**Where:** local curl against staging.
**Safe:** read-only.

```bash
curl -i https://staging.parametric-memory.dev/api/v1/auth/oauth/identities \
  -H 'Authorization: Bearer <any-valid-session>'
# Expect: HTTP/2 404
```

```bash
curl -i -X POST https://staging.parametric-memory.dev/api/v1/auth/oauth/bridge/signin \
  -H 'Content-Type: application/json' \
  -d '{}'
# Expect: HTTP/2 404 (the feature-flag branch rejects even pre-auth)
```

If you see anything other than 404, the flag is on by accident — flip
it off immediately and investigate.

---

## Phase C — Production (post Phase 2)

Do NOT run Phase C until the website-side adapters from Phase 2 of
ADR-003 are ready, reviewed, and deployed to staging, AND the full
security-checklist at the bottom of ADR-003 is signed off.

### C1. Provision the production signing key

**Same shape as B2**, but in the production env. Use a *different*
`openssl rand -hex 32` value — never reuse staging keys in production.

### C2. Deploy compute to production

Ship the code with `AUTH_OAUTH_ENABLED=false`. The routes 404 in prod,
just like they do in staging. Run migrations via the same pipeline as
any other deploy.

### C3. Flip the flag

**Why:** enable OAuth for real users.
**Where:** production env, after Phase 2 website deploy is live.
**Safe:** the boot-time guard in `src/config.ts` refuses to start if
the signing key is missing or too short, so a misconfigured flip fails
loud, not silently. If the compute app boots with the flag on, the key
is good.

Set `AUTH_OAUTH_ENABLED=true` in production env and restart the compute
app.

### C4. Post-flip monitoring (72h)

Watch for:

- 401s on `/api/v1/auth/oauth/bridge/*` — most likely a bridge signing
  clock skew or a bad signing-key pairing between website and compute.
- `rejected` rows in `account_identity_audit` with `reason =
  'unverified_email'` — these should be rare; a spike means a provider
  is misbehaving or an attacker is probing.
- `rejected` rows with `reason = 'identity_taken_by_another_account'`
  — these mean a user tried to attach a Google/GitHub to account A
  that's already linked to account B. Expected at low volume (users
  forgetting which account they own a provider on).
- Any 5xx from the OAuth routes — never expected.

A quick audit query, read-only:

```sql
SELECT action, reason, COUNT(*) AS n
  FROM account_identity_audit
 WHERE occurred_at > now() - INTERVAL '1 hour'
 GROUP BY action, reason
 ORDER BY n DESC;
```

---

## Rollback

### Full rollback (everything)

**Why:** something is broken and you want to get back to the
pre-OAuth world.
**Where:** compute prod DB or staging DB.
**Safe:** additive reversal — the DOWN sections of 075, 074, 073
reverse UP precisely. 073's DOWN recreates the TOTP + sudo tables
empty, which is equivalent to "never existed" since no app code reads
them.

```bash
# From the compute host, one step at a time. Each call rolls back ONE migration.
npm run db:rollback   # rolls back 075
npm run db:rollback   # rolls back 074
npm run db:rollback   # rolls back 073
```

After the first `db:rollback`, re-deploy the previous compute build
(before this branch) in parallel so app code and schema agree.

### Flag-only rollback

Just set `AUTH_OAUTH_ENABLED=false` and restart. The routes 404; the
schema and audit table stay. The blast radius is zero.

---

## Troubleshooting

### Server fails to start with "MISSING ENV VARS: [..., 'TOTP_ENCRYPTION_KEY']"

You are on an old compute build whose `_missingEnvVars` list still
contains `TOTP_ENCRYPTION_KEY`. Deploy the new build. (The warning was
never fatal — it's a console error, not a throw — but it should be gone
after this PR.)

### `bridge-auth` middleware 500s with "rawBody capture is required"

The route that failed is missing `express.json({ verify: captureRawBody })`.
All the canonical bridge routes in `oauth-routes.ts` already install it.
If you see this, you added a new bridge route without the raw-body hook —
add it before re-deploying.

### 401 `Bridge timestamp outside skew window`

The website host and the compute host disagree about the current time by
more than 5 minutes. Check NTP on both sides. Increase
`SKEW_TOLERANCE_MS` only as a last resort — it directly widens the
replay window.

### Integration tests fail with "relation account_identities does not exist"

The test DB never ran the new migrations. Run:

```bash
docker compose down -v
docker compose up -d postgres
npm run db:migrate
npx vitest run tests/integration/oauth-service.test.ts
```

### `tests/integration/test-pool.ts` missing a new table after a future migration

The filter in `truncateAll()` now skips missing tables, so stale entries
don't break. But missing entries mean the table isn't cleared between
test files on the same vitest worker. When you add a new table, add it
to `ALL_APP_TABLES` in dependency order (FK children before parents).
