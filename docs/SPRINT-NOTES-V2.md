# Sprint Implementation Notes v2 — Corrected Against Actual Codebase

**Parent ADR:** `docs/ADR-001-SSE-READONLY-TEMPORAL.md`
**Date:** 2026-03-15
**Supersedes:** `docs/SPRINT-NOTES.md` (v1 was based on memory atoms, not actual code)

These notes are based on reading the actual MMPM source files. Every line number, function name, and code path has been verified.

---

## Architecture Reality Check

**Key corrections from v1:**

1. **Two separate servers, not one:**
   - **REST data server** (`src/server.ts`, port 3000) — Fastify, all data endpoints
   - **MCP HTTP server** (`tools/mcp/mmpm_mcp_http.ts`, port 3001) — Streamable HTTP MCP transport + OAuth2

2. **OAuth2 already exists** but only on the MCP server (port 3001), not the REST server (port 3000). The OAuth provider is in `tools/mcp/mmpm_oauth_provider.ts`. It has no `scope` support — `scopes_supported: []`.

3. **The REST server uses simple multi-key Bearer auth** (`MMPM_API_KEY` + `MMPM_API_KEYS` env vars), not OAuth2.

4. **`session_checkpoint` is an MCP-only tool**, not a REST endpoint. It internally calls `POST /atoms` → `POST /admin/commit` → `POST /train` → `POST /admin/commit` sequentially via HTTP to the REST server.

5. **The website proxy talks to the REST server (port 3000)**, not the MCP server (port 3001).

**This means Phase A changes significantly.** We need to add scope support to the REST server's auth, not the OAuth provider. The simplest approach: add a new API key in `MMPM_API_KEYS` with a `read:` prefix convention, detected by the auth middleware.

---

## Server File Map

```
markov-merkle-memory/
├── src/
│   ├── server.ts              ← REST server (Fastify, port 3000, 2600+ lines)
│   │                            All data endpoints: /access, /batch-access, /atoms, /train, etc.
│   │                            Auth: multi-key Bearer via apiKeyMap (MMPM_API_KEY + MMPM_API_KEYS)
│   ├── shard_worker.ts        ← Shard logic (1949 lines)
│   │                            buildAccessResult() at line 1266 — the side-effect hotpath
│   │                            accessCounts Map + lastAccessedAtMs Map
│   │                            fire-and-forget storage.put for ac: and la: keys
│   │                            PPM model.recordAccess() for Markov context
│   │                            accessLog.append() for HLR training data
│   ├── orchestrator.ts        ← ShardedOrchestrator — routes to shard workers
│   ├── ingestion.ts           ← IngestionPipeline — batches atoms, flushes to shards
│   └── __tests__/             ← 36 test files, Vitest
│
├── tools/mcp/
│   ├── mmpm_mcp_http.ts       ← MCP HTTP server (port 3001)
│   │                            OAuth2 endpoints: /oauth/register, /oauth/authorize, /oauth/token
│   │                            Auth: static Bearer OR OAuth access token
│   ├── mmpm_mcp_server.ts     ← MCP tool definitions
│   │                            session_checkpoint at line 510 — calls REST API internally
│   └── mmpm_oauth_provider.ts ← OAuth2 provider (in-memory, no scope support)
│
├── vitest.config.mjs
├── tsconfig.json
└── package.json
```

---

## Phase A: Read-Only Access Mode (~100 lines)

**Goal:** A client key that strips all side-effects from reads and blocks writes.
**Approach:** Add scope awareness to the REST server's existing multi-key Bearer auth.

### Why not OAuth2 on the REST server

The website proxy talks directly to port 3000 (REST). Adding a full OAuth2 flow to the REST server would mean either:
- Duplicating the OAuth provider from the MCP server (bad)
- Making the website proxy talk to port 3001 first for tokens, then port 3000 for data (complex)

Instead: use the existing `MMPM_API_KEYS` env var with a naming convention that encodes scope.

### Step A.1: Scope-aware API key map

**File:** `src/server.ts`, lines 914–931

**Current auth model:**
```typescript
// Line 914-920:
const apiKey = process.env.MMPM_API_KEY ?? '';
const apiKeyMap = new Map<string, string>(); // token → clientName
if (apiKey) apiKeyMap.set(apiKey, 'default');
const multiKeyStr = process.env.MMPM_API_KEYS ?? '';
// Parses "name:key,name2:key2" into the map
```

**Change:** Parse a `scope` from the client name. Convention: `clientName` ending with `@read` gets read-only scope.

```typescript
// New types
interface ApiClient {
    name: string;
    scope: 'master' | 'read';
}

// Change apiKeyMap from Map<string, string> to Map<string, ApiClient>
const apiKeyMap = new Map<string, ApiClient>();

if (apiKey) apiKeyMap.set(apiKey, { name: 'default', scope: 'master' });

for (const pair of multiKeyStr.split(',')) {
    const idx = pair.indexOf(':');
    if (idx > 0) {
        const rawName = pair.slice(0, idx).trim();
        const key = pair.slice(idx + 1).trim();
        if (rawName && key) {
            // Convention: name ending with @read → read scope
            const isRead = rawName.endsWith('@read');
            const name = isRead ? rawName.slice(0, -5) : rawName;
            apiKeyMap.set(key, { name, scope: isRead ? 'read' : 'master' });
        }
    }
}
```

**Env var example:**
```env
MMPM_API_KEY=master-key-here
MMPM_API_KEYS=substrate-viewer@read:read-only-key-here
```

### Step A.2: Add `readOnly` to request context

**File:** `src/server.ts`

After the auth hook (line 1033–1041), decorate the request with the resolved client:

```typescript
// Fastify decoration
server.decorateRequest('mmpmClient', null);

// In the onRequest hook (line 1033-1041):
if (apiKeyMap.size > 0) {
    server.addHook('onRequest', async (request, reply) => {
        if (probePaths.has(request.url)) return;
        const auth = request.headers.authorization;
        if (!auth || !auth.startsWith('Bearer ')) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }
        const client = apiKeyMap.get(auth.slice(7));
        if (!client) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }
        (request as any).mmpmClient = client;
    });
}
```

**Helper:**
```typescript
function isReadOnly(request: FastifyRequest): boolean {
    return (request as any).mmpmClient?.scope === 'read';
}

function requireMaster(request: FastifyRequest, reply: FastifyReply): boolean {
    if (isReadOnly(request)) {
        reply.code(403).send({
            error: 'forbidden',
            message: 'Read-only client cannot perform write operations',
            scope: 'read',
            requiredScope: 'master',
        });
        return false;
    }
    return true;
}
```

### Step A.3: BLOCK write endpoints

Add `if (!requireMaster(request, reply)) return;` at the top of:

| Endpoint | Line in server.ts |
|----------|-------------------|
| `POST /atoms` | ~1796 |
| `POST /train` | ~1222 |
| `POST /admin/commit` | ~2027 |
| `DELETE /atoms/:atom` | ~2407 |
| `POST /policy` | ~1146 |
| `POST /write-policy` | ~1191 |
| `POST /admin/import` | ~2230 |
| `POST /admin/import-full` | ~2192 |
| `POST /memory/bootstrap` | ~1559 (has session tracking side-effects) |

### Step A.4: STRIP side-effects from access/batch-access

**The side-effect chain in `shard_worker.ts:buildAccessResult()` (line 1266–1293):**

```typescript
// Line 1268-1272: accessCount increment + fire-and-forget persist
// Line 1275-1279: lastAccessed timestamp + fire-and-forget persist
// Line 1282-1285: accessLog.append() for HLR training data
// Line 1291-1293: ppmModel.recordAccess() for Markov context
```

**Approach:** Add a `skipSideEffects` option to the access path.

**Option 1 (cleanest):** Add a parameter to `orchestrator.access()` and `orchestrator.batchAccess()`:

```typescript
// In orchestrator:
async access(item: string, opts?: { skipSideEffects?: boolean }): Promise<PredictionReport>
async batchAccess(items: string[], opts?: { skipSideEffects?: boolean }): Promise<BatchAccessResult[]>
```

These pass the option down to the shard worker. In `buildAccessResult()`:

```typescript
private buildAccessResult(snapshot: MerkleSnapshot, idx: number, skipSideEffects = false): ShardAccessResult {
    if (!skipSideEffects) {
        // accessCount increment
        const newCount = (this.accessCounts.get(idx) ?? 0) + 1;
        this.accessCounts.set(idx, newCount);
        const acKey = `ac:${String(idx).padStart(10, '0')}`;
        this.storage.put(acKey, String(newCount))
            .catch((err: unknown) => logger.error({ err }, 'Access count persist error'));

        // lastAccessed timestamp
        const nowMs = this.clock();
        this.lastAccessedAtMs.set(idx, nowMs);
        const laKey = `la:${String(idx).padStart(10, '0')}`;
        this.storage.put(laKey, String(Math.round(nowMs)))
            .catch((err: unknown) => logger.error({ err }, 'Last-access timestamp persist error'));

        // HLR access log
        if (this.accessLog && idx < this.data.length) {
            this.accessLog.append({ atom: this.data[idx], type: 'access', ts: this.clock() })
                .catch((err: unknown) => logger.error({ err }, 'Access log append error'));
        }

        // PPM context recording
        if (this.ppmModel) {
            this.ppmModel.recordAccess(hash);
        }
    }

    // The rest (proof generation, prediction) still runs — these are pure reads
    const hash = snapshot.getLeafHash(idx);
    const proof = snapshot.getProof(idx);
    // ... prediction logic unchanged ...
}
```

**Option 2 (minimal, no shard_worker changes):** Skip TTL touch in server.ts and accept that accessCount still increments. Less clean but fewer files to change.

**Recommendation:** Option 1. The whole point is to prevent the viz from corrupting weights. Four lines wrapped in an `if` block.

**In server.ts:**

```typescript
// POST /access (line 1059):
server.post('/access', async (request, reply) => {
    // ...existing code...
    const report = await orchestrator.access(item, { skipSideEffects: isReadOnly(request) });
    if (!isReadOnly(request)) {
        ttlRegistry.touch(item); // Only master touches TTL
    }
    // ...rest unchanged...
});

// POST /batch-access (line 1110):
server.post('/batch-access', async (request, reply) => {
    // ...existing code...
    const results = await orchestrator.batchAccess(normalized as string[], { skipSideEffects: isReadOnly(request) });
    if (!isReadOnly(request)) {
        ttlRegistry.touchAll(normalized as string[]);
    }
    return { results };
});
```

### Step A.5: STRIP search metadata

**POST /search (line 1269):** Currently the search handler doesn't have obvious side-effects beyond the query itself. The `searchAddAtoms()` function only runs on ingestion flush (line 945), not on search. Search is already read-safe. No changes needed.

### Step A.6: Update getClientName helper

**Line 933–937:** Currently returns `string | undefined`. Update to work with the new `ApiClient` type:

```typescript
const getClientName = (req: { headers: { authorization?: string } }): string | undefined => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return undefined;
    return apiKeyMap.get(auth.slice(7))?.name;
};
```

### Step A.7: Tests

**File:** New file `src/__tests__/read_scope.test.ts`

Key test cases:
1. Read client → POST /atoms → 403
2. Read client → POST /train → 403
3. Read client → POST /admin/commit → 403
4. Read client → DELETE /atoms/:atom → 403
5. Read client → POST /access → 200, verify accessCount unchanged
6. Read client → POST /batch-access → 200, verify no weight change
7. Read client → GET /atoms → 200
8. Read client → GET /tree-head → 200
9. Master client → all operations → unchanged (regression)
10. Tree head hash unchanged after all read client operations

**Test setup:** Use the existing `buildApp()` function with `MMPM_API_KEYS=test-master:masterkey,viewer@read:readkey` env var.

---

## Phase B: SSE Event Stream (~200 lines)

**Goal:** `GET /events` SSE endpoint on the REST server (port 3000) that broadcasts batched changesets.

### Where to hook: IngestionPipeline.flush()

The SSE hook point is NOT in the commit handler — it's in the `IngestionPipeline`. The pipeline has an `onFlush` callback (line 945):

```typescript
const pipeline = new IngestionPipeline(orchestrator, {
    batchSize: parseInt(process.env.INGEST_BATCH_SIZE ?? '100'),
    flushIntervalMs: parseInt(process.env.INGEST_FLUSH_MS ?? '1000'),
    onFlush: (flushedAtoms) => searchAddAtoms(flushedAtoms),
});
```

**This `onFlush` callback is called with the atoms that were just flushed.** We can extend it to also broadcast to SSE clients:

```typescript
onFlush: (flushedAtoms) => {
    searchAddAtoms(flushedAtoms);
    broadcastChangeset(flushedAtoms); // NEW
},
```

However, `onFlush` only gets the flushed atom keys — not tombstones or trained arcs. The `session_checkpoint` tool calls POST /atoms, POST /admin/commit, POST /train, POST /admin/commit as separate REST calls. The REST server doesn't know they're part of one checkpoint.

**Better approach:** Add the SSE broadcast to the `POST /admin/commit` handler (line 2027), which IS called by session_checkpoint. After a successful flush:

```typescript
server.post('/admin/commit', async (request, reply) => {
    try {
        const before = pipeline.getStats().totalCommitted;
        const beforeAtoms = getCommittedAtomSnapshot(); // NEW: capture before state
        await pipeline.flush();
        const after = pipeline.getStats().totalCommitted;
        const flushedCount = after - before;

        // Build and broadcast changeset
        const changeset = buildChangeset(beforeAtoms, flushedCount); // NEW
        sseManager.broadcast('changeset', changeset);                // NEW

        auditLog.record('admin.commit', { ... });
        return { status: 'Committed', flushedCount };
    } catch (e: any) { ... }
});
```

**Challenge:** The commit handler doesn't easily know which atoms were added vs tombstoned. The `pipeline.flush()` call is opaque — it returns void.

**Best hook:** Modify `IngestionPipeline` to return a flush result, or accumulate recent mutations in a buffer that gets drained on commit. The simplest approach:

1. Track "pending changeset" atoms in a buffer
2. When `POST /atoms` is called, record the atoms in the buffer
3. When `DELETE /atoms/:atom` is called, record the tombstone in the buffer
4. When `POST /admin/commit` succeeds, drain the buffer into an SSE changeset and broadcast
5. Clear the buffer

This maps naturally to how `session_checkpoint` works: POST /atoms → buffer fills → POST /admin/commit → buffer drains to SSE.

### Step B.1: ChangesetBuffer class

**File:** New file `src/changeset_buffer.ts`

```typescript
export interface ChangesetEntry {
    added: Array<{ key: string; type: string }>;
    tombstoned: string[];
    trained: string[][];
}

export class ChangesetBuffer {
    private added: Array<{ key: string; type: string }> = [];
    private tombstoned: string[] = [];
    private trained: string[][] = [];

    recordAdded(atoms: string[]): void {
        for (const atom of atoms) {
            const type = atom.split('.')[1] ?? 'other';
            this.added.push({ key: atom, type });
        }
    }

    recordTombstoned(atom: string): void {
        this.tombstoned.push(atom);
    }

    recordTrained(sequence: string[]): void {
        this.trained.push([...sequence]);
    }

    drain(): ChangesetEntry | null {
        if (this.added.length === 0 && this.tombstoned.length === 0 && this.trained.length === 0) {
            return null;
        }
        const entry: ChangesetEntry = {
            added: [...this.added],
            tombstoned: [...this.tombstoned],
            trained: [...this.trained],
        };
        this.added = [];
        this.tombstoned = [];
        this.trained = [];
        return entry;
    }
}
```

### Step B.2: SSEManager class

**File:** New file `src/sse_manager.ts`

Same design as v1 sprint notes — SSEManager with clients Map, broadcast method, heartbeat interval. See v1 notes for the full implementation.

**Key Fastify-specific difference:** Use `reply.raw` (Node.js `ServerResponse`) for streaming.

### Step B.3: Wire it into server.ts

In `buildApp()`:

```typescript
const changesetBuffer = new ChangesetBuffer();
const sseManager = new SSEManager();

// Hook into POST /atoms handler (line ~1796):
// After successful atom ingestion, before response:
changesetBuffer.recordAdded(writeEvaluation.allowedAtoms);

// Hook into DELETE /atoms/:atom handler (line ~2407):
changesetBuffer.recordTombstoned(atom);

// Hook into POST /train handler (line ~1222):
changesetBuffer.recordTrained(normalized);

// Hook into POST /admin/commit handler (line ~2027):
// After successful flush:
const entry = changesetBuffer.drain();
if (entry) {
    const changeset = {
        version: orchestrator.getMasterVersion(),
        rootHash: orchestrator.getMasterRootHash(),
        timestamp: Date.now(),
        ...entry,
    };
    sseManager.broadcast('changeset', changeset);
}

// SSE endpoint:
server.get('/events', async (request, reply) => {
    // Auth required, read OR master scope allowed
    reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    reply.hijack(); // Tell Fastify we're taking over the response
    sseManager.addClient(reply.raw);
});
```

**Gotcha: `reply.hijack()`** — Fastify's method for SSE/WebSocket. Replaces `reply.sent = true`. Tells Fastify the handler owns the response lifecycle.

### Step B.4: Enrich changeset with shard/index/hash

The changeset `added` array needs `shard`, `index`, and `hash` so the viz can position atoms without calling batch-access. These are only available AFTER commit.

**After `pipeline.flush()` succeeds**, query the orchestrator for each added atom's metadata:

```typescript
const enrichedAdded = await Promise.all(entry.added.map(async (a) => {
    try {
        const report = await orchestrator.access(a.key, { skipSideEffects: true });
        return {
            key: a.key,
            type: a.type,
            shard: report.shardRootProof?.index ?? -1,
            index: report.currentProof?.index ?? -1,
            hash: report.currentProof?.leaf ?? '',
            status: 'active',
        };
    } catch {
        return { key: a.key, type: a.type, shard: -1, index: -1, hash: '', status: 'active' };
    }
}));
```

**Important:** Use `skipSideEffects: true` here — the SSE enrichment must not trigger side-effects!

### Step B.5: Nginx config

Same as v1 notes:

```nginx
location /events {
    proxy_pass http://localhost:3000/events;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 86400s;
    chunked_transfer_encoding off;
}
```

### Step B.6: Expose SSEManager in buildApp return

```typescript
return { server, orchestrator, pipeline, auditLog, sseManager };
```

For tests and metrics (`sseManager.clientCount`).

---

## Phase C: Website Integration (~433 lines)

**Key correction from v1:** The website talks to the REST server, not the MCP server. No OAuth2 token exchange needed — just use a read-only API key.

### Step C.1: Replace MMPM_API_KEY with read-only key

**File:** `src/lib/mmpm.ts`

Much simpler than v1 — no OAuth2 token management needed:

```typescript
// Before: const MMPM_KEY = loadApiKey(); // loaded MMPM_API_KEY
// After:
const MMPM_KEY = process.env.MMPM_READONLY_KEY ?? loadApiKey();
```

Or just change the `.env.local`:
```env
# Replace master key with read-only key
MMPM_API_KEY=<read-only-key-from-MMPM_API_KEYS>
```

**No code changes needed in mmpm.ts!** The proxy just uses a different key that the server recognizes as read-only.

### Step C.2: SSE proxy route

**File:** New file `src/app/api/memory/events/route.ts`

Same as v1 notes, but simpler auth (just forward the same Bearer token):

```typescript
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    const MMPM_URL = process.env.MMPM_API_URL ?? 'https://mmpm.co.nz';
    const MMPM_KEY = process.env.MMPM_API_KEY ?? '';

    const upstream = await fetch(`${MMPM_URL}/events`, {
        headers: {
            Authorization: `Bearer ${MMPM_KEY}`,
            Accept: 'text/event-stream',
        },
    });

    if (!upstream.ok || !upstream.body) {
        return new Response(JSON.stringify({ error: 'SSE upstream failed' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    return new Response(upstream.body, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
```

### Steps C.3–C.9: Unchanged from v1

The Zustand store `observe()` action, `TemporalConnections.tsx`, `ChangesetAudio.ts`, `MerkleScene.tsx`, and `AccessControls.tsx` changes are all the same as v1 sprint notes. The only difference is that the SSE proxy is simpler.

---

## Phase D: Search Temporal + Audio (~90 lines)

**Unchanged from v1.** The `searchAtoms()` store action, `SearchPanel.tsx`, and TemporalConnections reuse are all the same.

---

## Deployment Sequence

1. **Phase A on the MMPM server:**
   - Add `substrate-viewer@read:<generated-key>` to `MMPM_API_KEYS` env var
   - Deploy server changes (scope-aware auth, skipSideEffects)
   - Run tests

2. **Update website `.env.local`:**
   - Change `MMPM_API_KEY` to the read-only key
   - Verify viz still works (it should — same data, just no side-effects)

3. **Phase B on the MMPM server:**
   - Deploy ChangesetBuffer, SSEManager, SSE endpoint
   - Update nginx config for `/events`
   - Test SSE with `curl -H "Authorization: Bearer <read-key>" https://mmpm.co.nz/events`

4. **Phase C on the website:**
   - Add SSE proxy route
   - Add observe() store action + TemporalConnections + audio
   - Deploy website

5. **Phase D on the website:**
   - Add search temporal connections
   - Deploy

---

## Key File Changes Summary

### MMPM Server (`markov-merkle-memory/`)

| File | Change |
|------|--------|
| `src/server.ts` | ApiClient type, scope-aware apiKeyMap, isReadOnly() + requireMaster() helpers, BLOCK guards on write endpoints, skipSideEffects on access/batch-access, SSE route, changeset buffer wiring |
| `src/shard_worker.ts` | `skipSideEffects` parameter on `buildAccessResult()`, wrap 4 side-effect blocks in `if (!skipSideEffects)` |
| `src/orchestrator.ts` | Pass `skipSideEffects` through `access()` and `batchAccess()` to shard workers |
| `src/sse_manager.ts` | NEW — SSEManager class |
| `src/changeset_buffer.ts` | NEW — ChangesetBuffer class |
| `src/__tests__/read_scope.test.ts` | NEW — 10 test cases |
| `src/__tests__/sse_events.test.ts` | NEW — 9 test cases |

### Website (`mmpm-website/`)

| File | Change |
|------|--------|
| `.env.local` | Change MMPM_API_KEY to read-only key |
| `src/app/api/memory/events/route.ts` | NEW — SSE proxy route |
| `src/stores/memory-store.ts` | observe(), disconnect(), temporalGroups, soundEnabled, TemporalGroup interface |
| `src/components/visualise/TemporalConnections.tsx` | NEW — white temporal lines + purple trained arcs + ghost persistence |
| `src/components/visualise/ChangesetAudio.ts` | NEW — Tone.js chime |
| `src/components/visualise/SearchPanel.tsx` | NEW — search input |
| `src/components/visualise/MerkleScene.tsx` | Mount TemporalConnections, wire observe() |
| `src/components/visualise/AccessControls.tsx` | Sound toggle button |
| `src/components/visualise/StatsOverlay.tsx` | Changeset notification banner |
