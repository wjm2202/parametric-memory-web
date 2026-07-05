# MMPM vs. a Well-Crafted Prompt — Defensible Claims & FAQ

Source of every number: `markov-merkle-memory/docs/BENCHMARK-MMPM-VS-PROMPT-RESULTS.md` (Tier 1 retrieval benchmark, real 3,716-fact production corpus, 2026-07-05). Raw data: `tools/harness/associative/results.bench_vs_prompt.json`.

**Scope disclaimer to attach whenever these are used:** this is a *retrieval* benchmark — it measures whether the fact that answers a query lands inside a token budget, not whether an agent completes a task (that's Tier 2, not yet run). Single real corpus, coding-assistant domain. Token counts approximate (chars/4, applied identically to every method). Reference run on a dirty git tree (`a1c1394`); re-run on a clean tree before quoting in a published artifact.

---

## The three claims you can defend

### Claim 1 — Token efficiency

> "In a controlled benchmark on a real 3,716-fact corpus, MMPM surfaced the fact needed to answer a query using about **500 tokens**, at 100% recall. Carrying the whole corpus into a prompt would cost about **253,000 tokens** — MMPM gets the same answer on roughly **0.2% of the tokens**, and its context never exceeds ~3,400 tokens no matter how large the budget."

**Q: Isn't "carry the whole corpus" a strawman — nobody does that?**
A: Correct, and that's the point. Because you *can't* stuff 253k tokens into a prompt, you need retrieval. MMPM is retrieval that ships with the memory. The 0.2% figure quantifies the gap between "put everything in context" and "rank and surface the relevant slice."

**Q: Where does ~500 come from?**
A: MMPM reached 100% recall (48/48 lookups) at the smallest budget tested — a 500-token budget, ~495 tokens actually spent. Even offered 32,000 tokens it plateaus at ~3,434, because it ranks instead of filling the budget.

### Claim 2 — Recall that survives corpus growth

> "On 48 real recall tasks, a recency-maintained prompt (newest context first) surfaced the needed fact **0 out of 48 times — even with a 32,000-token budget**. MMPM surfaced it **48 out of 48**."

**Q: Why did the recency prompt score zero? That sounds too clean.**
A: We verified it independently. A 32k-token recency window holds only the newest 129 of 3,716 atoms; the newest of the 48 target facts sits 627 atoms deep, the median 1,506 deep. The facts people ask about are simply older than any recent-context window reaches. That's not a rigged result — it's the core reason a rolling prompt window can't be your memory.

**Q: What's the confidence on 0/48 and 48/48?**
A: At these boundary rates the bootstrap is degenerate, so we report Wilson score intervals: 48/48 → [92.6%, 100%], 0/48 → [0%, 7.4%] (n=48).

### Claim 3 — Multi-hop reach (state as directional)

> "On multi-hop queries whose answer shares no words with the question, MMPM's Markov spreading reached the answer **38.9%** of the time, versus **33.3%** for keyword retrieval and **0%** for a recency prompt."

**Q: 38.9 vs 33.3 — is that a real difference?**
A: Directionally yes, statistically not yet — the multi-hop set is only 18 probes, so the confidence band is wide (MMPM 38.9% → [16.7%, 61.1%]). We say "directional" and we're growing the probe set past 100 to confirm. What *is* solid at this n: recency gets 0% and keyword retrieval trails, because the answer shares no words with the query — only a trained memory arc reaches it.

---

## The honesty line that makes the rest credible

> "On plain keyword lookups, classic lexical retrieval (BM25) tied MMPM — both hit 100%. Memory isn't magic on single-hop keyword questions."

Lead with this in a technical room. It signals you tested a real baseline, not a punching bag, which is exactly why the multi-hop and token-efficiency numbers are believable. MMPM's advantages over keyword RAG are: nothing to build or keep fresh, multi-hop reach, and the token plateau — plus properties this benchmark did not test (cross-session persistence, Merkle-verifiable provenance, conflict detection).

---

## General objection handling

**Q: Aren't the lookup queries rigged — the query is built from the target's own words?**
A: For the direct-lookup set, yes, the query lexically matches the target — that's what a lookup *is* ("what did we decide about X?"). The finding there isn't "MMPM is clever," it's "recency misses it entirely while retrieval finds it cheaply." The multi-hop set is the opposite by construction: the answer shares essentially no words with the query, so lexical matching can't reach it.

**Q: Is this reproducible, or a one-off?**
A: Fully. The retrieval is deterministic, so the recall/token numbers are hardware-independent — they don't depend on the machine. The code (`bench_mmpm_vs_prompt.ts`, `bench_arms.ts`), the probe sets, and the fixed random seed for the confidence intervals are all in the repo. Anyone can re-run and get the same numbers.

**Q: How are tokens counted?**
A: A ~4-characters-per-token estimate, applied identically to every method. Because all arms use the same counter on the same text, the *ratios* (the marketing numbers) don't change if you swap in a model-exact tokenizer — only the absolute counts shift slightly.

**Q: Does better retrieval actually mean better answers from the model?**
A: This benchmark stops at "the right context was retrievable." Whether the agent then completes the task better is Tier 2 (LLM-in-the-loop), which we haven't run yet. Don't let a claim imply task-success numbers we don't have.

**Q: Only one corpus?**
A: Yes — our real production substrate (a coding-assistant knowledge base). It's honest and on-domain, but we don't claim these exact figures generalize to every domain. That's stated in the report.

---

## Do not claim (yet)

Not supported by this run: any task-completion / "agent does X% better" number; cross-session retention figures (not an arm here); latency/throughput (not measured here); that MMPM beats vector RAG in general (we tested lexical BM25, and it tied on direct lookups). These need Tier 2, a cross-session arm, and a larger multi-hop set.
