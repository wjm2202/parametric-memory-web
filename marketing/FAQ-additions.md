# FAQ additions — traffic-targeted questions

Drop these into the `faqs` array in `src/app/faq/page.tsx` (before the closing `];` at line 265).
They match your existing `{ question, answer, category }` shape and use your existing categories
(`what`, `why`, `ai`, `security`, `setup`). Every one targets a query developers actually search
(see TRAFFIC-STRATEGY.md). Answers are kept short and self-contained so AI answer engines can quote
them cleanly.

```ts
  {
    question: "How is Parametric Memory different from Mem0 or Zep?",
    answer:
      "Mem0 is a vector-first memory layer and Zep builds a temporal knowledge graph — both are strong at recall, but neither lets you prove what was stored. Parametric Memory is MCP-native and adds cryptographic verifiability: every fact is sealed in an RFC 6962 Merkle tree, so your agent can prove its memory wasn't altered. It's also markedly cheaper — from $5/mo versus $125–$249/mo for comparable paid tiers.",
    category: "why",
  },
  {
    question: "What's a cheaper alternative to Mem0 or Zep for AI agent memory?",
    answer:
      "Parametric Memory starts at $5/mo (Starter) and $9/mo (Solo) for an isolated substrate, with dedicated infrastructure from $29/mo (Professional). Every tier includes Merkle proofs, Markov prediction, knowledge-graph edges, and MCP-native access — features that sit behind higher-priced plans elsewhere.",
    category: "why",
  },
  {
    question: "How do I give Claude Code or Cursor persistent memory?",
    answer:
      "Add an MCP memory server to your client config. Sign up for a Parametric Memory instance, claim your API key from the dashboard, and paste one config block (your endpoint plus a Bearer token) into Claude Code, Cursor, Claude Desktop, or any MCP client. Restart the client and your agent has durable, cross-session memory — no database or SDK to run.",
    category: "setup",
  },
  {
    question: "What's the difference between short-term and long-term memory for AI agents?",
    answer:
      "Short-term memory is the context window — it holds the current conversation and disappears when the session ends. Long-term memory persists across sessions, tools, and restarts, and must be ranked and retrieved on demand because it quickly outgrows any context window. Parametric Memory is long-term memory: it stores facts durably and surfaces the relevant slice when a new session starts.",
    category: "ai",
  },
  {
    question: "Do I need a vector database or a knowledge graph for agent memory?",
    answer:
      "Vector search is good at fuzzy recall; a knowledge graph is good at relationships and facts that change over time. Parametric Memory combines ranked retrieval with knowledge-graph edges and Markov prediction behind one MCP endpoint, so you don't have to build, tune, or host either yourself.",
    category: "ai",
  },
  {
    question: "What is parametric vs non-parametric memory in LLMs?",
    answer:
      "Parametric memory is knowledge baked into a model's weights during training — fast but fixed and unverifiable. Non-parametric memory is external and retrievable, so it can be updated, inspected, and proven. Parametric Memory (the product) is a verifiable non-parametric memory: your knowledge lives outside the model, is retrieved on demand, and every fact carries a cryptographic proof.",
    category: "what",
  },
  {
    question: "Is “Parametric Memory” actually parametric or non-parametric memory?",
    answer:
      "The product is a non-parametric, external memory substrate — your facts live outside the model and are retrieved on demand, not stored in the model's weights. We use the name for the brand; technically it's verifiable non-parametric memory with a predictive (Markov) retrieval layer that gives it some of the always-there feel of parametric memory.",
    category: "what",
  },
  {
    question: "Can I verify or trust what my AI agent remembers?",
    answer:
      "Yes. Every memory is written into an RFC 6962 Merkle tree, so altering a single stored fact changes the root hash. You can verify a signed memory snapshot yourself — no account, no API key, and none of our code in the loop — which is something vector or graph memory systems can't offer.",
    category: "security",
  },
  {
    question: "How do I make my AI agent remember across sessions?",
    answer:
      "Give it an external memory it manages itself over MCP. With Parametric Memory, the agent stores decisions, conventions, and corrections as it works, and on the next session it bootstraps the relevant context automatically — so it never starts from zero. Setup is one config block in your MCP client.",
    category: "setup",
  },
```

**Also update the FAQ page metadata/H1** to lead with category language so it's findable by problem, not just by brand — e.g. title `AI Agent Memory — FAQ (Parametric Memory)` and an intro line mentioning "long-term memory for LLM agents, MCP, and how it compares to Mem0 and Zep."
