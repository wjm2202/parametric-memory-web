# Traffic Strategy — grounded in data, not guesses

Built from (1) your real Search Console query data, (2) live research of the AI-agent-memory market and the questions developers actually search, July 2026.

## 1. What your own data says (the problem)

Your Search Console queries for the last 3 months — **every single one is branded or a definition of your name**:

| Query | Impressions | Clicks |
|---|---|---|
| parametric memory | 248 | 4 |
| what is parametric memory | 14 | 0 |
| parametric memory meaning | 6 | 0 |
| scalable persistent memory | 2 | 0 |
| substrate ai | 1 | 0 |

Two conclusions, both important:

- **You have ~zero top-of-funnel visibility.** You only appear when someone already knows your name. You do **not** rank for the category terms that would bring *new* people — "AI agent memory", "Mem0 alternative", "MCP memory server", etc. That is where the traffic is, and you're not in it.
- **Your name collides with an established ML term.** "Parametric memory" already means *knowledge baked into a model's weights* (as opposed to *non-parametric* = external, retrievable memory). So "what is parametric memory" / "parametric memory meaning" searchers want a **definition of the concept**, not your product — which is why those impressions convert to 0 clicks. Ironically your product is a *non-parametric* memory system, so the name works against discovery. (See §5.)

## 2. What the market looks like (the opportunity)

The AI-agent-memory category is hot and **saturated with comparison content you are completely absent from.** The players developers compare: **Mem0, Zep, Letta, Cognee, Graphiti, LangMem, Supermemory.** The high-traffic content is listicles and head-to-heads — "Mem0 vs Zep vs Letta vs Cognee 2026", "best AI agent memory frameworks 2026", "Mem0 alternatives". MMPM appears in none of them.

Facts worth knowing:
- The category's standard benchmark is **LongMemEval** (Mem0 self-reports 94.4%; Zep 63.8% on GPT-4o; Mem0 49.0% on the same test). If you want to be taken seriously in comparisons, running LongMemEval (not just your own probes) is the price of entry.
- Competitor pricing anchors: Mem0 Pro graph at $249/mo, Zep Flex ~$125/mo. **Your $5–$29 pricing is dramatically cheaper** — a real wedge the comparison articles would highlight.
- **MCP is an underexploited niche you're built for.** "MCP memory server", "give Claude Code persistent memory", "Claude memory across sessions" all have real demand, and the competitors there are thin (mem0's MCP server, `claude-mem`). You are MCP-native — this is your least-crowded, highest-fit lane.

## 3. The strategy — five plays, in priority order

**Play 1 — Get into the comparison conversation (highest intent, proven demand).**
Publish your own definitive comparison: *"MMPM vs Mem0 vs Zep vs Letta — AI agent memory compared."* Be honest and specific (that's what makes it cited). Lead with your genuine wedges: cryptographic verifiability (nobody else has it), MCP-native drop-in, and price. This page targets the exact queries thousands of developers already search, and — because your `robots.txt` already allow-lists AI answer engines — it's the kind of page ChatGPT/Perplexity/Claude cite. The `/benchmark` page you just built is the proof asset that backs it.

**Play 2 — Own the MCP / "give Claude memory" lane (best fit, least crowded).**
A tutorial page + blog post: *"How to give Claude Code (and Cursor) persistent memory in one config block."* You already have the one-block MCP setup as your homepage hook — turn it into a standalone, search-targeted guide. This is where you can rank fastest because the competition is weakest and your fit is strongest.

**Play 3 — Answer the educational questions (top-funnel + AEO citations).**
Expand the FAQ and blog with the questions developers actually ask (§4). These capture people earlier in the journey and are the pages AI answer engines quote. You already have FAQPage JSON-LD — feed it more questions.

**Play 4 — Turn the name collision into content.**
Publish a definitive *"Parametric vs non-parametric memory in LLMs — explained"* page. It captures the existing "what is parametric memory" demand, ranks for a real concept, and honestly positions MMPM as verifiable non-parametric/hybrid memory. It converts a branding liability into a keyword asset.

**Play 5 — Off-site: get listed.**
The category's traffic flows through third-party "best AI memory tools" roundups. Reach out to the authors of the DEV.to / Medium / MCP.directory comparison pieces to be added, and submit to MCP directories/registries. A single inclusion in a ranking listicle can outperform months of your own SEO.

## 4. The questions to target (ready-to-use FAQ)

Grounded in what developers are actually searching. Priority: 🔥 = high intent / proven demand.

**Comparison & selection (🔥 bottom-funnel):**
- "What's the best memory system for AI agents?" → comparison page
- "Mem0 vs Zep vs Letta vs Cognee — which should I use?" → comparison page
- "What's a cheaper alternative to Mem0 / Zep?" → pricing + comparison (your $5 wedge)
- "How is MMPM different from Mem0 / Zep?" → FAQ + comparison

**MCP / Claude (🔥 best fit):**
- "How do I give Claude Code persistent memory?" → MCP guide
- "How do I make my AI agent remember across sessions?" → MCP guide
- "Is there an MCP server for long-term memory?" → MCP guide

**Educational (top-funnel + AEO):**
- "How does LLM memory work?"
- "Short-term vs long-term memory for LLM agents — what's the difference?"
- "What should an AI agent store in long-term memory?"
- "Do I need a vector database or a knowledge graph for agent memory?"
- "What is parametric vs non-parametric memory?" (the name-collision page)

**Trust / your differentiator:**
- "Can I trust / verify what my AI agent remembers?" → Merkle-proof story (nobody else answers this)
- "How much does AI agent memory cost?" → pricing intent, your wedge

Each of these should be (a) an FAQ entry with a crisp answer + FAQPage JSON-LD, and (b) where demand is high, its own page targeting the query in the title/H1.

## 5. Honest caveats

- **SEO is slow for a new low-authority site.** You have ~12 indexed pages and single-digit clicks; ranking for competitive category terms takes months of content + links. The fastest returns are Play 2 (MCP niche), Play 5 (off-site listings), and AEO citations — not head-on competition for "AI agent memory".
- **The name is a real headwind.** "Parametric Memory" is a known ML concept and describes the *opposite* of what you do. You don't have to rename, but your **titles and H1s should lead with category language** ("AI agent memory", "persistent memory for Claude") rather than the brand, so you're findable by problem, not just by name.
- **To win comparisons, run the standard benchmark.** Your own probe-based numbers are honest but bespoke; publishing a **LongMemEval** result puts you on the same axis as Mem0/Zep and makes your comparison page credible.

## 6. Do this first (next 2 weeks)

1. Ship the `/benchmark` page + nav/sitemap changes (already built) and request indexing.
2. Write the **MCP "give Claude memory" guide** (Play 2) — fastest win.
3. Add the §4 FAQ entries to `/faq` (JSON-LD already in place).
4. Draft the **MMPM vs Mem0/Zep comparison** page (Play 1), backed by `/benchmark`.
5. List MMPM in 2–3 MCP directories and reach out to one comparison-article author (Play 5).

---

### Sources
- [Designing Memory Systems for LLM Agents (Medium)](https://medium.com/@candemir13/designing-memory-systems-for-llm-agents-from-short-term-context-to-long-term-knowledge-b27a1d4d5516)
- [LangMem — Long-term Memory in LLM Applications](https://langchain-ai.github.io/langmem/concepts/conceptual_guide/)
- [5 AI Agent Memory Systems Compared: Mem0, Zep, Letta… (DEV)](https://dev.to/varun_pratapbhardwaj_b13/5-ai-agent-memory-systems-compared-mem0-zep-letta-supermemory-superlocalmemory-2026-benchmark-59p3)
- [Best AI Agent Memory 2026: Mem0 vs Letta vs Zep vs Cognee (MCP.Directory)](https://mcp.directory/blog/mem0-vs-letta-vs-zep-vs-cognee-2026)
- [Best Mem0 Alternatives 2026 (EverMind)](https://evermind.ai/blogs/mem0-alternative)
- [How to give Claude Code persistent memory with a self-hosted mem0 MCP server (DEV)](https://dev.to/n3rdh4ck3r/how-to-give-claude-code-persistent-memory-with-a-self-hosted-mem0-mcp-server-h68)
- [claude-mem — Persistent Context Across Sessions (GitHub)](https://github.com/thedotmack/claude-mem)
- [Parametric vs. Non-Parametric Memory in LLMs (Medium)](https://lawrence-emenike.medium.com/a-straightforward-explanation-of-parametric-vs-non-parametric-memory-in-llms-f0b00ac64167)
- [Long-Term Memory for AI Agents: The What, Why and How (Mem0)](https://mem0.ai/blog/long-term-memory-ai-agents)
