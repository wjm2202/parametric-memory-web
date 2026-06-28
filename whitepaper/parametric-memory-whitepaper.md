# Parametric Memory: A Cryptographically Verifiable, Predictive Memory Substrate for MCP-Capable AI Agents

**Parametric Memory (MMPM)** · parametric-memory.dev
*White paper · June 2026*

---

## Abstract

Large language models reason brilliantly over what is in their context window and forget everything the moment it closes. The dominant remedy — retrieval-augmented generation over a vector index — restores *recall* but discards four properties that production agents need: a verifiable record of *what was known and when*, a model of *what tends to follow what*, automatic detection of *contradictions* between stored beliefs, and an explicit *graph* of how facts relate. This paper presents MMPM (Markov–Merkle Predictive Memory), a memory substrate that an AI agent reaches through the Model Context Protocol (MCP) and treats as a first-class, queryable source of truth. MMPM stores knowledge as typed *atoms* in an append-structured store; every read returns a Merkle proof binding the atom to a signed tree version; a variable-order Markov layer with half-life decay turns the store into a *predictive* memory rather than a passive index; a Jaccard-keyed conflict detector surfaces contradictions at retrieval time; and a hexastore knowledge graph lets retrieval be reranked by topology. We describe the architecture, then develop three application patterns that the substrate makes newly tractable: (i) ingesting a research corpus into a queryable, citable evidence base; (ii) streaming high-frequency exchange data into a continuously-updated situational-awareness store; and (iii) maintaining a live structural graph of a codebase under active development. We argue that the research contribution is not any single mechanism but the *coherent combination* of verifiability, prediction, conflict-awareness, and graph structure behind one MCP-native interface — and we lay out the open questions this combination raises.

**Keywords:** AI memory, Model Context Protocol, Merkle proofs, Markov chains, knowledge graphs, agent architectures, verifiable retrieval.

---

## 1. Introduction

The capability frontier of AI agents has moved faster than their memory. A modern model can plan a multi-step task, call tools, and write production code, yet between two sessions it retains nothing. Each conversation begins from zero; hard-won context — a user's correction, a design decision, the root cause of a bug found yesterday — must be re-derived or re-pasted. The context window is working memory: large, fast, and volatile. What agents lack is the equivalent of *long-term* memory: a durable store that survives sessions, that can be queried on demand, and that the agent can trust.

The reflexive answer is retrieval-augmented generation (RAG): embed documents into vectors, store them in an approximate-nearest-neighbour index, and at query time retrieve the top-*k* semantically similar chunks. RAG solves recall, and for many question-answering workloads it is sufficient. But an autonomous agent operating over long horizons needs more than recall. It needs to answer four further questions that a vector index cannot:

1. **Provenance and integrity** — *"Was this fact actually in memory at the time I acted on it, and has it been tampered with since?"* A flat vector store offers no cryptographic answer.
2. **Prediction** — *"Given that I just recalled X, what do I usually need next?"* Similarity is symmetric and static; it has no notion of sequence or of what tends to follow what.
3. **Contradiction** — *"Do two of my stored beliefs disagree?"* Cosine similarity will happily return two mutually exclusive facts as both relevant, with no signal that they conflict.
4. **Structure** — *"How does this fact relate to the others — what does it depend on, supersede, or belong to?"* A bag of vectors has no edges.

MMPM is built around the claim that these four questions are not optional extras but the defining requirements of *agent* memory, as opposed to *document* retrieval. The substrate is exposed entirely through MCP, which means **any MCP-capable AI** — not a bespoke client — can write to it and query it. The agent does not "load a database"; it converses with a memory the way it converses with any other tool.

This paper has two purposes. First, to document the architecture precisely enough that the design choices can be evaluated on their merits (§3–§4). Second, to show *what becomes possible* once an agent has such a memory, through three application patterns that recur across domains (§5). We close with comparisons (§6), limitations, and open research questions (§7).

---

## 2. Background: MCP and the Stateless Agent

The Model Context Protocol standardises how an AI client discovers and calls external tools and data sources. A server advertises a set of tools; the client (the model) calls them with structured arguments and receives structured results. MCP is deliberately stateless at the protocol level: the server holds no implicit session memory of the model, and the model holds no memory of the server between conversations.

This statelessness is exactly the gap MMPM fills. Rather than bolting persistence onto the client, MMPM is an MCP *server* whose entire purpose is to be the agent's memory. Its tool surface is the memory API: bootstrap context for a new task, checkpoint new knowledge, search, recall a specific atom with its prediction, reinforce a sequence, verify a proof. Because the interface is MCP, the substrate is client-agnostic: the same memory can serve a coding assistant in one session, a market-monitoring agent in the next, and a research assistant in a third, each writing into and reading from the same verifiable store.

---

## 3. The MMPM Substrate

MMPM's name encodes its three load-bearing ideas: it is **Markov** (predictive), **Merkle** (verifiable), and **Predictive Memory**. This section describes each subsystem and how they compose.

### 3.1 Atoms: a typed unit of knowledge

The atomic unit of memory is the *atom*: a short, canonical statement with an explicit epistemic type. Atom identifiers follow the grammar `v1.<type>.<snake_case_id>`, optionally carrying an informational `payload`. There are **eight atom types**, and the type is not decoration — it changes how the atom is scored, decayed, and reconciled:

| Type | Epistemic stance | Example |
|---|---|---|
| `fact` | Stable truth | `v1.fact.user_prefers_dark_mode` |
| `state` | Mutable working context | `v1.state.deploy_in_progress` |
| `event` | Immutable dated milestone | `v1.event.api_v2_shipped_2026_05_01` |
| `procedure` | A rule that constrains behaviour | `v1.procedure.never_force_push_main` |
| `relation` | A link between entities | `v1.relation.service_a_calls_service_b` |
| `domain` | A long-lived area/project anchor | `v1.domain.compute` |
| `task` | An active or completed objective | `v1.task.refund_compliance_sprint` |
| `other` | Unclassified / hub anchors | `v1.other.hub_corrections` |

Forcing every write to commit to a type is a *forcing function*: the author must decide whether a claim is a stable truth, a transient state, a dated event that never changes, or a rule. Get the type wrong and decay, conflict detection, and ranking all misfire — so the type system does real epistemic work, not bookkeeping.

The canonical wire form of an atom (`v1.<type>.<id>` or `v1.<type>.<id> = <payload>`) is the exact byte string that is hashed into the Merkle tree. A deliberate invariant — payloads may not contain carriage returns or line feeds — keeps this wire form unambiguous and lets the edge codec reuse the newline as a safe field delimiter (§3.2).

### 3.2 Edges: the knowledge graph

Atoms relate to one another through typed, directional **edges**, and edges are permanent — they never decay. Seven edge types capture the relationships that matter for reasoning over memory:

`references` (informational link), `depends_on` (logical prerequisite), `supersedes` (replacement/correction), `constrains` (boundary or policy), `member_of` (classification into a domain or hub), `derived_from` (this finding came from investigating that atom), and `produced_by` (provenance — the task or agent that created this atom).

Edges are stored in a **hexastore-style three-index layout** so the graph can be traversed efficiently in any direction:

```
e:out:<source>:<target>:<type>     forward traversal
e:in:<target>:<source>:<type>      reverse traversal
e:type:<type>:<source>:<target>    type-filtered scan
```

The edge record itself is newline-delimited (`<createdAtMs>\n<confidence>\n<source>\n<target>\n<createdBy>`), which is safe precisely because the atom schema forbids newlines inside atom values. (An earlier colon-delimited codec "fractured" any edge whose atoms contained a colon; the newline codec closes that class of bug by construction.)

The discipline that makes the graph useful is simple: *every* write that introduces a new atom must also attach at least one edge — minimally a `member_of` link to a hub. Atoms are proteins, edges are the cytoskeleton; skip the edges and you have a heap, not a graph.

### 3.3 Merkle verifiability

Every committed state of the substrate is an immutable **Merkle snapshot**. Each atom's canonical string is hashed (SHA-256) into a leaf; leaves are sorted and zero-padded to a power of two; internal nodes are computed bottom-up to a single root. The store is **sharded** (consistent hashing via Google's jump-hash maps each atom deterministically to one of N independent shards), and a master kernel combines the per-shard roots into one master root with a monotonically increasing version counter.

When an agent retrieves an atom, the response carries a **proof**. In full mode this is `{ leaf, root, auditPath[] }` — the sibling hashes along the O(log N) path from leaf to root — which any party can verify offline without trusting the server. In the default compact mode the server returns a verified summary `{ verified, treeVersion, shardId }`, saving roughly 85% of proof bytes while preserving the security guarantee for agent-to-server interaction; full proofs remain available on demand for forensics or third-party audit.

The system also supports **consistency proofs** (adapted from RFC 6962, the Certificate Transparency log format): given two tree versions, it proves that the later tree is an append-only extension of the earlier one — that history was added to, not rewritten. This is what lets a compliance reviewer establish, cryptographically, that the memory an agent acted on at version *v* genuinely existed at version *v* and was never silently edited.

The payoff is a property no vector store has: **every recalled fact is accompanied by a proof of what was known, and when.**

### 3.4 Markov prediction and adaptive decay

A passive index answers "what is similar to this query?" A *predictive* memory also answers "given what I just recalled, what tends to come next?" MMPM maintains a **variable-order Markov model** over atoms: a weighted transition graph where the weight of an arc *a → b* reflects how often recalling (or training on) *a* has been followed by *b*. Agents reinforce sequences explicitly — a `train` call over `[a, b, c]` strengthens *a → b* and *b → c* — so successful workflows leave a durable trace that the memory can later replay as a prediction.

Crucially, weights **decay**, and they decay *adaptively*. Rather than a single global half-life, MMPM uses **half-life regression (HLR)** — a model from the spaced-repetition literature (Settles & Meeder, 2016) — to give each atom its own half-life as a function of observable features:

$$\text{halflife}(\text{atom}) = \text{base} \cdot 2^{\,\theta \cdot x}$$

where the feature vector $x$ includes access count, training passes, atom type, and provenance, and the learned coefficients $\theta$ weight them. The effect is intuitive: a `procedure` decays far slower than a transient `state`; a human-sourced fact persists longer than an unverified guess; an atom that is accessed and reinforced keeps itself alive, while one that is never recalled fades. Effective weight at read time is `raw · 0.5^(elapsed / halflife)`. Memory, in other words, *forgets the way a well-organised mind forgets* — preferentially shedding the ephemeral and the unused.

### 3.5 Conflict detection

Because atoms are named compositionally, MMPM can detect contradictions cheaply and automatically. The detector strips provenance suffixes, tokenises the identifier on underscores, and splits it into a **conflict key** (all tokens but the last) and a **claim** (the last token). Two `fact` atoms that share a key but differ in claim are flagged as competing: `v1.fact.payment_mode_live` and `v1.fact.payment_mode_test` correctly conflict; same key *and* same claim is a duplicate, not a conflict. The index is maintained incrementally, so conflict status is an O(1) lookup rather than an O(N) scan.

Every bootstrap response therefore carries, per atom, a `contradiction` block listing any competing claims. The agent is told *at retrieval time* when two of its beliefs disagree, and can surface the contradiction to the user or resolve it (by tombstoning the stale one) rather than silently acting on whichever happened to rank higher. This is the substrate's primary defence against **stale-truth drift** — the slow accumulation of contradictory beliefs that plagues any long-lived memory.

### 3.6 Retrieval: a four-phase ranking pipeline

The central read operation, `session_bootstrap`, takes an *objective* and returns a ranked, token-budgeted set of atoms with proofs. Ranking proceeds in four phases:

1. **Base relevance** — a hybrid scorer combines BM25 lexical scores with embedding similarity by *max-pooling* rather than linear blending (`max(bm25, scale·embed) + boost·min(...)`), which avoids the interference that a naive weighted sum produces when the two signals disagree.
2. **Edge-boosted scoring** — an atom richly connected (by confident edges) to other relevant candidates is boosted multiplicatively (capped at 1.25×); an atom with incoming `supersedes` edges is penalised (it has been outmoded); an atom that is `member_of` the active domain is boosted 1.15×. Graph topology shapes ranking *without* a full second-stage rerank.
3. **Markov contribution** — optionally, spreading activation from the top anchors flows through the Markov graph, adding the predicted-next atoms into the candidate scores. This is the step that lets memory surface *"you'll probably need this next"* items that pure similarity would miss.
4. **Evidence gating** — in high-impact mode, a composite evidence score (relevance 0.55 + proof-presence 0.25 + category 0.10 + conflict-freedom 0.10) filters out weakly-supported atoms, with a fallback so the agent is never left empty-handed.

The result is a retrieval that is simultaneously semantic, structural, predictive, and trust-weighted.

### 3.7 Storage, durability, and serving

Each shard is an independent embedded key-value store fronted by a **write-ahead log**: every atom write is logged and fsynced before it is acknowledged, and an interrupted process replays the uncommitted tail on restart, so a crash mid-write cannot corrupt the tree. Writes accumulate in a pending queue and are committed in batches (by count or interval) into a fresh immutable snapshot; backpressure (HTTP 429 with `Retry-After`) protects the substrate under write storms. A write **policy** layer (`auto-write`, `review-required`, `never-store`, with per-type overrides) governs what may enter memory without human approval. The whole substrate is served over MCP (Streamable HTTP with OAuth2), and in its commercial form is multi-tenant: each customer gets an isolated substrate, from a shared container on entry tiers to a dedicated, TLS-fronted instance on higher tiers.

On internal benchmarks the substrate sustains on the order of a few thousand mixed read/write/train operations per second, with median recall latency around a millisecond and proof verification in tens of microseconds; the figures matter less than their shape — *verification is effectively free relative to retrieval*, which is what makes "return a proof with every read" a practical default rather than an expensive opt-in.

---

## 4. The Substrate as a Queryable Knowledge Source

Step back from the mechanisms and consider the *interaction pattern* they enable. Two paths define how an agent uses MMPM as a knowledge source.

**The write path.** As the agent encounters durable knowledge — a finding, a decision, a state change, a correction — it commits *atoms* via a single checkpoint call that simultaneously adds the atoms, attaches their edges, trains any reinforcing sequences, and tombstones anything they supersede, all in one Merkle commit. Knowledge is captured *as it forms*, not transcribed afterward, so that an interrupted session loses nothing.

**The read path.** When the agent starts a task, it bootstraps: it hands the substrate its objective and receives the most relevant, highest-trust, conflict-checked, prediction-augmented slice of everything it has ever known, each item carrying a proof. Mid-task, it can recall a specific atom (and its predicted successors), search semantically, or follow edges through the graph.

The conceptual shift is this: **memory becomes a source the agent queries, not a transcript it re-reads.** The agent does not page through history; it asks a question of a structured, verifiable store and gets back a ranked, proof-carrying answer. That single shift is what the three applications below exploit.

---

## 5. Applications

### 5.1 A research corpus as a queryable, citable evidence base

Consider an agent tasked with synthesising a body of research — papers, reports, primary sources. The naive approach dumps everything into a vector index and retrieves chunks. The MMPM approach is different in kind: the agent *decomposes* each source into typed atoms and *connects* them.

A finding becomes a `fact` atom; a study's result on a given date becomes an `event`; a methodological rule becomes a `procedure`; the paper itself is a `domain` or hub. Edges carry the intellectual structure: a finding `derived_from` its study, a claim that `supersedes` an earlier one, a result that `depends_on` an assumption, a synthesis `member_of` a topic hub. As the agent ingests more sources, contradictions between them are surfaced *automatically* — two papers asserting `v1.fact.effect_x_positive` and `v1.fact.effect_x_negative` collide on their conflict key and are flagged, turning the literature's disagreements into first-class, queryable signals rather than noise the agent must notice by luck.

What the agent gets is not a pile of passages but an **evidence graph**. Asked a question, it bootstraps against the objective and receives the most relevant claims *with their provenance edges and a Merkle proof of what the corpus contained at ingestion time*. The proof matters: a citation backed by a consistency proof is one a reviewer can verify was not retro-edited. The Markov layer adds a research-specific affordance — having recalled one finding, the memory predicts the related findings the agent reached for last time, reconstructing a line of argument rather than a single hit. The corpus stops being a document to search and becomes **a colleague to consult.**

### 5.2 Streaming exchange data into situational awareness

Now consider a far more demanding source: a live feed from an exchange — ticks, order-book updates, news. Here the value of memory is not archival but *situational*: the agent must hold an accurate, current model of the world and reason over it in motion.

MMPM's design fits this regime in a way a document index does not. Market reality is mutable, so it is stored as `state` atoms — `v1.state.vol_regime_elevated`, `v1.state.spread_widening_AAPL` — which are exactly the atoms HLR decays *fastest*, so stale conditions fade automatically unless reinforced by fresh ticks. Discrete occurrences ("circuit breaker tripped 14:32") are immutable `event` atoms that never decay and remain forever auditable. When the regime flips, the new state atom *supersedes* the old, and the conflict detector guarantees the agent is never simultaneously certain of two incompatible regimes — a stale-belief failure mode that is merely embarrassing in a chatbot and expensive here.

The Markov layer is where situational awareness becomes *anticipatory*. Sequences the agent has reinforced — *spread-widening → volatility-spike → liquidity-withdrawal* — let memory answer not just "what is true now?" but "given the current state, what has historically come next?" That is the difference between a dashboard and a watch-stander. And because every state the agent acted on carries a tree version and proof, the post-hoc question every trading desk eventually asks — *"what did the system actually know at 14:32, and can you prove it?"* — has a cryptographic answer instead of a log file someone could have edited.

*(This describes a memory and situational-awareness architecture, not investment advice or a trading strategy. Whether to act on any signal is a decision for the operator, not the memory.)*

### 5.3 A live structural graph of a codebase

The third source is the code an agent is actively working on. Today a coding agent re-reads files into its context every session and rebuilds its mental model from scratch. With MMPM that model becomes *persistent and structural*.

The codebase maps almost directly onto the substrate's primitives. Modules, services, and functions become atoms; the call graph, the dependency graph, and the module hierarchy become edges — `service_a depends_on service_b`, `function_x member_of module_y`, a refactor that `supersedes` the old implementation. Architectural decisions and their rationale are `fact` atoms linked by `depends_on` to the constraints that drove them; a bug's root cause is a `fact` linked `derived_from` the symptom that exposed it, so the next time a similar symptom appears the memory surfaces the prior diagnosis. Project conventions ("never force-push main", "migrations are human-run") are `procedure` atoms that *constrain* the agent's behaviour and are reinforced so they resist decay — they come back automatically at the start of every session.

Two MMPM properties are especially potent here. The Markov layer learns the *workflows* a codebase induces — touch the schema, and memory predicts the migration file, the type definitions, and the tests that history says come next — turning memory into a navigator of the change, not just a map of the code. And Merkle verifiability gives the codebase graph an audit trail: who (which task) produced which architectural fact, and a proof of the graph's state at any past version. The agent stops re-deriving the shape of the system on every session and starts **remembering it.**

---

## 6. Why the Combination Matters

Each of MMPM's four properties exists in isolation elsewhere. Merkle trees underpin certificate transparency and blockchains. Markov models are textbook. Knowledge graphs are decades old. Conflict detection appears in truth-maintenance systems. The contribution is their *composition behind one MCP-native interface*, and the composition is more than additive:

- Verifiability makes prediction **trustworthy** — a predicted-next atom still arrives with a proof of what it is.
- The graph makes conflict detection **richer** — contradictions can be reasoned about along `supersedes` and `depends_on` edges, not just flagged.
- Prediction makes the graph **dynamic** — Markov arcs are a learned heatmap over the static edge skeleton, so retrieval reflects how knowledge is *actually used*, not just how it was *declared*.
- Typed decay makes the whole store **self-curating** — the substrate sheds the ephemeral and keeps the load-bearing without manual gardening.

A memory with only similarity search has recall. A memory with all four has *judgement*: it knows what is relevant, what is trustworthy, what is contested, what is connected, and what tends to come next.

---

## 7. Comparison, Limitations, and Open Questions

**Versus vector RAG.** Vector search is simpler, has a mature tooling ecosystem, and excels at fuzzy semantic recall over large unstructured corpora. MMPM trades some of that raw recall breadth for structure, verifiability, and prediction. The two are complementary: a production system might use vector recall for wide first-pass retrieval and MMPM for the structured, verifiable, decision-grade memory an agent acts on. MMPM's hybrid scorer already folds embeddings into ranking, so the boundary is porous.

**Versus a plain knowledge graph.** A KG gives structure but no native notion of decay, prediction, verifiable history, or automatic contradiction surfacing. MMPM is a KG with a metabolism and an audit log.

**Versus fine-tuning.** Baking knowledge into weights is durable but slow, opaque, hard to correct, and impossible to audit per-fact. MMPM keeps knowledge external, inspectable, revisable, and provable — and editable in milliseconds.

**Limitations and open questions.** Several questions are genuinely open. (1) *Atom granularity:* the quality of the whole system depends on knowledge being decomposed into well-named atoms; how much of that decomposition can be automated reliably, and how is naming kept consistent across agents and time? (2) *Conflict semantics:* the underscore-key heuristic is fast and surprisingly effective but syntactic; semantic contradiction ("X is safe" vs "X is dangerous") needs deeper modelling. (3) *Markov data hunger:* prediction only lifts retrieval once arc density is high enough; cold-start substrates see little benefit, raising questions about transfer or priors. (4) *Decay coefficient learning:* the HLR coefficients are currently set rather than continuously learned per-substrate from recall outcomes. (5) *Streaming scale:* §5.2's exchange scenario stresses write throughput and commit cadence harder than the conversational workload the substrate was tuned for; characterising that envelope is future work. These are not gaps in the vision but the research frontier the architecture opens.

---

## 8. Conclusion

The bottleneck for AI agents is shifting from reasoning to remembering. An agent that cannot retain, trust, and query what it learns is condemned to re-derive its world every session. RAG restored recall but stopped there. MMPM argues that *agent* memory needs four things at once — proof of what was known, prediction of what comes next, detection of what conflicts, and a graph of how it all connects — and that delivering them behind the Model Context Protocol makes the resulting memory usable by *any* MCP-capable AI, not a single bespoke client. Whether the source is a research corpus, a live exchange feed, or a codebase under active development, the pattern is the same: ingest the world as typed, connected, verifiable atoms, and then *consult* memory instead of re-reading it. The mechanisms are individually well understood; the opportunity is in their coherent combination, and the questions that combination raises are, we think, among the more interesting open problems in agent architecture today.

---

## References

1. Settles, B., & Meeder, B. (2016). *A Trainable Spaced Repetition Model for Language Learning.* Proceedings of the 54th Annual Meeting of the Association for Computational Linguistics (ACL).
2. Laurie, B., Langley, A., & Kasper, E. (2013). *Certificate Transparency.* RFC 6962, IETF.
3. Merkle, R. C. (1988). *A Digital Signature Based on a Conventional Encryption Function.* Advances in Cryptology — CRYPTO '87.
4. Lamping, J., & Veach, E. (2014). *A Fast, Minimal Memory, Consistent Hash Algorithm* ("jump consistent hash"). arXiv:1406.2294.
5. Robertson, S., & Zaragoza, H. (2009). *The Probabilistic Relevance Framework: BM25 and Beyond.* Foundations and Trends in Information Retrieval.
6. Weiss, C., Karras, P., & Bernstein, A. (2008). *Hexastore: Sextuple Indexing for Semantic Web Data Management.* Proceedings of the VLDB Endowment.
7. Anthropic (2024). *Model Context Protocol Specification.* modelcontextprotocol.io.

---

*Parametric Memory — a cryptographically verifiable, predictive memory substrate for AI agents. parametric-memory.dev*
