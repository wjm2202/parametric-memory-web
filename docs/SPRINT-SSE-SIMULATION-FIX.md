# Sprint: SSE Simulation Pipeline Fix

**Goal:** Every MCP tool that mutates memory produces a visible animation on the Substrate Viewer. The SSE pipeline delivers events reliably with zero connection leaks.

**Date:** 2026-03-17
**Discovered by:** Live diagnostic session — ran each MCP tool and observed simulation response.

---

## Findings from diagnostic session

| MCP Tool | SSE Event | Animation | Result |
|---|---|---|---|
| `memory_atoms_add` | None (buffered) | None expected | **PASS** |
| `memory_commit` | `"commit"` expected | Cyan add cascade | **FAIL — server never emits commit event** |
| `memory_access` | `"access"` | Yellow edge glow + ring glow | **PASS** |
| `memory_batch_access` | `"access"` | Multi-edge yellow glow + ring glow | **PASS** |
| `session_checkpoint` (add) | `"commit"` expected | Cyan add cascade | **FAIL — no commit event** |
| `session_checkpoint` (tombstone) | `"commit"` expected | Pink tombstone cascade | **FAIL — no commit event** |
| `session_checkpoint` (train) | `"commit"` expected | Indigo train arcs | **FAIL — no commit event** |
| `memory_train` + `memory_commit` | `"commit"` expected | Indigo train arcs | **FAIL — no commit event** |

**Additional finding:** SSE client count showed 44 when only 2-3 real clients exist. Cause: proxy route has no AbortController — upstream fetch survives browser disconnect.

---

## Three bugs, ordered by dependency

1. **SSE proxy connection leak** (website) — fix first, otherwise testing creates phantom connections
2. **Missing commit SSE broadcast** (MMPM server) — the core blocker for 5 of 8 animation types
3. **Store handler separation of concerns** (website) — clean up the 125-line mixed handler

---

## Step 1: Fix SSE proxy connection leak

**File:** `src/app/api/memory/events/route.ts`
**What:** Add AbortController so upstream fetch closes when browser disconnects
**Why:** Every page refresh creates a phantom SSE connection that never closes. After a testing session, dozens of ghost connections accumulate. This inflates client count and wastes server resources.
**Achieves:** Accurate client count. Clean connection lifecycle. Reliable testing baseline for subsequent steps.

### Change

The current proxy pipes `upstream.body` directly to the response with the comment `// No AbortSignal — SSE connections are long-lived`. That's the bug. Long-lived doesn't mean immortal — when the browser closes the downstream connection, the proxy must abort the upstream fetch.

Next.js edge/node routes receive a `request.signal` that aborts when the client disconnects. Pass it through to the upstream fetch. If not available in this Next.js version, use a `ReadableStream` wrapper that detects cancellation and aborts.

### Test

1. Open `/visualise`, note client count
2. Refresh page 5 times
3. Client count should remain at 1 (not 6)
4. Close tab — count should drop to 0
5. Verify with `curl` to SSE endpoint: open connection, kill curl, confirm upstream closes

### Acceptance

- Client count matches actual open browser tabs (within ±1 for race conditions)
- No phantom connections accumulate across page refreshes
- `memory_health` or server logs show connections opening and closing in pairs

---

## Step 2: Add commit SSE broadcast to MMPM server

**File:** MMPM server source — the commit/flush handler (likely in `mmpm_mcp_http.ts` or persistence layer)
**What:** After atoms are flushed to the Merkle tree, broadcast a `"commit"` event to all connected SSE clients
**Why:** This is the core blocker. The website's commit handler (memory-store.ts lines 1085-1209) is fully built and handles added, tombstoned, and trained arrays. It's just never receiving data because the server never sends it.
**Achieves:** Unlocks add cascade, tombstone cascade, and train arc animations — 3 of 4 animation types that currently don't work.

### Change

In the server's commit path, after the Merkle tree is updated:

```
Broadcast to all SSE clients:
  event: commit
  data: {
    "version": <new tree version>,
    "root": "<new root hash>",
    "timestamp": <commit timestamp ms>,
    "added": [
      { "key": "v1.fact.foo", "shard": 2, "index": 47, "hash": "abc..." },
      ...
    ],
    "tombstoned": ["v1.state.old_thing", ...],
    "trained": [["atom_a", "atom_b", "atom_c"], ...]
  }
```

Requirements for the `added` array:
- Must include enriched objects with `key`, `shard`, `index`, `hash` — not just plain strings
- The website falls back to FNV-1a shard guessing for plain strings, but enriched payloads give accurate positioning and skip the layout worker race

Requirements for `tombstoned`:
- Array of atom key strings that were tombstoned in this commit

Requirements for `trained`:
- Array of arrays — each inner array is an ordered Markov sequence that was trained
- The website's TrainParticles component draws bezier arcs between atoms in sequence order

### Test — repeat the diagnostic session

Run each tool one at a time. After each, ask the user what they saw.

**Test 2a: `memory_atoms_add` → `memory_commit`**
- Add 2 atoms, then commit
- **Expected:** Cyan particles descend from hash ring to leaf positions. Golden rehash wave propagates upward through Merkle tree. Duration ~2200ms.
- Atoms should appear in the correct shard positions

**Test 2b: `session_checkpoint` with tombstone**
- Checkpoint with tombstone array targeting a known atom
- **Expected:** Pink particle descends to atom position. Red rehash wave upward. Atom shrinks/fades. Duration ~2200ms.

**Test 2c: `session_checkpoint` with train**
- Checkpoint with train sequence of 3 atoms
- **Expected:** Indigo sequential halos pulse through atoms in order. Bezier arc lightning connects them. Duration ~1200ms.

**Test 2d: `session_checkpoint` with all three (add + tombstone + train)**
- Single checkpoint with atoms, tombstone, and train arrays
- **Expected:** All three animation types fire from one commit event. Add cascade, tombstone cascade, and train arcs all visible simultaneously.

### Acceptance

- Tree version increments on each commit (verify with `memory_tree_head`)
- SSE listener in browser receives `"commit"` event with correct payload shape
- All three animation types (add, tombstone, train) visually confirmed on `/visualise`
- Existing "access" animations still work (regression check)

---

## Step 3: Separate concerns in store SSE handler

**File:** `src/stores/memory-store.ts` — the `es.addEventListener("commit", ...)` handler (lines 1085-1209)
**What:** Extract the 125-line commit handler into a thin event parser + command buffer pattern
**Why:** The handler currently does 5 jobs in one function: parse JSON, create VisualAtom objects, compute tree positions inline, manage the atoms array, schedule layout workers, AND queue animations. This makes it hard to test, debug, and extend. The inline position computation (lines 1119-1125) also races with the layout worker — positions are computed twice.
**Achieves:** Clean separation. Each concern is testable in isolation. Adding new event types (search, bootstrap) won't further bloat the handler.

### Change

Split into three layers:

**Layer 1: Event parser (thin, ~15 lines)**
Receives raw SSE event. Parses JSON. Pushes a typed command to a command buffer. Nothing else.

```typescript
type SimCommand =
  | { type: "atoms-added"; atoms: EnrichedAtom[] }
  | { type: "atoms-tombstoned"; keys: string[] }
  | { type: "sequences-trained"; sequences: string[][] }
  | { type: "atoms-accessed"; keys: string[] }
  | { type: "tree-updated"; version: number; root: string };
```

**Layer 2: State updater (~40 lines)**
Drains command buffer. Updates `atoms[]`, `atomMap`, `treeVersion`, `treeHead`. Schedules layout worker if atoms changed. Does NOT compute positions inline — let the layout worker own positioning. Does NOT queue animations.

**Layer 3: Animation dispatcher (~20 lines)**
Reads commands and pushes to `sseAnimations[]` queue. The ThreeJS components continue consuming this queue per-frame exactly as they do now. No changes to rendering layer.

### Why remove inline position computation

Currently when a commit adds atoms, the handler computes approximate BFS positions inline (lines 1119-1125) so the animation components can target those positions immediately. Then the layout worker recomputes and overwrites ~150ms later.

Instead: new atoms get a `pending` flag. The animation components already handle the "atom appears" animation — they can use the shard's ring position as the starting point and animate to the final position once the worker responds. This removes the duplicated math and the race condition.

### Test

1. Fire `session_checkpoint` with 2 new atoms + 1 train sequence
2. Verify atoms appear in correct shard positions (not at [0,0,0])
3. Verify add cascade animation plays
4. Verify train arc animation plays
5. Verify no console errors about missing positions or undefined atoms
6. Fire `memory_access` — verify yellow glow still works (regression)
7. Check `memory_batch_access` — multi-atom access still works

### Acceptance

- Commit handler is under 20 lines
- State update logic is in a separate function, unit-testable
- Animation dispatch is in a separate function, unit-testable
- No inline position computation in the event handler
- All 4 animation types work identically to pre-refactor
- No performance regression (measure frame time before/after)

---

## Step 4: Verify all MCP tools end-to-end

**What:** Re-run the exact diagnostic test sequence from the discovery session
**Why:** Proves all bugs are fixed and all animations work
**Achieves:** Confidence that the full pipeline works: MCP tool → MMPM server mutation → SSE broadcast → website proxy → browser EventSource → store → animation queue → ThreeJS render

### Test sequence

| # | Action | Expected Animation | Expected SSE Event |
|---|---|---|---|
| 1 | `memory_atoms_add` (2 atoms) | Nothing | None |
| 2 | `memory_commit` | Cyan add cascade ×2 + golden rehash | `"commit"` with 2 added |
| 3 | `memory_access` (1 atom) | Yellow edge glow + ring glow | `"access"` with 1 atom |
| 4 | `memory_batch_access` (3 atoms) | Yellow glow ×3 + ring glow | `"access"` with 3 atoms |
| 5 | `session_checkpoint` (add 1 + train 3-seq) | Cyan cascade + indigo train arcs | `"commit"` with added + trained |
| 6 | `session_checkpoint` (tombstone 1) | Pink cascade + atom shrink | `"commit"` with tombstoned |
| 7 | Verify client count | Should show 1-3, not 40+ | `"clients"` event accurate |

Each test: run tool, ask user what they saw, compare against expected.

### Acceptance

- All 7 tests pass
- Client count is accurate
- No console errors
- No phantom SSE connections after page refresh

---

## Out of scope (future sprint)

- Add SSE events for `memory_search` and `memory_session_bootstrap` (new event types + new animation components)
- Server-side Phase 2 OAuth scope enforcement (read vs master)
- Tombstone URL encoding bug (atom keys with `= value` suffix fail DELETE route)
