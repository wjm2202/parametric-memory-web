# ADR-001: OAuth2 Read Scope, SSE Event Stream, and Temporal Connection Visualisation

**Status:** Proposed
**Date:** 2026-03-15
**Deciders:** Entity One
**Supersedes:** CLIENT-MODE-SPEC.md Phase 2 (refines and extends it)

---

## Context

The Substrate Viewer (3D Merkle visualisation at `/visualise`) is live and working. It renders ~626 atoms across 4 shard trees hanging from a hash ring, with access path animations, tombstoned atom rendering, and interactive detail panels.

Three problems need solving:

### 1. Silent weight corruption

The visualisation calls `POST /batch-access` to resolve atom positions. The MMPM server treats every batch-access call identically to a master access — it fires-and-forgets `storage.put` for `accessCount` and `lastAccessed`, and triggers Markov weight adjustment. Every page load "accesses" all 626 atoms uniformly, inflating weights and degrading the Markov chain's predictive signal. With the current one-shot load this is tolerable noise. With SSE driving continuous re-fetches, it becomes active corruption.

### 2. No live updates

The viz does a one-shot load and goes stale. When Claude (master) writes atoms mid-session, the 3D scene doesn't update until manual refresh. We need SSE so mutations flow to connected viewers in real-time.

### 3. Master credentials on the website

The website proxy currently uses the same `MMPM_API_KEY` bearer that Claude uses for full master access. The proxy never exposes write endpoints, but the credential itself has master scope. If the website token leaks, it grants full write access to memory. We need a properly scoped read-only credential.

---

## Decision

Implement three changes to the MMPM server, consumed by one new feature on the website:

1. **OAuth2 `read` scope** — read-only client credential that strips all side-effects
2. **SSE endpoint** (`GET /events`) — batched mutation stream authenticated with read scope
3. **Temporal connection visualisation** — white lines connecting atoms within a batch, showing they arrived together

The website removes `MMPM_API_KEY` from its env and uses an OAuth2 client credential with `scope: read` instead.

---

## Part 1: OAuth2 Read Scope (Server)

### Design

Extends the existing OAuth2 provider (`/oauth/register`, `/oauth/token`) with scope enforcement.

**Scope definitions:**

| Scope | Access |
|-------|--------|
| `master` | Full access — reads with reinforcement, writes, training, commits. Existing behaviour, unchanged. |
| `read` | Read-only — queries return data but skip ALL side-effects. Write operations return 403. SSE connection allowed. |

**Registration:**

```json
POST /oauth/register
{
  "client_name": "substrate-viewer",
  "scope": "read"
}
```

Returns `client_id` + `client_secret`. These go into the website's `.env.local` (server-side only).

**Token request:**

```
POST /oauth/token
grant_type=client_credentials
&client_id=substrate-viewer-xxxx
&client_secret=xxxx
&scope=read
```

Returns bearer token with `scope: "read"` in claims.

### Enforcement tiers

**BLOCKED (403)** — write operations:

| Endpoint | Reason |
|----------|--------|
| `POST /atoms` | Writes new atoms |
| `POST /train` | Reinforces Markov weights |
| `POST /admin/commit` | Flushes pending to Merkle tree |
| `POST /checkpoint` | Combines write + train + commit |
| `GET /atoms/stale` | Tombstoning pipeline |
| `POST /memory/bootstrap` | Session tracking side-effects |

**STRIPPED (200, skip side-effects)** — reads that normally have side-effects:

| Endpoint | Normal side-effect | Read-scope behaviour |
|----------|-------------------|---------------------|
| `POST /access` | Updates access timestamps, triggers Markov weight adjustment | Returns data, skips `storage.put` for accessCount/lastAccessed, skips weight adjustment |
| `POST /batch-access` | Same as access, in bulk | Returns data, skips all updates |
| `POST /search` | May update access metadata | Returns results, skips metadata updates |

Implementation: auth middleware extracts scope from token, sets `request.readOnly = true`. Each STRIPPED handler passes `{ skipSideEffects: true }` to its core function. The core function already has the `storage.put` call on its fire-and-forget hotpath — wrapping it in `if (!opts?.skipSideEffects)` is ~2 lines per handler.

**PASSTHROUGH (unchanged)** — pure reads with no side-effects:

`GET /tree-head`, `POST /verify`, `POST /verify-consistency`, `GET /metrics`, `GET /health`, `GET /atoms`, `GET /atoms/:name`, `GET /weights/:atom`, `GET /admin/audit-log`, `GET /context`, `GET /pending`

### Key principle: Additive only

No existing code paths change for master tokens. `readOnly` defaults to `false`. All new code is gated behind `if (request.readOnly)`. Master mode is unchanged.

---

## Part 2: SSE Event Stream (Server)

### Endpoint

```
GET /events
Authorization: Bearer <read-scope-token>
Accept: text/event-stream
```

Returns an SSE stream. The server holds an array of open response streams and broadcasts on mutation.

### Event format

Events are **batched per commit**. When `session_checkpoint` (or `commit`) completes, the server emits ONE event containing the full changeset:

```
event: changeset
data: {
  "version": 93,
  "rootHash": "3fb2bf14aa...",
  "timestamp": 1742054400000,
  "added": [
    {
      "key": "v1.fact.new_finding",
      "type": "fact",
      "shard": 2,
      "index": 187,
      "hash": "a1b2c3d4...",
      "status": "active"
    },
    {
      "key": "v1.event.task_completed_dt_2026_03_15",
      "type": "event",
      "shard": 0,
      "index": 158,
      "hash": "e5f6a7b8...",
      "status": "active"
    }
  ],
  "tombstoned": [
    "v1.state.old_task_in_progress"
  ],
  "trained": [
    ["v1.event.started_task", "v1.procedure.run_tests_first", "v1.event.task_completed_dt_2026_03_15"]
  ]
}

```

Additional event types:

```
event: heartbeat
data: {"timestamp": 1742054400000, "version": 93}

event: connected
data: {"version": 93, "atomCount": 628, "clientScope": "read"}
```

### Why batched, not per-atom

A `session_checkpoint` that adds 5 atoms and tombstones 2 emits ONE changeset event. This is critical because:

1. **Atoms in a batch are semantically related** — they were committed together because they belong to the same thought/action/outcome arc
2. **The visualisation needs the batch boundary** to draw temporal connections (Part 3)
3. **Fewer events = less re-rendering** — one layout recalculation per batch, not per atom
4. **The `trained` array shows the Markov arc** that motivated the batch — useful for animating the causal chain

### SSE connection lifecycle

1. Client connects with read-scope bearer
2. Server sends `connected` event with current version + atom count
3. Server sends `heartbeat` every 30 seconds (keep-alive, prevents proxy timeouts)
4. On each `commit`/`checkpoint`, server broadcasts `changeset` to all connected clients
5. Client reconnects automatically on disconnect (EventSource handles this natively)
6. Server tracks connected client count in metrics (`mmpm_sse_clients_connected`)

### Backpressure

If a client falls behind (slow consumer), the server drops older events and sends a `resync` event telling the client to re-fetch the full atom list:

```
event: resync
data: {"reason": "client_behind", "currentVersion": 98, "clientLastVersion": 93}
```

### Implementation (server)

The hook point is the existing `commit()` function in the storage layer. After a successful commit:

```typescript
// In commit handler, after storage.commit() succeeds
const changeset = buildChangeset(pendingAtoms, tombstonedAtoms, trainedArcs, newVersion);
sseManager.broadcast("changeset", changeset);
```

`SSEManager` is a simple class:
- `clients: Map<string, Response>` — open SSE response streams keyed by connection ID
- `addClient(id, res)` / `removeClient(id)` — manages the set
- `broadcast(event, data)` — iterates clients, writes `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
- Heartbeat interval: `setInterval(() => broadcast("heartbeat", ...), 30_000)`

Estimated: ~120 lines for `SSEManager` + route handler + commit hook.

### SSE and readOnly interaction

The SSE endpoint is available to `read` scope tokens. The SSE connection itself:
- Does NOT count as an "access" for any atom (no weight adjustment)
- Does NOT record session tracking
- Is purely passive — data flows server→client only
- Changeset events include full atom metadata (shard, index, hash) so the client doesn't need to call `batch-access` to position new atoms — **zero side-effect risk from SSE-driven updates**

This is the key safety property: **the visualization can stay live-updated forever without ever touching a Markov weight.**

---

## Part 3: Temporal Connection Visualisation (Website)

### Concept

When a batch of atoms arrives (via SSE changeset or multi-result search), the visualization shows:

1. **Each atom's Merkle proof path** — the existing amber cascade animation (leaf → ancestors → root → ring)
2. **White temporal lines** connecting the batch members to each other — showing they were committed/found together

The temporal lines are the new element. They represent the semantic relationship "these atoms were part of the same thought" — distinct from the cryptographic relationship shown by the Merkle proof paths.

### Visual design

**Temporal lines:**
- Color: White (`#ffffff`) with bloom (emissive > 1.0 for glow)
- Opacity: Fade in as batch atoms appear, hold for 3 seconds, fade out over 1 second
- Shape: Straight lines connecting each atom in the batch to every other atom in the batch (complete graph for small batches ≤ 5; for larger batches, connect sequentially: atom₁→atom₂→atom₃→...→atomₙ to avoid visual clutter)
- Width: Thinner than Merkle proof edges (linewidth ~1.5 vs 2.0 for proof paths)
- Z-order: Rendered behind proof paths but in front of the static tree edges

**Animation sequence for an SSE changeset:**

See "Complete Animation Timeline" section below for the full choreography with all three visual layers (amber proof paths, white temporal lines, purple trained arcs) plus audio.

**For tombstoned atoms in the same batch:**
- The tombstoned atom dims (switches to ghost appearance)
- A brief red flash on the temporal line connecting it to the batch (showing "this one died as the others were born")
- No Merkle proof cascade for tombstoned atoms (they're leaving, not being proven)

### Search result temporal connections

The same temporal connection behavior applies when `memory_search` returns multiple atoms. When the user performs a search and gets N results:

1. All matching atoms pulse/highlight in the tree
2. White temporal lines connect them (same visual as SSE batches)
3. A floating label shows "N results for: {query}"

This reuses the same `TemporalGroup` component and animation system.

### Data model

```typescript
/** A group of atoms that arrived or were found together */
interface TemporalGroup {
  /** Unique ID for this group */
  id: string;
  /** Atom keys in this group */
  atoms: string[];
  /** Atom keys tombstoned in this group */
  tombstoned: string[];
  /** Source: SSE changeset or search results */
  source: "changeset" | "search";
  /** When the group was created (performance.now()) */
  startTime: number;
  /** Optional: search query that produced this group */
  query?: string;
  /** Optional: Markov training arcs from this changeset (ordered sequences) */
  trainedArcs?: string[][];
  /** Tree version after this changeset */
  version?: number;
}

/** Ghost lifetime: temporal lines persist as fading ghosts for 5 minutes */
const GHOST_START_MS = 4300;      // when ghost phase begins
const GHOST_DURATION_MS = 300000; // 5 minutes of linear fade
const GHOST_OPACITY = 0.15;       // starting ghost opacity
const GROUP_TTL_MS = GHOST_START_MS + GHOST_DURATION_MS; // total lifetime before GC
```
```

Stored in the Zustand store as `temporalGroups: TemporalGroup[]`. Old groups are garbage-collected after their animation completes (startTime + 5000ms).

### New component: `TemporalConnections.tsx`

R3F component that renders temporal lines for all active groups:

```typescript
// For each group, compute line geometry connecting group atoms
// Small groups (≤5): complete graph (all pairs)
// Large groups (>5): sequential chain (atom₁→atom₂→...→atomₙ)
// Animate opacity: 0 → 1 (500ms) → hold (3000ms) → 0 (1000ms)
// Color: white with bloom
```

### Store changes: `observe()` action

```typescript
observe: () => {
  const eventSource = new EventSource("/api/memory/events");

  eventSource.addEventListener("changeset", (e) => {
    const data = JSON.parse(e.data);

    // Add new atoms to the scene
    for (const added of data.added) {
      // Insert into atoms array with position computed from shard/index
      // No batch-access call needed — changeset includes shard + index
    }

    // Mark tombstoned atoms
    for (const key of data.tombstoned) {
      // Set tombstoned: true on matching VisualAtom
    }

    // Create temporal group for animation
    const group: TemporalGroup = {
      id: crypto.randomUUID(),
      atoms: data.added.map(a => a.key),
      tombstoned: data.tombstoned,
      source: "changeset",
      startTime: performance.now(),
      trainedArcs: data.trained,
      version: data.version,
    };

    set((s) => ({
      temporalGroups: [...s.temporalGroups, group],
    }));

    // Re-layout with new atoms
    requestLayoutDebounced();
  });

  eventSource.addEventListener("resync", () => {
    // Full reload — server says we're behind
    get().fetchTree();
    get().fetchRealPositions();
  });

  return eventSource; // caller can close() to disconnect
}
```

---

## Part 4: Website Proxy Changes

### Remove master key

Delete `MMPM_API_KEY` from website `.env.local`. Replace with:

```env
MMPM_CLIENT_ID=substrate-viewer-xxxx
MMPM_CLIENT_SECRET=xxxx
```

### Token management in `mmpm.ts`

The proxy obtains a read-scope bearer on startup and caches it:

```typescript
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getReadToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const res = await fetch(`${MMPM_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.MMPM_CLIENT_ID!,
      client_secret: process.env.MMPM_CLIENT_SECRET!,
      scope: "read",
    }),
  });

  const { access_token, expires_in } = await res.json();
  cachedToken = access_token;
  tokenExpiresAt = Date.now() + expires_in * 1000;
  return access_token;
}
```

### SSE proxy route

New route: `/api/memory/events/route.ts`

This opens an SSE connection to MMPM and pipes it to the browser. The server-side holds the read-scope bearer; the browser connects to the proxy without any token.

```typescript
// GET /api/memory/events
export async function GET() {
  const token = await getReadToken();

  const upstream = await fetch(`${MMPM_URL}/events`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
  });

  // Pipe upstream SSE to client
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": process.env.CORS_ORIGIN ?? "*",
    },
  });
}
```

---

## Security Considerations

1. **No master credentials on website** — The website only holds a `read` scope client_id/secret. Even if leaked, it cannot write, train, or commit.

2. **SSE is passive** — Data flows server→client only. No atom access is recorded from SSE connections. The Markov chain is completely untouched by any number of connected viewers.

3. **batch-access calls stripped** — If the viz ever needs to call batch-access (e.g., on resync), the read-scope token ensures side-effects are skipped server-side. Defense in depth — even if the proxy code changes, the server enforces read-only.

4. **Independent revocation** — Read client tokens can be revoked without affecting Claude's master access.

5. **Audit trail** — SSE connections and read-scope queries are logged with `clientId: "substrate-viewer"`, distinguishable from master operations.

---

## Implementation Order

### Phase A: Server-side read scope (blocks everything else)

| Step | File | Change | Lines |
|------|------|--------|-------|
| A.1 | Auth middleware | Extract scope from OAuth2 token, set `request.readOnly` | ~20 |
| A.2 | Write handlers | Add 403 guard for readOnly on atoms_add, train, commit, checkpoint | ~15 |
| A.3 | Access handler | Pass `skipSideEffects` when readOnly | ~5 |
| A.4 | Batch-access handler | Pass `skipSideEffects` when readOnly | ~5 |
| A.5 | Search handler | Skip metadata updates when readOnly | ~5 |
| A.6 | Tests | 9 unit tests (see CLIENT-MODE-SPEC.md testing strategy) | ~80 |
| **Subtotal** | | | **~130** |

### Phase B: SSE endpoint (server)

| Step | File | Change | Lines |
|------|------|--------|-------|
| B.1 | `sse-manager.ts` | New file: SSEManager class (client tracking, broadcast, heartbeat) | ~80 |
| B.2 | Route handler | `GET /events` route with auth + SSE headers | ~30 |
| B.3 | Commit hook | After commit, build changeset + broadcast | ~20 |
| B.4 | Checkpoint hook | Same pattern for session_checkpoint | ~10 |
| B.5 | Tests | SSE connection, changeset format, heartbeat, auth | ~60 |
| **Subtotal** | | | **~200** |

### Phase C: Website integration

| Step | File | Change | Lines |
|------|------|--------|-------|
| C.1 | `mmpm.ts` | Replace static bearer with OAuth2 client_credentials flow | ~40 |
| C.2 | `.env.local` | Replace MMPM_API_KEY with CLIENT_ID + CLIENT_SECRET | ~3 |
| C.3 | `/api/memory/events/route.ts` | New SSE proxy route | ~30 |
| C.4 | `memory-store.ts` | Add `observe()` action, `temporalGroups` state, changeset handler, sound toggle | ~100 |
| C.5 | `TemporalConnections.tsx` | New R3F component: white temporal lines + ghost persistence + purple trained arcs | ~160 |
| C.6 | `ChangesetAudio.ts` | Tone.js chime on changeset (pitch varies by batch size, muted when tab hidden) | ~50 |
| C.7 | `MerkleScene.tsx` | Mount TemporalConnections + wire observe() on mount | ~15 |
| C.8 | `AccessControls.tsx` | Add sound toggle button | ~15 |
| C.9 | `StatsOverlay.tsx` | Show changeset notification banner | ~20 |
| **Subtotal** | | | **~433** |

### Phase D: Search temporal connections

| Step | File | Change | Lines |
|------|------|--------|-------|
| D.1 | `memory-store.ts` | `searchAtoms()` action that creates TemporalGroup from results | ~30 |
| D.2 | `SearchPanel.tsx` | New search UI component (or extend AccessControls) | ~60 |
| D.3 | Reuses `TemporalConnections.tsx` | No changes — already handles search-sourced groups | 0 |
| **Subtotal** | | | **~90** |

**Total estimated: ~853 lines across server + website**

---

## Consequences

### What becomes easier

- **Live demos** — show someone the viz while Claude is working, and they see atoms appear in real-time with temporal connections showing the thought process
- **Safe observation** — any number of viewers can watch memory without corrupting the Markov chain
- **Batch semantics are visible** — temporal lines make the "why were these atoms committed together" relationship physically visible in 3D space
- **Search is visual** — search results aren't just a list, they're highlighted and connected in the tree

### What becomes harder

- **Two auth systems** — OAuth2 for website, static bearer for local Claude Desktop (but Claude Desktop stays on local stdio, only Cowork uses OAuth2, which it already does)
- **SSE proxy complexity** — Next.js SSE proxying has edge cases (Vercel doesn't support SSE well, but we self-host so this is fine)
- **Animation timing** — temporal lines + proof paths + ring glow all animating simultaneously needs careful choreography to avoid visual chaos

### What we'll need to revisit

- **Rate limiting on `/events`** — currently unplanned; add if abuse detected
- **SSE connection limit** — cap at ~50 concurrent clients to avoid fd exhaustion on the droplet
- **Temporal lines for very large batches** — if a bulk import adds 100+ atoms, the complete graph is insane; the sequential chain fallback handles this but may need tuning
- **Mobile performance** — temporal line rendering on mobile WebGL needs testing

---

## Resolved Design Decisions

### 1. Trained arc visualisation — YES (purple)

The `trained` arcs in the changeset WILL be visualised. When a changeset includes a `trained` array like `["v1.event.started_task", "v1.procedure.run_tests_first", "v1.event.task_completed"]`, the viz animates directional lines between those atoms in sequence:

- **Color:** Violet/purple (`#a78bfa` — matches procedure atom color) with bloom
- **Shape:** Directional arrows, not bidirectional lines — showing the causal flow (trigger → action → outcome)
- **Timing:** Animate after temporal lines appear (t=800ms), cascade along the arc sequence (100ms per hop)
- **Distinction from temporal lines:** Temporal lines (white) show "committed together." Trained arcs (purple) show "this is the causal chain the Markov engine learned." Different visual meaning, different color.

This means a single changeset can produce three visual layers simultaneously:
1. **Amber** — Merkle proof paths (cryptographic: how each atom is proven in the tree)
2. **White** — Temporal connections (semantic: these atoms were committed together)
3. **Purple** — Trained arcs (causal: this is the workflow that was reinforced)

### 2. Temporal line persistence — LINEAR FADE over 5 minutes

Temporal lines persist as faint ghosts, fading linearly over 5 minutes:

- **t=0–4s:** Full animation cycle (fade in → hold → initial fade to ghost opacity)
- **t=4s–5min:** Ghost mode at 15% opacity, decaying linearly to 0% over 5 minutes
- **Visual:** At ghost opacity, lines are barely visible — a faint web of recent history
- **Implementation:** Each `TemporalGroup` stores its `startTime`. The `TemporalConnections.tsx` component computes opacity per-frame as `Math.max(0, 1 - (elapsed - 4000) / 296000) * 0.15` for the ghost phase
- **Cleanup:** Groups are garbage-collected when opacity reaches 0 (startTime + 300000ms)
- **Benefit:** Someone watching the viz for a few minutes sees a pattern emerge — clusters of related atoms connected by fading webs, with the most recent commits brightest

### 3. Changeset replay — DEFERRED

Timeline slider deferred to a future sprint. The ghost persistence (decision #2) partially addresses the need by keeping recent history visible.

### 4. Sound — ON by default, toggleable

A subtle audio cue when a changeset arrives:

- **Default:** On
- **Toggle:** Button in the viz controls (next to the "ACCESS RANDOM ATOM" button), persisted in localStorage
- **Sound design:** Short, soft chime — think a quiet bell or water drop. Different pitch for different changeset sizes (more atoms = slightly richer chord). Tombstone-only changesets get a lower, more muted tone.
- **Implementation:** Tone.js `Synth` with a short envelope. Play on `changeset` SSE event. Muted when tab is not visible (Page Visibility API).
- **Volume:** Low — background ambient, not notification-loud

---

## Complete Animation Timeline (Single Changeset)

With all four decisions resolved, here is the full choreography for when a `changeset` SSE event arrives with N added atoms, T tombstoned atoms, and a trained arc:

```
t=0ms       Audio chime plays (if enabled)
t=0ms       New atoms appear in tree (scale 0 → 1.0, 300ms ease-out)
t=0ms       Tombstoned atoms dim (switch to ghost appearance, 300ms)
t=150ms     Merkle proof paths cascade for each new atom (amber, leaf → root → ring, 100ms/edge)
t=300ms     Ring glows for each affected shard (cyan)
t=300ms     Temporal lines fade in between all batch members (white, 500ms)
t=300ms     Red flash on temporal lines connecting tombstoned atoms (500ms)
t=800ms     Trained arc arrows animate along causal chain (purple, 100ms/hop)
t=3300ms    Temporal lines begin initial fade (1000ms, from 100% → 15% ghost)
t=4300ms    Proof paths + trained arcs fade out (1000ms)
t=4300ms    Ring glow fades
t=4500ms    Scene returns to normal — temporal ghost lines remain at 15%
t=4500ms–   Ghost lines fade linearly: 15% → 0% over next 5 minutes
  5min
```

---

## Deferred Items

- **Changeset replay / timeline slider** — future sprint
- **Rate limiting on `/events`** — add if abuse detected
- **SSE connection limit** — cap at ~50 concurrent clients
- **Temporal lines for very large batches** — sequential chain fallback may need tuning at scale
- **Mobile WebGL performance** — needs testing
