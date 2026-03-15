# MMPM Client Mode — Technical Specification

**Sprint:** V1 (proxy-only) → V4 (server-side)
**Status:** Implementing proxy-only approach
**Date:** 2026-03-14

---

## Problem

The Substrate Viewer (3D Merkle visualisation) needs to query MMPM for atom data, tree structure, Markov weights, and proof paths. It must not modify memory state — no atom writes, no training, no reinforcement from reads. Today, MMPM only has one access level: full master access with all side-effects.

## Phased Approach

### Phase 1 (Now): Proxy-Only Client Mode — No Server Changes

The website API proxy only exposes read-safe endpoints. Write endpoints are simply never proxied. The proxy uses the existing MCP bearer auth to talk to MMPM server-side.

**Why proxy-only first:**
- Zero changes to the memory substrate (safest possible approach)
- Gets the 3D visualisation live immediately
- Side-effect noise from `memory_access`/`memory_search` is negligible on a 57-atom tree with occasional viz queries
- Server-side readOnly mode deferred to Sprint V4 when high-frequency live streaming needs it

### Phase 2 (Sprint V4): Server-Side OAuth2 Scope-Based Client Mode

When real-time streaming drives high-frequency queries, we add proper server-side enforcement via OAuth2 scopes. Full design below, retained for when we need it.

## Phase 1: Proxy-Only Implementation

### Endpoints the proxy exposes (read-safe)

| Proxy Route | MMPM Endpoint | Auth Needed | Side Effects |
|-------------|--------------|-------------|--------------|
| `/api/memory/atoms` | GET /atoms | Yes (bearer) | None |
| `/api/memory/atoms/[atom]` | GET /atoms/:atom | Yes (bearer) | None |
| `/api/memory/search` | POST /search | Yes (bearer) | Minor (access metadata) |
| `/api/memory/access` | POST /access | Yes (bearer) | Minor (timestamps, weight adj) |
| `/api/memory/tree-head` | GET /tree-head | No | None |
| `/api/memory/verify` | POST /verify | No | None |
| `/api/memory/verify-consistency` | POST /verify-consistency | No | None |
| `/api/memory/metrics` | GET /metrics | No | None |
| `/api/memory/health` | GET /health | No | None |
| `/api/memory/weights/[atom]` | GET /weights/:atom | Yes (bearer) | None |

### Endpoints NEVER proxied (write operations)

- `POST /atoms` (atoms_add)
- `POST /train` (train)
- `POST /admin/commit` (commit)
- `POST /checkpoint` (session_checkpoint)
- `GET /atoms/stale` (tombstoning)
- `POST /batch-access` (deferred — not needed for initial viz)
- `POST /memory/bootstrap` (deferred — master only)
- `GET /admin/export` (admin only)
- `GET /admin/audit-log` (admin only)

### Security Model

1. **MMPM bearer held server-side only** — Next.js API routes hold the static bearer. Browser never sees it.
2. **No write exposure** — proxy routes physically cannot reach write endpoints. Not blocked by middleware — simply not implemented.
3. **Rate limiting** — Next.js API routes add rate limiting before proxying (prevents viz from hammering MMPM).
4. **CORS** — proxy routes only accept requests from parametric-memory.dev origin.

### Architecture

```
Browser (3D viz)
    │
    │  fetch('/api/memory/search', { body: query })
    ▼
Next.js API Route (/api/memory/search/route.ts)
    │
    │  Rate limit check
    │  Add Authorization: Bearer <MMPM_BEARER> from env
    │  Forward to MMPM
    ▼
mmpm.co.nz POST /search
    │
    │  Returns results (with minor access metadata side-effect)
    ▼
Next.js returns JSON to browser
```

---

## Phase 2: Server-Side OAuth2 Scopes (Deferred to Sprint V4)

We use **OAuth2 scopes** to distinguish read-only clients from master clients.

### Why scopes (not a separate token type)

The server already has a working OAuth2 provider with `/oauth/register` and `/oauth/token` endpoints. Scopes are the standard OAuth2 mechanism for limiting access. The token itself carries the scope claim, so the middleware can enforce restrictions without additional lookups or configuration files.

### Alternatives considered

| Approach | Verdict |
|----------|---------|
| Separate static bearer token with readOnly env var | Works but bypasses OAuth2 entirely — two auth systems to maintain |
| Client metadata flag on registration | Non-standard; requires introspection endpoint or token enrichment |
| **Proxy-only (no server changes)** | **Chosen for Phase 1** — zero substrate risk, gets viz live fast |
| **OAuth2 scopes** | **Chosen for Phase 2** — proper enforcement when high-frequency queries need it |

---

## Token Format

### Scope definitions

| Scope | Meaning |
|-------|---------|
| `master` | Full access — reads with reinforcement, writes, training, commits (existing behaviour) |
| `read` | Read-only — queries return data but skip all side-effects. Write operations blocked. |

### Client registration

Register a read-only client via the existing `/oauth/register` endpoint:

```json
{
  "client_name": "substrate-viewer",
  "scope": "read"
}
```

Returns `client_id` and `client_secret`. These go into the website's `.env` (server-side only, never exposed to browser).

### Token request

Standard OAuth2 client_credentials flow:

```
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=substrate-viewer-xxxx
&client_secret=xxxx
&scope=read
```

Returns a bearer token with `scope: "read"` in the JWT claims (or in-memory token store, depending on current implementation).

### Token in requests

```
Authorization: Bearer <token>
```

The MCP HTTP handler extracts the token and resolves the scope before routing.

---

## Middleware Design

### Request context

Add a `readOnly: boolean` field to the request context that Fastify decorates on every authenticated request:

```typescript
// In auth middleware / hook
interface RequestContext {
  authenticated: boolean;
  clientId: string;
  scope: 'master' | 'read';
  readOnly: boolean;  // derived: scope === 'read'
}
```

### Enforcement points

Three levels of enforcement, each handled differently:

#### 1. BLOCKED operations (return 403)

These endpoints are completely blocked for `readOnly` clients:

| Endpoint | Reason |
|----------|--------|
| `memory_atoms_add` | Writes new atoms |
| `memory_train` | Reinforces Markov weights |
| `memory_commit` | Flushes pending to Merkle tree |
| `session_checkpoint` | Combines write + train |
| `memory_atoms_stale` | Tombstones atoms (destructive) |

Response for blocked operations:

```json
{
  "error": "forbidden",
  "message": "Read-only client cannot perform write operations",
  "scope": "read",
  "requiredScope": "master"
}
```

#### 2. STRIPPED operations (allow read, skip side-effects)

These endpoints return data but skip internal updates:

| Endpoint | Normal side-effect | Client mode behaviour |
|----------|-------------------|----------------------|
| `memory_access` | Updates access timestamps, triggers Markov weight adjustment | Returns results, skips timestamp + weight updates |
| `memory_search` | May update access metadata | Returns results, skips metadata updates |
| `memory_batch_access` | Same as access, in bulk | Returns results, skips all updates |
| `memory_session_bootstrap` | May record session tracking | Returns atoms + context, skips session tracking |

Implementation: Each handler checks `request.readOnly` and passes a `skipSideEffects: true` flag to the core memory functions.

#### 3. PASSTHROUGH operations (no changes needed)

These are already pure reads with no side-effects:

- `memory_tree_head` — returns Merkle root
- `memory_verify` — returns proof path
- `memory_verify_consistency` — checks tree integrity
- `memory_metrics` — shard/atom/edge counts
- `memory_health` — server health
- `memory_atoms_list` — enumerate atoms
- `memory_atom_get` — get atom value
- `memory_weights_get` — Markov transition weights
- `memory_audit_log` — query history
- `memory_context` — read context
- `memory_pending` — read pending queue

---

## Implementation Plan

### File changes (estimated)

| File | Change | Lines |
|------|--------|-------|
| `mmpm_mcp_http.ts` | Add scope extraction to auth hook, add readOnly to request context | ~20 |
| `mmpm_mcp_http.ts` | Add BLOCK check before write operations (atoms_add, train, commit, checkpoint, stale) | ~15 |
| `memory_access handler` | Check readOnly flag, pass `skipSideEffects` to core | ~5 |
| `memory_search handler` | Check readOnly flag, skip metadata updates | ~5 |
| `memory_batch_access handler` | Check readOnly flag, pass `skipSideEffects` | ~5 |
| `memory_session_bootstrap handler` | Check readOnly flag, skip session tracking | ~5 |
| OAuth provider (if needed) | Ensure scope claim is included in token | ~10 |
| **Total** | | **~65 lines** |

### Key principle: Additive only

No existing code paths change for master tokens. The `readOnly` flag defaults to `false`. All new code is gated behind `if (request.readOnly)` checks. Master mode is unchanged and untested paths don't exist for it.

---

## Auth Flow Diagram

```
┌─────────────────┐     ┌──────────────────────┐
│  Website Server  │     │    MMPM Server        │
│  (Next.js API)   │     │    (mmpm.co.nz)       │
│                  │     │                       │
│  On startup:     │     │                       │
│  POST /oauth/    │────▶│  Validate client      │
│    token         │     │  Return bearer token  │
│  scope=read      │◀────│  with scope="read"    │
│                  │     │                       │
│  Cache token     │     │                       │
│  (server-side)   │     │                       │
│                  │     │                       │
│  Per request:    │     │                       │
│  GET /api/memory │     │                       │
│    /search       │     │                       │
│  (from browser)  │     │                       │
│                  │     │                       │
│  Proxy to MMPM:  │     │                       │
│  Authorization:  │────▶│  Extract token        │
│  Bearer <token>  │     │  Resolve scope="read" │
│                  │     │  Set readOnly=true     │
│                  │     │  Execute search        │
│                  │◀────│  Skip side-effects     │
│                  │     │  Return results        │
│  Return to       │     │                       │
│  browser         │     │                       │
└─────────────────┘     └──────────────────────┘
```

---

## Security Considerations

1. **Client token never reaches browser** — The Next.js API proxy holds the bearer token server-side. The browser only talks to `/api/memory/*` routes on the website.

2. **Scope downgrade impossible** — A `read` scope token cannot be used to request `master` operations. The middleware blocks before the handler runs.

3. **Independent revocation** — Client tokens can be revoked without affecting master (Claude's) access. If the website token leaks, revoke it and issue a new one.

4. **Audit trail** — Client queries are logged with `clientId: "substrate-viewer"` in the audit log, distinguishable from master operations.

5. **Existing security issues to address alongside:**
   - Rate-limit `/oauth/token` endpoint (currently unprotected)
   - Rate-limit `/oauth/register` endpoint (currently open with no cap)
   - Add `client_max_body_size` to nginx for OAuth routes

---

## Testing Strategy

### Unit tests

1. `readOnly` client → `memory_atoms_add` → 403
2. `readOnly` client → `memory_train` → 403
3. `readOnly` client → `memory_commit` → 403
4. `readOnly` client → `session_checkpoint` → 403
5. `readOnly` client → `memory_access` → 200, verify no weight change
6. `readOnly` client → `memory_search` → 200, verify no metadata update
7. `readOnly` client → `memory_tree_head` → 200
8. `readOnly` client → `memory_verify` → 200, proof valid
9. `master` client → all operations → unchanged behaviour (regression)

### Integration test

1. Register `substrate-viewer` client with `scope: read`
2. Obtain token via client_credentials
3. Run full read cycle: list atoms, search, access, tree_head, verify, metrics
4. Attempt write: atoms_add → expect 403
5. Attempt train: train → expect 403
6. Verify Merkle tree head hash unchanged after all client operations

---

## Next Steps

1. Mount the MMPM server codebase to implement
2. Examine actual auth middleware in `mmpm_mcp_http.ts`
3. Verify OAuth provider includes scopes in tokens
4. Implement, test, deploy (Steps 1.2–1.6)
