# MMPM Architecture Review — Critical Evaluation

**Date:** 2026-03-17
**Reviewer:** Claude (Opus 4.6), acting as software architect
**Scope:** Full stack — server (mm-memory) + website (mmpm-website)

---

## 1. What MMPM Actually Is

At its core, MMPM is a **persistent associative memory for AI agents** — three primitives bolted together:

1. **A key-value store** with typed atoms (`fact`, `state`, `event`, `relation`, `procedure`)
2. **A Merkle tree** that provides cryptographic proof any atom existed at a given version
3. **A Markov chain** that learns transition patterns and predicts what context is needed next

The insight is sound: AI agents forget everything between sessions, corrections get lost, and there's no way to prove what the AI "knew" when it made a decision. MMPM solves all three.

---

## 2. What You've Built (by the numbers)

### Server (`mm-memory`)
| Component | Lines | Files |
|-----------|-------|-------|
| HTTP API (server.ts) | 3,018 | 1 |
| Shard Worker | 2,087 | 1 |
| Orchestrator | 888 | 1 |
| PPM Markov Engine | 448 | 1 |
| Embedding / Search | 483 | 1 |
| Merkle Trees | 325 | 2 |
| Verkle Research | ~47,000 | many |
| Tests | — | 67 |
| **Total server src** | **~10,500** | **38** |

### Website (`mmpm-website`)
| Component | Lines | Files |
|-----------|-------|-------|
| Zustand Store | 1,319 | 1 |
| Visualise Components | 3,427 | 16 |
| API Proxy + Lib | 633 | 5 |
| Types | 151 | 1 |
| **Total website src** | **~7,500** | **31** |

### Dependencies
- Server: **5 production deps** (fastify, classic-level, prom-client, MCP SDK, dotenv)
- Website: **~40 production deps** (React 19, Next.js 15, Three.js, Zustand, Stripe, d3, etc.)

---

## 3. The Good — What's Working

### Minimal dependency server
Five production dependencies for a cryptographic memory server with Merkle proofs, Markov chains, sharded storage, SSE, and Prometheus metrics. This is excellent discipline. The server could run on a Raspberry Pi.

### Proof-first design
Every atom access returns a Merkle audit path. This isn't decoration — it's the core value proposition. An AI agent can prove what it knew and when. No other memory system for AI offers this.

### Sharding done right
JumpHash for zero-reshuffling shard assignment, independent LevelDB instances per shard, atomic multi-shard commits. The sharding adds complexity but the payoff is real: horizontal scalability without data migration.

### The PPM engine is genuinely novel
Variable-order Prediction by Partial Matching for AI context prediction — this isn't a standard approach. The CSR sparse matrix with exponential decay is memory-efficient and the 7-day half-life is well-tuned for session-based workflows.

### Clean visualiser decomposition
16 focused components, each handling one visual concern. The pre-allocated Float32Array buffers and zero-GC-per-frame discipline show real understanding of WebGL performance constraints.

### Test coverage on the server
67 test files covering Merkle proofs, Markov training, WAL recovery, concurrent access, consistency proofs. This is thorough.

---

## 4. The Bad — Accumulated Complexity

### 4.1 server.ts is a 3,018-line monolith

This single file handles:
- 30 HTTP endpoints
- SSE connection management
- Request validation
- Authentication
- CORS
- Metrics collection
- Health checks
- Rate limiting
- Audit logging

**Impact:** Every change to any endpoint risks breaking others. New developers see one enormous file and can't find anything. Testing requires spinning up the entire HTTP stack.

**If building from scratch:** Split into a route registry pattern:
```
src/
  routes/
    atoms.ts        # CRUD for atoms
    admin.ts        # export, import, audit
    proofs.ts       # verify, consistency, tree-head
    search.ts       # search, context, bootstrap
    sse.ts          # event stream management
    health.ts       # health, ready, metrics
  middleware/
    auth.ts
    rateLimit.ts
    cors.ts
  server.ts         # ~50 lines: create app, register routes
```

### 4.2 memory-store.ts is a 1,319-line god object

Six distinct responsibilities in one Zustand store:
1. Data state (atoms, tree head, details)
2. Layout computation (conical bowl positioning)
3. SSE connection lifecycle
4. Animation queue management
5. API orchestration (5 different fetch functions)
6. Merkle proof verification

**Impact:** Any change to layout triggers a review of SSE code. Animation timing changes risk breaking API caching logic. It's all coupled through shared state.

**If building from scratch:** Zustand supports `slices` — compose independent stores:
```
stores/
  atoms-slice.ts      # atom data + CRUD
  layout-slice.ts     # position computation
  sse-slice.ts        # connection + event dispatch
  animation-slice.ts  # queue, cleanup, timing
  api-slice.ts        # fetch orchestration
  store.ts            # compose slices into one store
```

### 4.3 The Verkle tree research (~47,000 lines) ships with production

An experimental cryptographic tree implementation lives alongside production code. It's research — useful, but it inflates the codebase by 4.5× and confuses anyone trying to understand what MMPM actually is.

**If building from scratch:** Separate repo or a `research/` directory excluded from builds and Docker images.

### 4.4 Animation timing constants are scattered

`SSE_ANIM_DURATION_MS`, `CASCADE_ANIM_DURATION_MS`, descent/rehash/settle phase boundaries, particle sizes, color multipliers — these live in 5+ different component files with no single source of truth.

**Impact:** Tuning animation feel requires editing multiple files and hoping the timing math still works across components. Subtle bugs when one component uses 1200ms and another assumes 1000ms.

**If building from scratch:**
```
src/constants/
  animation-timing.ts   # all durations, phases, stagger values
  animation-colors.ts   # all color definitions with multipliers
  layout.ts             # bowl geometry, ring radius, shard angles
```

### 4.5 The SSE proxy is fragile

The Next.js SSE proxy (`events/route.ts`) pipes an upstream ReadableStream directly to the client. This works but:
- Next.js App Router wasn't designed for long-lived streaming responses
- The 32-second timeout you saw in the logs is likely Vercel/Next.js killing the connection
- When the proxy drops, the client falls back to polling, which hammers the API

**If building from scratch:** Direct SSE from browser → MMPM server (with CORS), bypassing Next.js entirely. The proxy only exists to hide the API key — use a lightweight token exchange instead:
```
1. Browser calls /api/sse-token (Next.js) → returns short-lived JWT
2. Browser opens EventSource directly to mmpm.co.nz/events?token=JWT
3. No proxy needed. SSE runs without middleware interference.
```

### 4.6 The MCP tool surface is large

25+ MCP tools registered. Most agents will use 3: `session_checkpoint`, `memory_session_bootstrap`, `memory_access`. The rest (audit log, export, metrics, atom inspection, weight inspection, policy, verify, verify-consistency, tree-head, pending, stale, context, search, train, commit) are admin tools exposed as agent tools.

**Impact:** Every tool consumes context window tokens in the agent's tool list. More tools = less room for actual thinking. Tool descriptions alone could be 2,000+ tokens.

**If building from scratch:** Expose 4 MCP tools:
1. `memory_bootstrap` — session start
2. `memory_checkpoint` — save + tombstone + train (already exists)
3. `memory_recall` — single/batch access + search (merge access + search)
4. `memory_admin` — everything else behind a `command` parameter

---

## 5. The Questionable — Features That May Not Earn Their Complexity

### 5.1 Sharding (for a single-user memory server)

MMPM is designed for one AI agent's memory. The sharding layer (orchestrator, shard workers, JumpHash, cross-shard commits) adds ~3,000 lines of code. A single LevelDB instance with a Merkle tree on top would serve the same purpose for any realistic atom count (under 100K atoms).

**Counter-argument:** Sharding enables multi-tenant hosting. If you're selling MMPM as a service, sharding matters. But for the single-server deployment that 90% of users will run, it's over-engineering.

**Verdict:** Keep it, but make single-shard the default. The orchestrator should detect `SHARD_COUNT=1` and skip all coordination overhead.

### 5.2 Consistency proofs (RFC 6962)

Full RFC 6962 consistency proofs between tree versions. This proves the tree evolved honestly (no rewriting history). Powerful for audit scenarios, but no current user or workflow exercises this capability.

**Verdict:** Keep it — it's the moat. But don't spend more time on it until a customer actually needs audit compliance.

### 5.3 The weekly evaluation harness

A scientific evaluation that measures prediction accuracy, retrieval quality, and decay health. Good engineering discipline, but it's infrastructure for a team that doesn't exist yet.

**Verdict:** Simplify to a health score. One number: "memory is 87% healthy." The full eval framework can return when there's a team to act on its findings.

### 5.4 Embedding / semantic search

NgramHash embeddings + BM25 hybrid search. This is necessary for `memory_search` and `memory_bootstrap`, but the embedding implementation is custom rather than using an existing library.

**Verdict:** The custom NgramHash is lightweight and dependency-free — that's actually good. But document that this is a "good enough" embedding, not a production vector search.

### 5.5 The 3D Substrate Viewer

16 components, 3,427 lines of WebGL code, bloom post-processing, bezier arc lightning, sequential staggered atom growth, Merkle rehash cascades. It's visually impressive but:

- It's a demo/marketing tool, not a product feature
- It consumes more engineering time than the core memory server
- Every animation refinement pulls focus from the actual product

**Verdict:** Ship what you have. Freeze the visualiser. Every hour spent tuning particle sizes is an hour not spent on customer onboarding, documentation, or the things that make money.

---

## 6. If Building From Scratch — The Simplified Architecture

### Server (target: ~4,000 lines)

```
src/
  server.ts              # 50 lines — app bootstrap
  routes/
    atoms.ts             # atom CRUD (200 lines)
    memory.ts            # bootstrap, context, search (200 lines)
    proofs.ts            # verify, tree-head (100 lines)
    admin.ts             # export, audit, health (150 lines)
    sse.ts               # event streaming (100 lines)
  core/
    store.ts             # LevelDB atom storage (300 lines)
    merkle.ts            # Merkle tree + proofs (300 lines)
    markov.ts            # PPM engine + training (500 lines)
    search.ts            # BM25 + embedding search (300 lines)
  middleware/
    auth.ts              # Bearer token (30 lines)
  mcp/
    tools.ts             # 4 MCP tools (200 lines)
```

**Key simplifications:**
- No sharding layer (single store, single Merkle tree)
- Routes split by domain (atoms, memory, proofs, admin, sse)
- Auth is middleware, not inline
- MCP exposes 4 tools, not 25+

### Website (target: ~5,000 lines)

```
src/
  stores/
    atoms-slice.ts       # atom data
    layout-slice.ts      # position computation
    sse-slice.ts         # connection lifecycle
    animation-slice.ts   # queue management
    store.ts             # compose slices
  constants/
    timing.ts            # all animation durations
    colors.ts            # all color definitions
    layout.ts            # geometry constants
  components/visualise/
    Scene.tsx             # orchestrator (keep)
    AtomNodes.tsx         # atom rendering (keep)
    MerkleEdges.tsx       # edge rendering (keep)
    HashRing.tsx          # ring rendering (keep)
    Animations.tsx        # merge: cascade + train + access + highlights
    Controls.tsx          # merge: access controls + stats overlay
    Background.tsx        # merge: particles + stars
    Effects.tsx           # keep
```

**Key simplifications:**
- Store split into focused slices
- Constants centralised
- 16 visualise components → 8 (merge related concerns)
- Direct SSE to server (no Next.js proxy)

---

## 7. Priority Recommendations (ordered by impact)

### Do now (before deploy)
1. **Nothing.** Ship what you have. The codebase works. Refactoring before shipping is the #1 startup killer.

### Do next sprint
2. **Split server.ts into route files.** This is the single highest-impact refactor. It makes the server comprehensible to anyone new and unlocks parallel development.
3. **Centralise animation constants.** One file for all timing, one for all colors. Eliminates cross-file animation bugs.

### Do when it hurts
4. **Split memory-store.ts into slices.** When the store hits 2,000 lines or when a second developer joins.
5. **Direct SSE (bypass Next.js proxy).** When SSE reliability becomes a customer issue.
6. **Reduce MCP tool count.** When context window pressure becomes measurable.

### Do never (unless a customer asks)
7. Don't rewrite the Merkle tree. It works.
8. Don't replace the PPM engine. It's unique and differentiating.
9. Don't add more visualiser features. Freeze it.

---

## 8. Summary

MMPM is a **genuinely novel system** — the combination of Merkle proofs + Markov prediction + typed atoms for AI memory doesn't exist anywhere else. The engineering quality is high: minimal dependencies, thorough tests, real cryptographic guarantees.

The accumulated complexity is typical of a project that grew feature-by-feature over sprints. The two monoliths (server.ts at 3K lines, memory-store.ts at 1.3K lines) are the main maintenance risk. The visualiser, while impressive, has consumed disproportionate engineering time relative to its commercial value.

The path forward is clear: **ship, then simplify.** The product works. The architecture can be incrementally improved without a rewrite. The core primitives (store + tree + chain) are solid and don't need to change.

The biggest risk isn't technical — it's spending another sprint on animation polish instead of getting the product in front of paying users.
