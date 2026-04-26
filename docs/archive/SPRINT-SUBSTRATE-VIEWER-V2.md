# Sprint: Substrate Viewer V2 — Animations & Bug Fixes

**Created:** 2026-03-16
**Status:** Complete — ready to deploy
**Completed:** 2026-03-16
**Deploy target:** parametric-memory.dev (web only — no memory server changes)

## Bug Fixes (Must-do)

### Bug 1: InstancedMesh recreated on atom count change
- **Files:** `AtomNodes.tsx` line 238, `TreePlaceholders.tsx` line 124
- **Root cause:** `args={[undefined, undefined, atoms.length]}` — when atom count changes via SSE, React destroys and recreates the entire WebGL InstancedMesh
- **Fix:** Pre-allocate fixed capacity (MAX_ATOMS = 2048), use setDrawRange or scale-0 for unused slots. Args prop never changes.

### Bug 2: New SSE atoms at [0,0,0] miss animation window
- **Files:** `memory-store.ts` SSE commit handler (line ~1075), `SseEventHighlight.tsx` (line 103)
- **Root cause:** New atoms start at position [0,0,0]. SseEventHighlight skips [0,0,0]. Layout worker takes 200-400ms. Animation line window is 100-500ms. By the time positions arrive, animation is over.
- **Fix:** Compute position inline in SSE commit handler using treeNodePosition(). Enriched payload provides shard+index.

### Bug 3: fetchTree race condition overwrites SSE state
- **File:** `memory-store.ts` line 597
- **Root cause:** 60s safety poll fetches stale version. SSE already advanced treeVersion. `===` check fails, triggering full atom rebuild from stale data. resolvedRef.current already true so positions never re-resolve.
- **Fix:** Change `head.version === currentVersion` to `head.version <= currentVersion`

## Performance Improvements

### P1: Replace atoms.find() with Map lookup
- **Files:** `SseEventHighlight.tsx`, `TrainParticles.tsx`, `AtomNodes.tsx`
- Both SseEventHighlight and TrainParticles do `atoms.find(a => a.key === atomKey)` per atom per animation per frame — O(n) per lookup with 780+ atoms
- Maintain a `Map<string, VisualAtom>` in the store, updated when atoms change

### P2: Reusable Map for atomAnimMap
- **File:** `AtomNodes.tsx` line 93
- Creates `new Map()` every frame at 60fps. Use module-level Map with `.clear()`

## Animation Redesign

### A1: Merkle Rehash Cascade (add/tombstone)
- Replace single line from ring→atom with 4-phase animation:
  - Phase 1 (200ms): Particle routes along hash ring to shard
  - Phase 2 (300ms): Particle descends through Merkle tree to insertion point
  - Phase 3 (400ms): Golden wave travels UPWARD leaf→root (rehash cascade) — the money shot
  - Phase 4 (200ms): Atom settles to type colour
- Tombstone uses same cascade but in pink/red tones, atom desaturates first

### A2: Arc Lightning for Training
- Replace white lines + particle burst with curved bezier arcs between sequence atoms
- Phase 1 (400ms): Atoms in sequence pulse in order [A, B, C]
- Phase 2 (400ms): Curved arcs drawn A→B, B→C (electric blue/violet)
- Phase 3 (200ms): Arcs pulse bright then fade to dim lingering glow

### A3: Markov Prediction Arcs on Access
- SSE access events show compressed proof descent (ring→tree→atom)
- If predictedNext exists, draw faint dashed arc to predicted atom
- On atom select, show top 2-3 predicted next atoms with soft arcs

### A4: Staggered Batch Cascades
- Multi-atom commits: stagger each atom's cascade by 50-100ms
- Overlapping rehash waves create ripple storm through tree
- Final root pulse stronger for batches (atomic commit visualised)

### A5: Ring Particle Flow
- Replace static hash bucket markers with flowing particles around ring
- Particles accelerate near active shard during operations
- Ambient life — ring always feels active

## Future Considerations (not this sprint)
- Consistency proof "tree heartbeat" animation
- Depth of field post-processing
- Ambient occlusion
- Particle trails on accessed paths (hot path visualisation)
- Ambient radial glow beneath the bowl
