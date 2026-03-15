# Sprint Implementation Notes

**Parent ADR:** `docs/ADR-001-SSE-READONLY-TEMPORAL.md`
**Date:** 2026-03-15

These notes contain everything needed to implement each phase without re-reading the full codebase. Each sprint section is self-contained with file paths, code patterns, gotchas, and test strategies.

---

## Phase A: Server-Side Read Scope (~130 lines)

**Goal:** OAuth2 `read` scope that strips side-effects from reads and blocks writes.
**Blocks:** Phases B, C, D (nothing else is safe without this).

### What we know about the server

From memory:
- **Stack:** TypeScript, Fastify, LevelDB
- **Key files:** `mmpm_mcp_http.ts` (2579 lines — Fastify routes, auth, write policy, bootstrap, search), `shard_worker.ts` (1949 lines — Merkle, epoch WAL, PPM)
- **Source:** 28 TypeScript files in `src/`, largest is server (101k), shard worker (53k)
- **Tests:** 36 test files, Vitest, includes integration/security/load/concurrent tests. Use `jsdom@25` (not v28 — ESM compat issues with Vitest CJS mode)
- **Ingestion pipeline:** queue → shard → pending → commit
- **Commit hotpath:** CSR matrix rebuild → Merkle apply → PPM persist (async)
- **Access hotpath:** fire-and-forget `storage.put` for `accessCount` + `lastAccessed`, then PPM predict (first-order Markov, then PPM variable-order)
- **OAuth provider:** Already has `/oauth/register` and `/oauth/token` endpoints. API gateway on port 8443, rate limit 1000/min, auth OAuth2 JWT
- **Known security issues:** No rate limit on `/oauth/token`, no rate limit on `/oauth/register` (open with no client cap — memory exhaustion risk), missing `MMPM_OAUTH_ISSUER` env var for mmpm-mcp service in docker-compose.production.yml
- **Deployed:** DigitalOcean droplet at mmpm.co.nz

### Step A.1: Auth middleware — extract scope, set `readOnly`

**File:** `src/mmpm_mcp_http.ts` (look for the Fastify `preHandler` or `onRequest` hook that validates the bearer token)

**What to do:**
1. Find where the OAuth2 token is validated (likely a Fastify hook or decorator)
2. After token validation succeeds, extract the `scope` claim from the JWT (or in-memory token store)
3. Add `readOnly: boolean` to the Fastify request context/decoration:

```typescript
// In the auth hook, after token is validated:
interface RequestContext {
  authenticated: boolean;
  clientId: string;
  scope: 'master' | 'read';
  readOnly: boolean;  // derived: scope === 'read'
}

// Set it:
request.mmpmContext = {
  ...existingContext,
  scope: tokenClaims.scope ?? 'master',
  readOnly: tokenClaims.scope === 'read',
};
```

**Gotcha:** The existing OAuth provider may not include `scope` in the token claims. Check the `/oauth/register` handler — if it doesn't store scope on the client record, add it. Check the `/oauth/token` handler — if it doesn't embed scope in the JWT or token store, add it.

**Gotcha:** Existing master tokens must continue to work unchanged. Default `scope` to `'master'` if not present in the token (backward compat). Static bearer tokens (non-OAuth) should also default to master.

### Step A.2: BLOCK write operations for readOnly clients

**File:** `src/mmpm_mcp_http.ts`

**What to do:** Add a guard at the top of each write handler. The cleanest approach is a shared helper:

```typescript
function requireMaster(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.mmpmContext?.readOnly) {
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

**Endpoints to guard:**

| Route handler | Method | Path |
|--------------|--------|------|
| atoms_add | POST | `/atoms` |
| train | POST | `/train` |
| commit | POST | `/admin/commit` |
| checkpoint | POST | `/checkpoint` |
| atoms_stale | GET | `/atoms/stale` (triggers tombstoning) |
| bootstrap | POST | `/memory/bootstrap` (session tracking side-effects) |

**Pattern:** At the top of each handler, before any logic:
```typescript
if (!requireMaster(request, reply)) return;
```

### Step A.3–A.5: STRIP side-effects from access/batch-access/search

**Files:** The handler functions for `/access`, `/batch-access`, and `/search` in `mmpm_mcp_http.ts`

**Access handler (`/access`):**
The access hotpath does fire-and-forget `storage.put` for accessCount and lastAccessed. Find this call and wrap it:

```typescript
// BEFORE (existing):
storage.put(atomKey, { ...data, accessCount: data.accessCount + 1, lastAccessed: Date.now() });

// AFTER:
if (!request.mmpmContext?.readOnly) {
  storage.put(atomKey, { ...data, accessCount: data.accessCount + 1, lastAccessed: Date.now() });
}
```

Also find where Markov weight adjustment happens after access (PPM predict may trigger weight updates). Wrap that too:

```typescript
if (!request.mmpmContext?.readOnly) {
  // Markov weight adjustment / transition recording
}
```

**Batch-access handler (`/batch-access`):**
Same pattern — likely loops over items and calls the same access logic. Pass a `skipSideEffects` option through:

```typescript
const results = await Promise.all(
  items.map(atom => accessAtom(atom, { skipSideEffects: request.mmpmContext?.readOnly }))
);
```

**Search handler (`/search`):**
Search may update access metadata. Find the metadata update call and guard it:

```typescript
if (!request.mmpmContext?.readOnly) {
  // update access metadata for search results
}
```

### Step A.6: Tests

**File:** New file `test/read-scope.test.ts`

**Framework:** Vitest (existing test framework). Use `jsdom@25` for DOM tests.

**Test cases (9 minimum):**

```typescript
describe('OAuth2 read scope', () => {
  // Setup: register a read-only client, get a token
  let readToken: string;
  let masterToken: string;

  beforeAll(async () => {
    // Register read client
    const readClient = await registerClient({ client_name: 'test-viewer', scope: 'read' });
    readToken = await getToken(readClient, 'read');
    // Register master client (or use existing static bearer)
    masterToken = existingMasterToken;
  });

  // BLOCKED operations
  test('read client → POST /atoms → 403', async () => { ... });
  test('read client → POST /train → 403', async () => { ... });
  test('read client → POST /admin/commit → 403', async () => { ... });
  test('read client → POST /checkpoint → 403', async () => { ... });

  // STRIPPED operations
  test('read client → POST /access → 200, no weight change', async () => {
    const weightsBefore = await getWeights(testAtom, masterToken);
    await access(testAtom, readToken);
    const weightsAfter = await getWeights(testAtom, masterToken);
    expect(weightsAfter).toEqual(weightsBefore); // No change!
  });

  test('read client → POST /batch-access → 200, no metadata update', async () => { ... });
  test('read client → POST /search → 200, no metadata update', async () => { ... });

  // PASSTHROUGH operations
  test('read client → GET /tree-head → 200', async () => { ... });
  test('read client → POST /verify → 200, proof valid', async () => { ... });

  // REGRESSION: master unchanged
  test('master client → all operations → unchanged behaviour', async () => { ... });

  // CRITICAL: verify tree unchanged
  test('tree head hash unchanged after all read client operations', async () => {
    const headBefore = await getTreeHead();
    // ... run all read operations ...
    const headAfter = await getTreeHead();
    expect(headAfter.root).toBe(headBefore.root);
    expect(headAfter.version).toBe(headBefore.version);
  });
});
```

### Security fix to include

While touching the auth middleware, also address the known security issues:
- Add rate limit to `/oauth/token` (currently unprotected)
- Add rate limit to `/oauth/register` (currently open with no client cap)
- Add `MMPM_OAUTH_ISSUER` env var to `docker-compose.production.yml`

### Register the substrate-viewer client

After deploying Phase A, register the client:

```bash
curl -X POST https://mmpm.co.nz/oauth/register \
  -H 'Content-Type: application/json' \
  -d '{"client_name": "substrate-viewer", "scope": "read"}'
```

Save the returned `client_id` and `client_secret` in the website's `.env.local`.

---

## Phase B: SSE Event Stream (~200 lines)

**Goal:** `GET /events` SSE endpoint that broadcasts batched changesets on commit.
**Depends on:** Phase A (read scope for auth).

### Step B.1: SSEManager class

**File:** New file `src/sse-manager.ts`

```typescript
import { FastifyReply } from 'fastify';
import crypto from 'node:crypto';

interface SSEClient {
  id: string;
  reply: FastifyReply;
  lastVersion: number;
  connectedAt: number;
}

export class SSEManager {
  private clients = new Map<string, SSEClient>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private currentVersion = 0;

  start(initialVersion: number) {
    this.currentVersion = initialVersion;
    this.heartbeatInterval = setInterval(() => this.heartbeat(), 30_000);
  }

  stop() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    for (const client of this.clients.values()) {
      client.reply.raw.end();
    }
    this.clients.clear();
  }

  addClient(reply: FastifyReply): string {
    const id = crypto.randomUUID();
    const client: SSEClient = {
      id,
      reply,
      lastVersion: this.currentVersion,
      connectedAt: Date.now(),
    };
    this.clients.set(id, client);

    // Send connected event
    this.sendTo(client, 'connected', {
      version: this.currentVersion,
      clientScope: 'read',
    });

    // Clean up on disconnect
    reply.raw.on('close', () => this.clients.delete(id));

    return id;
  }

  get clientCount(): number {
    return this.clients.size;
  }

  broadcast(event: string, data: unknown) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [id, client] of this.clients) {
      try {
        client.reply.raw.write(payload);
        if (event === 'changeset') {
          client.lastVersion = (data as { version: number }).version;
        }
      } catch {
        // Client disconnected — clean up
        this.clients.delete(id);
      }
    }
  }

  private heartbeat() {
    this.broadcast('heartbeat', {
      timestamp: Date.now(),
      version: this.currentVersion,
    });
  }

  private sendTo(client: SSEClient, event: string, data: unknown) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    try {
      client.reply.raw.write(payload);
    } catch {
      this.clients.delete(client.id);
    }
  }
}

export const sseManager = new SSEManager();
```

**Notes:**
- Singleton export — imported by the commit handler and the route handler
- `reply.raw.write()` — Fastify's raw Node.js response for streaming
- 30s heartbeat prevents nginx proxy timeouts (default 60s)
- Max 50 clients — add a guard in `addClient()` returning 503 if at cap

### Step B.2: Route handler

**File:** `src/mmpm_mcp_http.ts` (add new route)

```typescript
// GET /events — SSE stream (read scope only)
fastify.get('/events', {
  preHandler: [authHook], // Must be authenticated
}, async (request, reply) => {
  // Read scope OR master can connect
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Prevent nginx buffering
  });

  sseManager.addClient(reply);

  // Don't close the response — it stays open for SSE
  // Fastify will handle cleanup via reply.raw.on('close')
});
```

**Gotcha: `X-Accel-Buffering: no`** — Critical for nginx. Without this header, nginx buffers the SSE stream and the client receives nothing until the buffer fills. The MMPM server sits behind nginx on the droplet, so this header is essential.

**Gotcha: Fastify reply handling** — Fastify normally expects handlers to return or call `reply.send()`. For SSE, we write headers manually and never send a final response. Make sure the handler doesn't call `reply.send()` — just return after `addClient()`. You may need to set `reply.sent = true` to prevent Fastify from auto-closing.

### Step B.3–B.4: Commit and checkpoint hooks

**File:** `src/mmpm_mcp_http.ts` (in the commit and checkpoint handlers)

**After a successful commit**, build a changeset and broadcast:

```typescript
// In the commit handler, after storage.commit() succeeds:
import { sseManager } from './sse-manager';

// Build changeset from the atoms that were just committed
const changeset = {
  version: newTreeVersion,
  rootHash: newRootHash,
  timestamp: Date.now(),
  added: newlyCommittedAtoms.map(a => ({
    key: a.atom,
    type: parseAtomType(a.atom),
    shard: a.shardId,
    index: a.leafIndex,
    hash: a.leafHash,
    status: a.status,
  })),
  tombstoned: tombstonedAtomKeys,
  trained: trainedArcs, // from session_checkpoint's train parameter
};

sseManager.broadcast('changeset', changeset);
```

**Where to hook:**
- The `POST /admin/commit` handler — after `storage.commit()` succeeds
- The `POST /checkpoint` handler — this calls atoms_add + train + commit internally, so the changeset should be built from its combined effects

**Key data to collect:**
- `added` atoms need: key, type (parsed from key), shard, index (leaf index within shard), hash (leaf hash). These come from the ingestion result.
- `tombstoned` atoms: just the keys. These come from the `tombstone` parameter.
- `trained` arcs: the ordered sequences from the `train` parameter.
- `version` and `rootHash`: from the new tree head after commit.

**Gotcha:** The ingestion pipeline is queue → shard → pending → commit. The shard/index/hash for newly added atoms are only known AFTER the commit (Merkle tree update). Make sure the changeset is built from the commit result, not the pending queue.

### Step B.5: SSE tests

**File:** New file `test/sse-events.test.ts`

```typescript
describe('SSE event stream', () => {
  test('GET /events returns text/event-stream', async () => { ... });
  test('connected event includes version and atomCount', async () => { ... });
  test('changeset event emitted after checkpoint', async () => {
    // Connect SSE client
    // Run a checkpoint with master token (adds atom + tombstones atom)
    // Verify changeset event received with correct added/tombstoned arrays
  });
  test('heartbeat received within 35 seconds', async () => { ... });
  test('read-scope token can connect', async () => { ... });
  test('unauthenticated request rejected', async () => { ... });
  test('changeset includes trained arcs', async () => { ... });
  test('multiple clients receive same changeset', async () => { ... });
  test('client disconnect cleans up', async () => { ... });
});
```

### Nginx config update

**File:** nginx config on the droplet (likely `/etc/nginx/sites-available/mmpm` or similar)

Add SSE-specific config for the `/events` path:

```nginx
location /events {
    proxy_pass http://localhost:3000/events;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 86400s;  # 24h — keep SSE alive
    chunked_transfer_encoding off;
}
```

**Gotcha:** The default `proxy_read_timeout` is 60s. Without extending it, nginx closes the SSE connection every minute. The heartbeat (30s) keeps the TCP connection alive, but nginx still needs a long read timeout.

---

## Phase C: Website Integration (~433 lines)

**Goal:** Replace static bearer with OAuth2 token, add SSE proxy, add `observe()` store action, add `TemporalConnections.tsx`, add `ChangesetAudio.ts`.
**Depends on:** Phases A and B (server changes deployed).

### Step C.1: Replace static bearer with OAuth2 client_credentials

**File:** `src/lib/mmpm.ts`

**Current state:** Reads `MMPM_API_KEY` from env/`.env.local`, sends as `Authorization: Bearer <key>` on every request.

**Change to:**

```typescript
// Remove: const MMPM_KEY = loadApiKey();

const MMPM_CLIENT_ID = process.env.MMPM_CLIENT_ID ?? '';
const MMPM_CLIENT_SECRET = process.env.MMPM_CLIENT_SECRET ?? '';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getReadToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const res = await fetch(`${MMPM_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: MMPM_CLIENT_ID,
      client_secret: MMPM_CLIENT_SECRET,
      scope: 'read',
    }),
    signal: AbortSignal.timeout(5_000),
  });

  if (!res.ok) {
    throw new Error(`OAuth token request failed: ${res.status}`);
  }

  const { access_token, expires_in } = await res.json();
  cachedToken = access_token;
  tokenExpiresAt = Date.now() + (expires_in ?? 3600) * 1000;
  return access_token;
}

// Update buildHeaders to use the token:
async function buildHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = await getReadToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}
```

**Gotcha:** `buildHeaders()` becomes async. Update `proxyToMmpm()` to await it:
```typescript
const headers = await buildHeaders();
```

### Step C.2: Update `.env.local`

```env
# Remove: MMPM_API_KEY=...
MMPM_CLIENT_ID=substrate-viewer-xxxx
MMPM_CLIENT_SECRET=xxxx
MMPM_API_URL=https://mmpm.co.nz
CORS_ORIGIN=https://parametric-memory.dev
```

### Step C.3: SSE proxy route

**File:** New file `src/app/api/memory/events/route.ts`

```typescript
import { NextResponse } from 'next/server';

const MMPM_URL = process.env.MMPM_API_URL ?? 'https://mmpm.co.nz';

export const runtime = 'nodejs'; // SSE requires Node.js runtime, not Edge

export async function GET() {
  // Get read-scope token (import from mmpm.ts)
  const { getReadToken } = await import('@/lib/mmpm');
  const token = await getReadToken();

  const upstream = await fetch(`${MMPM_URL}/events`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'text/event-stream',
    },
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: 'SSE connection failed', status: upstream.status },
      { status: 502 }
    );
  }

  // Pipe the upstream SSE stream to the client
  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': process.env.CORS_ORIGIN ?? '*',
    },
  });
}
```

**Gotcha: `export const runtime = 'nodejs'`** — Next.js Edge Runtime doesn't support streaming responses properly for SSE. Force Node.js runtime.

**Gotcha: `getReadToken()` export** — You'll need to export this function from `mmpm.ts`. Currently it's not exported.

**Gotcha: Response piping** — `upstream.body` is a `ReadableStream`. The `new Response(upstream.body, ...)` constructor pipes it through. This works in Node.js 18+ with `ReadableStream` support.

### Step C.4: Store changes — `observe()` action + `temporalGroups` state

**File:** `src/stores/memory-store.ts`

**New interfaces:**

```typescript
/** A group of atoms that arrived or were found together */
export interface TemporalGroup {
  id: string;
  atoms: string[];       // keys of added atoms
  tombstoned: string[];  // keys of tombstoned atoms
  source: 'changeset' | 'search';
  startTime: number;     // performance.now()
  query?: string;        // for search-sourced groups
  trainedArcs?: string[][];
  version?: number;
}
```

**New state fields:**

```typescript
// In MemoryState interface:
temporalGroups: TemporalGroup[];
soundEnabled: boolean;
eventSource: EventSource | null;

// New actions:
observe: () => void;
disconnect: () => void;
toggleSound: () => void;
addTemporalGroup: (group: TemporalGroup) => void;
```

**The `observe()` action:**

```typescript
observe: () => {
  const existing = get().eventSource;
  if (existing) return; // Already connected

  const es = new EventSource('/api/memory/events');

  es.addEventListener('changeset', (e) => {
    const data = JSON.parse(e.data) as {
      version: number;
      rootHash: string;
      timestamp: number;
      added: Array<{ key: string; type: string; shard: number; index: number; hash: string; status: string }>;
      tombstoned: string[];
      trained: string[][];
    };

    set((s) => {
      // 1. Add new atoms to the scene
      const newAtoms: VisualAtom[] = data.added.map(a => ({
        key: a.key,
        type: parseAtomType(a.key),
        shard: a.shard,
        index: a.index,
        hash: a.hash,
        resolved: true, // SSE provides real shard/index
        position: treeNodePosition(a.shard, atomTreeDepth(a.index), atomTreePosInLevel(a.index)),
        pulse: true,
        tombstoned: a.status === 'tombstoned',
      }));

      // 2. Mark tombstoned atoms
      const tombSet = new Set(data.tombstoned);
      const updatedAtoms = s.atoms.map(a =>
        tombSet.has(a.key) ? { ...a, tombstoned: true } : a
      );

      // 3. Create temporal group
      const group: TemporalGroup = {
        id: crypto.randomUUID(),
        atoms: data.added.map(a => a.key),
        tombstoned: data.tombstoned,
        source: 'changeset',
        startTime: performance.now(),
        trainedArcs: data.trained,
        version: data.version,
      };

      return {
        atoms: [...updatedAtoms, ...newAtoms],
        temporalGroups: [...s.temporalGroups, group],
        treeVersion: data.version,
      };
    });

    // Re-layout with new atoms
    requestLayoutDebounced();

    // Play audio chime (if enabled)
    if (get().soundEnabled) {
      playChangesetChime(data.added.length, data.tombstoned.length);
    }
  });

  es.addEventListener('resync', () => {
    // Server says we're behind — full reload
    get().fetchTree().then(() => get().fetchRealPositions());
  });

  es.addEventListener('error', () => {
    // EventSource auto-reconnects, but log the error
    get().logError('SSE', 'Connection lost, reconnecting...', 'warn');
  });

  set({ eventSource: es });
},
```

**Gotcha: atom index vs sortedIndex** — The `index` from the changeset is the leaf index in the shard Merkle tree. But `treeNodePosition()` expects `sortedIdx` (the BFS position within the visual tree, based on sorting atoms by index). When a new atom arrives via SSE, its visual position depends on WHERE it falls in the sorted order of existing shard atoms. The simplest approach: after adding new atoms, re-sort and re-layout the entire shard. The `requestLayoutDebounced()` call handles this.

**Gotcha: Temporal group GC** — Add cleanup in the animation loop or on a timer:

```typescript
// In the useFrame callback or a setInterval:
const now = performance.now();
const GROUP_TTL_MS = 304300; // 4.3s animation + 5min ghost
set(s => ({
  temporalGroups: s.temporalGroups.filter(g => now - g.startTime < GROUP_TTL_MS),
}));
```

### Step C.5: TemporalConnections.tsx

**File:** New file `src/components/visualise/TemporalConnections.tsx`

**Component structure:**

```typescript
import { useFrame } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useMemoryStore } from '@/stores/memory-store';

// Timing constants
const FADE_IN_MS = 500;
const HOLD_MS = 3000;
const FADE_TO_GHOST_MS = 1000;
const GHOST_START_MS = FADE_IN_MS + HOLD_MS + FADE_TO_GHOST_MS; // 4500
const GHOST_OPACITY = 0.15;
const GHOST_DURATION_MS = 300_000; // 5 minutes

// Colors
const TEMPORAL_COLOR = new THREE.Color(1.5, 1.5, 1.5); // white with bloom
const ARC_COLOR = new THREE.Color(0.65, 0.55, 0.98);   // violet with bloom
const TOMBSTONE_FLASH_COLOR = new THREE.Color(1.5, 0.3, 0.3); // red flash

export function TemporalConnections() {
  const groups = useMemoryStore(s => s.temporalGroups);
  const atoms = useMemoryStore(s => s.atoms);

  // Build atom position lookup
  const posMap = useMemo(() => {
    const m = new Map<string, [number, number, number]>();
    for (const a of atoms) m.set(a.key, a.position);
    return m;
  }, [atoms]);

  // For each group, compute line pairs
  // ≤5 atoms: complete graph (all pairs)
  // >5 atoms: sequential chain
  // Plus: trained arcs as separate purple lines

  // useFrame: compute opacity per group based on elapsed time
  // Phase 1 (0–500ms): fade in from 0 to 1
  // Phase 2 (500–3500ms): hold at 1
  // Phase 3 (3500–4500ms): fade to GHOST_OPACITY
  // Phase 4 (4500ms–5min): linear decay from GHOST_OPACITY to 0

  return (
    <>
      {/* White temporal lines */}
      {/* Purple trained arc arrows */}
      {/* Red tombstone flash lines */}
    </>
  );
}
```

**Rendering approach:** Use `<line>` with `<bufferGeometry>` and `<lineBasicMaterial>` per group. Set material opacity per-frame. For bloom, set `toneMapped={false}` and use color values > 1.0.

**Trained arcs:** Render as separate lines with the violet/purple color. Animate them with a delay (start at t=800ms, cascade 100ms per hop along the sequence).

**Arrow direction for trained arcs:** Use a small cone mesh at the midpoint of each arc segment, oriented along the line direction. Or use a custom shader with dashed lines where the dash pattern moves in the direction of flow.

**Performance:** Groups are short-lived (max 5 min). At most ~10 groups active simultaneously (one per recent commit). Each group has ≤10 atoms. Total line count is tiny — no performance concern.

### Step C.6: ChangesetAudio.ts

**File:** New file `src/components/visualise/ChangesetAudio.ts`

```typescript
import * as Tone from 'tone';

let synth: Tone.PolySynth | null = null;

function ensureSynth(): Tone.PolySynth {
  if (!synth) {
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0, release: 0.5 },
      volume: -20, // Quiet — background ambient
    }).toDestination();
  }
  return synth;
}

export function playChangesetChime(addedCount: number, tombstonedCount: number) {
  // Don't play if tab is hidden
  if (document.hidden) return;

  const s = ensureSynth();

  if (tombstonedCount > 0 && addedCount === 0) {
    // Tombstone-only: low, muted tone
    s.triggerAttackRelease('C3', '8n', Tone.now());
  } else if (addedCount <= 2) {
    // Small batch: single bell
    s.triggerAttackRelease('E5', '16n', Tone.now());
  } else if (addedCount <= 5) {
    // Medium batch: two-note chord
    s.triggerAttackRelease(['E5', 'G5'], '16n', Tone.now());
  } else {
    // Large batch: three-note chord
    s.triggerAttackRelease(['E5', 'G5', 'B5'], '16n', Tone.now());
  }
}
```

**Gotcha: Tone.js AudioContext** — The Web Audio API requires user interaction before playing audio. Tone.js handles this with `Tone.start()`. Call `Tone.start()` when the user first clicks anything in the viz (e.g., the sound toggle button, or the first atom click). Without this, audio will be silently blocked.

**Gotcha: Page Visibility API** — `document.hidden` check prevents chimes when the user has the viz in a background tab.

### Step C.7–C.8: MerkleScene + AccessControls updates

**File:** `src/components/visualise/MerkleScene.tsx`

Add:
```typescript
import { TemporalConnections } from './TemporalConnections';

// Inside the Canvas, after AccessPathHighlight:
<TemporalConnections />

// In the component body, call observe() on mount:
useEffect(() => {
  useMemoryStore.getState().observe();
  return () => useMemoryStore.getState().disconnect();
}, []);
```

**File:** `src/components/visualise/AccessControls.tsx`

Add sound toggle button next to "ACCESS RANDOM ATOM":

```tsx
<button
  onClick={() => {
    Tone.start(); // Ensure AudioContext is started
    useMemoryStore.getState().toggleSound();
  }}
  className="..."
>
  {soundEnabled ? '🔊' : '🔇'}
</button>
```

**Gotcha: `Tone.start()` on first click** — Call this in the onClick handler of the sound toggle, not on mount.

---

## Phase D: Search Temporal Connections + Polish (~90 lines)

**Goal:** Search results get the same temporal line treatment. Polish the changeset notification.
**Depends on:** Phase C (TemporalConnections component exists).

### Step D.1: searchAtoms() store action

**File:** `src/stores/memory-store.ts`

```typescript
searchAtoms: async (query: string) => {
  const res = await fetch(`${API_BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit: 20 }),
  });

  if (!res.ok) return;

  const data = await res.json() as SearchResponse;
  const matchedKeys = data.results.map(r => r.atom);

  // Pulse matched atoms
  set(s => ({
    atoms: s.atoms.map(a =>
      matchedKeys.includes(a.key) ? { ...a, pulse: true } : a
    ),
  }));

  // Create temporal group for visual connections
  const group: TemporalGroup = {
    id: crypto.randomUUID(),
    atoms: matchedKeys,
    tombstoned: [],
    source: 'search',
    startTime: performance.now(),
    query,
  };

  set(s => ({
    temporalGroups: [...s.temporalGroups, group],
  }));
},
```

### Step D.2: SearchPanel component

**File:** New file `src/components/visualise/SearchPanel.tsx`

A small search input (bottom-left, complementing the access controls bottom-right):

```tsx
export function SearchPanel() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    await useMemoryStore.getState().searchAtoms(query);
    setSearching(false);
  };

  return (
    <div className="absolute bottom-6 left-6 z-10">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Search atoms..."
          className="rounded-lg border border-slate-700/50 bg-slate-900/80 px-3 py-1.5 font-mono text-xs text-slate-300 backdrop-blur-md placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none"
        />
        <button onClick={handleSearch} disabled={searching} className="...">
          {searching ? '...' : 'SEARCH'}
        </button>
      </div>
    </div>
  );
}
```

### Step D.3: TemporalConnections already handles search groups

No changes needed — the component iterates all `temporalGroups` regardless of source. Search-sourced groups render the same white temporal lines.

### Step D.4: Changeset notification in StatsOverlay

**File:** `src/components/visualise/StatsOverlay.tsx`

When a changeset arrives, show a brief notification banner (top-center, fades after 3s):

```tsx
// Watch for new temporal groups with source === 'changeset'
const latestChangeset = temporalGroups
  .filter(g => g.source === 'changeset')
  .sort((a, b) => b.startTime - a.startTime)[0];

const showBanner = latestChangeset && (performance.now() - latestChangeset.startTime < 3000);

{showBanner && (
  <div className="absolute left-1/2 top-16 -translate-x-1/2 animate-fade-in rounded-lg border border-cyan-500/30 bg-slate-900/90 px-4 py-2 font-mono text-xs text-cyan-400 backdrop-blur-md">
    v{latestChangeset.version}: +{latestChangeset.atoms.length} atoms
    {latestChangeset.tombstoned.length > 0 && `, −${latestChangeset.tombstoned.length} tombstoned`}
  </div>
)}
```

---

## Cross-Phase Checklist

Before marking each phase complete:

- [ ] `npx tsc --noEmit` passes (typecheck)
- [ ] All new tests pass
- [ ] Existing tests still pass (regression)
- [ ] Merkle tree head hash unchanged after all read-only operations (Phase A critical test)
- [ ] No Markov weight changes from visualization activity (Phase A critical test)
- [ ] SSE connection survives nginx proxy (Phase B — test with `X-Accel-Buffering: no`)
- [ ] Sound plays only after user interaction (Phase C — AudioContext policy)
- [ ] Temporal lines render with bloom (Phase C — `toneMapped={false}` on materials)
- [ ] Ghost lines visible at 15% opacity (Phase C — test on dark background)
- [ ] Search temporal lines connect correct atoms (Phase D)
