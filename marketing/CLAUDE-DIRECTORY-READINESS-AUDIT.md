# Claude Connectors Directory — Readiness Audit for MMPM

*What's needed to submit MMPM to Anthropic's Connectors Directory (the surface that
makes it first-class in Claude). Audited against the live MCP server
`markov-merkle-memory/tools/mcp/mmpm_mcp_server.ts` + `mmpm_oauth_provider.ts`,
July 2026. Companion: AI-FIRST-DISTRIBUTION-PLAYBOOK.md.*

## Verdict: closer than expected — one real blocker

The hardest requirement (OAuth 2.0 with Dynamic Client Registration) is **already
implemented**. The one true blocker is **missing tool annotations**. Fix that, verify
two small things, and MMPM is submittable.

| Requirement | Status | Note |
|---|---|---|
| Remote MCP over HTTPS + `Origin` validation | ✅ | Streamable HTTP server, served over TLS |
| **OAuth 2.0 (DCR / RFC 7591)** | ✅ | `/oauth/register`, `/authorize`, `/token`; `authorization_code` + `refresh_token`; discovery metadata present |
| Redirect URI `https://claude.ai/api/mcp/auth_callback` | ✅ (verify) | DCR accepts arbitrary `redirect_uris`, so it'll register — just confirm no allow-list rejects it |
| `.well-known/oauth-protected-resource` (RFC 9728) | ⚠️ verify | Claude discovers the auth server from the MCP endpoint via this; confirm it's served |
| **Per-tool `readOnlyHint` / `destructiveHint` annotations** | ❌ **BLOCKER** | Absent from the `ListTools` response — directory auto-rejects without these |
| Read vs. write are separate tools (no catch-all `api_request`) | ✅ | Tools are purpose-specific; `session_checkpoint` is a coherent write, not a generic method dispatcher |
| Detailed tool descriptions (the selection signal) | ✅ strong | Already 3–4+ sentences each; minor intent-keyword optimization below |
| Public privacy policy URL | ⚠️ verify | Confirm `/privacy` is substantive, public, and linked (missing = instant rejection) |
| Human-readable tool `title` | ⚠️ minor | Currently `title: tool.name`; a friendly title is nicer but not blocking |

---

## Blocker: add tool annotations

`mmpm_mcp_server.ts` (~line 1195) returns tools as `{ name, title, description,
inputSchema }` with **no `annotations`**. The directory requires every tool to
declare `title` + `readOnlyHint` (or `destructiveHint`). Recommended mapping for the
11 live tools:

| Tool | readOnlyHint | destructiveHint | idempotentHint |
|---|---|---|---|
| `memory_session_bootstrap` | true | — | true |
| `memory_search` | true | — | true |
| `memory_access` | true | — | true |
| `memory_context` | true | — | true |
| `memory_list_atoms` | true | — | true |
| `memory_markov_density_report` | true | — | true |
| `memory_associate` | true | — | true |
| `memory_weekly_eval_status` | true | — | true |
| `session_checkpoint` | false | **false** | false |
| `memory_recluster` | false | false | true |
| `memory_weekly_eval_run` | false | false | false |

`session_checkpoint` is `readOnlyHint: false` (it writes) but **`destructiveHint:
false`** — the substrate is an **append-only Merkle log with a non-mutating
default**. Existing atoms are never overwritten or hard-deleted; the only removal
(`tombstone` / `removeEdges` / `supersedes`) is a *recoverable logical marker* that
leaves the atom in verifiable history. That non-mutating default is now stated
explicitly in the tool description and asserted by the test. Everything that only
reads is `readOnlyHint: true`.

**The change** (illustrative — implement via the `memory-dev` workflow with a test):
add an `annotations` field to each tool definition in `createToolDefinitions`, then
surface it in the `ListTools` handler:

```ts
// in createToolDefinitions(): give each def an annotations object, e.g.
// { name: 'memory_search', description: '...', inputSchema: {...},
//   annotations: { title: 'Search memory', readOnlyHint: true, idempotentHint: true } }

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefs.map(tool => ({
    name: tool.name,
    title: tool.annotations?.title ?? tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,   // ← the missing piece
  })),
}));
```

This is a substrate change → run it through the `memory-dev` skill and add a test
asserting every tool exposes an `annotations` object with a boolean `readOnlyHint`
or `destructiveHint` (so it can't regress before submission).

---

## Optimization: lead descriptions with the trigger intent

Descriptions are the load-bearing signal for Claude *choosing* MMPM. They're already
detailed, but several lead with internal mechanics (e.g. "Addresses the
production-measured 5% Markov dominantNext density…"). Move the **user intent** to
the first sentence so tool-selection matches user phrasing:

- `session_checkpoint` → start with: *"Save durable knowledge to persistent memory so
  it survives across sessions — facts, decisions, corrections, and state the user or
  agent will want next time."* (then the mechanics)
- `memory_session_bootstrap` → *"Load relevant prior context at the start of a task —
  recall what was learned, decided, or corrected in previous sessions."*
- `memory_search` → *"Search everything the agent has ever remembered, by meaning."*

Name the phrases users actually say — "remember this," "what do we know about,"
"pick up where we left off," "recall," "load context." Same signal wins at the Skill
layer: make the `mmpm-memory` Skill's `description` enumerate those intents verbatim.

---

## Two things to verify (not code)

1. **`.well-known/oauth-protected-resource`** (RFC 9728) is served from the MCP
   origin so Claude can discover the auth server. Quick check:
   `curl -s https://<mcp-host>/.well-known/oauth-protected-resource`.
2. **Public privacy policy** at a stable URL, linked from the site and referenced in
   the submission. This is a hard, common rejection cause.

---

## Submission sequence

1. Add annotations (blocker) + verify the two items above.
2. Prepare a **reviewer test account** (Anthropic functionally tests every tool).
3. Submit at **`clau.de/mcp-directory-submission`** (needs a Team/Enterprise org).
   "Plan in weeks, not days" for review.
4. In parallel, optimize the tool + Skill descriptions and bundle the `mmpm-memory`
   Skill + connector + `SETUP.md` into a **plugin** (public marketplace repo) for the
   Claude Code / Cowork surface.

Once listed, the entry becomes eligible for **Suggested Connectors** — Claude
proactively recommending MMPM when a user needs memory, which is the whole goal.

---

## What I changed already

- `public/robots.txt` — added the 2026 citation bots (`OAI-SearchBot`,
  `Claude-SearchBot`, `Claude-User`, `Perplexity-User`) and made the training-bot
  stance explicit. That's the Part-1 quick win; this audit is the Part-2 path.
