# MCP Directory Listing Kit — Parametric Memory

Copy-paste metadata and steps to list/claim the Parametric Memory MCP server across the major
registries (Glama, Smithery, PulseMCP, MCP.so, mcp.directory). Listings are high-authority
backlinks *and* discovery surfaces — see COMPETITOR-OUTRANK.md. Directories auto-crawl, so you may
already be listed anonymously; the win is **claiming ownership** and controlling the copy.

## ⚠️ Reconcile these first (they appear in your own materials inconsistently)

Fix before you publish a listing, or the config you ship will be wrong:

1. **Endpoint domain.** Docs use `https://<instance>.parametric-memory.dev/mcp`; the homepage shows
   `https://<instance>.droplet-mcp.nz/mcp`. Pick one canonical form.
2. **API key prefix.** Homepage/docs show `mmk_…`; `src/services/key-generator.ts` produces
   `mmpm_…`. Confirm the real prefix and make site, docs, and listings match.

## Listing metadata

**Name:** Parametric Memory
**Alt name / handle:** MMPM
**Slug:** `parametric-memory`
**Category / tags:** memory, long-term-memory, knowledge-graph, verifiable, merkle, rag, agent-memory
**Homepage:** https://parametric-memory.dev
**Docs:** https://parametric-memory.dev/docs
**Pricing:** https://parametric-memory.dev/pricing
**Repo / verifier:** (add once the open-source verifier/CLI ships — see COMPETITOR-OUTRANK.md #5)
**Icon:** `public/brand/favicon-512.png`
**License / model:** Commercial, managed SaaS (isolated substrate per customer)
**Transport:** MCP 2025-03-26 Streamable HTTP
**Auth:** OAuth2 + Bearer token (per-instance API key)

**Short description (≤160 chars):**
> Verifiable long-term memory for AI agents. Merkle-proofed, predictive, MCP-native — from $5/mo. Give Claude, Cursor, or any MCP client durable cross-session memory.

**Long description:**
> Parametric Memory (MMPM) is a persistent, cryptographically verifiable memory substrate for AI
> agents, delivered over MCP. Every fact is sealed in an RFC 6962 Merkle tree, so an agent can
> prove its memory wasn't altered — something vector or graph memory can't do. A Markov prediction
> layer pre-loads the context an agent is about to need, and knowledge-graph edges capture
> relationships. It drops into Claude Code, Cursor, Claude Desktop, or any MCP client with one
> config block — no database or SDK to run. Isolated substrate per customer, from $5/mo.

**Key tools (11):** `memory_session_bootstrap`, `session_checkpoint`, `memory_search`,
`memory_access`, `memory_context`, `memory_associate`, `memory_train`, `memory_list_atoms`,
plus verification/analytics tools. (Pull the full list from `content/docs/mcp/tools.mdx`.)

**Connection config (ship with placeholders):**
```json
{
  "mcpServers": {
    "parametric-memory": {
      "type": "streamable-http",
      "url": "https://<your-instance>/mcp",
      "headers": { "Authorization": "Bearer <YOUR_API_KEY>" }
    }
  }
}
```

**Differentiator one-liner (lead with this everywhere):**
> The only AI agent memory with cryptographic proof — MCP-native, from $5/mo.

## How to list / claim

**Fastest:** the open-source `mcp-submit` tool pushes to 10+ directories in one command. Run it
with the metadata above.

**Per-registry:**
- **Glama** (glama.ai/mcp/servers) — highest authority (meta-registry). Find your auto-crawled
  entry and **claim ownership** to verify and control the listing.
- **Smithery** (smithery.ai) — publish with the CLI: `smithery mcp publish <your-endpoint> -n parametric-memory/parametric-memory`.
- **PulseMCP** (pulsemcp.com) — hand-reviewed; submit via their form with the long description above.
- **MCP.so** and **mcp.directory** — community submission forms; mcp.directory also runs the
  comparison posts you want to appear in, so a good listing there is doubly valuable.

## After listing
- Link back from each listing to `/docs` and `/pricing` (the backlink is the SEO value).
- Where the directory supports it, add the verifier/CLI GitHub repo once it exists.
- Re-check quarterly: registries re-rank on freshness and completeness.
