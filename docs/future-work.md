# Future Work — Post-Launch

Items identified during the TOTP 2FA sprint (March 2026) that should be tackled after launch.

## API Key Rotation (High Priority)

**Problem:** Customers cannot rotate their API key from the dashboard. The current flow shows the key exactly once at claim time. If a customer loses it, they have no self-service recovery.

**What exists today:**
- `key-service.ts` has a `rotateKey()` with grace period support (database-only)
- `keys.ts` route exposes `POST /api/keys/:keyId/rotate`
- Neither touches the running substrate

**What's needed for full rotation:**
1. SSH into the substrate host and update `CUSTOMER_API_KEY` in the `.env`
2. Restart both containers (`mmpm-service` and `mmpm-mcp`) so they pick up the new key
3. Wait for health check to confirm the substrate is back up
4. Only then return the new key to the customer
5. Old key stays valid during the grace period (already implemented in DB layer)
6. Customer updates their Claude Desktop config with the new key

**Token chain (all 5 must stay in sync):**
- PostgreSQL `substrates.api_key_hash`
- Substrate host `.env` (`CUSTOMER_API_KEY`)
- `mmpm-service` container env
- `mmpm-mcp` container env
- Customer's Claude Desktop config / `~/.mcp-auth/`

**Approach:** Build a `SubstrateKeyRotator` service that orchestrates all 5 locations atomically. If any step fails, roll back to the old key. Wire it to the existing `/api/keys/:keyId/rotate` route. Add a "Rotate API Key" button to the dashboard that replaces the removed "Regenerate" button.

**Risk:** SSH failure mid-rotation could leave the substrate in an inconsistent state. Need a recovery mechanism — possibly a health-check-and-rollback loop.

---

## Re-authentication Gate for Security Settings (Medium Priority)

**Problem:** Anyone with an active session can enable/disable TOTP. If a session is hijacked, the attacker could enrol their own TOTP and lock out the real user.

**What's needed:**
- Before accessing `/admin/security`, require a fresh magic link confirmation
- Send a new magic link, user clicks it, and only then unlock the security controls
- Short-lived "security session" token (5–10 min) scoped to the security page
- Falls back to normal auth if the security session expires

**Approach:** Add a `/auth/security-challenge` flow that issues a scoped token. The security page checks for this token before rendering the TOTP controls.

---

## First-Login Detection for 2FA Nudge (Low Priority)

**Problem:** The 2FA nudge banner on `/admin` shows every time the user visits (until dismissed), not just on first login. Ideally it should be more prominent on first login and quieter on subsequent visits.

**Options:**
- Compute returns a `firstLogin: boolean` flag on `/api/auth/me`
- Track dismissal server-side (account metadata) so it persists across sessions
- Time-based heuristic: show prominent nudge if account created < 1 hour ago

---

## Production Env Cleanup (Low Priority)

**Addressed in this sprint:**
- Added `TOTP_ENCRYPTION_KEY` to `.env.production`
- Added `STRIPE_PRICE_FREE_MONTHLY` to `.env.production`
- Removed `NODE_TLS_REJECT_UNAUTHORIZED=0` from `.env.production`

**Still to do:**
- Update `.env.example` to include `TOTP_ENCRYPTION_KEY` and `STRIPE_PRICE_FREE_MONTHLY` as documented vars
- Audit whether `PGSSLMODE` needs to be set now that global TLS bypass is removed (if DB uses SSL)
- Clean up stale path references in docs (`/srv/mmpm-launch-ops/mmpm-compute` → `/srv/parametric-memory-compute`)

---

## Dashboard Improvements (Low Priority)

- Show API key prefix (first 8 chars) so users can confirm which key they have
- Add "last used" timestamp for the API key
- Show MCP connection status (is the substrate actually reachable right now?)
- Add a "Test Connection" button that pings the substrate health endpoint
