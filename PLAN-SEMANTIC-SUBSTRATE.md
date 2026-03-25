# Semantic Substrate Migration Plan

> Version 2 — restructured with domain→task→knowledge provenance as the
> primary organising principle. Embeddings serve the provenance structure.

---

## Scientific Foundation

### The Problem with Discrete Types

The current MMPM memory substrate classifies atoms into a discrete taxonomy
(`fact | state | event | relation | procedure | other`). This is a **Voronoi
partition** of a continuous semantic space — it assigns each atom to the nearest
of 6 centroids, discarding all information about *how far* the atom is from its
centroid, *which other centroids* it's near, and critically, *why* the atom
was created.

### How Humans Actually Organise Knowledge

Humans don't think in types. They think in **domains** (the project or area
they're working in), **tasks** (the objective they're pursuing), and
**knowledge** (what they learn while doing the work). Knowledge is produced
*during* work, not filed into categories afterward.

The brain has two modes of memory organisation:

1. **Online encoding (hippocampus):** During the day, new experiences are
   rapidly encoded with rich contextual associations — what you were doing,
   where you were, what came before and after. These associations are
   approximate and fast.

2. **Offline consolidation (sleep):** During sleep, the hippocampus replays
   the day's experiences. Useful associations are strengthened and transferred
   to long-term cortical storage. Irrelevant associations decay. Cross-domain
   connections that weren't obvious during the day become apparent during
   replay.

### The Proposed Architecture

This plan implements both modes:

- **Sprint 0:** Domain→Task→Knowledge provenance — the structural backbone
  that records *how* knowledge was produced.
- **Sprint 1:** Embedding pipeline — the semantic layer that enables
  similarity-based association (what things *mean*).
- **Sprint 2:** Live association agent (haiku) — the hippocampal encoder
  that makes fast, approximate associations during work sessions.
- **Sprint 3:** Nightly consolidation agent (opus) — the sleep replay that
  strengthens, prunes, and discovers cross-domain bridges.
- **Sprint 4:** Poincaré projection — the spatial encoding that turns the
  domain→task tree into a navigable visualisation.
- **Sprint 5:** Visualisation — the /knowledge page consumes all of the above.
- **Sprint 6:** Self-organising ontology — emergent clusters replace manual hubs.
- **Sprint 7:** Verification and fallback.

### Why Hyperbolic Geometry

In Euclidean space, the volume of a sphere grows polynomially with radius
(r^d). In hyperbolic space, it grows *exponentially* (e^{(d-1)r}). This
matches the branching structure of domain→task→knowledge: 1 domain → 5 tasks
→ 25 knowledge atoms. A Poincaré disk places domains near the origin and
specific learned facts near the boundary. The radial distance encodes
generality→specificity as a *geometric property*.

### What Stays the Same

Markov arcs (temporal causality), structural edges (explicit relationships),
merkle proofs (cryptographic verification), shard layout (storage
partitioning), the 6 existing structural edge types. These are orthogonal
to provenance and embeddings.

---

## Architecture Overview

```
Before:                                 After:
┌──────────────┐                        ┌────────────────────────────────┐
│ atom: string │                        │ atom: string                   │
│ type: enum   │  ← parsed from         │ type: enum (kept as fallback)  │
│ status       │    name prefix         │ status                         │
│ weight       │                        │ weight                         │
│              │                        │ embedding: float[384]          │ ← NEW
│              │                        │ poincare: float[2]             │ ← NEW
│              │                        │ domain: string (atom key)      │ ← NEW
│              │                        │ task: string (atom key)        │ ← NEW
└──────────────┘                        └────────────────────────────────┘
       │                                         │
       ▼                                         ▼
  6 fixed colours                       ┌────────────────────────────┐
  (type-based)                          │ Provenance tree:           │
                                        │   domain → task → atom     │
                                        │ Semantic position:         │
                                        │   Poincaré [x, y]         │
                                        │ Live associations:         │
                                        │   haiku agent (low conf)   │
                                        │ Nightly consolidation:     │
                                        │   opus agent (promote/prune│
                                        └────────────────────────────┘
```

### Layers and Scope

| Layer | What changes | Where | Risk |
|-------|-------------|-------|------|
| 0. Provenance | domain + task atoms, `produced_by` edge type | mmpm-service | Low — additive atoms and edges |
| 1. Embeddings | Compute + store 384-dim vectors at checkpoint | mmpm-service | Medium — new dependency |
| 2. Live agent | Background haiku during sessions | Cowork / Claude Code | Low — writes low-confidence edges only |
| 3. Nightly agent | Upgrade existing association-agent | Scheduled task | Low — already runs nightly |
| 4. Poincaré | 2D projection from embeddings + provenance tree | mmpm-service | Medium — math |
| 5. Visualisation | /knowledge page consumes all of the above | mmpm-website | Low — isolated components |
| 6. Ontology | Emergent clusters replace manual hubs | mmpm-service | Medium — migration |
| 7. Verification | A/B tests, fallback paths | Both | Low |

**Scope boundary:** mmpm-compute is NOT touched. Compute handles billing,
provisioning, DO workers, Stripe, and credit management. All work lives in
mmpm-service (core server), mmpm-website (visualisation), and scheduled tasks.

---

## Sprint 0: Domain → Task → Knowledge Provenance ✅ COMPLETE (2026-03-25)

> **Completed:** `domain` and `task` atom types added to `ATOM_TYPES` and `V1_PATTERN`. `produced_by` added as 7th edge type. `taskContext` param on `session_checkpoint` auto-generates `produced_by` edges. `TYPE_TO_INDEX` updated (domain=6, task=7). Domain/task detection and task lifecycle documented in CLAUDE.md. Typecheck clean.
>
> **Files changed:** `atom_schema.ts`, `edge_schema.ts`, `transition_policy.ts`, `mmpm_mcp_server.ts`, global + project CLAUDE.md files.

**Goal:** Every atom knows where it came from — which domain, which task,
which work session. This provenance tree becomes the primary organising
structure. The system infers domain and task from session context rather
than requiring explicit declaration.

**Scientific context:** Episodic memory in the brain tags each memory with
the *context of acquisition* — where you were, what you were doing, what
came before. This contextual tag is what makes retrieval work: "what do I
know about security?" becomes "what did I learn while working on security
tasks?" The provenance layer implements this contextual tagging.

**Why this must come first:** Embeddings (Sprint 1) tell you what an atom
*means*. Provenance tells you *why it exists*. Without provenance, the live
agent (Sprint 2) can't tag associations with task context. Without task
context, the nightly agent (Sprint 3) can't assess which associations were
productive. The entire pipeline depends on atoms knowing their origin.

### 0.1 — Domain and Task atom types

| | |
|---|---|
| **Change** | Introduce two new atom naming conventions: `v1.domain.<name>` and `v1.task.<domain>_<short_objective>` |
| **Where** | MMPM server — atom validation rules (if any), CLAUDE.md naming conventions |
| **Examples** | `v1.domain.compute` — the mmpm-compute project |
| | `v1.domain.memory` — the mmpm-service / core MMPM server |
| | `v1.domain.website` — the mmpm-website / commercial site |
| | `v1.domain.marketing` — content, Instagram, brand |
| | `v1.domain.infrastructure` — droplets, CI/CD, DNS |
| | `v1.task.compute_add_2fa` — add 2FA to compute |
| | `v1.task.website_fix_knowledge_clicks` — fix click handling on /knowledge |
| | `v1.task.marketing_instagram_launch_posts` — create launch posts |
| **Lifecycle** | Domain atoms are long-lived — created once, rarely tombstoned. Task atoms are ephemeral — created when work begins, marked complete when the objective is achieved |
| **Schema** | Task atoms carry metadata in their value: `v1.task.compute_add_2fa = Add two-factor authentication to compute. Status: active. Started: 2026-03-25` |
| **Careful** | Domain atoms should be created lazily — the first time work in that domain is detected, not preloaded. Start with 0 domains and let them emerge |
| **Careful** | Task names must be short and keyword-dense (same naming rules as other atoms). The objective goes in the value, not the key |

### 0.2 — `produced_by` edge type

| | |
|---|---|
| **Change** | Add `produced_by` as a 7th structural edge type. Links a knowledge atom to the task that created it |
| **Where** | MMPM server — edge type validation, CLAUDE.md edge type table |
| **Direction** | `v1.fact.totp_secrets_encrypted_at_rest` → `produced_by` → `v1.task.compute_add_2fa` |
| **Also add** | Task → `member_of` → Domain: `v1.task.compute_add_2fa` → `member_of` → `v1.domain.compute` |
| **When written** | During `session_checkpoint`, when new atoms are created. The active task atom key is passed as context |
| **Careful** | `produced_by` is immutable — an atom's provenance doesn't change after creation. Unlike `member_of` which can be rewired when clusters change, `produced_by` is permanent |
| **Careful** | If no task context is available (legacy atoms, or session without domain detection), skip the `produced_by` edge. Don't invent provenance that doesn't exist. The nightly agent can attempt retroactive attribution later |
| **Backward-compatible** | Existing atoms have no `produced_by` edge. They still work. The backfill strategy is: nightly agent groups existing atoms by creation timestamp + Markov arc proximity, infers which "task" they likely belonged to, and proposes edges at low confidence |

### 0.3 — Domain detection (multi-signal inference)

| | |
|---|---|
| **Change** | At session start (during bootstrap), infer the active domain from available context signals. Create or find the matching domain atom. This is NOT a new tool — it's logic added to the bootstrap flow |
| **Where** | `memory_session_bootstrap` handler in MMPM server, and/or the session orchestration layer (Claude's behaviour in CLAUDE.md) |
| **Signal priority** | Signals are checked in order; first strong match wins: |
| | **Tier 1 — Explicit (no question needed):** |
| | 1. Mounted folder name → `mmpm-website` maps to `v1.domain.website` |
| | 2. Project/repo name mentioned in first message |
| | 3. Skill triggered that's project-specific (e.g., `cicd-web-deploy` → website, `droplet-ops` → infrastructure) |
| | **Tier 2 — Strong inference (confirm lightly):** |
| | 4. Keywords in objective suggest a domain but don't name it → "I'll set this up under compute — that right?" |
| | 5. Bootstrap retrieval returns atoms concentrated in one domain → infer from the cluster |
| | **Tier 3 — Ambiguous (ask):** |
| | 6. No signal at all → "What are you working on today?" |
| **Output** | Active domain atom key stored in session context (available to checkpoint handler and live agent) |
| **Careful** | Domain detection must work across all interfaces: Cowork (has folder), Claude Code (has working directory), scheduled tasks (have predefined purpose). Each interface provides different signals |
| **Careful** | Don't ask when the domain is obvious. "Fix the 2FA on compute" → domain is compute, don't ask. "Let's work on something" → ask |
| **Careful** | A session can involve multiple domains (user switches mid-session). The live agent (Sprint 2) should detect domain switches when the conversation shifts topics. The initial domain detection is a starting point, not a constraint |

### 0.4 — Task creation at session start

| | |
|---|---|
| **Change** | After domain detection, create (or find existing) a task atom for the current objective. Link it to the domain |
| **Where** | Part of the bootstrap/session-start flow |
| **Logic** | Parse the user's first message for the objective. Search existing task atoms in the detected domain for a close match (cosine similarity > 0.85 if embeddings are available, otherwise keyword match). If found → reuse (continuing previous work). If not found → create new task atom |
| **Example** | User says "let's continue with the 2FA work" → finds `v1.task.compute_add_2fa` (status: active) → reuses it |
| | User says "I want to add rate limiting to the API" → no match → creates `v1.task.compute_add_rate_limiting` |
| **Edges** | New task: `v1.task.compute_add_rate_limiting` → `member_of` → `v1.domain.compute` |
| **Careful** | Task matching must be fuzzy. "Continue 2FA" and "the two factor auth thing" and "where were we with authentication" should all match the same task atom. This is where embeddings (Sprint 1) make a huge difference — but before Sprint 1, keyword overlap is good enough |
| **Careful** | Don't create duplicate tasks. If `v1.task.compute_add_2fa` already exists and is active, reuse it. Duplicates fragment the provenance tree |

### 0.5 — Checkpoint enrichment with provenance

| | |
|---|---|
| **Change** | Modify the `session_checkpoint` flow to automatically add `produced_by` edges for new atoms |
| **Where** | The checkpoint handler in MMPM server, or the Claude-side checkpoint logic in CLAUDE.md |
| **How** | When `session_checkpoint` is called with new atoms, the active task atom key is included in the call. For each new atom, a `produced_by` edge is created automatically |
| **Interface change** | Add optional `taskContext` field to `session_checkpoint` params: `{ atoms: [...], edges: [...], taskContext: "v1.task.compute_add_2fa" }` |
| **Careful** | `taskContext` is optional. If omitted, no `produced_by` edges are created (backward-compatible). This allows legacy callers and scheduled tasks to checkpoint without provenance |
| **Careful** | Don't duplicate edges. If atom A already has a `produced_by` → task T edge, don't create another one |

### 0.6 — Task completion and status tracking

| | |
|---|---|
| **Change** | Tasks have a lifecycle: `active` → `completed` or `abandoned`. Track status in the task atom's value |
| **Where** | Task atom value field, updated via session_checkpoint |
| **When** | User says "that's done" or "ship it" or "let's move on" → mark task as completed. User says "let's abandon this approach" → mark as abandoned |
| **Why this matters** | The nightly agent uses task completion status to assess which knowledge was productive. Atoms `produced_by` a completed task are more valuable than atoms from an abandoned task. This drives the reinforcement/decay decisions |
| **Careful** | Don't auto-complete tasks. Only the user decides when something is done. A session ending doesn't mean the task is complete — it might continue tomorrow |

---

## Sprint 1: Server-Side Embedding Pipeline ✅ COMPLETE (2026-03-25)

> **Completed:** Model2Vec + HybridScorer were already integrated (pre-existing). Sprint 1 additions: `domain` and `producedBy` provenance fields added to bootstrap response (`BootstrapMemoryItem`) and `/atoms/:atom` inspect. Domain-aware bootstrap scoring: optional `domain` param on `/memory/bootstrap` applies 1.15× boost to same-domain atoms. MCP `memory_session_bootstrap` exposes `domain` param. GET `/atoms` type filter updated for domain/task types. Typecheck clean.
>
> **Files changed:** `server.ts` (BootstrapMemoryItem type, bootstrap handler, /atoms/:atom handler, /atoms type filter), `mmpm_mcp_server.ts` (domain param).
> **Pre-existing (no work needed):** 1.1 embedding model (Model2VecEmbedding), 1.2 checkpoint embeddings (EmbeddingIndex), 1.3 cosine similarity in bootstrap (HybridScorer).

**Goal:** Every atom gets a 384-dimensional embedding vector computed at
checkpoint time and stored alongside its existing data. Retrieval (bootstrap,
search) gains cosine similarity as a first-class scoring signal. The live
agent (Sprint 2) uses these embeddings to find cross-domain associations.

**Scientific context:** Sentence transformers (e.g., `all-MiniLM-L6-v2`)
map variable-length text to fixed-length vectors where cosine similarity
≈ semantic similarity. The model is 22MB (ONNX), runs in ~0.5ms per atom
on CPU. For 833 atoms, full re-embedding takes <1 second.

**Why this comes after Sprint 0:** The provenance layer (Sprint 0) can work
without embeddings — it uses keyword matching and explicit signals. But
embeddings dramatically improve domain detection (0.3), task matching (0.4),
and are essential for the live agent's cross-domain bridge detection (Sprint 2).
Sprint 1 upgrades Sprint 0's keyword heuristics to semantic understanding.

### 1.1 — Embedding model integration

| | |
|---|---|
| **Change** | Add `@xenova/transformers` (Node.js ONNX runtime) to MMPM server |
| **Decision** | Model: `Xenova/all-MiniLM-L6-v2` — 22MB ONNX, 384-dim output. Chosen for: small size, fast inference, good quality on short text (atom values are typically 1-3 sentences) |
| **Where** | New module: `src/embedding/embed.ts` in MMPM server |
| **Interface** | `embed(text: string): Promise<Float32Array>` — single atom |
| | `embedBatch(texts: string[]): Promise<Float32Array[]>` — bulk (used by backfill and clustering) |
| | `cosineSimilarity(a: Float32Array, b: Float32Array): number` — utility |
| **Singleton** | Model loads ~2s on cold start. Use a module-level singleton — `let pipeline: Pipeline | null = null`. Lazy-load on first call. Never block server startup |
| **Careful** | The ONNX runtime (`onnxruntime-node`) has native bindings. Verify it works on the production droplet's architecture (likely x86_64 Linux). Test before deploy |
| **Careful** | Memory footprint: the model uses ~100MB RAM when loaded. The MMPM server's droplet should have sufficient headroom. Check with `process.memoryUsage()` before and after model load |
| **Test** | `embed("v1.fact.deploy_strategy = Blue-green deployment via Docker Swarm")` → 384-float vector. `cosineSimilarity(embed("deployment"), embed("deploy strategy"))` > 0.7. `cosineSimilarity(embed("deployment"), embed("stripe billing"))` < 0.3 |

### 1.2 — Compute embeddings at checkpoint time

| | |
|---|---|
| **Change** | In the `session_checkpoint` handler, after storing the atom text, compute and store its embedding |
| **Where** | `session_checkpoint` handler in MMPM server |
| **Storage** | New LevelDB prefix: `emb:<atom_key>` → `Buffer` (384 × 4 bytes = 1,536 bytes per atom). Total for 833 atoms: ~1.25MB |
| **What to embed** | The **full atom string** (key = value), not just the key. Example: `"v1.fact.deploy_strategy = Blue-green deployment via Docker Swarm"`. The value carries the semantic content; the key alone is often too terse |
| **Async** | Don't block checkpoint response on embedding computation. Flow: (1) store atom → (2) confirm checkpoint → (3) compute embedding in background → (4) store embedding. If embedding fails, the atom still exists — backfill will catch it |
| **Migration** | One-time backfill script: iterate all atoms via `/atoms`, compute embeddings, store to LevelDB. Run once after deploying Sprint 1.1. Expected time: <5 seconds for 833 atoms |
| **Careful** | Domain and task atoms also get embeddings. `v1.domain.compute` gets embedded alongside facts and procedures. This is important — the live agent uses domain atom embeddings to detect domain switches |

### 1.3 — Cosine similarity in bootstrap retrieval

| | |
|---|---|
| **Change** | `memory_session_bootstrap` currently uses Jaccard token overlap for `baseRelevance`. Add cosine similarity between the objective's embedding and each atom's stored embedding as a weighted signal |
| **Where** | Bootstrap scoring logic in MMPM server |
| **Formula** | `relevance = 0.4 × jaccard + 0.6 × cosineSim` |
| **Why 60% cosine** | Cosine captures semantic meaning that keyword overlap misses. "Docker deployment" and "container orchestration" have low Jaccard but high cosine. But Jaccard catches exact matches that embeddings blur: "PM2" vs "process manager" share no embedding similarity but have keyword overlap via the atom key |
| **Implementation** | Compute the objective's embedding once per bootstrap call. Load all atom embeddings from LevelDB (cached in memory after first load — 1.25MB total). Single batch cosine comparison. This is fast — dot product of 833 × 384 floats takes <1ms |
| **Careful** | If an atom has no embedding (not yet backfilled, or embedding failed), fall back to Jaccard-only for that atom. Don't crash. Don't skip the atom |
| **Careful** | The bootstrap should now also boost atoms that share a domain with the detected session domain. Atoms from `v1.domain.compute` should get a relevance bonus when the session is in the compute domain. This combines semantic relevance with provenance relevance |
| **Test** | Bootstrap with objective "Docker deployment strategy" should rank `v1.fact.deploy_strategy` higher than `v1.fact.stripe_test_mode`. Bootstrap in domain compute should rank compute atoms higher than website atoms |

### 1.4 — Expose embeddings in API response

| | |
|---|---|
| **Change** | Add `poincare: [x, y]` and optional `embedding` to the `/atoms` API response |
| **Where** | `/atoms` endpoint handler in MMPM server |
| **Default** | Always include `poincare: [x, y]` when available (2 floats per atom = negligible payload). Also include `domain: string` and `task: string` (the provenance parent keys) when available |
| **Optional** | Full `embedding: base64(Float32Array)` only when `?includeEmbeddings=true` (384 floats × 833 atoms = ~1MB as base64) |
| **Backward-compatible** | Existing callers that don't expect these fields ignore them. No breaking change |
| **Careful** | Poincaré coordinates aren't available until Sprint 4. Until then, `poincare` is null/omitted. The API should handle this gracefully |

---

## Sprint 2: Live Background Association Agent ✅ SERVER-SIDE COMPLETE (2026-03-25)

> **Completed (server-side):** `createdBy` field added to `Edge` and `EdgeInput` interfaces. LevelDB encode/decode updated (5-field format, backward-compatible). `POST /memory/associate` endpoint: accepts new atoms + current domain, computes cross-domain embedding similarity via HybridScorer, returns suggested `references` edges (threshold ≥0.7, max 5/atom, confidence 0.4) + domain switch detection (2+ atoms, gap >0.15). MCP tool `memory_associate` wraps the endpoint. `memory.associate` audit event added. Shard worker edge reconstruction updated (3 sites). MCP `session_checkpoint` edge schema accepts `createdBy`. Test files updated. Typecheck clean.
>
> **Files changed:** `edge_schema.ts`, `shard_worker.ts`, `server.ts`, `audit_log.ts`, `mmpm_mcp_server.ts`, `community_detection.test.ts`, `edge_schema.test.ts`.
> **Remaining (client-side):** Haiku subagent spawning in Cowork/Claude Code, pulse delivery on checkpoint, domain-switch notification surfacing. Documented in global CLAUDE.md.

**Goal:** A haiku-tier subagent runs continuously during active work sessions.
It watches for new atoms (via checkpoint events), finds cross-domain
associations using embedding similarity, and writes low-confidence edges
back to memory. It is the hippocampal fast-encoder — approximate but immediate.

**Scientific context:** The hippocampus rapidly encodes new experiences with
contextual associations during waking hours. These encodings are fast,
sometimes noisy, and don't require deep analysis. The value comes from
volume — hundreds of approximate associations per day give the consolidation
process (sleep) raw material to work with. Without rapid encoding, the
consolidation process has nothing to consolidate.

**Why a live agent, not batch:** The nightly association-agent (currently at
2am) has no context about *what you were doing* when atoms were created.
By the time it runs, the temporal context is lost. A live agent captures
the domain, task, and conversational context at the moment of creation —
information that can't be reconstructed later.

### 2.1 — Agent architecture and lifecycle

| | |
|---|---|
| **What** | A haiku-tier subagent spawned at session start, running in parallel with the main conversation |
| **Interface** | In Cowork: `Agent` tool with `model: "haiku"` and a long-running prompt. In Claude Code: background process via `run_in_background`. In scheduled tasks: not applicable (no live session) |
| **Lifecycle** | Spawned after bootstrap completes (domain and task are known). Runs until the session ends. Receives periodic "pulses" when atoms are checkpointed |
| **Context it receives** | On spawn: current domain atom key, current task atom key, list of all domain atoms (for cross-domain search). On each pulse: the new atoms just checkpointed, their edges, their embeddings (if available) |
| **What it does NOT receive** | The full conversation. The live agent doesn't need to read every message — it only needs the atoms produced. This keeps token cost minimal |

### 2.2 — Cross-domain bridge detection

| | |
|---|---|
| **Change** | When new atoms arrive, the live agent compares their embeddings against atoms in OTHER domains (not the current one — within-domain associations are already handled by the main session's edge creation) |
| **Algorithm** | For each new atom A in domain D: (1) compute cosine similarity against all atoms NOT in domain D. (2) For any atom B with similarity > 0.7: create a `references` edge A → B with confidence 0.4. (3) Log the association for the nightly agent to review |
| **Where** | The haiku agent's per-pulse logic |
| **Why 0.7 threshold** | Below 0.7, sentence transformer similarity is unreliable for short texts. Above 0.7 usually indicates genuine semantic overlap. The nightly agent can lower this threshold if it finds the live agent is too conservative |
| **Careful** | The live agent must NOT create `produced_by`, `member_of`, `supersedes`, `constrains`, or `depends_on` edges. It only creates `references` edges. The other edge types require reasoning that haiku isn't reliable enough for |
| **Careful** | Rate limit: max 5 new edges per pulse. If a new atom matches 20 cross-domain atoms, pick the top 5 by similarity. This prevents edge explosion |
| **Careful** | The live agent must never modify or tombstone existing atoms or edges. It is append-only. Only the nightly agent or the user (via the main session) can modify/tombstone |

### 2.3 — Domain switch detection

| | |
|---|---|
| **Change** | If the live agent detects that new atoms are semantically distant from the current domain but close to a different domain, it signals a potential domain switch |
| **How** | For each new atom, compute cosine similarity against all domain atoms. If the nearest domain is NOT the current session domain AND the similarity gap is > 0.15, flag it |
| **Action** | The live agent writes a low-priority note (not an atom — a session-local flag) that the main session can optionally surface: "You seem to have shifted to the website domain — should I update the context?" |
| **Careful** | Don't interrupt the user's flow. The domain switch detection is a soft signal, not a hard redirect. If the user is in the middle of a thought, the main session should defer the question to a natural break point |
| **Careful** | One-off mentions of another domain don't constitute a switch. The agent should require 2+ consecutive atoms matching a different domain before flagging |

### 2.4 — MCP write path for the live agent

| | |
|---|---|
| **Change** | The live agent writes edges to MMPM via the same MCP `session_checkpoint` tool, but with a special marker |
| **How** | Edges created by the live agent include metadata: `{ source, target, type: "references", confidence: 0.4, createdBy: "live-agent" }` |
| **Storage** | These edges are stored identically to any other structural edge. The `createdBy` field is metadata in the edge value (not a separate storage scheme) |
| **Careful** | Concurrent writes: the main session and the live agent may both call `session_checkpoint` simultaneously. MMPM's LevelDB serialises writes — this is safe. But ensure the agent's checkpoint calls don't include the main session's `taskContext` — the agent uses its own checkpoint calls with only edges (no atoms) |
| **Careful** | The live agent must handle MCP connection failures gracefully. If MMPM is unreachable, buffer edges locally and retry. If the session ends before retry succeeds, the edges are lost (acceptable — they were low-confidence) |

---

## Sprint 3: Nightly Consolidation Agent (Opus) ✅ COMPLETE (2026-03-25)

> **Completed:** `GET /edges` bulk query endpoint added with `createdBy`, `since`, `type`, `limit` filters — enables the nightly agent to query all live-agent edges from last 24h. `GET /edges/:atom` response now includes `createdBy`. `association-agent` scheduled task upgraded with 5-phase consolidation prompt: (1) review live-agent edges (promote/demote/remove), (2) task completion reinforcement, (3) emergent sub-domain detection, (4) orphan atom attribution, (5) legacy hub wiring. Typecheck clean.
>
> **Files changed:** `server.ts` (GET /edges endpoint, createdBy in edge responses, isEdgeType import). Scheduled task prompt updated via MCP.

**Goal:** Upgrade the existing `association-agent` (runs at 2am daily) to
perform hippocampal-style consolidation: review the day's work, promote
valuable associations, prune noise, detect emergent sub-domains, and
strengthen atoms that contributed to completed tasks.

**Scientific context:** During NREM sleep, the hippocampus replays the day's
experiences in compressed form. Synaptic connections that were activated during
the day are selectively strengthened (long-term potentiation) or weakened
(synaptic homeostasis). The net effect: useful knowledge is consolidated into
long-term memory, irrelevant noise is pruned, and cross-domain connections
that weren't obvious during the day become apparent.

**Why opus, not sonnet:** The nightly agent makes judgment calls — "is this
association meaningful or superficial?" "should this sub-domain be promoted
to a full domain?" These require the reasoning depth that opus provides.
The volume is low (reviewing one day's work, not processing real-time), so
the higher per-token cost is justified.

### 3.1 — Review live agent edges

| | |
|---|---|
| **Change** | Query all edges with `createdBy: "live-agent"` created in the last 24 hours. For each, assess whether the association is meaningful |
| **Where** | Upgraded `association-agent` scheduled task |
| **Assessment criteria** | (1) Are the two atoms actually related, or is the embedding similarity superficial? (2) Does the connection add value — would knowing about atom B help when working on atom A's domain? (3) Is this a genuine cross-domain bridge, or just two atoms that happen to use similar vocabulary? |
| **Actions** | **Promote:** increase confidence to 0.7-0.9, update `createdBy` to `"consolidated"`. **Demote:** decrease confidence to 0.1 (keeps edge for re-evaluation next cycle). **Tombstone:** remove edge entirely if it's clearly noise |
| **Careful** | The nightly agent should batch its decisions. Read all live-agent edges first, reason about them as a group, then write all updates in one checkpoint call. Avoid N individual checkpoint calls |

### 3.2 — Task completion reinforcement

| | |
|---|---|
| **Change** | Find tasks that were marked `completed` today. For each, reinforce all atoms with `produced_by` → that task |
| **Where** | Same scheduled task |
| **How** | Run `memory_train` (2 passes) on each atom produced by a completed task. This strengthens knowledge that contributed to a successful outcome |
| **Inverse** | Find tasks marked `abandoned`. Do NOT weaken their atoms (the knowledge might still be valid — the task failed for other reasons). But do flag the atoms for future review: the nightly agent notes that these atoms haven't been reinforced and will decay naturally faster |
| **Careful** | Don't train atoms that were created today — they haven't been committed to the Merkle tree yet. Only train atoms from previous sessions that belong to today-completed tasks |

### 3.3 — Emergent sub-domain detection

| | |
|---|---|
| **Change** | Analyse the domain→task→knowledge tree for patterns. If 3+ tasks in the same domain produce knowledge that clusters tightly in embedding space, propose a sub-domain |
| **Where** | Same scheduled task |
| **Example** | In `v1.domain.compute`, tasks about 2FA, SSH hardening, and API key rotation all produce security-related atoms. The agent detects this cluster and proposes `v1.domain.compute_security` as a sub-domain |
| **Action** | Create the sub-domain atom with a `member_of` → parent domain edge. Move the relevant tasks from the parent to the sub-domain (update their `member_of` edges). This is a low-confidence proposal — the next time the user works in this area, the main session can confirm or reject |
| **Careful** | Sub-domain creation requires at least 3 tasks and 10 knowledge atoms in the cluster. Below this threshold, the pattern isn't strong enough |
| **Careful** | Don't create sub-sub-domains yet. Limit the hierarchy to domain → sub-domain → task. Deeper nesting can come later if needed |

### 3.4 — Orphan atom attribution

| | |
|---|---|
| **Change** | Find atoms with no `produced_by` edge (legacy atoms, or atoms from sessions before Sprint 0). Attempt retroactive attribution |
| **Where** | Same scheduled task |
| **How** | For each orphan atom: (1) Find its nearest domain atom by embedding similarity. (2) Find the task atom with the closest creation timestamp that shares that domain. (3) If both matches are strong (similarity > 0.75, timestamp within 24 hours), create a `produced_by` edge at confidence 0.5 |
| **Careful** | Don't force attribution. If no good match exists, leave the atom as an orphan. An unattributed atom is better than a misattributed one |
| **Careful** | Run orphan attribution only once per atom. Mark attributed atoms (e.g., with a `createdBy: "nightly-attribution"` field on the edge) so they're not re-processed |

---

## Sprint 4: Poincaré Projection ✅ COMPLETE (2026-03-25)

> **Completed:** Ward's hierarchical clustering per domain + Sarkar's Poincaré disk projection. New modules: `cluster.ts` (Ward's agglomerative clustering, provenance tree builder for small domains) and `poincare.ts` (Sarkar's construction, Möbius addition, interim placement, PoincareCache, LevelDB serialization helpers). Server integration: `GET /poincare` bulk coordinate endpoint, `POST /poincare/reproject` force re-projection, Poincaré coords included in `GET /atoms` and `GET /atoms/:atom` responses (`poincare: [x, y]`), interim placement on atom flush, startup projection. `EmbeddingIndex` extended with `getEmbedding()` and `entries()` iterator. Typecheck clean.
>
> **Files changed:** `cluster.ts` (new), `poincare.ts` (new), `embedding.ts` (getEmbedding, entries), `server.ts` (imports, PoincareCache init, rebuildPoincareProjection, poincareInterimPlace, GET/POST /poincare endpoints, /atoms enrichment, /atoms/:atom poincare field).

**Goal:** Compute a 2D Poincaré disk projection that encodes the
domain→task→knowledge hierarchy spatially. Domains near the centre,
tasks at mid-radius, specific knowledge near the boundary.

**Scientific context:** The Poincaré disk model maps points in hyperbolic
space to the unit disk interior. Sarkar's construction (2011) places a
tree's root at the origin and pushes children toward the boundary with
exponentially increasing distance. This is exact for trees — zero distortion.

**Why this comes after the agents (Sprints 2-3):** The Poincaré projection
operates on the provenance tree (domain→task→knowledge). That tree must
be populated before it can be projected. Sprints 0-3 build and refine the
tree. Sprint 4 projects it.

### 4.1 — Hierarchical clustering of embeddings within domains

| | |
|---|---|
| **Change** | Within each domain, cluster knowledge atoms using Ward's method on their 384-dim embeddings. Combined with the provenance tree, this gives a rich hierarchy: domain → (sub-domain) → task cluster → individual atoms |
| **Where** | New module: `src/embedding/cluster.ts` in MMPM server |
| **Algorithm** | Ward's method (minimises within-cluster variance). Run per-domain, not globally. Each domain gets its own dendrogram |
| **Why per-domain** | Global clustering would mix atoms from different domains that happen to be semantically similar. Per-domain clustering respects the provenance boundary — "security in compute" and "security in website" cluster separately |
| **Output** | Each atom gets: `depth` (distance from domain root), `cluster_path` (IDs from domain to leaf), `parent_cluster_id` |
| **Careful** | Re-cluster when >10 new atoms arrive in a domain since last clustering. Don't re-cluster on every checkpoint — it's O(n² log n) per domain |
| **Careful** | Small domains (<20 atoms) don't need clustering — just use the provenance tree directly (domain → tasks → atoms) |

### 4.2 — Poincaré disk embedding

| | |
|---|---|
| **Change** | Project each domain's hierarchy into a sector of the Poincaré disk. Each domain gets an angular sector proportional to its atom count |
| **Where** | New module: `src/embedding/poincare.ts` in MMPM server |
| **Algorithm** | Sarkar's construction: place root at origin. For each child of node n at radius ρ, place at `tanh(d(n,c)/2)` with angular offset weighted by subtree size |
| **Layout** | Domain atoms at radius ~0.1-0.2 (near centre). Task atoms at radius ~0.3-0.5. Knowledge atoms at radius ~0.5-0.9. The exact radii emerge from the tree depth |
| **Angular sectors** | Divide 360° among top-level domains proportional to atom count. `compute` with 200 atoms gets more angular range than `marketing` with 30 |
| **Output** | Each atom gets `poincare: [x, y]` where `x² + y² < 1` |
| **Storage** | LevelDB prefix: `poinc:<atom_key>` → 8 bytes (2 × float32) |
| **Careful** | Cross-domain bridge edges (from the live agent) should create subtle visual connections — but the nodes stay in their domain sectors. The bridges are edges, not position overrides |
| **Careful** | Numerical precision near the boundary: use float64 for computation, truncate to float32 for storage |
| **Test** | `v1.domain.compute` at radius < 0.2. `v1.task.compute_add_2fa` at radius 0.3-0.5. `v1.fact.totp_secrets_encrypted_at_rest` at radius > 0.6 |

### 4.3 — Store and serve Poincaré coordinates

| | |
|---|---|
| **Change** | Serve `poincare: [x, y]` per atom in the `/atoms?includeWeights=true` response |
| **API** | Always include `poincare` when available (2 floats per atom = negligible). Also include `domain` and `task` keys for provenance display |
| **Interim atoms** | When new atoms arrive between re-clustering, assign a temporary Poincaré position: place near the active task's position with small random offset toward the boundary. Re-clustering will correct this |
| **Cache** | The projection is deterministic given the same tree. Cache it. Invalidate only when re-clustering runs |

---

## Sprint 5: Visualisation — Semantic Layout and Colour ✅ COMPLETE (2026-03-25)

> **Completed:** Full Poincaré-aware visualisation pipeline. 5.1: `poincare` field added to `AtomWithEdges` type and `KGNode` interface. `addNodesLoadedWithPoincare` store method seeds initial positions from Poincaré [x,y]→3D (×80 scale + z jitter). `useAutoSeed` passes poincare data from API→store. 5.2: Continuous HSL colour from `atan2(py, px)` with radius-based saturation. 5.3: Depth-encoded scale (`1.4 - radius * 0.6`, min 0.6) with domain +0.3 / task +0.15 bonus. 5.4: Domain-aware Markov arc tinting — same-domain arcs get source hue, cross-domain bridges (>60° angle diff) render in gold. 5.5: `ViewToggle` component (semantic vs provenance mode), `LayoutMode` store state, provenance mode adjusts link force strengths (strong `member_of`/`produced_by` attraction). Also: `AtomType` extended with `domain`|`task`, `StructuralEdgeType` extended with `produced_by`, `ATOM_COLORS`/`TYPE_LABELS` updated, `StatsOverlay` fixed. Typecheck clean on both repos.
>
> **Files changed (mmpm-website):** `types/memory.ts` (AtomType, StructuralEdgeType, AtomWithEdges, ATOM_COLORS), `stores/knowledge-store.ts` (KGNode, LayoutMode, poincarePosition, addNodesLoadedWithPoincare, setLayoutMode), `useAutoSeed.ts` (poincare data flow), `GraphNodes.tsx` (poincareColor, poincareScale, useFrame updates), `GraphEdges.tsx` (cross-domain bridge detection, domain hue tinting), `useForceGraph.ts` (layoutMode effect, provenance forces), `ViewToggle.tsx` (new), `KnowledgeClient.tsx` (ViewToggle placement), `StatsOverlay.tsx` (domain/task labels).

**Goal:** The /knowledge page renders atoms using Poincaré coordinates for
layout, provenance for grouping, and embedding similarity for colour. The
discrete `ATOM_COLORS` map becomes a fallback.

### 5.1 — Poincaré-aware force simulation

| | |
|---|---|
| **Change** | Replace random initial positions in `useForceGraph` with Poincaré coordinates |
| **Where** | `src/components/knowledge/useForceGraph.ts` — the sync effect that sets initial positions |
| **How** | When a node enters the sim: `node.x = poincare[0] * 80`, `node.y = poincare[1] * 80`, `node.z = small random jitter`. The force sim refines from this starting point |
| **Careful** | Don't add a pinning force. Let the sim settle naturally. Poincaré positions are initial conditions, not constraints |
| **Fallback** | If `poincare` is null (Sprint 4 not yet deployed), fall back to current random initial positions. Zero breaking change |

### 5.2 — Continuous colour from embedding space

| | |
|---|---|
| **Change** | Replace `ATOM_COLORS[node.type]` with colour derived from Poincaré position |
| **Where** | `src/components/knowledge/GraphNodes.tsx` — the colour assignment in `useFrame` |
| **Algorithm** | `hue = atan2(poincare.y, poincare.x)` → [0, 360]. `saturation = 0.3 + radius * 0.7`. `lightness = 0.65`. Normalise angles per top-level domain sector so all 360° are used |
| **Fallback** | `if (node.poincare) { /* continuous */ } else { /* ATOM_COLORS[node.type] */ }` |
| **Test** | Same-domain atoms share similar hues. General atoms are desaturated. Specific atoms are vivid |

### 5.3 — Depth encoding (scale and bloom)

| | |
|---|---|
| **Change** | Domain atoms: large, low bloom, desaturated. Task atoms: medium. Knowledge atoms: small, high bloom, saturated |
| **Where** | `src/components/knowledge/GraphNodes.tsx` — scale in `useFrame` |
| **Formula** | `scale = BASE_SCALE * (1.4 - radius * 0.6)`. Min scale = 0.6 × BASE_SCALE (still clickable) |
| **Atom-type bonus** | Domain atoms get +0.3 scale bonus. Task atoms get +0.15. These are anchor points in the visualisation |

### 5.4 — Edge colour from endpoint embeddings

| | |
|---|---|
| **Change** | Markov arcs between same-domain atoms get domain hue tint. Cross-domain arcs (live agent bridges) render as white/gold to highlight them |
| **Where** | `src/components/knowledge/GraphEdges.tsx` |
| **Careful** | Structural edge type colours (sky blue, orange, purple, etc.) remain as-is. Only Markov arcs gain semantic tint |

### 5.5 — Provenance view toggle

| | |
|---|---|
| **Change** | Add a small toggle in the /knowledge UI that switches between "semantic view" (Poincaré layout) and "provenance view" (tree layout: domains → tasks → atoms) |
| **Where** | New component: `src/components/knowledge/ViewToggle.tsx` + layout mode in `useForceGraph` |
| **Provenance layout** | Force sim with strong `member_of` and `produced_by` edge attraction. Atoms cluster around their task, tasks cluster around their domain. Cross-domain bridges are visible as long arcs across the graph |
| **Careful** | Both views use the same data. The toggle only changes the force configuration and initial positions. No additional API calls |

---

## Sprint 6: Self-Organising Ontology

**Goal:** The 7 manual hub atoms are replaced by emergent cluster labels
discovered from the domain→task→knowledge tree and embedding space.

### 6.1 — Cluster label generation ✅

| | |
|---|---|
| **Change** | TF-IDF keyword extraction from BM25 tokenizer — no external API dependency |
| **Implementation** | `cluster_labels.ts`: `computeTfIdf()` scores tokens by term frequency × inverse document frequency. `generateClusterLabel()` picks top 2-3 discriminative tokens → snake_case label. `buildGlobalDf()` computes document frequency across all atoms. `labelDomainClusters()` labels all clusters in a domain with deduplication |
| **Output** | `v1.other.cluster_<domain>_<label>` with `member_of` edges from members |
| **Decision** | Local TF-IDF chosen over Claude API for reliability — no cost, no failure modes, deterministic. Claude enrichment runs as optional nightly enhancement (see 6.3) |

### 6.2 — Hub migration endpoint ✅

| | |
|---|---|
| **Change** | `POST /clusters/relabel` endpoint — dry-run or persist mode. Groups atoms by domain via `member_of` edges to `v1.domain.*`, runs Ward's clustering, generates TF-IDF labels, optionally persists cluster atoms + `member_of` edges |
| **Updated** | `community_detection.ts` — replaced hash-based naming (`community_auto_*`) with TF-IDF labels (`cluster_*`). Recognizes both legacy and new prefixes for idempotency |
| **Note** | 7 manual hubs NOT tombstoned yet — coexist with emergent clusters. Manual hubs remain as classification anchors in CLAUDE.md; emergent clusters add finer structure |

### 6.3 — Dynamic re-clustering + Claude enrichment ✅

| | |
|---|---|
| **Change** | Added Phase 6 to the `association-agent` nightly scheduled task (runs 2am daily) |
| **Trigger** | >20 new atoms since last run, or 7+ days since last re-clustering, or 10+ orphans wired in same run |
| **Step 6a** | `POST /clusters/relabel?persist=true` — Louvain community detection + TF-IDF labels |
| **Step 6b** | Claude (opus) label enrichment — reviews TF-IDF labels, renames unclear ones via `supersedes` edge (max 5/run) |
| **Step 6c** | `POST /poincare/reproject` — rebuilds Poincaré coordinates after structural changes |
| **Careful** | Re-clustering changes Poincaré positions. Runs at 2am, not during active sessions |

---

## Sprint 7: Verification and Fallback

### 7.1 — A/B retrieval quality

| | |
|---|---|
| **Test** | Bootstrap with 50 historical objectives. Compare Jaccard-only vs Jaccard+cosine+provenance. Pass: new method matches or beats on ≥80% |

### 7.2 — Visualisation comparison

| | |
|---|---|
| **Test** | Screenshot old vs new /knowledge layout. User evaluates which communicates structure better |

### 7.3 — Fallback path

| | |
|---|---|
| **Test** | Delete all `emb:*` and `poinc:*` keys from LevelDB. Verify /knowledge renders with type colours, bootstrap returns correct results, live agent gracefully degrades to no-op |

### 7.4 — Live agent quality audit

| | |
|---|---|
| **Test** | After 1 week of live agent operation: count edges created, promoted, tombstoned. If promotion rate < 20%, tighten the similarity threshold. If > 80%, loosen it. Target: 40-60% promotion rate (agent is finding real associations but also some noise) |

---

## Migration Safety

| Concern | Mitigation |
|---------|-----------|
| Breaking existing atoms | All changes are additive. `type` field stays. All existing code paths remain valid |
| Breaking edges | Edges reference atoms by key. `produced_by` is a new type — doesn't affect existing edges |
| Breaking Markov arcs | Markov weights are independent of provenance and embeddings. Zero impact |
| Breaking Merkle proofs | Proofs computed from atom content hash. Embeddings and provenance stored in separate LevelDB prefixes. Zero impact |
| Breaking bootstrap | Jaccard scoring still runs. Cosine and provenance are weighted additions. If either fails, Jaccard gives current results |
| API backward compatibility | New fields (`poincare`, `domain`, `task`) are additive. Existing clients ignore them |
| Live agent writes bad edges | All live agent edges are `references` type with confidence ≤ 0.5. Nightly agent reviews and tombstones noise |
| Server cold start | Embedding model loads async. Provenance works without embeddings (keyword-based domain detection) |
| mmpm-compute | NOT TOUCHED. Scope boundary enforced at the project level |

---

## Dependency Map

```
Sprint 0.1-0.2 (domain/task atoms + produced_by edge)
    ↓
Sprint 0.3-0.4 (domain detection + task creation)
    ↓
Sprint 0.5-0.6 (checkpoint enrichment + task lifecycle)
    ↓
Sprint 1.1 (embedding model)
    ↓
Sprint 1.2 (compute at checkpoint) ─── can run in parallel with 1.3
    ↓
Sprint 1.3 (cosine in bootstrap)
    ↓
Sprint 1.4 (API exposure)
    ↓
Sprint 2.1-2.4 (live agent) ←── requires embeddings for bridge detection
    ↓
Sprint 3.1-3.4 (nightly agent) ←── requires live agent edges to consolidate
    ↓
Sprint 4.1-4.3 (Poincaré) ←── requires populated provenance tree
    ↓
Sprint 5.1-5.5 (visualisation) ←── requires Poincaré coordinates
    ↓
Sprint 6.1-6.3 (ontology) ←── requires clustering + provenance
    ↓
Sprint 7 (verification + fallback)
```

## Token Budget Estimate

| Sprint | Estimated effort | Agent tier | Sessions |
|--------|-----------------|------------|----------|
| Sprint 0 (provenance) | Medium — new atom types, edge type, detection logic | Opus | 1-2 |
| Sprint 1 (embeddings) | Heavy — new dependency, storage, scoring | Opus | 2 |
| Sprint 2 (live agent) | Medium — agent design, MCP integration | Opus | 1-2 |
| Sprint 3 (nightly agent) | Medium — upgrade existing, add consolidation | Opus | 1 |
| Sprint 4 (Poincaré) | Medium — algorithm, math, storage | Opus | 1 |
| Sprint 5 (visualisation) | Medium — R3F changes, colour, toggle | Sonnet | 1-2 |
| Sprint 6 (ontology) | Medium — LLM integration, migration | Opus | 1 |
| Sprint 7 (verification) | Light — testing, comparison | Sonnet | 0.5 |
| **Total** | | | **8-11 sessions** |
