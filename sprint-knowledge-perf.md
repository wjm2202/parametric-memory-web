# Sprint: Knowledge Graph — Performance Hardening

> Generated from comparative review of `/visualise` (source of truth for R3F patterns) and `/knowledge`.
> All file references are relative to `src/`.

---

## Context

The `/knowledge` page was built after `/visualise` and shares the same R3F/Zustand/d3-force-3d architecture. However several efficiency tricks that were deliberately engineered into `/visualise` were not carried over. This sprint fixes that gap, plus three critical issues found independently. The result should handle 2000+ atom graphs without frame drops or stale GC pressure.

---

## Tricks from `/visualise` NOT in `/knowledge`

Before the tickets, here is the direct comparison of what `/visualise` does that `/knowledge` misses:

| Trick | Visualise file | Knowledge gap | Impact |
|---|---|---|---|
| `useMemo` integer index for hovered/selected (avoids N string compares/frame) | `AtomNodes.tsx:83-96` | `GraphNodes.tsx` does `node.key === hoveredAtom` per-instance in hot loop | High |
| `colorChanged` flag — only uploads to GPU when color actually changed | `AtomNodes.tsx:114,238-247` | `GraphNodes.tsx` calls `instanceColor.needsUpdate = true` unconditionally every frame | Medium |
| `useCallback` on all Three event handlers | `AtomNodes.tsx:250-274` | `GraphNodes.tsx` uses inline arrows — new refs every render | Medium |
| Module-level reusable Map (`_atomAnimMap.clear()` not `new Map()`) | `AtomNodes.tsx:56-59` | `HoverLabel.tsx` does O(n) `.find()` every frame | High |
| `usage={THREE.DynamicDrawUsage}` on dynamic buffer attributes | `PredictionArcs.tsx:189` | `GraphEdges.tsx` buffers have no usage hint — GPU treats as static | Medium |
| `isSettled` ref to short-circuit per-frame work | `useForceGraph.ts` (already in handle) | `GraphNodes` + `GraphEdges` ignore `isSettled` — full update every frame after graph settles | High |
| Pre-shared trig values computed once before per-atom loop | `AtomNodes.tsx:112-113` | Minor — only affects loading-pulse path | Low |

---

## Ticket Breakdown

Tickets are ordered by impact. Each ticket includes: what to change, which file(s), the exact pattern to follow from `/visualise`, and the acceptance criterion.

---

### Ticket KG-01 — `markExpandedBatch`: collapse 833 Zustand updates into 1

**Files:** `stores/knowledge-store.ts`, `components/knowledge/useAutoSeed.ts`
**Priority:** Critical
**Effort:** Small

**Problem:** `useAutoSeed.ts:121` calls `markExpanded(sourceKey)` inside a `for` loop, once per atom. Each call is a full Zustand `set()` that clones the entire `expandedAtoms` Set. For 833 atoms: 833 separate state updates, 832 Set objects immediately eligible for GC.

**Fix:** Add a `markExpandedBatch(keys: string[])` action to the store (mirrors the existing `markLoadingBatch` pattern exactly). Replace the per-atom `markExpanded` call in `useAutoSeed` with a single `markExpandedBatch(atomKeys)` call after the loop.

```
// stores/knowledge-store.ts — new action alongside markLoadingBatch:
markExpandedBatch: (keys) =>
  set((s) => {
    const next = new Set(s.expandedAtoms);
    for (const key of keys) next.add(key);
    return { expandedAtoms: next };
  }),

// useAutoSeed.ts — replace the loop call:
// BEFORE (inside for loop):    markExpanded(sourceKey);
// AFTER  (after loop, once):   markExpandedBatch(atomKeys);
```

**Acceptance:** On load, DevTools React profiler shows ONE re-render for `expandedAtoms` change, not 833.

---

### Ticket KG-02 — HoverLabel: O(n) `.find()` → O(1) module-level Map

**Files:** `components/knowledge/HoverLabel.tsx`
**Priority:** Critical
**Effort:** Small
**Visualise source:** `AtomNodes.tsx:56-59` (`_atomAnimMap` pattern)

**Problem:** `HoverLabel.tsx:41` calls `simNodes.current.find(n => n.key === hoveredAtom)` inside `useFrame`. That's an O(n) linear scan at 60fps = up to 60,000 string comparisons/sec at 1000 nodes.

**Fix:** Add a module-level `_nodeByKey = new Map<string, KGNode>()` in `HoverLabel.tsx`. Rebuild it inside `useFrame` only when node count changes (identical to `nodeIndexRef` logic already in `GraphEdges.tsx`). Replace `.find()` with `.get()`.

```
// module-level (zero GC per frame):
const _nodeByKey = new Map<string, KGNode>();
let _nodeByKeySize = 0;

// inside useFrame:
const nodes = simNodes.current;
if (nodes.length !== _nodeByKeySize) {
  _nodeByKey.clear();
  for (const n of nodes) _nodeByKey.set(n.key, n);
  _nodeByKeySize = nodes.length;
}
const node = _nodeByKey.get(hoveredAtom);  // O(1)
```

**Acceptance:** No `.find()` calls in the hot path. Profiler shows no GC spikes during hover.

---

### Ticket KG-03 — `addEdges`: persistent `edgeKeys` Set (O(k) not O(n) per call)

**Files:** `stores/knowledge-store.ts`
**Priority:** Critical
**Effort:** Medium

**Problem:** `addEdges` at line 227 rebuilds a full Set from the entire `edges` array on every call: `new Set(s.edges.map(e => ...))`. Sprint 2's expand-on-click will call this once per node expansion. At 2000 edges that's 2000 map ops + 2000 Set insertions on every click.

**Fix:** Add `edgeKeys: Set<string>` to the store state, maintained alongside `edges`. Updated atomically inside `addEdges` — never rebuilt from scratch.

```
// state: add edgeKeys: new Set<string>(),

addEdges: (newEdges) =>
  set((s) => {
    const toAdd = newEdges.filter(
      (e) => !s.edgeKeys.has(`${e.source}→${e.target}`)
    );
    if (toAdd.length === 0) return {};
    const nextKeys = new Set(s.edgeKeys);
    for (const e of toAdd) nextKeys.add(`${e.source}→${e.target}`);
    return { edges: [...s.edges, ...toAdd], edgeKeys: nextKeys };
  }),
```

Also update `reset()` to clear `edgeKeys: new Set()`.

**Acceptance:** `addEdges` is O(k) where k = number of new edges in the call, not O(n) total edges.

---

### Ticket KG-04 — GraphNodes: pre-computed integer index for hovered/selected

**Files:** `components/knowledge/GraphNodes.tsx`
**Priority:** High
**Effort:** Small
**Visualise source:** `AtomNodes.tsx:83-96`

**Problem:** The `useFrame` loop does `node.key === hoveredAtom` and `node.key === selectedAtom` per instance (N string compares per frame). Visualise pre-computes these as integer indices using `useMemo`, then uses `i === hoveredIdx` (integer compare) in the hot loop.

**Fix:** Add `selectedIdx` and `hoveredIdx` computed with `useMemo`:

```
const selectedIdx = useMemo(() => {
  if (!selectedAtom) return -1;
  return simNodes.current.findIndex((n) => n.key === selectedAtom);
}, [selectedAtom]);   // note: simNodes.current is a ref, selectedAtom drives the memo

const hoveredIdx = useMemo(() => {
  if (!hoveredAtom) return -1;
  return simNodes.current.findIndex((n) => n.key === hoveredAtom);
}, [hoveredAtom]);
```

Replace string comparisons inside `useFrame` with `i === selectedIdx`, `i === hoveredIdx`.

**Note:** Visualise also pre-computes `loadingAtoms` membership using `useMemo` over an index — for `loadingAtoms` (a Set) a simpler fix is Ticket KG-06.

**Acceptance:** Zero string comparisons for hover/select inside the `useFrame` hot loop.

---

### Ticket KG-05 — GraphNodes: `colorChanged` flag, conditional GPU color upload

**Files:** `components/knowledge/GraphNodes.tsx`
**Priority:** High
**Effort:** Small
**Visualise source:** `AtomNodes.tsx:114, 238-247`

**Problem:** `GraphNodes.tsx:100` calls `mesh.instanceColor.needsUpdate = true` unconditionally every frame. After the graph has settled and no hover/selection is active, no colors are changing — but the GPU still re-uploads the entire color buffer (1024 × 3 floats = 12KB) every frame.

**Fix:** Add a `colorChanged` boolean, set to `true` only when a color assignment changes. Gate the `instanceColor.needsUpdate` on it, exactly as `AtomNodes.tsx` does:

```
let colorChanged = false;

// inside the per-node loop, set colorChanged = true whenever a color is written differently

mesh.instanceMatrix.needsUpdate = true;
if (mesh.instanceColor && (colorChanged || hoveredIdx >= 0 || selectedIdx >= 0)) {
  mesh.instanceColor.needsUpdate = true;
}
```

**Acceptance:** After graph settles with no hover/select: zero `instanceColor.needsUpdate = true` calls per frame.

---

### Ticket KG-06 — GraphNodes: `loadingAtoms` — read via `getState()` in `useFrame`, not selector

**Files:** `components/knowledge/GraphNodes.tsx`
**Priority:** High
**Effort:** Small

**Problem:** `useKnowledgeStore((s) => s.loadingAtoms)` is a React selector. Every time any atom is marked loading/loaded, this causes `GraphNodes` to re-render. During the initial 833-atom seed, the component can re-render many times even though `useFrame` (which actually uses `loadingAtoms`) is unaffected by React renders.

**Fix:** Remove the `loadingAtoms` selector. Read it directly from the store inside `useFrame` using `useKnowledgeStore.getState().loadingAtoms`. This is the same pattern used throughout the codebase for per-frame store reads.

```
// REMOVE: const loadingAtoms = useKnowledgeStore((s) => s.loadingAtoms);

// INSIDE useFrame:
const loadingAtoms = useKnowledgeStore.getState().loadingAtoms;
```

**Acceptance:** `GraphNodes` no longer re-renders on loading state changes. Profiler shows stable render count during seed.

---

### Ticket KG-07 — GraphNodes: wrap event handlers in `useCallback`

**Files:** `components/knowledge/GraphNodes.tsx`
**Priority:** Medium
**Effort:** Trivial
**Visualise source:** `AtomNodes.tsx:250-274`

**Problem:** `handleClick`, `handlePointerOver`, and `handlePointerOut` are inline arrow functions on `GraphNodes`. New function references are created every re-render, causing React to update the event bindings on the `instancedMesh` element.

**Fix:** Wrap all three in `useCallback` with correct dependency arrays, matching the `AtomNodes.tsx` pattern.

```
const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
  e.stopPropagation();
  const node = simNodes.current[e.instanceId ?? -1] as KGNode | undefined;
  if (node) selectAtom(node.key === selectedAtom ? null : node.key);
}, [selectedAtom, selectAtom]);

const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
  e.stopPropagation();
  const node = simNodes.current[e.instanceId ?? -1] as KGNode | undefined;
  if (node) { hoverAtom(node.key); document.body.style.cursor = 'pointer'; }
}, [hoverAtom]);

const handlePointerOut = useCallback(() => {
  hoverAtom(null); document.body.style.cursor = 'auto';
}, [hoverAtom]);
```

**Acceptance:** Event handler references are stable between renders (confirmed via React DevTools "why did this render?").

---

### Ticket KG-08 — GraphEdges: `usage={THREE.DynamicDrawUsage}` on position/color buffers

**Files:** `components/knowledge/GraphEdges.tsx`
**Priority:** Medium
**Effort:** Trivial
**Visualise source:** `PredictionArcs.tsx:189`

**Problem:** `GraphEdges.tsx` pre-allocates its position and color `Float32Array` buffers and updates them in-place every frame while the simulation runs. The `bufferAttribute` elements don't declare `usage`, so WebGL defaults to `STATIC_DRAW`. This causes the GPU driver to assume the data won't change and may not optimize for frequent updates.

**Fix:** Add `usage={THREE.DynamicDrawUsage}` to both `bufferAttribute` elements:

```jsx
<bufferAttribute
  attach="attributes-position"
  args={[positions, 3]}
  count={MAX_EDGES * 2}
  usage={THREE.DynamicDrawUsage}   // ← add
/>
<bufferAttribute
  attach="attributes-color"
  args={[colors, 3]}
  count={MAX_EDGES * 2}
  usage={THREE.DynamicDrawUsage}   // ← add
/>
```

**Acceptance:** Buffer attributes declare `DYNAMIC_DRAW` usage. Verified in the WebGL context's buffer state.

---

### Ticket KG-09 — GraphNodes + GraphEdges: use `isSettled` to skip frame updates

**Files:** `components/knowledge/GraphNodes.tsx`, `components/knowledge/GraphEdges.tsx`
**Priority:** High
**Effort:** Small

**Problem:** `isSettled` is already in `ForceGraphHandle` (and already passed to both components via `handle`), but neither `GraphNodes` nor `GraphEdges` reads it. After the simulation settles (alpha < 0.005), node positions stop changing — but both components still run the full per-instance matrix + color update and GPU upload every frame. This is pure waste.

**Fix:** In both components, check `handle.isSettled.current` at the top of `useFrame`. If settled AND no dynamic state (hover/selection) is active, skip the update. Positions don't change, so there's nothing to upload.

```
// GraphNodes.tsx — inside useFrame:
const settled = handle.isSettled.current;
const hasHover = hoveredIdx >= 0;
const hasSelect = selectedIdx >= 0;
if (settled && !hasHover && !hasSelect && loadingAtoms.size === 0) return;

// GraphEdges.tsx — inside the position-update useFrame:
if (handle.isSettled.current) return;  // positions frozen, no update needed
```

**Note:** GraphEdges can hard-skip when settled (edges don't animate). GraphNodes needs to keep running when hover or selection is active (scale/color changes). The node index rebuild frame in GraphEdges can always skip when settled too.

**Acceptance:** After graph settles: `useFrame` body exits immediately in both components. GPU receives zero buffer uploads per frame at rest.

---

### Ticket KG-10 — GraphEdges: merge two `useFrame` registrations into one

**Files:** `components/knowledge/GraphEdges.tsx`
**Priority:** Medium
**Effort:** Small

**Problem:** `GraphEdges.tsx` registers two separate `useFrame` callbacks — one for rebuilding the node index (line 48) and one for the edge position update (line 68). R3F schedules each `useFrame` registration independently. Two scheduler entries for one component adds overhead and is harder to reason about ordering.

**Fix:** Merge both `useFrame` bodies into a single callback. The index rebuild runs first (same as now), then the edge update. Combined with KG-09's `isSettled` skip, both short-circuit together.

```
useFrame(() => {
  // 1. Rebuild node index if needed
  const nodes = simNodes.current;
  if (nodeIndexRef.current.size !== nodes.length) { /* rebuild */ }

  // 2. Early exit if settled
  if (handle.isSettled.current) return;

  // 3. Edge position + color update
  const geo = geometryRef.current;
  ...
});
```

**Acceptance:** Single `useFrame` registration in `GraphEdges`. No behaviour change.

---

### Ticket KG-11 — GraphEdges: harden d3 link resolution type safety

**Files:** `components/knowledge/GraphEdges.tsx`
**Priority:** Medium
**Effort:** Small

**Problem:** After `sim.nodes()` and `lf.links()` run, d3-force-3d resolves link `source` and `target` from string keys into node object references. The code at lines 82-83 casts `simEdges.current` edges as `KGEdge` and calls `idx.get((edge as KGEdge).source)` — treating `source` as a string. If `simEdges.current` contains d3-resolved edges, `source` is the node object, not its key string, and `idx.get(nodeObject)` returns `undefined` silently.

**Fix:** Normalise the key extraction to be safe regardless of d3's resolution state:

```
function edgeKey(v: string | KGNode): string {
  return typeof v === 'string' ? v : v.key;
}

// inside useFrame:
const si = idx.get(edgeKey((edge as KGEdge).source));
const ti = idx.get(edgeKey((edge as KGEdge).target));
```

**Acceptance:** Edge rendering is stable whether `simEdges.current` holds pre- or post-resolution edges.

---

### Ticket KG-12 — knowledge-store: module-level `_tmpVec3` (eliminate per-node Vector3 allocation)

**Files:** `stores/knowledge-store.ts`
**Priority:** Low
**Effort:** Trivial

**Problem:** `randomPosition()` (line 43) and `nearPosition()` (line 52) each call `new THREE.Vector3()`. For the initial 833-node load that's 833 allocations. For ongoing expand-on-click calls these happen per node added.

**Fix:** Hoist a single module-level temp vector, reused across both functions:

```
const _tmpVec3 = new THREE.Vector3();

export function randomPosition(radius = 80): { x: number; y: number; z: number } {
  _tmpVec3.randomDirection().multiplyScalar(Math.random() * radius);
  return { x: _tmpVec3.x, y: _tmpVec3.y, z: _tmpVec3.z };
}

export function nearPosition(anchor, radius = 5): { x: number; y: number; z: number } {
  _tmpVec3.randomDirection().multiplyScalar(Math.random() * radius);
  return { x: anchor.x + _tmpVec3.x, y: anchor.y + _tmpVec3.y, z: anchor.z + _tmpVec3.z };
}
```

**Acceptance:** Zero `new THREE.Vector3()` calls during graph seeding.

---

### Ticket KG-13 — knowledge-api: HTTP caching for `fetchAtomGraph`

**Files:** `lib/knowledge-api.ts`
**Priority:** Medium
**Effort:** Small

**Problem:** `fetchAtomGraph` uses `cache: 'no-store'`. The atom graph (80-120KB) is re-fetched from the MMPM server on every page load by every visitor. The graph changes only when a checkpoint runs — not per request.

**Fix:** Replace `cache: 'no-store'` with `next: { revalidate: 30 }` (30-second stale-while-revalidate). Users get a cached response after the first request; the cache refreshes in the background. The 30s window is invisible to users but eliminates redundant origin hits at scale.

Keep `cache: 'no-store'` on `fetchAtomWeights`, `fetchAtomDetail`, and `searchAtoms` — those are interactive/user-specific and should stay fresh.

**Acceptance:** Two rapid page loads within 30s result in one HTTP request to MMPM, not two.

---

### Ticket KG-14 — knowledge-api: request timeout on all fetch calls

**Files:** `lib/knowledge-api.ts`
**Priority:** Low
**Effort:** Small

**Problem:** All `fetch` calls have no timeout. If the MMPM server hangs or the network is degraded, the page stays on the loading skeleton indefinitely with no error surfaced.

**Fix:** Add `AbortSignal.timeout(10_000)` (10 seconds) to each call. For `fetchAtomGraph` which already accepts an external signal, combine both using `AbortSignal.any()`:

```
// fetchAtomGraph (has external abort signal):
const timeoutSignal = AbortSignal.timeout(10_000);
const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
const res = await fetch('...', { signal: combined, ... });

// fetchAtomWeights, fetchAtomDetail, searchAtoms:
const res = await fetch('...', { signal: AbortSignal.timeout(10_000), ... });
```

**Acceptance:** A simulated 15s server hang results in an `AbortError` after 10s, not an infinite wait.

---

### Ticket KG-15 — Warn (don't silently clip) when nodes/edges exceed MAX caps

**Files:** `components/knowledge/GraphNodes.tsx`, `components/knowledge/GraphEdges.tsx`
**Priority:** Low
**Effort:** Trivial

**Problem:** Both components silently clip at `MAX_INSTANCES = 1024` (nodes) and `MAX_EDGES = 2048` (edges). When MMPM grows past these thresholds, nodes and edges disappear from the graph with no indication to the developer.

**Fix:** Add a one-time `console.warn` guarded by a module-level flag:

```
// GraphNodes.tsx — module level:
let _warnedNodeCap = false;

// inside useFrame:
if (!_warnedNodeCap && nodes.length > MAX_INSTANCES) {
  _warnedNodeCap = true;
  console.warn(`[GraphNodes] Node count ${nodes.length} exceeds MAX_INSTANCES ${MAX_INSTANCES}. Increase the cap.`);
}
```

Same pattern in `GraphEdges.tsx` for edge count.

**Acceptance:** Exceeding either cap logs a console warning exactly once.

---

### Ticket KG-16 — `cachedDetails` Map: LRU eviction cap (prep for Sprint 2)

**Files:** `stores/knowledge-store.ts`
**Priority:** Low
**Effort:** Small

**Problem:** `cachedDetails` in the store grows unboundedly. Currently fine at 833 atoms (~1-2KB per detail response). Sprint 2 adds a side panel that fetches detail on every selected atom — heavy browsing sessions could accumulate significant memory.

**Fix:** Add an LRU cap of 50 entries to `cacheDetail`:

```
cacheDetail: (key, detail) => {
  set((s) => {
    const next = new Map(s.cachedDetails);
    next.set(key, detail);
    // Evict oldest entry if over cap
    if (next.size > 50) {
      const firstKey = next.keys().next().value;
      next.delete(firstKey);
    }
    return { cachedDetails: next };
  });
},
```

**Acceptance:** `cachedDetails.size` never exceeds 50 regardless of how many atoms are selected.

---

## Sprint Summary

| # | Ticket | File(s) | Priority | Source |
|---|--------|---------|----------|--------|
| KG-01 | `markExpandedBatch` — collapse 833 Zustand updates | `knowledge-store.ts`, `useAutoSeed.ts` | 🔴 Critical | Original review |
| KG-02 | HoverLabel O(1) node lookup (module-level Map) | `HoverLabel.tsx` | 🔴 Critical | `/visualise` `_atomAnimMap` pattern |
| KG-03 | `addEdges` persistent `edgeKeys` Set | `knowledge-store.ts` | 🔴 Critical | Original review |
| KG-04 | Pre-computed `selectedIdx`/`hoveredIdx` in GraphNodes | `GraphNodes.tsx` | 🟠 High | `/visualise` `AtomNodes.tsx:83-96` |
| KG-05 | `colorChanged` flag — conditional GPU color upload | `GraphNodes.tsx` | 🟠 High | `/visualise` `AtomNodes.tsx:238-247` |
| KG-06 | `loadingAtoms` via `getState()` in useFrame | `GraphNodes.tsx` | 🟠 High | Original review |
| KG-07 | `useCallback` on all event handlers | `GraphNodes.tsx` | 🟡 Medium | `/visualise` `AtomNodes.tsx:250-274` |
| KG-08 | `DynamicDrawUsage` on edge buffer attributes | `GraphEdges.tsx` | 🟡 Medium | `/visualise` `PredictionArcs.tsx:189` |
| KG-09 | `isSettled` to skip frame updates in GraphNodes + GraphEdges | `GraphNodes.tsx`, `GraphEdges.tsx` | 🟠 High | Original review |
| KG-10 | Merge two `useFrame` registrations in GraphEdges | `GraphEdges.tsx` | 🟡 Medium | Original review |
| KG-11 | Harden d3 link resolution type safety | `GraphEdges.tsx` | 🟡 Medium | Original review |
| KG-12 | Module-level `_tmpVec3` (no per-node allocation) | `knowledge-store.ts` | 🔵 Low | Original review |
| KG-13 | HTTP caching for `fetchAtomGraph` | `knowledge-api.ts` | 🟡 Medium | Original review |
| KG-14 | Request timeout on all API fetch calls | `knowledge-api.ts` | 🔵 Low | Original review |
| KG-15 | Warn on MAX_INSTANCES / MAX_EDGES cap exceeded | `GraphNodes.tsx`, `GraphEdges.tsx` | 🔵 Low | Original review |
| KG-16 | `cachedDetails` LRU eviction cap (50 entries) | `knowledge-store.ts` | 🔵 Low | Original review |

**Suggested sequencing:**
Week 1 — KG-01, KG-02, KG-03 (the three criticals — biggest combined impact, independent of each other)
Week 1 — KG-04, KG-05, KG-06, KG-09 (four high-priority frame loop fixes — do together since they touch the same files)
Week 2 — KG-07, KG-08, KG-10, KG-11 (medium — same files, natural batching)
Week 2 — KG-12, KG-13, KG-14, KG-15, KG-16 (low — cleanup, each trivial)
