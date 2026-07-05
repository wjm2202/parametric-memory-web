# Why MMPM — Marketing Source Doc (Instagram / social)

**Purpose:** a single source to spin Instagram posts, carousels, and captions from. Every claim here is honest and grounded — after the 2026-07-04 accuracy cleanup we do not advertise mechanisms that aren't live. Numbers use the verified set; head-to-head benchmark numbers are pending (see BENCHMARK-MMPM-VS-PROMPT-SPEC.md).

---

## The positioning (the spine of everything)

**Most AI memory is a filing cabinet your agent searches. MMPM is a memory your agent can trust, that predicts what it needs, and that sharpens with use.**

Three ideas, in customer language: **trustworthy · predictive · adaptive.**

---

## The benefit pillars (feature → benefit)

1. **Your AI stops forgetting — and stops re-asking.** Every session picks up exactly where the last left off. No re-explaining. *(persistent typed memory across sessions)*
2. **Correct it once. It never makes that mistake again.** Corrections become permanent rules, loaded and checked before every future action. *(corrections stored as permanent procedure atoms)* — the pillar customers feel most.
3. **It surfaces the right memory before you ask.** Learns your AI's recall patterns and pre-fetches what's next — 64% of the time the needed memory is already warm. *(Markov predictive pre-fetch, 64% hit rate)*
4. **You can prove what it remembered — and when.** A cryptographic proof on every read; verify exactly what was stored, tamper-evident, without trusting us. **No other commercial AI memory does this.** *(RFC 6962 Merkle proofs)* — the moat.
5. **Your memory is yours.** Isolated substrate per customer; dedicated infrastructure on Pro/Team. Competitors pool everyone together.
6. **Flat price, no meter.** No per-query charges, ever — so your AI uses memory freely.
7. **Sharpens the more you use it.** *(reinforce-on-access — see "live status" below)* Memories your AI actually relies on stay sharp; the rest fades — like a human brain. Backed by real measurement.

---

## The competitive one-liners (the "why better than X" answer)

- **vs Mem0 / Zep:** they give you *storage*; MMPM gives you *verifiable, isolated, predictive* memory — cryptographic proofs they don't have, your own substrate instead of a shared pool, a prediction layer they lack, and the knowledge graph included at every tier (Mem0 paywalls it behind $249/mo).
- **vs a well-crafted prompt / CLAUDE.md:** a prompt is one session and rots when facts change. **MMPM is a well-crafted prompt that maintains itself and keeps working after your knowledge outgrows the context window.**
- **vs file-based notes:** no ranking, no verification, no recall model — the agent reads whole files and hopes. MMPM is addressable, ranked, and provable.

---

## Verified proof points (safe to put on-screen)

- 64% predictive hit rate (memory warm before you ask)
- Sub-millisecond recall (0.045ms p50)
- 37% fewer tokens via compact proofs
- ~2,900 ops/sec sustained
- RFC 6962 SHA-256 Merkle proof on every read — **only** commercial AI memory that does
- Isolated substrate per customer; dedicated on Pro/Team
- From $5/mo USD, flat, no per-query cost
- MCP-native (Claude, Claude Code, Cowork, Cursor, Cline) — one config block, no SDK

---

## Ready-to-shoot post concepts

Each = hook (on-image) + caption angle + visual idea.

1. **"Your AI has amnesia. We fixed it."** — Split image: goldfish vs elephant. Caption: persistence across sessions, stop re-explaining.
2. **"Tell it once."** — A correction turning into a lock icon. Caption: corrections become permanent rules applied every future session.
3. **"Prove it."** — A memory with a cryptographic seal / receipt. Caption: every recall comes with a Merkle proof — verify what your AI remembered, tamper-evident. No competitor offers this.
4. **"A prompt forgets on Friday. MMPM doesn't."** — Calendar with a fading vs solid note. Caption: the well-crafted-prompt-that-maintains-itself angle.
5. **"64% of the time, it's already there."** — Big stat card. Caption: predictive pre-fetch explained in one line.
6. **"Your memory. Not a shared pool."** — One locked vault vs a crowded shared room. Caption: isolated substrate per customer.
7. **"Memory that gets sharper the more you use it."** — A path worn smoother with footsteps. Caption: reinforce-on-access, brain-inspired. *(gate on live status below)*
8. **Carousel — "MMPM vs Mem0 vs Zep"** — feature grid: proofs / isolation / prediction / graph-included / flat pricing. Honest checkmarks.
9. **"We run our whole business on it."** — Behind-the-scenes: engineering, billing, deploys all on MMPM. Caption: customer zero — we depend on it in production.
10. **Coming soon teaser** — "Soon: real numbers. MMPM vs a perfect prompt." — build anticipation for the benchmark.

---

## Tone & guardrails

- Confident, plain, a little brainy. No hype we can't back.
- Lead with the pain (forgetting, re-explaining, un-provable recall), then the mechanism.
- Superlatives allowed **only** where literally true: "the only commercial AI memory with cryptographic proofs."
- Don't quote prices from images — link the live page (prices change).

---

## LIVE STATUS — read before scheduling posts

- Pillars 1–6 and all "verified proof points": **LIVE.** Safe now.
- Pillar 7 / post #7 ("sharpens with use", reinforce-on-access): **built and measured, shipping.** Once it ships to prod (default-on, pending final gates + commit), this becomes a fully honest live claim backed by real before/after numbers. **Hold post #7 until it's live** — same discipline as the "edges boost scoring" fix.
- Post #10 (benchmark teaser): fine to tease; the numbers themselves wait on BENCHMARK-MMPM-VS-PROMPT-SPEC.md.

---

## What would make the marketing dramatically stronger

The head-to-head benchmark (spec'd separately). The moment we have "MMPM answered X% at N tokens vs a crafted prompt's Y% at M tokens, and the gap widens as your knowledge grows," posts 4, 5, 8, and 10 all get a hard number instead of a claim. That's the highest-leverage next marketing input.
