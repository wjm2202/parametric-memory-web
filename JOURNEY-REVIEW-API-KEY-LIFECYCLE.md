# Journey Review — API Key Lifecycle

**Date:** 2026-04-17
**Scope:** provisioning (key generation) → first claim after checkout → paste into Claude Desktop → rotation → 401 recovery
**Status:** Draft — findings to be consolidated into SPRINT-PLAN.md
**Companion docs:** `JOURNEY-REVIEW-SIGNUP-CHECKOUT.md`, `JOURNEY-REVIEW-DASHBOARD-RETURNING.md`, `JOURNEY-REVIEW-BILLING-LIFECYCLE.md`

---

## Executive summary

The MMPM API key (`mmk_live_…`) is the single credential the customer's Claude Desktop presents to their substrate. It must stay in sync across **five locations**: (1) PostgreSQL `substrates` row (hash + prefix), (2) substrate host `.env`, (3) `mmpm-service` container env, (4) `mmpm-mcp` container env, (5) customer's Claude Desktop config. Any divergence causes a 401 loop with no diagnostic path.

**What works well:**
- `generateKey()` uses CSPRNG + SHA-256 hash; raw key never stored long-term after claim.
- Claim endpoint uses an atomic CTE with `FOR UPDATE` — two concurrent claims cannot both return the raw key.
- 7-state rotation state machine (`pending → generating → updating_env → rendering_nginx → restarting → verifying → committing → complete`) with per-job persistence for crash-safe resume.
- Rate limits on rotation: 2 attempts/hour, 3 successful/day.
- Partial unique index on `key_rotation_jobs` prevents two active rotations per substrate.

**Critical gaps:**
1. **Key is one-shot. If the user refreshes before copying, the only recovery is rotation** — and rotation is rate-limited (2 attempts/hour).
2. **Container restart at step 4 is fire-and-forget.** Verification at step 5 hits `/health` but cannot guarantee the new env was loaded — race between "container up" and "container running with new env". DB commits at step 6 regardless.
3. **SSH failure mid-rotation orphans the first generated key.** If `sed` on the host fails, the job is marked failed, `new_key_raw = NULL`, and the next rotation attempt calls `generateKey()` again — the first key is lost.
4. **No `/test-key` endpoint.** After pasting the key into Claude Desktop, the customer has no in-app way to verify connectivity before relying on it.
5. **No reaper for stale `pending_api_key` rows.** Raw key sits in DB indefinitely if the customer never claims.
6. **`key_unclaimed` flag has no timeout.** No urgency signal on the dashboard.
7. **Claim endpoint returns `{ claimed: false }` with 200 — callers cannot distinguish "already claimed" from "never existed".**

---

## 5-location token chain (initial provisioning)

```
generateKey()   src/services/key-generator.ts:27
  │
  raw: "mmk_live_<22+ hex chars>"   hash: SHA-256
  prefix: first 32 chars (safe to display)
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│ 1. PostgreSQL substrates row                            │
│    ├─ api_key_hash       = <sha256>                    │
│    ├─ api_key_prefix     = "mmk_live_..."               │
│    └─ pending_api_key    = raw  (cleared on claim)     │
└─────────────────────────────────────────────────────────┘
  │   SSH to host   src/workers/substrate-provisioner.ts
  ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Substrate host .env                                   │
│    CUSTOMER_API_KEY=mmk_live_...                        │
└─────────────────────────────────────────────────────────┘
  │   docker compose up -d   (customer.yml template)
  ▼
┌─────────────────────────────────────────────────────────┐
│ 3a. mmpm-service container                               │
│     MMPM_API_KEY: ${CUSTOMER_API_KEY}                   │
│ 3b. mmpm-mcp container                                   │
│     MMPM_API_KEY: ${CUSTOMER_API_KEY}                   │
└─────────────────────────────────────────────────────────┘
  │   Customer claims + pastes
  ▼
┌─────────────────────────────────────────────────────────┐
│ 4. ~/.mcp-auth/claude_desktop_config.json                │
│    "AUTH_HEADER": "Bearer mmk_live_..."                 │
└─────────────────────────────────────────────────────────┘
```

Any location out of sync ⇒ 401 on every tool call.

---

## Rotation state machine

```
                      src/key-rotation/state-machine.ts:87 processRotationJob

  pending
    │
    ▼
  generating          generateKey(), stash new_key_raw/new_key_hash/new_key_prefix on job
    │
    ▼
  updating_env        SSH: sed -i 's|^CUSTOMER_API_KEY=.*|...|' <host>:<dir>/.env
    │
    ▼
  rendering_nginx     render nginx.conf with new key, SCP to host
    │
    ▼
  restarting          SSH: docker compose -p mmpm-<slug> up -d --remove-orphans
    │                 (fire-and-forget; Docker returns before containers fully up)
    ▼
  verifying           poll substrate /health; exponential backoff 2–10s, 90s cap
    │                 (WARNING: /health can pass before container has new env)
    ▼
  committing          BEGIN
                        UPDATE substrates SET
                          api_key_hash = new_hash,
                          api_key_prefix = new_prefix,
                          pending_api_key = new_raw   ◄── set for next claim
                        UPDATE key_rotation_jobs SET status='committing', new_key_raw = NULL
                      COMMIT
    │
    ▼
  complete            Customer must now RE-CLAIM to fetch new key, then paste into Claude Desktop

  [any step fails]
    ▼
  failed              status = 'failed', error_message saved, new_key_raw = NULL
                      Customer may retry (subject to rate limit including failed attempts)
```

---

## Step-by-step trace

### 1. Initial claim after checkout

**Website BFF:** `src/app/api/my-substrate/claim-key/route.ts:15–30` — reads `mmpm_session` cookie, forwards to compute `api/v1/my-substrate/claim-key` via `computeProxy`. Also exists on the slug-scoped `src/app/api/substrates/[slug]/claim-key/route.ts` if present (check the directory to confirm — the signup flow appears to use a single-substrate path).

**Dashboard trigger:** `src/app/admin/AdminClient.tsx:553` — renders an amber "Claim Key →" banner when `substrate.keyUnclaimed === true` (derived from `pending_api_key IS NOT NULL` in the compute dashboard BFF response).

**Click handler:** `AdminClient.tsx:267–284` — POST to claim endpoint; on 200 with `claimed: true`, sets `revealedKey = data.apiKey`, `showKeyReveal = true`.

**Compute handler:** `src/api/substrates/routes.ts:596–663` — `createClaimKeyHandler`
- Line 605: `requireSession` guard.
- Line 609: ownership chokepoint (`resolveOwnedSubstrate`); 404 on non-ownership.
- Line 621–640: **atomic CTE**
  ```sql
  WITH locked_row AS (
    SELECT id, slug, api_key_prefix, pending_api_key AS raw_key
    FROM substrates
    WHERE id = $1 AND account_id = $2
      AND status NOT IN ('deprovisioned')
      AND pending_api_key IS NOT NULL
    FOR UPDATE
  ),
  cleared AS (
    UPDATE substrates s SET pending_api_key = NULL, updated_at = now()
    FROM locked_row WHERE s.id = locked_row.id
  )
  SELECT id, slug, api_key_prefix, raw_key FROM locked_row
  ```
- Line 642–650: if `rows.length === 0` → return `{ claimed: false, message: "...already claimed..." }` **with 200**. No HTTP status distinction between "never provisioned", "already claimed", or "substrate deprovisioned".
- Otherwise: return `{ claimed: true, substrateId, slug, apiKeyPrefix, apiKey, warning: "Save this now. It cannot be retrieved again." }`.

**UI reveal:** `AdminClient.tsx:572–591` — emerald/green block, copy button, warning copy, then inline mcpConfig block at lines 595–655.

### 2. Paste into Claude Desktop

**Where shown:**
- Signup flow: `src/app/signup/SignupClient.tsx` renders the mcpConfig inline once after signup (see signup review).
- Admin flow: `AdminClient.tsx:595–655` renders the same config block after claim succeeds.

**Config shape:**
```json
{
  "mcpServers": {
    "Memory-mcp": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${endpoint}", "--header", "Authorization:${AUTH_HEADER}"],
      "env": { "AUTH_HEADER": "Bearer mmk_live_..." }
    }
  }
}
```

**HTTP flow on first request:**
1. Claude Desktop → `https://<slug>.mmpm.co.nz/mcp` with `Authorization: Bearer mmk_live_...`
2. Traefik terminates TLS, proxies to the substrate host.
3. nginx on the substrate validates `CUSTOMER_API_KEY` env var against the Bearer.
4. nginx proxies to `mmpm-service:3000` (internal) with the Bearer header.
5. `mmpm-service` validates against `MMPM_API_KEY` env var.
6. If match: success. Else: 401 (no downstream diagnostic).

**Customer responsibilities:**
- Paste config, restart Claude Desktop.
- On rotation: re-claim, re-paste, re-restart Claude Desktop, clear `~/.mcp-auth/` cache.

### 3. Key rotation

**Website UI:** `AdminClient.tsx:727–731` — "Rotate Key" button; sets `keyRotating = true`; POSTs to `/api/substrates/:slug/rotate-key` (BFF proxy).

**Compute endpoint:** `src/api/substrates/routes.ts:491–543` — `createRotateKeyHandler`
- Line 498: ownership chokepoint.
- Line 513: `createRotationJob` (see below).
- Line 514: return `202 Accepted` with `{ jobId, status: 'pending' }`.

**Job creation:** `src/key-rotation/jobs.ts:132–224` — `createRotationJob`
- BEGIN transaction; `FOR UPDATE` on substrate row.
- Line 158: substrate status must be `running` or `read_only`.
- Line 168–180: no other in-progress rotation for this substrate.
- Line 182: **rate limits**
  - Hourly: max 2 attempts (failed + non-failed) — `jobs.ts:39–69`.
  - Daily: max 3 successful.
- INSERT `key_rotation_jobs(status='pending')`.

**Website polling:** `AdminClient.tsx:196–219` — every 2 s, `GET /api/substrates/:slug/key-rotation/status`. Renders a stepper.

**Worker loop:** `src/key-rotation/state-machine.ts:87–263` — `processRotationJob`
- Crash-safe resume: re-entering `processRotationJob` inspects persisted state and resumes at the right step, as long as status is not `failed/complete`.
- Step 1 `generating` (line 123–144): call `generateKey('live')`; stash `new_key_raw/hash/prefix` on the job row.
- Step 2 `updating_env` (line 156–162): `sshExec`: `sed -i 's|^CUSTOMER_API_KEY=.*|...|' <dataroot>/<slug>/.env`.
- Step 3 `rendering_nginx` (line 164–169): render nginx.conf, `scpWrite` to host.
- Step 4 `restarting` (line 171–179): `docker compose -p mmpm-<slug> up -d --remove-orphans`. **Fire-and-forget** — `docker compose up -d` returns when it's *issued* the commands, not when containers are healthy with new env.
- Step 5 `verifying` (line 181–203): poll `/health` endpoint, exponential backoff 2–10 s, 90 s cap. `/health` returning 200 does NOT prove the new env is loaded.
- Step 6 `committing` (line 208–249): open tx; UPDATE `substrates` with new hash+prefix, set `pending_api_key = new_raw`; UPDATE job `status='committing', new_key_raw = NULL`; COMMIT.
- Step 7 `complete`.

**Post-rotation UI:** `AdminClient.tsx:204–210` — when stepper hits `complete`, `fetchSubstrate()` refreshes; `keyUnclaimed` flips true again; claim banner reappears.

### 4. 401 debugging (current state: dead end)

There is **no dedicated diagnostic path**.

- No `/api/v1/substrates/:slug/test-key` endpoint.
- No "test connection" button on admin page.
- Dashboard exposes `keyUnclaimed` but not "key mismatch".
- nginx errors log to `/var/log/nginx/error.log` on the substrate host (customer has no access).
- `mmpm-service` logs go to `docker logs mmpm-<slug>-mmpm-service-1` (customer has no access on shared tier).

Customer recourse:
- Rotate again (→ rate limit after 2 failures/hour).
- Contact support.
- On dedicated tier only: SSH into the host to inspect.

---

## UX findings

### High

**UX-K1: Key shown only once; no resend path.** `AdminClient.tsx:553–591`. If the customer refreshes before copying, the only path forward is rotation, which is rate-limited (2 attempts/hour). A lost key can effectively lock the customer out for an hour or more.
**Fix:** retain `pending_api_key` until explicit acknowledgement ("I've saved my key"), OR add a "resend claim email" path (one-time link mailed to account address), OR accept that rotation is the recovery and waive the rate limit on the first rotation after a failed claim.

**UX-K2: No "Test my connection" button.** After pasting into Claude Desktop, the customer has no way to verify connectivity before relying on it. First failure happens inside a tool call and returns an opaque "Connection failed" in Claude Desktop's UI.
**Fix:** add `POST /api/v1/substrates/:slug/test-key` that issues a `/health` call from compute's perspective using the stored hash (prove the mmpm-service container can be reached and that the key validates). Surface as a "Test connection" button on the admin page.

**UX-K3: No 401 recovery guidance.** Dashboard has no banner, notification, or help when Claude Desktop is hitting 401. Customer has to diagnose entirely outside the product.
**Fix:** if compute-side telemetry ever sees a 401 with a valid prefix but wrong key, surface a dashboard alert "Your Claude Desktop key may be out of date — re-claim and re-paste".

**UX-K4: Container-restart race between rotation and claim.** Between step 4 (docker up) and step 6 (commit), containers are in an indeterminate state re: which key they're running. If the customer claims and pastes during this window, Claude Desktop's first call may hit the old key and fail silently. No UI signal that "your new key is not live yet — wait 30 s".
**Fix:** add a cooldown banner on the admin page: "Key rotated. Your new key will be active within 30 s — don't paste into Claude Desktop until the stepper reaches Complete."

### Medium

**UX-K5: No claim-key urgency signal.** `AdminClient.tsx:553` shows a calm amber banner. No "this key expires if unclaimed" copy, no TTL, no re-ordering to the top of the dashboard.
**Fix:** add an "Expires in N hours" (see L-K5 for the server-side reaper), bump urgency visually.

**UX-K6: No place to re-read endpoint/slug after dismissing the reveal.** The endpoint is in a card on the admin page but not prominently repeated.
**Fix:** sticky reference card at the top of /admin with endpoint, slug, API-key-prefix, and a "regenerate mcpConfig" button.

**UX-K7: Double-claim race returns `{ claimed: false }` silently.** Two tabs, both click claim. One wins, the other gets `{ claimed: false }`. AdminClient's click handler treats it as an error.
**Fix:** detect the "already claimed in another tab" case; prompt "The key was claimed in another tab — check there or rotate to get a new one."

**UX-K8: Rotation stepper error messages are sanitised but not actionable.** If `verifying` fails, the stepper shows the sanitised message but doesn't explain what to do ("try again later", "contact support").

### Low

**UX-K9: No visual confirmation after paste.** After the customer pastes into Claude Desktop and restarts, no feedback loop on the website. Claude Desktop failing silently with 401 gives a poor "nothing happened" feel.
**Fix:** combine with UX-K2.

**UX-K10: Rotation button has no guard.** Button is clickable during an in-progress rotation until `keyRotating` flips. Double-click can race.
**Fix:** disable during any active rotation polling.

---

## Logic findings

### High

**L-K1: Claim endpoint returns 200 for both success and "already claimed".** `routes.ts:642–650` — response shape `{ claimed: false, message: "..." }`. Clients cannot reliably distinguish error conditions from the status code. Any 200 consumer has to parse the body.
**Fix:** return 404 for non-existent, 409 for already claimed, 200 only for the one-shot success. (Preserves idempotency — 409 is idempotent.)

**L-K2: Container restart is fire-and-forget; verification cannot guarantee new env is loaded.** `state-machine.ts:171–203`. `docker compose up -d` returns once the compose command is issued. `/health` may return 200 on the *old* container before it terminates, or on the new container before env reload completes. Committing the new hash at step 6 is a race.
**Impact:** customer claims new key, updates Claude Desktop, hits 401 because the containers are still running the old key. This is the most likely failure mode in production.
**Fix:** step 5 should explicitly `docker inspect` the running containers for the new env value, OR make an authenticated request to the substrate using the new key and fail unless it succeeds. If the auth fails, roll back.

**L-K3: SSH failure at step 2 orphans the first generated key.** `state-machine.ts:156–162`. `sshExec` throws during `sed`. `markFailed` sets `new_key_raw = NULL`. Next rotation attempt calls `generateKey()` again — a *second* new key. The *first* key's hash was never written to DB, its raw is gone. No chain of custody.
**Impact:** repeated SSH failures on a flaky network create multiple dead keys; logs may reference them but nothing can recover them.
**Fix:** persist the new key BEFORE attempting SSH so a retry can reuse the same key. Or: a retry path that reuses the current job's `new_key_raw` if non-NULL.

**L-K4: No global dedupe on rotation → customer pays for failed rotations with rate limit.** `jobs.ts:43–69` counts all attempts (failed + non-failed) against the hourly cap. Two genuine network failures and the customer is locked out for an hour even though they've never had a successful rotation.
**Fix:** failed rotations inside the last 5 minutes should not burn the retry budget (treat as "transient"); or at minimum, don't count "network/SSH" failures against the budget.

**L-K5: No reaper for unclaimed `pending_api_key`.** Customer provisions, then disappears for 6 months. `pending_api_key` is raw in DB. No TTL column, no scheduled job.
**Impact:** long-term secret storage; if DB is breached, all unclaimed raw keys are exposed.
**Fix:** add `pending_api_key_created_at`; scheduled job NULLs the column after, say, 7 days unclaimed; surface to the customer "your claim link has expired — rotate to generate a new key".

**L-K6: Dedicated-tier cloud-init doesn't bake the key; SSH writes it after.** `src/workers/cloud-init-substrate.ts:1–93`. Between droplet boot and successful SSH, the host has no `CUSTOMER_API_KEY` env. If provisioning aborts there, a droplet is left running with no MMPM state and no cleanup trigger.
**Fix:** bake a placeholder into cloud-init; provisioner either replaces it via SSH (current path) or includes a self-timeout that destroys the droplet if no API-key update arrives within N minutes.

### Medium

**L-K7: Atomic CTE is correct but hard to audit.** `routes.ts:621–640` — the three-CTE pattern (`locked_row`, `cleared`, `SELECT`) works because `locked_row` takes `FOR UPDATE` and `cleared`'s UPDATE executes within the same statement. Reviewers should be able to verify this without re-reading CTE docs.
**Fix:** either leave a comment explaining the ordering, or refactor to `BEGIN; SELECT ... FOR UPDATE; UPDATE ...; COMMIT;` for clarity.

**L-K8: Verifying step has no retry path for transient health-endpoint flakiness.** `state-machine.ts:188–203`. 90 s total timeout; if substrate is oscillating (memory pressure, GC), verification fails and the job is marked failed. No "retry after 5 minutes" logic.
**Fix:** on transient failure at step 5, re-enqueue the job for later retry rather than marking failed.

**L-K9: `key_unclaimed` is computed as `pending_api_key IS NOT NULL`.** No explicit state column; flag flips whenever the column is set/cleared. Fine for display but means we can't distinguish "newly claimed, customer hasn't pasted yet" from "claimed long ago, container synced".
**Fix:** optional — add an observability-side flag for "last confirmed connected" based on a successful authenticated request.

**L-K10: `sed` match pattern is fragile.** If the host `.env` gets reformatted (whitespace, inline comments, reordering), `sed -i 's|^CUSTOMER_API_KEY=.*|...|'` becomes a silent no-op. Containers restart with the old key; rotation appears to succeed; DB has new hash; 5-location sync is broken with no detection.
**Fix:** after sed, `grep ^CUSTOMER_API_KEY= <file>` and assert the new value is present; fail the rotation if not.

### Low

**L-K11: Rotation endpoint returns `202 Accepted` but client polls.** No ETag/`Last-Modified` or `Retry-After`. Clients that crash mid-poll restart polling; no backoff guidance.
**Fix:** include `Retry-After` on the status endpoint.

**L-K12: `claim-key` legacy path at `/api/v1/my-substrate/claim-key`.** Still mounted (see `src/api/my-substrate/claim-key/...`). Slightly different error wording than the substrate-scoped path. Swagger may not document both.
**Fix:** deprecate legacy path; document both in OpenAPI until removed.

**L-K13: Partial unique index on `key_rotation_jobs` is load-bearing and un-commented.** `CREATE UNIQUE INDEX ... WHERE status NOT IN ('complete', 'failed')`. If this index is ever dropped, two worker instances can both advance a job.
**Fix:** add a DB-level test that asserts the index exists; comment in the migration file.

---

## 5-location sync audit — concrete failure modes

| # | Scenario | Where it fails | Symptom | Fix |
|---|---|---|---|---|
| F1 | SSH `sed` succeeds but docker restart doesn't actually restart containers (cache hit, compose no-op) | step 4 returns success; containers still running old env | Claim new key → paste → 401 | Step 5 must assert new env is loaded inside the container (`docker inspect`, or authenticated probe). |
| F2 | Host `.env` format changed; `sed` matches nothing | step 2 silent no-op | Same as F1 | `grep` after sed; fail if not present. |
| F3 | Docker restart begins but container crashloops (OOM, corrupted data) | step 5 /health returns 200 briefly (old container); or fails | Rotation marked failed; old key still works | Current behaviour is correct (rollback), but UX is opaque. |
| F4 | SSH to host unreachable entirely | step 2 throws | Job failed; key lost; retry generates 2nd new key | Persist key before SSH (L-K3). |
| F5 | Health check passes but mmpm-service process is about to crash | verification passes, commit runs | Customer claims, pastes, first real request fails | Explicit authenticated probe at step 5. |
| F6 | Claim succeeds but browser crashes before copy | key revealed once; customer has neither old nor new | Customer locked out; rotate → consumes budget | Retain key in DB until explicit "I saved it" acknowledgement; one-shot still holds for mcpConfig contents. |
| F7 | Cloud-init for dedicated tier fails before SSH | droplet orphaned with no `.env` | Customer sees provision_failed; ops pays for droplet | Self-timeout in cloud-init; reaper for provision_failed droplets. |
| F8 | Two tabs race to claim | One wins, other gets `{claimed:false}` | Second tab shows error | Return 409 + "already claimed" copy (L-K1). |
| F9 | Worker crashes mid-commit | tx rolls back; job stuck in `committing` | Next worker pass sees committing; re-enters tx | Current behaviour is crash-safe; test it. |
| F10 | Partial unique index dropped (ops accident) | Two workers race | Duplicate job rows; weird states | Assert index in health check; comment in migration. |

---

## Missing tests

### Integration

1. **5-location sync on rotation (the critical one).** Provision a substrate, rotate, then:
   - Query DB: assert `api_key_hash = sha256(new_raw)` and `api_key_prefix = new_raw.slice(0,32)`.
   - SSH into host, `cat .env` → assert `CUSTOMER_API_KEY=new_raw`.
   - `docker exec` both containers → assert `MMPM_API_KEY=new_raw`.
   - Authenticate a request to the substrate with new_raw → expect 200.
   - Authenticate a request with old_raw → expect 401.

2. **Claim-key concurrency.** Two simultaneous POSTs; exactly one gets `claimed: true`, the other gets `claimed: false`.

3. **Rotation step failures.** Mock SSH throw at each step 2/3/4 independently; assert `status=failed`, `new_key_raw=NULL`, substrate hash unchanged.

4. **Verification step timeout.** Mock /health hung; assert timeout at 90 s, `status=failed`.

5. **Rate limit enforcement.** Create 2 failed rotations in an hour, assert 3rd is rejected with 429.

6. **Partial unique index enforcement.** Insert two rotation jobs for the same substrate (non-terminal status), assert 23505.

7. **Cloud-init security.** For dedicated tier, assert cloud-init output contains no plaintext API key.

8. **Sed-no-op detection.** Mutate the host `.env` to remove the `CUSTOMER_API_KEY` line, attempt rotation; assert failure is detected.

### e2e (Playwright)

9. **Claim flow.** Existing `logged-in-key-rotation.spec.ts` covers rotation; extend with: provision, check banner, click claim, verify key appears, click copy, refresh, verify banner is gone.

10. **Rotation stepper.** Assert stepper progresses through all states; assert error message on failed path; assert banner reappears when status=complete.

11. **Double-claim UX.** Open two tabs, click claim simultaneously, assert the losing tab shows a friendly message.

12. **Rotation cool-down window.** After rotation completes, verify there's a "don't paste yet" notice (fixes UX-K4).

---

## Reference file list

### Compute
- `src/services/key-generator.ts`
- `src/api/substrates/routes.ts` — `createClaimKeyHandler` (596–663), `createRotateKeyHandler` (491–543)
- `src/key-rotation/jobs.ts` — `createRotationJob`, `getRotationStatus`, `checkRateLimits`
- `src/key-rotation/state-machine.ts` — 7-step lifecycle
- `src/workers/substrate-provisioner.ts` — initial provisioning path
- `src/workers/cloud-init-substrate.ts` — dedicated tier bootstrap
- `integrations/saas/docker-compose.customer.yml` — container env mapping
- `src/api/docs/features/substrates.ts` — Swagger for claim + rotate
- `tests/integration/key-rotation.test.ts`, `tests/integration/key-api.test.ts`
- `tests/e2e/journeys/logged-in-key-rotation.spec.ts`

### Website
- `src/app/api/my-substrate/claim-key/route.ts`
- `src/app/admin/AdminClient.tsx` — banner (553–569), claim handler (267–284), reveal (572–591), config block (595–655), rotation stepper + button (713–735)
- `src/app/signup/SignupClient.tsx` — initial reveal on signup

### Migrations
- `027_substrate-provisioning.sql` — api_key_hash column
- `042_substrates_add_api_key_reveal.sql` — pending_api_key, api_key_prefix
- Key-rotation jobs table — find CREATE TABLE in migrations for exact file

---

## Pre-launch critical items (key lifecycle)

1. **L-K2 / F1 / F5: make step 5 verification prove new env is loaded**, not just that `/health` returns 200. Authenticated probe is the right primitive.
2. **L-K3 / F4: persist new key on the job row before SSH**; retries reuse the same key.
3. **UX-K2: add `/test-key` endpoint + admin button** so customers can verify without guessing.
4. **UX-K1: tighten the claim UX** — require explicit acknowledgement before `pending_api_key` is cleared, OR waive the rotation rate limit for one rotation after a failed claim.
5. **L-K5: reaper for unclaimed `pending_api_key`** (7-day TTL + dashboard urgency).
6. **L-K1: return 404/409 properly** on claim-key; stop returning 200 for failure.
7. **L-K10: grep-validate the sed result** after step 2 to detect silent no-ops.
8. **Tests 1–8 above** are required before rotation can be trusted in production.
