# Knowledge Graph — Sprint Plan

**Created:** 2026-03-22
**Status:** 🟢 Sprint 2 complete — awaiting user verification before Sprint 3
**File:** `SPRINT-KNOWLEDGE-GRAPH.md`

---

## npm Install (run before starting Sprint 1)

```bash
npm install d3-force-3d
```

> That is the only missing dependency. Everything else (`@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, `d3`, `three`) is already installed.

---

## Plan Goal

Build a publicly accessible 3D interactive knowledge graph at `/knowledge` that exposes the semantic intelligence layer of the MMPM memory substrate.

Users search to seed a topic → matching atoms appear as bloom-lit 3D spheres → click any node to expand its Markov connections outward → explore how knowledge links together.

**Constraints locked in:**
- Ego graph loading (search to seed, expand on click — not full load)
- Emergent clusters only (force physics, no explicit halos)
- Public page — no auth gate
- Full custom R3F build — same engine and aesthetic as `/visualise`

---

## Progress Tracker

| Sprint | Goal | Status |
|--------|------|--------|
| Sprint 1 | Scene Foundation & Data Pipeline | ✅ Complete |
| Perf Sprint | Knowledge Graph Performance Hardening (KG-01–16) | ✅ Complete |
| Sprint 2 | Ego Graph Exploration UX | ✅ Complete |
| Sprint 3 | Visual Polish (Substrate Viewer parity) | 🔲 Not started |
| Sprint 4 | Production & Launch | 🔲 Not started |

---

## Sprint 1 — Scene Foundation & Data Pipeline

**Sprint Goal:** The `/knowledge` page exists, connects to MMPM, and renders a working force-directed 3D graph with at least one seeded atom and its immediate Markov neighbours. No polish — correctness is everything.

**Estimated effort:** 4–5 days

---

### Item 1.1 — Page scaffold and public route

- [ ] Create `src/app/knowledge/page.tsx`
- [ ] Create `src/components/knowledge/` directory
- [ ] Match layout pattern from `visualise/page.tsx` (full-screen Canvas, black background, no header/footer)
- [ ] **CRITICAL:** Check `src/middleware.ts` matcher config — explicitly whitelist `/knowledge` as a public route. The auth catch-all likely blocks it by default.

**What must be correct:**
The middleware check almost certainly protects `/knowledge` by default if it has a catch-all auth rule. This is the first thing to verify — open an incognito window and confirm the page is not redirected to login.

**What to avoid:**
Don't copy the Zustand memory-store from the Substrate Viewer. The Knowledge Graph gets its own `knowledge-store.ts`. The two pages share `memory.ts` types but have completely separate state trees.

---

### Item 1.2 — Zustand store: `knowledge-store.ts`

- [ ] Create `src/stores/knowledge-store.ts`
- [ ] State shape:
  ```ts
  nodes: Map<string, KGNode>       // atom name → position + type + label
  edges: KGEdge[]                  // { from, to, weight, effectiveWeight }
  selectedAtom: string | null
  hoveredAtom: string | null
  expandedAtoms: Set<string>       // which atoms have had neighbours fetched
  loadingAtoms: Set<string>        // pending fetch (prevents duplicate requests)
  searchQuery: string
  searchResults: string[]          // atom names from last /search call
  ```
- [ ] `KGNode` carries stable position object (`{ x, y, z }`) that force sim mutates in place
- [ ] `KGNode` interface allows extra properties (`[key: string]: unknown`) for d3-force-3d attachment of `vx`, `vy`, `vz`

**What must be correct:**
Store positions as plain `{ x, y, z }` not `THREE.Vector3` — Zustand's serialization handles plain objects safely. Convert to `THREE.Vector3` at render time. The force sim attaches `vx`, `vy`, `vz` directly onto node objects — your node interface must allow extra properties.

**What to avoid:**
Don't put the force simulation itself in the store. The simulation lives in a component ref. The store holds declarative state; the sim is imperative.

---

### Item 1.3 — API fetch utilities: `knowledge-api.ts`

- [ ] Create `src/lib/knowledge-api.ts`
- [ ] `searchAtoms(query: string): Promise<SearchResult[]>` → `POST /api/memory/search`
- [ ] `fetchAtomDetail(atom: string): Promise<AtomDetailResponse>` → `GET /api/memory/atoms/{atom}`
- [ ] `fetchAtomWeights(atom: string): Promise<WeightsResponse>` → `GET /api/memory/weights/{atom}`
- [ ] **CRITICAL:** Verify `/weights/{atom}` is handled by the existing proxy in `src/app/api/memory/[...path]/route.ts`. Check `DYNAMIC_PREFIXES` in `src/lib/mmpm.ts`. If `weights` is missing from the map, the proxy will 404.

**What must be correct:**
Use `fetchAtomWeights` (not `fetchAtomDetail`) for edges — the weights endpoint returns `effectiveWeight` (decay-adjusted) which the atoms detail endpoint doesn't. Always render `effectiveWeight`, never raw `weight`.

---

### Item 1.4 — Force simulation hook: `useForceGraph.ts`

- [ ] Create `src/components/knowledge/useForceGraph.ts`
- [ ] Use `forceSimulation` from `d3-force-3d`
- [ ] Forces: `forceLink` (edge spring), `forceManyBody` (repulsion), `forceCenter`
- [ ] Link strength: `d => d.effectiveWeight * 2` — higher weight = stronger spring = nodes pulled closer
- [ ] Starting config: `forceLink().distance(30).strength(d => d.effectiveWeight * 2)`
- [ ] Simulation lives in a `useRef` — it is imperative and mutates node positions in place
- [ ] Tick inside `useFrame`: call `simulation.tick()` once per frame until `simulation.alpha() < 0.01`
- [ ] On node add: call `simulation.nodes([...allNodes])`, `simulation.force('link').links([...allEdges])`, then `simulation.alpha(0.5).restart()`

**What must be correct:**
The simulation must run in `useFrame`, not in `setInterval` or `setTimeout`. This is the single most important correctness constraint — if you tick outside the render loop, you'll get React state updates every frame and kill performance.

When adding new nodes after expand, you **must** call `.restart()` — if you forget, new nodes freeze at the origin (0, 0, 0).

---

### Item 1.5 — KnowledgeScene: R3F canvas and base scene

- [ ] Create `src/components/knowledge/KnowledgeScene.tsx`
- [ ] Copy `SceneErrorBoundary` and `Safe` wrapper pattern from `MerkleScene.tsx` exactly
- [ ] Include `OrbitControls` with `enableDamping`
- [ ] Include `Stars` background
- [ ] Include `Effects` component (bloom) — reuse from visualise or create `src/components/knowledge/KnowledgeEffects.tsx`
- [ ] Canvas config: `gl={{ antialias: true, alpha: false }}`, `dpr={[1, 2]}`
- [ ] Camera start position: `[0, 0, 80]`

**What must be correct:**
Bloom threshold must match the Substrate Viewer's settings — atom colours use `BLOOM_BOOST = 2.2` to punch through the bloom threshold. If bloom settings differ, nodes won't glow.

---

## Sprint 2 — Ego Graph Exploration UX

**Sprint Goal:** Full search → seed → expand interaction working end-to-end. Type a topic, see atoms appear, click to expand connections, hover for labels, click to inspect in side panel.

**Estimated effort:** 4–5 days
**Dependency:** Sprint 1 fully complete.

**Post-sprint fix (2026-03-22):** During Sprint 2 implementation, `useAutoSeed()` was removed from `KnowledgeScene.tsx` on the assumption that SearchBar would replace it entirely. This left the graph empty on initial load — users landed on a blank canvas with no visual feedback until they typed a search. Fix applied:
- `useAutoSeed()` restored to `Scene()` — loads all atoms + edges on mount (1 HTTP request ≈ 1s)
- SearchBar behaviour changed from "replace" to "additive" — searches add ego-graph nodes on top of the full graph
- Clear button (`handleReset`) now reloads the full graph after `reset()` rather than leaving a void
- Seeding architecture is now two-layer: auto-seed (baseline full graph) + SearchBar (focused ego-graph overlays)

---

### Item 2.1 — Search bar component

- [ ] Create `src/components/knowledge/SearchBar.tsx`
- [ ] Floating text input overlaid on Canvas (absolute positioned in wrapping div, NOT inside R3F scene)
- [ ] On submit: call `searchAtoms(query)`, take top 5 results, fetch their weights, seed graph store
- [ ] Debounce input: 300ms
- [ ] Seed atom positions: random within sphere radius 15 around origin — use `new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 15)`

**What must be correct:**
Seed positions must be randomised within a sphere — **not** all at `[0, 0, 0]`. If all start at origin they'll explode outward chaotically when the sim starts.

**What to avoid:**
Don't seed more than 5 atoms from a search. Fetching 20 atoms' transitions in parallel = 20 simultaneous API calls on every keystroke.

---

### Item 2.2 — GraphNodes: instanced sphere rendering

- [ ] Create `src/components/knowledge/GraphNodes.tsx`
- [ ] `InstancedMesh` with `SphereGeometry(0.3, 16, 16)` and `MeshBasicMaterial({ toneMapped: false })`
- [ ] Pre-allocate `MAX_INSTANCES = 512`
- [ ] Colour by atom type using `TYPE_COLORS` (with `BLOOM_BOOST = 2.2`, same as Substrate Viewer)
- [ ] Hover colour: white. Select colour: `#f0abfc`
- [ ] Set `mesh.count = activeNodeCount` each frame — GPU only draws active instances
- [ ] Read positions from force sim node objects directly in `useFrame` — not from Zustand

**What must be correct:**
`mesh.setMatrixAt` belongs in `useFrame`, not in `useMemo`. Positions change every frame as the sim runs — the matrix updates must match.

---

### Item 2.3 — GraphEdges: Markov arc rendering

- [ ] Create `src/components/knowledge/GraphEdges.tsx`
- [ ] `LineSegments` with pre-allocated `BufferGeometry` position buffer (`MAX_INSTANCES * 2 * 3` floats)
- [ ] Base colour: `#7c3aed` (violet — same as Substrate Viewer Markov arcs)
- [ ] Opacity encoding: `0.2 + effectiveWeight * 0.6`, clamped to `0.9` (WebGL line width capped at 1px on most GPUs — use opacity for weight encoding instead)
- [ ] Set `geometry.attributes.position.needsUpdate = true` every frame
- [ ] Preserve edge directionality: store as `{ from, to }` always in Markov direction (the atom with the trained transition → the atom it predicts)

**What must be correct:**
The position buffer must be updated in-place — **never** rebuild the `BufferGeometry` from scratch each frame. That causes GC pressure that tanks frame rate.

Directionality matters — preserve `from → to` now even though lines don't show arrowheads yet. Sprint 3 arc particles depend on this direction being correct.

---

### Item 2.4 — Click to expand neighbours

- [ ] On node click, check `!expandedAtoms.has(atomName)` before fetching
- [ ] Add placeholder node immediately with `status: 'loading'` (don't wait for fetch)
- [ ] Call `fetchAtomWeights(atomName)`, take all `outgoingTransitions`
- [ ] Add new atoms to store with positions seeded near clicked node (radius 8 from clicked node's current sim position)
- [ ] Add new edges to store
- [ ] Mark atom as `expandedAtoms.add(atomName)`
- [ ] Restart sim: `simulation.alpha(0.4).restart()`
- [ ] **Guard:** if `nodes.size > 150`, show toast and block further expansion

**What must be correct:**
New node positions must be seeded **near the clicked node**, not at origin. Read the clicked node's current `.x`, `.y`, `.z` from the sim and offset randomly. The visual effect: new nodes emerge from the clicked node rather than flying in from outside.

---

### Item 2.5 — Hover labels with drei `<Text>`

- [ ] On hover, render single `<Text>` label from `@react-three/drei` above hovered node
- [ ] Label text: short form of atom name — strip `v1.<type>.` prefix (e.g. `v1.fact.deploy_strategy` → `deploy_strategy`)
- [ ] Config: `fontSize={1.2}`, `anchorY="bottom"`, position at `[node.x, node.y + 1.2, node.z]`
- [ ] Wrap in `<Suspense>` — `<Text>` loads a font atlas async
- [ ] Only render **one** label at a time (the hovered atom)

**What to avoid:**
Never render 50 `<Text>` instances simultaneously — kills performance. One label at a time, triggered by hover state.

---

### Item 2.6 — Side panel: atom detail on select

- [ ] Slide-in panel (absolute, right side) triggered by `selectedAtom`
- [ ] Show: full atom name, type badge, creation date (from `createdAtMs`), all `outgoingTransitions` ranked table (`atom → effectiveWeight`), `dominantNext` highlighted
- [ ] Fetch full `AtomDetailResponse` on select (not just weights — need `contradiction`, `proof`, `status`)
- [ ] Cache result in store — re-clicking same node must not re-fetch
- [ ] Close button + click Canvas background (no node) closes panel

---

## Sprint 3 — Visual Polish (Substrate Viewer Parity)

**Sprint Goal:** The knowledge graph looks and feels identical in quality to the Substrate Viewer. Bloom, animated arc particles, weighted edge colour encoding, camera animates on expand.

**Estimated effort:** 3–4 days

---

### Item 3.1 — Animated arc flow particles

- [ ] Create `src/components/knowledge/ArcParticles.tsx`
- [ ] Particles travel along each edge from source → destination atom
- [ ] Reuse particle-on-a-path pattern from `RingParticleFlow.tsx` or `TrainParticles.tsx`
- [ ] 1–3 particles per edge with staggered offsets
- [ ] Particle speed proportional to `effectiveWeight`
- [ ] Use `InstancedMesh` — not individual meshes
- [ ] Direction: **always from the atom with the trained transition toward the predicted atom** (Markov direction)

**What must be correct:**
Particle direction is the key visual differentiator from the Substrate Viewer's undirected hash edges. A → B means "A predicts B" — this must be immediately readable. Double-check edge `{ from, to }` directionality from Item 2.3.

---

### Item 3.2 — Camera animation on expand

- [ ] Replace `OrbitControls` with `CameraControls` from `@react-three/drei`
- [ ] On expand: animate camera to frame clicked node + new neighbours using `fitToSphere()`
- [ ] Animation duration: 800ms, easing: `easeInOutCubic`
- [ ] Skip camera animation if new nodes are already in viewport

**What must be correct:**
`CameraControls` has a different API than `OrbitControls` — it requires a ref and imperative calls. Check drei v10 docs specifically. Don't assume the OrbitControls API applies.

---

### Item 3.3 — Edge weight colour encoding

- [ ] Dual encoding: opacity + colour shift
  - Weak (`effectiveWeight < 0.3`): dim violet `#7c3aed`, 20% opacity
  - Medium: full violet, 50% opacity
  - Strong (`effectiveWeight > 0.7`): lerp toward cyan `#22d3ee`, 80% opacity
- [ ] Colour interpolation using `THREE.Color.lerp()` — runs in typed array update each frame, not in `useMemo`

---

### Item 3.4 — Loading and empty states

- [ ] **Empty state:** pulsing sphere at origin + overlay text: "Search to explore your memory substrate"
- [ ] **Loading state:** node pulses (scale oscillation in `useFrame`) while in `loadingAtoms` set — same `PULSE_SCALE` pattern as `AtomNodes.tsx`
- [ ] **Error state:** node turns red if fetch fails, re-clickable to retry

**What must be correct:**
Loading pulse uses scale oscillation in `useFrame`, not CSS animations. CSS animations don't work inside the R3F scene.

---

## Sprint 4 — Production & Launch

**Sprint Goal:** Deep-linkable, filterable, performant at 150+ nodes, linked from nav, deployed and publicly accessible.

**Estimated effort:** 2–3 days

---

### Item 4.1 — URL deep-link: seed param

- [ ] `?seed=v1.fact.xxx` in URL auto-seeds graph on mount
- [ ] Use `useSearchParams()` from Next.js App Router
- [ ] Wrap component reading search params in `<Suspense>` — **required** in App Router or build fails
- [ ] "Share" button copies current URL with selected atom as `?seed=` param

---

### Item 4.2 — Atom type filter panel

- [ ] Floating panel (top-left, matching `StatsOverlay` style)
- [ ] Toggle buttons for each type: `fact`, `state`, `event`, `relation`, `procedure`
- [ ] Hidden nodes: set instance scale to `[0, 0, 0]` — **do not remove from force sim** (removing restarts physics)

---

### Item 4.3 — Performance: culling and LOD

- [ ] Nodes > 120 units from camera: suppress labels, reduce sphere LOD
- [ ] Nodes > 200 units: hide entirely (scale `[0, 0, 0]`)
- [ ] Distance checks in `useFrame` using `useThree()` camera position — read camera from Three.js state, not Zustand

---

### Item 4.4 — Navigation links

- [ ] Add "Knowledge Graph" link to main nav wherever `/visualise` appears
- [ ] Button on Substrate Viewer page: "View Knowledge Graph →" → `/knowledge`
- [ ] Button on Knowledge Graph page: "View Substrate →" → `/visualise`

---

### Item 4.5 — Deploy and smoke test

- [ ] Run CI/CD pipeline (`cicd-web-deploy` skill)
- [ ] Smoke test: open `/knowledge` in incognito — confirm no redirect to login
- [ ] Smoke test: search for a topic — confirm atoms load and graph renders
- [ ] Smoke test: click a node — confirm expansion works against production MMPM endpoint
- [ ] Lighthouse performance check — target > 80 on desktop

---

## Critical Risks (check before each sprint)

| Risk | Where | What to verify |
|------|--------|----------------|
| Middleware blocks `/knowledge` | Sprint 1.1 | Check `src/middleware.ts` matcher — explicitly whitelist `/knowledge` |
| `/weights` not in proxy ROUTE_MAP | Sprint 1.3 | Check `DYNAMIC_PREFIXES` in `src/lib/mmpm.ts` — add `weights` if missing |
| Force sim ticked outside `useFrame` | Sprint 1.4 | Must use `useFrame`, never `setInterval`/`setTimeout` |
| New nodes spawned at origin | Sprint 2.4 | Must seed near clicked node's current position, not `[0,0,0]` |
| `useSearchParams()` without Suspense | Sprint 4.1 | App Router requires Suspense boundary — build will error without it |
| Rebuilding BufferGeometry each frame | Sprint 2.3 | Update typed array in-place, set `needsUpdate = true` |

---

## Architecture Notes

### Data flow
```
MMPM Server
    ↓
/api/memory/[...path] proxy (existing)
    ↓
knowledge-api.ts (searchAtoms, fetchAtomWeights, fetchAtomDetail)
    ↓
knowledge-store.ts (Zustand — nodes, edges, selection state)
    ↓
useForceGraph.ts (d3-force-3d simulation, ticks in useFrame)
    ↓
KnowledgeScene → GraphNodes + GraphEdges + ArcParticles
```

### File structure (new files only)
```
src/
  app/
    knowledge/
      page.tsx                    ← public page, no auth
  components/
    knowledge/
      KnowledgeScene.tsx          ← R3F Canvas root
      KnowledgeEffects.tsx        ← bloom + postprocessing
      GraphNodes.tsx              ← InstancedMesh spheres
      GraphEdges.tsx              ← LineSegments arcs
      ArcParticles.tsx            ← directional flow particles (Sprint 3)
      SearchBar.tsx               ← floating search input
      SidePanel.tsx               ← atom detail panel
      useForceGraph.ts            ← d3-force-3d simulation hook
  stores/
    knowledge-store.ts            ← Zustand store
  lib/
    knowledge-api.ts              ← MMPM fetch utilities
```

### Substrate Viewer vs Knowledge Graph
| | Substrate Viewer `/visualise` | Knowledge Graph `/knowledge` |
|---|---|---|
| Shows | Merkle tree (storage / cryptographic) | Markov graph (intelligence / semantic) |
| Layout | Fixed quadrant grid (4 shards) | Force-directed 3D physics |
| Edges | Merkle proof paths + Markov arcs | Markov arcs only, weighted |
| Clusters | Pre-defined (shard 0–3) | Emergent from force physics |
| Auth | Required | Public |
| Primary question | "Is this memory cryptographically sound?" | "What does this system know, and how is it connected?" |
