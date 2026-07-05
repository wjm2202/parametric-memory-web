# LinkedIn post — MMPM vs. a prompt (for review)

**Image to attach:** `mmpm-vs-prompt-grid.png` (the comparison grid — reused across IG, LinkedIn, and the /benchmark page).
**Format:** attach the square image; post copy below.

---

## Post

Everyone says AI agents need memory. We wanted a number, not a vibe.

So we ran a controlled retrieval benchmark: our memory substrate (MMPM) against a well-crafted prompt, on our real 3,716-fact production corpus. No hand-waving — just one question: when you ask about a specific fact, does the system surface it, and at what token cost?

The results:

→ A recency-maintained prompt surfaced the needed fact 0 of 48 times — even given a 32,000-token budget. The facts you ask about are usually older than any recent-context window reaches.

→ MMPM surfaced all 48 using ~500 tokens. That's 100% recall on roughly 0.2% of the corpus's tokens.

→ On multi-hop queries whose answer shares no words with the question, memory reached 39%, versus 33% for keyword retrieval and 0% for the prompt (directional — n=18).

Here's the part most vendors skip: on direct keyword lookups, classic lexical retrieval tied us at 100%. Memory isn't magic on single-hop keyword questions. Naming where the baseline wins is exactly what makes the other numbers worth citing.

It's deterministic and reproducible — the runner, the probe sets, and the random seeds are all in the repo. Re-run it and you'll get the same numbers.

Full write-up and the questions people actually asked: parametric-memory.dev/benchmark

#AI #LLM #RAG #AIAgents #MCP #MachineLearning #DeveloperTools

---

**Notes for review**
- Tone is builder-to-builder; the honesty line ("classic lexical retrieval tied us") is the differentiator for a technical audience — keep it prominent.
- "Directional — n=18" is deliberate; it pre-empts the "is that significant?" comment and signals rigor.
- Consider posting as the founder for reach, with the image as the single attachment.
