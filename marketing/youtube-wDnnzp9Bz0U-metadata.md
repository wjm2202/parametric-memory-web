# YouTube metadata rewrite — `wDnnzp9Bz0U`

**Video:** "Claude AI, create an L2 cache typescript expert memory for your agents"
**Runtime:** 32:23 · **Published:** 9 Aug 2026 · **Channel:** @parametricmemory

Prepared 9 Aug 2026 under the `youtube-publish` skill. Chapters are derived from
the video's own auto-transcript, sampled at ~30-second resolution — see
[Accuracy note](#accuracy-note) before publishing.

---

## Why this rewrite

The live description is 3 sentences, has no chapters against 32 minutes of
runtime, and contains three errors that a developer audience will notice:

| Live text | Should be |
|---|---|
| `Parametric-memeory.dev` | `parametric-memory.dev` — **the domain is misspelt, so the one link in the description does not resolve** |
| `injest` | ingest |
| `sonet` | Sonnet |

The domain typo is the material one. That description is also what Google reads
when ranking the YouTube result — which, per the 9 Aug Search Console audit, is a
surface the site is now instrumented to measure.

---

## Title

**Recommended** (68 chars):

```
I gave Claude Code a TypeScript expert it can query between sessions
```

Mirrors the framing that already works on this channel ("I gave Claude a memory
of every CVE from the last 6 months"): first-person build-log, two searchable
terms (Claude Code, TypeScript), and it names the problem — *between sessions*.

Alternates:

- `Claude Code forgets your standards. I gave it a TypeScript memory.` (66)
- `Building a TypeScript expert memory for a fleet of coding agents` (64)

> The current title reads as a prompt rather than a claim ("Claude AI, create
> an L2 cache…"), and lowercases "typescript". Keep the existing title if you'd
> rather not lose whatever ranking it has already accrued — but a video with 4
> views has nothing to protect.

---

## Description

Everything between the rules goes in the description box, chapters included.

---

Claude Code is a strong TypeScript programmer, and it still starts every session
knowing nothing about your standards. So I gave it a TypeScript expert it can
query — and left it there.

In this build I point Claude Code at a Parametric Memory substrate over MCP, have
it research current TypeScript language, compiler, lint and testing standards,
and encode what it finds as atoms with typed relations. The substrate then sits
between the model's context window and cold storage as an L2 cache: a new session
queries the expert instead of re-reading the codebase to rediscover conventions.

THE PART THAT MATTERS

Ingest once, query from every project. In an enterprise with fifty repos, the
fiftieth check costs almost nothing — the knowledge is already there. Memory is
the rare infrastructure cost that gets cheaper the more you use it. A context
window only gets more expensive.

It also fixes a consistency problem. A fleet of agents working from separate
context windows produces a fleet of house styles, and the drift compounds across
a codebase. A shared memory gives every agent the same baseline to write against
— and the baseline improves as it is corrected, rather than being re-derived from
scratch each session.

HOW IT WORKS

- Knowledge stored as atoms with typed edges (member_of, supersedes, uses),
  retrieved over MCP
- Every atom committed to a SHA-256 Merkle tree, so a read carries a proof
- A Markov chain prefetches what is likely next: 64% of reads are already warm
- One config block — works with Claude, Claude Code, Cursor, Cline and any MCP
  client

A vector database can delete. Only a parametric memory can forget — unused paths
decay, so relevance does not rot as the store grows.

0.022ms p50 recall, 0.046ms p95. 76.6% on LongMemEval-S with zero setup, 83.0%
with typed ingest — under LongMemEval's own official GPT-4o judge, in a sealed
bundle you can re-verify yourself.

CHAPTERS
0:00 Why a coding agent needs an L2 reference
1:40 Wiring the substrate into the MCP config
3:20 Fresh session, clean context
3:50 The brief: research current TypeScript standards
5:30 Claude runs the research pass
6:35 Encoding the findings as atoms
8:45 Atom design: facts, procedures and ontology
10:25 What is happening in the background
13:30 Why this lifts a lower-tier model
16:05 Coding standards, multiple authors, and drift
19:50 Context rot, and why recall beats grepping
21:50 Using it while you code
23:55 Where it stops scaling
26:05 Types, relations and member_of edges
28:15 Verifying the cache with paraphrased probes
30:20 Cold start: semantic match now, Markov arcs later

LINKS

Try it, from $5/mo: https://parametric-memory.dev

Verify a memory snapshot yourself — no account, and none of our code in the loop: https://parametric-memory.dev/verify

Docs: https://parametric-memory.dev/docs

---

> **Why the links carry an explicit `https://` scheme.** The first version of this
> rewrite used bare domains (`parametric-memory.dev/docs`), matching the original
> description's style. Checked on the public watch page, all three rendered as
> **plain text — YouTube did not auto-link them**. The `.dev` TLD appears not to
> trigger auto-detection without a scheme. Since the original description's single
> link was already dead (misspelt domain), shipping a rewrite whose links were
> merely unclickable would have fixed the spelling and not the problem. Always
> write the full scheme in a YouTube description, and verify link rendering on the
> public page rather than assuming it.

---

## Tags

Paste under **Show more → Tags**:

```
AI memory, agent memory, MCP, Model Context Protocol, Claude, Claude Code, Cursor, TypeScript, coding agents, agentic workflows, L2 cache, vector database, RAG, AI agents, developer tools
```

15 tags: what it is · tools people already search · what it gets compared to ·
what the video is. No other creator's channel name appears — that is misleading
metadata under YouTube's spam policy.

---

## Publishing checklist

Editing an existing video, so no upload preflight is needed. Three things still
apply:

1. **Identity.** Go to youtube.com (not Studio) → avatar → Switch account →
   **Parametric Memory (MMPM)** → reopen the avatar menu and read the name back.
   A Brand Account is technically a separate Google Account and Studio buttons
   act as whichever account is active in the session. The decoy personal channel
   `@EntityOne-j4f` shares this login.
2. **Audience.** While you are in the edit screen, confirm **"No, it's not made
   for kids."** If that radio is wrong, comments are silently disabled — the
   canary is a "Comments disabled" notice on the video in Channel content.
3. **Verify on the public page**, not in the Studio dialog. Load
   `youtube.com/watch?v=wDnnzp9Bz0U` and check: chapters render in the scrubber,
   comments are enabled, and the three links resolve.

<a id="accuracy-note"></a>

### Accuracy note on chapters

These offsets were derived from the video's auto-transcript sampled at roughly
30-second intervals, so a boundary may land a few seconds early or late. That is
within normal tolerance for YouTube chapters, which are authored rather than
precise — but **spot-check three before publishing** (1:40, 13:30, 26:05 are the
ones most likely to have drifted).

This matters more than it looks. The `hasPart`/Clip schema on the site's
`/videos/typescript-expert-memory-l2-cache` page asserts to Google that chapter
offsets are real. Once these chapters exist on YouTube and are confirmed, they
should be copied into the `chapters` array for that video in `src/lib/videos.ts`
— the page currently omits the field, because inventing offsets is a rich-result
violation rather than a shortcut.

### Retention

The `youtube-publish` skill flags a known pattern on this channel: a 13:10 demo
measured 71% motionless, with its best moment buried at 3:55. This video is 32
minutes of screencast and will measure worse. Chapters are the mitigation — on a
static screencast they are the only way a viewer escapes a still frame, and
YouTube surfaces them in search. That is the main reason this rewrite exists.

### Not changed

The YouTube channel URL is already present in the Organization JSON-LD `sameAs`
array (`src/app/layout.tsx:159`), verified live 13 Jul 2026. No action needed.
