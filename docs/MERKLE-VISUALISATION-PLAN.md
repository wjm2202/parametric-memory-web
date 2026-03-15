# Merkle Tree Visualisation — Project Plan

**Codename:** Substrate Viewer
**Goal:** A live, interactive 3D visualisation of the MMPM Merkle tree that connects to the memory server, letting users watch the memory "think" in real-time. This is the centrepiece of the commercial website — it must be visually stunning enough to drive enterprise revenue.

**Phased approach:**
1. **Sprints V1–V3 (Web only)** — Proxy-only client mode. No MMPM server changes. Zero substrate risk.
2. **Sprint V4 (Both)** — Add server-side OAuth2 scopes + real-time event streaming.

---

## High-Level Architecture

### Phase 1: Proxy-Only (Sprints V1–V3)

```
┌─────────────────────────┐     ┌──────────────────────────┐
│   parametric-memory.dev │     │     mmpm.co.nz            │
│   (Web Droplet)         │     │     (Memory Droplet)      │
│                         │     │                           │
│  ┌───────────────────┐  │     │                           │
│  │  /visualise page  │  │     │   Server UNCHANGED       │
│  │  Three.js / R3F   │  │     │   No new code paths      │
│  │  3D Merkle Tree   │  │     │   No new auth modes      │
│  │  Chat Panel       │  │     │                           │
│  │  Search Input     │  │     │                           │
│  └────────┬──────────┘  │     │                           │
│           │ fetch()     │     │                           │
│  ┌────────▼──────────┐  │     │                           │
│  │  API proxy routes │  │     │                           │
│  │  /api/memory/*    │──│────▶│  Existing bearer auth     │
│  │                   │  │     │  Read endpoints only      │
│  │  • Rate limited   │  │     │  (proxy never calls       │
│  │  • Bearer in env  │  │◀────│   write endpoints)        │
│  │  • Read-only      │  │     │                           │
│  └───────────────────┘  │     │                           │
│                         │     │                           │
│  Claude (master) ───────│─MCP─│──▶ Full master access     │
│  Normal MCP access      │     │    (unchanged)            │
└─────────────────────────┘     └──────────────────────────┘
```

Polling: viz checks tree-head version every 5s. On change → refetch atoms → update 3D scene.

### Phase 2: Server-Side Client Mode (Sprint V4)

```
┌─────────────────────────┐     ┌──────────────────────────┐
│   parametric-memory.dev │     │     mmpm.co.nz            │
│                         │     │                           │
│  ┌───────────────────┐  │     │  ┌─────────────────────┐  │
│  │  /visualise page  │──│─WSS─│──│  Event Stream (new)  │  │
│  └────────┬──────────┘  │     │  └─────────────────────┘  │
│  ┌────────▼──────────┐  │     │  ┌─────────────────────┐  │
│  │  API proxy routes │──│────▶│──│  OAuth2 scope=read   │  │
│  │  (OAuth2 client)  │  │     │  │  readOnly middleware  │  │
│  └───────────────────┘  │     │  │  Side-effects stripped│  │
│                         │     │  └─────────────────────┘  │
│  Claude (master) ───────│─MCP─│──▶ scope=master (unchanged)│
└─────────────────────────┘     └──────────────────────────┘
```

---

## Endpoint Classification (27 MCP tools audited)

### Proxied by website (10 read-safe endpoints)

| Proxy Route | MMPM Endpoint | Auth | Side Effects |
|-------------|--------------|------|--------------|
| `/api/memory/atoms` | GET /atoms | Bearer | None |
| `/api/memory/atoms/[atom]` | GET /atoms/:atom | Bearer | None |
| `/api/memory/search` | POST /search | Bearer | Minor (metadata) |
| `/api/memory/access` | POST /access | Bearer | Minor (timestamps) |
| `/api/memory/tree-head` | GET /tree-head | None | None |
| `/api/memory/verify` | POST /verify | None | None |
| `/api/memory/verify-consistency` | POST /verify-consistency | None | None |
| `/api/memory/metrics` | GET /metrics | None | None |
| `/api/memory/health` | GET /health | None | None |
| `/api/memory/weights/[atom]` | GET /weights/:atom | Bearer | None |

### Never proxied (write + admin endpoints)

POST /atoms, POST /train, POST /admin/commit, POST /checkpoint, GET /atoms/stale, POST /batch-access, POST /memory/bootstrap, GET /admin/export, GET /admin/audit-log, GET /write-policy, GET /policy, GET /atoms/pending, GET /ready

---

## Web — 3D Merkle Visualisation

### Technology Assessment

We evaluated 11 technologies for the particle-based 3D rendering. Full assessment below, then our chosen stack.

**Options Evaluated:**

| Technology | Visual Quality | Particles @60fps | React Integration | Verdict |
|-----------|---------------|-------------------|-------------------|---------|
| React Three Fiber + TSL | Game-engine | 5000+ | Native | **CHOSEN** |
| Babylon.js | Game-engine | 5000+ | Moderate (no native wrapper) | Good alternative, worse React fit |
| WebGPU Compute Shaders | Unmatched | 1M+ | Via Three.js | **CHOSEN** (for particle physics) |
| WebAssembly (Rust→WASM) | N/A (compute) | 1M+ | Manual integration | Overkill for 500-5000 atoms, add later if needed |
| Unreal Pixel Streaming | Photorealistic | Unlimited | None | Server GPU needed, latency kills interactivity |
| deck.gl | Data-grade | 1M+ | Good | Lacks artistic effects (glow, bloom, trails) |
| PlayCanvas | Game-grade | 5000+ | Poor | Self-contained editor, doesn't embed in Next.js |
| GPU.js | N/A (compute) | 10M | Moderate | Superseded by WebGPU compute in 2026 |
| Regl/TWGL | Raw WebGL | 5000+ | None | Dev time not worth 10-20% perf gain over R3F |
| Unity WebGL Export | Game-engine | Varies | None | 50-200MB bundles, unacceptable for web |

**Why React Three Fiber wins:**
- Native React/Next.js integration (JSX for 3D scenes, hooks for animation)
- InstancedMesh renders all atoms in 1-2 draw calls
- TSL (Three.js Shading Language r160+) auto-compiles to GLSL or WGSL — write once, run on WebGL or WebGPU
- UnrealBloomPass gives us the same bloom effect as Unreal Engine, as a post-processing pass
- WebGPU compute shaders sync pulse animations across all particles simultaneously
- ~300KB gzipped bundle (acceptable)
- Proven at scale: Firefly renders 10M+ particles in-browser, Shopify Live Globe 2025 achieved game-engine quality

**WebGPU status (2026):** Universal browser support — Chrome 113+, Firefox 141+, Safari 26, Edge 113+. Compute shaders deliver 150x performance improvement over CPU for particle physics. 1M particles at 60fps demonstrated in 2025 benchmarks.

**Scaling path:** If we need >5000 particles later (e.g., streaming all atoms across multiple MMPM instances), we add a Rust→WASM physics layer without rewriting the renderer.

### Chosen Tech Stack

| Technology | Purpose |
|-----------|---------|
| React Three Fiber (R3F) | 3D rendering in React/Next.js — declarative JSX scenes |
| @react-three/drei | Pre-built 3D components (bloom, glow, trails, orbit controls) |
| Three.js r160+ (underlying) | WebGL/WebGPU rendering engine |
| TSL (Three.js Shading Language) | Node-based shaders, auto-compiles to GLSL/WGSL |
| Custom GLSL/WGSL shaders | Glowing nodes, particle effects, proof trail animations |
| WebGPU compute shaders | Particle physics — pulse timing, position updates, Markov edge forces |
| InstancedMesh | Renders 5000 atoms in 1-2 draw calls |
| UnrealBloomPass | Post-processing bloom/glow (same tech as Unreal Engine) |
| Zustand | Lightweight state management for tree data + WebSocket events |
| WebSocket (or SSE) | Real-time updates from MMPM event stream |
| Framer Motion | UI animation (panels, overlays, search results) |

### Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [Parametric Memory]              [Docs] [Pricing] [Login]  │
├─────────────────────────────────────┬───────────────────────┤
│                                     │                       │
│        3D MERKLE TREE               │   CHAT / SEARCH       │
│        VISUALISATION                │   PANEL               │
│                                     │                       │
│   ┌─ Shard 0 ─┐  ┌─ Shard 1 ─┐   │   ┌─────────────────┐ │
│   │ ● ● ● ●   │  │ ● ● ● ●   │   │   │ Search atoms... │ │
│   │  ╲ ╱ ╲ ╱  │  │  ╲ ╱ ╲ ╱  │   │   └─────────────────┘ │
│   │   ●   ●   │  │   ●   ●   │   │                       │
│   │    ╲ ╱    │  │    ╲ ╱    │   │   Results:             │
│   │     ●     │  │     ●     │   │   ● v1.fact.web_stack  │
│   └───────────┘  └───────────┘   │   ● v1.fact.deploy_ip  │
│                                     │   ● v1.event.hardened │
│   ┌─ Shard 2 ─┐  ┌─ Shard 3 ─┐   │                       │
│   │ ● ● ● ●   │  │ ● ● ● ●   │   │   [Proof path shown]  │
│   │  ╲ ╱ ╲ ╱  │  │  ╲ ╱ ╲ ╱  │   │   Leaf → Node → Root  │
│   │   ●   ●   │  │   ●   ●   │   │   Hash: 0x7f3a...      │
│   │    ╲ ╱    │  │    ╲ ╱    │   │                       │
│   │     ●     │  │     ●     │   │   Markov edges:        │
│   └───────────┘  └───────────┘   │   → v1.fact.ssl_cert   │
│                                     │   → v1.state.version   │
│   [Stats: 55 atoms | 63 edges |    │                       │
│    4 shards | 12ms avg recall]     │                       │
├─────────────────────────────────────┴───────────────────────┤
│  Metrics bar: atoms accessed/sec | proof verifications | ..  │
└─────────────────────────────────────────────────────────────┘
```

### Visual Design

**Dark theme** (matches existing site). Glowing nodes on a near-black background.

- **Nodes (atoms):** Glowing spheres. Dormant = dim blue. Accessed = bright cyan pulse. Recently written = gold flash.
- **Edges (Merkle proof paths):** Thin lines connecting leaf to root. Light up cyan when a proof is verified.
- **Markov edges:** Dotted lines between atoms showing transition weights. Thicker = stronger association.
- **Shard quadrants:** Four distinct spatial regions, each containing one shard's binary tree.
- **Particle effects:** Subtle floating particles in the background. Burst effect when an atom is accessed.
- **Camera:** Orbit controls. Auto-rotate slowly when idle. Zoom to atom on click.

### Interaction

1. **Search panel:** Type a query → calls `memory_search` via client mode → results light up in the tree
2. **Click an atom:** Shows atom key, value, shard, leaf index, Merkle proof path, Markov neighbours
3. **Auto-recall mode:** Button that triggers random atom lookups every few seconds, making the tree "breathe" with activity
4. **Live mode (Phase 4):** Subscribe to real-time master access events, watch Claude's memory recalls light up as they happen

### API Proxy

The web server proxies memory requests to avoid exposing the MMPM server directly:

```
/api/memory/search   → mmpm.co.nz (client token, read-only)
/api/memory/tree     → mmpm.co.nz (tree_head, no auth needed)
/api/memory/verify   → mmpm.co.nz (verify, no auth needed)
/api/memory/metrics  → mmpm.co.nz (metrics, no auth needed)
/api/memory/access   → mmpm.co.nz (client token, no reinforcement)
```

---

## Sprint Plan

### Sprint V1: API Proxy + 3D Foundation (1 week)

**Project:** Web (parametric-memory.dev)
**Goal:** Proxy-only client mode + basic 3D Merkle tree rendering with real data
**Approach:** No MMPM server changes. Website API proxy exposes read-safe endpoints only.

| Step | Task | Detail |
|------|------|--------|
| 1.1 | Design client mode approach | **DONE** — Proxy-only chosen. See `docs/CLIENT-MODE-SPEC.md`. OAuth2 scopes deferred to V4. |
| 1.2 | Build API proxy routes | Next.js API routes at `/api/memory/*`. Bearer held server-side. Only read-safe endpoints exposed. Rate limiting. |
| 1.3 | Test proxy routes | Verify all 10 proxy routes return data. Verify no write endpoints are reachable. Test rate limiting. |
| 1.4 | Install R3F + dependencies | `npm install @react-three/fiber @react-three/drei three zustand` |
| 1.5 | Create /visualise route | New Next.js page at `src/app/visualise/page.tsx` — dynamic import (no SSR for WebGL). |
| 1.6 | Build tree geometry | Fetch tree_head + atoms_list via proxy. Calculate node positions for 4-shard binary tree layout. |
| 1.7 | Render nodes and edges | InstancedMesh for atoms (leaves). Line segments for Merkle tree edges. Custom glow shader. |
| 1.8 | Add orbit controls + camera | Drei OrbitControls. Auto-rotate when idle. Dark background with ambient particles. |
| 1.9 | Visual polish pass | Node colours by type (fact=blue, state=amber, event=green, procedure=purple). Glow intensity by weight. |
| 1.10 | Polling for updates | Poll tree-head every 5s. If version changes, refetch atoms and update positions. Near-real-time feel. |
| 1.11 | Deploy and verify | Push through CI/CD. Verify at parametric-memory.dev/visualise |

### Sprint V2: Search + Interaction (1 week)

**Project:** Web
**Goal:** Chat panel, search, click-to-inspect, proof path highlighting

| Step | Task | Detail |
|------|------|--------|
| 2.1 | Build chat/search panel | Split-screen layout. Text input at bottom. Results list above. |
| 2.2 | Connect search to proxy API | Type query → POST /api/memory/search → highlight matching atoms in 3D view |
| 2.3 | Proof path animation | Click atom → fetch verify via proxy → animate line from leaf through proof nodes to Merkle root |
| 2.4 | Atom detail overlay | Click atom → show key, value, shard, leaf index, weight, timestamps |
| 2.5 | Markov edge rendering | Fetch weights for selected atom via proxy → draw dotted lines to connected atoms |
| 2.6 | Auto-recall mode | Button that triggers random access every 2-3 seconds. Tree "breathes" with activity. |
| 2.7 | Metrics bar | Bottom bar: atom count, edge count, shards, avg recall time, proofs verified |
| 2.8 | Deploy and verify | Push through CI/CD |

### Sprint V3: Landing Page Integration + Polish (1 week)

**Project:** Web
**Goal:** Smaller viz teaser on landing page, mobile support, visual refinement

| Step | Task | Detail |
|------|------|--------|
| 3.1 | Landing page teaser | Smaller auto-playing visualisation on the main page. Entices visitors to click through to /visualise. |
| 3.2 | Mobile responsive | Simplified view for mobile. Touch controls instead of orbit. Reduced particle count. |
| 3.3 | Performance optimisation | InstancedMesh tuning for 500+ atoms. LOD based on zoom level. |
| 3.4 | Loading states + error handling | Skeleton loader while fetching. Graceful degradation if MMPM unreachable. WebGL fallback if no WebGPU. |
| 3.5 | Particle effects | Subtle floating particles in background. Burst effect when atom accessed. Transition animations. |
| 3.6 | Deploy and verify | Push through CI/CD |

### Sprint V4: Real-Time + Server Client Mode (1 week)

**Project:** Both (MMPM Server + Web)
**Goal:** True real-time streaming, server-side OAuth2 scope enforcement

| Step | Task | Detail |
|------|------|--------|
| 4.1 | Implement OAuth2 read scope on MMPM | Add `scope: "read"` to OAuth2 tokens. readOnly middleware. Strip side-effects. See CLIENT-MODE-SPEC.md Phase 2. |
| 4.2 | Add event stream to MMPM | SSE or WebSocket endpoint. Publishes events when master access/train/commit occurs. |
| 4.3 | Subscribe from visualisation | Connect to event stream. Light up atoms in real-time as Claude accesses them. |
| 4.4 | Switch proxy to OAuth2 client | Replace static bearer with OAuth2 client_credentials flow using read scope. |
| 4.5 | High-frequency rate management | Server-side rate limiting for read scope clients. Backpressure on event stream. |
| 4.6 | Final visual polish | Real-time pulse effects, "neural activity" animations when Claude is actively using memory. |
| 4.7 | Deploy both projects | Memory server first (manual, controlled, full safety protocol). Web second (CI/CD). |

---

## Risk Management

### Memory Server Changes (Highest Risk)

The memory substrate at mmpm.co.nz holds all persistent knowledge. Any server update must:

1. **Backup before deploy:** Record Merkle tree head hash for all 4 shards
2. **Verify after deploy:** Compare head hashes — must match exactly
3. **Run consistency check:** `memory_verify_consistency` on all shards
4. **Count atoms:** `memory_atoms_list` — count must match pre-deploy
5. **Test master mode:** Full bootstrap + access + train cycle — must work identically
6. **Rollback plan:** Keep previous server binary. If anything fails, revert immediately.

The client mode changes are additive — they add a new code path without modifying the existing master path. This minimises risk.

### Web Changes (Lower Risk)

Standard CI/CD pipeline. If the visualisation breaks, it doesn't affect the rest of the site. Can be feature-flagged behind `/visualise` route.

---

## Success Criteria

The visualisation is successful when:
1. Enterprise visitors say "wow" within 3 seconds of loading
2. You can type a concept and watch the memory light up
3. You can see proof paths trace through the Merkle tree
4. The tree "breathes" with real-time activity
5. It demonstrates the value proposition better than any slide deck could
6. It works on desktop Chrome, Firefox, Safari at 60fps
7. Zero impact on memory substrate integrity
