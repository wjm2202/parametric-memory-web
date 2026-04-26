# Ground Rules — Human-Only Operations (HARD RULES)

**These four rules override every other instruction in this file and every session-specific instruction.** If a rule would be violated to complete a task, STOP and tell the user exactly which rule applies, what you would have done, and what you need them to do instead. Do not work around a rule by phrasing the action differently — the rules are about the *effect*, not the tool name.

1. **Git is human-only.** Claude NEVER runs `git commit`, `git push`, `git tag`, `git merge`, `git rebase`, `git reset --hard`, `git checkout -- .`, `git clean`, `git stash drop`, or any other history-mutating or remote-touching git command without an explicit, unambiguous ask in the current message. "Continue", "go ahead", and "ship it" are NOT git authorization on their own — they must name the git operation. When a commit/tag/push is needed, hand the user the exact command with a one-line reason and let them run it. Read-only commands (`git status`, `git diff`, `git log`, `git show`) are fine.

2. **File deletion is human-only.** Claude NEVER runs `rm`, `rmdir`, `mv <file> /dev/null`, `git rm`, and NEVER invokes `allow_cowork_file_delete`. When a file needs to go, hand the user the exact `rm` command with a one-line reason and let them run it. This rule applies even when the deletion is obviously safe — e.g. unwiring dead code, cleaning up generated artifacts, removing test scratch files.

3. **`.env` files are human-only.** Claude NEVER reads, writes, edits, creates, renames, copies, or diffs any `.env*` file (`.env`, `.env.local`, `.env.production`, `.env.staging`, `.env.test`, `.env.example` is the one exception — committed templates are fine). Secrets live in the human's head and the human's password manager. If an env var is missing or wrong, tell the user which key is needed, which file it belongs in, and why; let them add it. Claude MAY read `src/config.ts` or equivalent to understand which env vars the code expects.

4. **pgadmin and direct DB ops are human-only.** Claude NEVER runs `psql`, never connects to Postgres interactively, never opens pgadmin, never issues raw `INSERT` / `UPDATE` / `DELETE` / `ALTER` / `DROP` / `TRUNCATE` against a live database. All schema changes go through a migration file under `migrations/` (see the `migration` skill) and the human runs the migration. All data fixes go through a reviewed script and the human runs the script. Read-only `SELECT` queries run against Testcontainers test databases from inside integration tests are fine — that's not a live DB.

**Memory anchor.** `v1.other.hub_bootstrap_ground_rules` in MMPM holds these rules as trained, decay-resistant procedures. If memory is healthy, these rules come back automatically on `memory_session_bootstrap`. This document is the belt-and-braces backup for when memory is offline or the atoms haven't loaded yet. If this file and memory ever disagree, **this file wins** — memory is eventually consistent; this file is statically loaded.

---

# Persistent Memory (MMPM)

Persistent memory via MMPM MCP at `mmpm.co.nz`. Survives across sessions. Goal: enrich the substrate with durable design/technical knowledge so memory becomes the project's technical advisor.

## Core Rule

Memory first, files second. Store knowledge via `session_checkpoint` as it forms, not as an afterthought. If the session dies mid-work, unsaved knowledge is gone.

## Session Start

On the first user message of a new conversation, run `memory_session_bootstrap` with `objective` from the message and `maxTokens: 1200`. Review `conflictingFacts` — surface contradictions, tombstone the stale one. For high-stakes requests (deploy, architecture, production), re-bootstrap with `highImpact: true`, `evidenceThreshold: 0.75`. Do not re-bootstrap on every prompt.

**Skip bootstrap entirely** for simple or step-by-step interactive work — terminal commands, quick questions, single-file edits, back-and-forth debugging. Bootstrap only when starting a new complex task that genuinely needs prior context (architecture, deploy planning, sprint work). Skip on continuation after context compaction.

## If Memory Is Unreachable

**HARD STOP.** If any MMPM tool fails to connect, stop and tell the user memory is offline, that proceeding would lose prior context and risk repeating mistakes, and that they should restart the **mmpm** connector (pointing to `https://mmpm.co.nz/mcp`) in Claude Desktop → Settings → MCP Servers, then start a new conversation. Do not attempt workarounds. Wait for confirmation before doing any work. **Note:** the Ground Rules section at the top of this file still applies when memory is offline — it is statically loaded.

## Domain & Task Detection (after bootstrap)

1. **Domain detection** — in priority order: mounted folder name (`mmpm-website` → `v1.domain.website`, etc.) → project/repo in first message → project-specific skill triggered → keyword in objective (confirm lightly, e.g. "setting this up under compute — right?") → ask the user.
2. **Task creation/reuse** — parse objective, search active tasks in that domain for keyword match. Reuse if found, else create. Link: `v1.task.X` → `member_of` → `v1.domain.Y`.
3. Pass `taskContext` to all `session_checkpoint` calls for the session (auto-creates `produced_by` edges on new atoms).
4. **Task completion only on explicit "done" / "ship it".** Session end does NOT complete tasks.

## Token Budget

After bootstrap, before work, assess workload. If 3+ tasks, multiple workstreams, or heavy session, invoke the `token-budget` skill. It routes to the cheapest capable tier (haiku for file ops, sonnet for code/content, opus for architecture/strategy), sequences by value/dependency, and enforces checkpointing at 70% context. Applies to interactive and scheduled sessions alike. Every session is planned, not improvised.

## What to Store

**Immediately:** user corrections (highest priority), architecture decisions, bug root causes, hard-won config, research findings (progressively), sprint state changes.
**Session end:** updated `v1.state.*` atoms, tombstone obsolete states, reinforce Markov arcs for successful workflows.
**Never:** secrets/passwords (server rejects with 422), speculative guesses, trivial conversation.

## Atom Format

`v1.<type>.<concise_snake_case_identifier>`

Types: `fact` (stable truths), `state` (mutable work context), `event` (immutable dated milestones), `relation` (links between things), `procedure` (rules/processes), `domain` (long-lived project/area, rarely tombstoned), `task` (active/completed/abandoned work objective).

**Naming:** short, keyword-dense, under 10 tokens. Jaccard similarity is `overlap / union` — longer names dilute match. Name for your future self, using keywords future objectives will match. No colons/periods/punctuation — underscores only.

**Conflict detection:** last underscore token = "claim", everything before = "conflict key". `v1.fact.payment_mode_live` and `v1.fact.payment_mode_test` correctly conflict. **Never** use numbered suffixes — they cause false positives. Provenance suffixes (`_src_human`, `_src_research`, `_src_test`, `_dt_YYYY_MM_DD`) are stripped before conflict detection.

## Tombstoning

Tombstone `state` atoms when state changes, `fact` atoms when proven wrong. **Never** tombstone `event` atoms. Use `session_checkpoint`'s `tombstone` array.

## Knowledge Graph Edges — MANDATORY

**Every `session_checkpoint` MUST include edges wherever atoms relate.** Not optional. Edges are permanent (no decay), boost bootstrap scoring, and are the primary mechanism that makes memory useful across sessions. Skipping edges wastes the work done to build this feature. Use the `edges` array in `session_checkpoint`.

| Edge type | Use when |
|---|---|
| `supersedes` | New atom replaces an older one (pair with tombstone or leave both live) |
| `member_of` | Atom belongs to a hub cluster (`v1.other.hub_*`) |
| `depends_on` | Atom requires another to be true first (config → procedure) |
| `constrains` | Atom limits what another can do (policy → strategy) |
| `references` | Atom mentions/uses another without depending on it |
| `derived_from` | Finding came from investigating another atom (bug → root cause) |
| `produced_by` | Atom was created during a task (immutable provenance) |

**Required patterns:** new `procedure` atoms → `member_of` a relevant hub + `supersedes` any older procedure they replace. User corrections → `constrains` the behaviour corrected + `member_of` `v1.other.hub_corrections`. Architecture decisions → `depends_on` driving facts. Bug root causes → `derived_from` the symptom atom. Atoms checkpointed with active `taskContext` → `produced_by` the task (auto-created by `session_checkpoint`).

## Hub Architecture

Eight hub atoms are cluster anchors. **Every new atom MUST get a `member_of` edge to its hub at checkpoint time** — classify before you commit. Do not defer to the background agent. An atom can belong to multiple hubs.

| Hub atom | Belongs here if about |
|---|---|
| `v1.other.hub_bootstrap_ground_rules` | Hard human-only rules (git, file deletion, .env, pgadmin), source-of-truth file paths, session bootstrap anchor |
| `v1.other.hub_mmpm_compute` | billing, provisioning, DO workers, Stripe, credit, PM2, mmpm-compute, docker |
| `v1.other.hub_mmpm_testing` | test infra, integration tests, E2E scenarios, Testcontainers, mock-do-server, vitest |
| `v1.other.hub_mmpm_core` | MMPM server, Merkle tree, shards, PostgreSQL, SSE, API, auth, Markov |
| `v1.other.hub_memory_procedures` | checkpoint, tombstone, train, edges, session workflow, atom naming |
| `v1.other.hub_sprint_state` | sprint tracking, roadmap, milestones, architecture upgrades, KG sprints |
| `v1.other.hub_corrections` | user corrections to Claude behaviour, hard rules, git rules, team protocols |
| `v1.other.hub_visualization` | substrate viewer, R3F, WebGPU, TSL, Merkle viz, KG UI |

The nightly `association-agent` scheduled task catches orphans at 2am, but it is a safety net, not a substitute — add hub edges inline.

## Correction Handling

Highest priority event in a session. When the user corrects you:

1. Store as `v1.procedure.*` immediately via `session_checkpoint` — do not wait for session end.
2. Same checkpoint call: add edges `constrains` → the corrected behaviour, `member_of` → `v1.other.hub_corrections`.
3. Reinforce with 3 `memory_train` passes after the checkpoint commits (training silently skips non-existent atoms).
4. Apply in all future sessions — check procedures before any action.

## Reinforcement

Each `memory_train` adds +1 weight; decay is `weight × 0.5^(days/7)` (three passes → weight 3 → 1.5 after one week, still strong). Always checkpoint atoms before training them.

| Context | Passes |
|---|---|
| User corrections | 3 |
| Proven workflows | 2 |
| Re-reinforcement | 1 |

## Live Association Agent (Haiku, Background)

A haiku subagent runs in parallel during active sessions — the hippocampal fast-encoder, finding cross-domain bridges in real time while you focus on the user's work.

**Spawn rule:** after every `session_checkpoint` that stores new atoms, spawn a haiku subagent in parallel with your next action. You do NOT wait for it — continue working. Skip on bootstrap, on the session-end checkpoint, and on tombstone-only or train-only checkpoints. Spawn in the SAME message as your next tool call or response.

**Spawn prompt template** (fill bracketed values from session context):

```
You are the MMPM live association agent. Fast cross-domain bridge detection.

Context:
- Current domain: [v1.domain.X]
- Current task: [v1.task.X]
- Atoms just checkpointed: [atom keys]

Steps:
1. Call `memory_associate` with atoms, domain (current), allDomains (from bootstrap).
2. For each suggested edge with similarity >= 0.7, write via `session_checkpoint` with ONLY edges (no atoms, no taskContext):
   edges: [{ source, target, type: "references", confidence: 0.4, createdBy: "live-agent" }]
3. If response has a domain switch signal (2+ atoms matching a different domain), return it.

Rules: only `references` edges (never member_of/supersedes/produced_by/etc); max 5 edges per run (top by similarity); append-only (never modify or tombstone); no taskContext in checkpoint calls; if `memory_associate` fails, return silently — losing low-confidence edges is acceptable.
```

**Handling results:** if the agent returns a domain switch signal, surface at a natural break: "You seem to have shifted to [domain] — update the context?". Otherwise ignore — edges are already in memory and the nightly opus agent promotes/demotes them. A typical pulse costs <500 tokens; haiku is ~60x cheaper than opus.

## Session End

**Mandatory.** Run `session_checkpoint` with new atoms and tombstoned states. Do NOT include `train` for atoms created in the same call. Then separately run `memory_train` for key arcs (2–3 passes). Do NOT spawn the live association agent on the final checkpoint — the session is closing.

Checklist: corrections stored as procedures? Decisions stored as facts? State atoms updated? Obsolete states tombstoned? Successful workflows trained? **Every new atom has a `member_of` hub edge?**
