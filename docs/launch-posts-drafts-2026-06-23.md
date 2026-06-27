# Launch Posts — Drafts for Refinement (2026-06-23)

Status: **drafts only**, not posted. Two channels, three artifacts:

1. **LinkedIn** — byline *Glen Osborne*, all business, the commercial case.
2. **Show HN** — byline/handle *entityone*, playful genius voice, with a timeline.
3. **The dedicated writeup** the Show HN submission links to.

Plus a short **posting playbook** (timing + do/don't) at the bottom, from current best-practice research.

Product facts used (all verified against the site/memory): Parametric Memory (MMPM — Markov-Merkle Predictive Memory). Atoms in a SHA-256 Merkle tree, RFC 6962 consistency proofs, PPM Markov prediction at a 64% next-atom hit rate, sub-millisecond recall (0.045ms p50), MCP-native (25+ tools). Site: parametric-memory.dev. Repo: github.com/wjm2202/Parametric-Memory. Plans from $5/mo.

---

## 1) LinkedIn post — Glen Osborne (professional / commercial)

**Audiences woven in:** engineers who want their AI to code better, engineers who want their AI to learn from its own loops, businesses who want intelligence from a question instead of an analyst, and teams ingesting large volumes of data who want to *ask* it for insight.

**Three pillars:** compliance (auditable, cryptographic records) · compounding (value accrues every session) · business intelligence (query your operation in plain language).

---

> **For most teams, AI memory is treated as a convenience. We treat it as a compliance asset, a compounding asset, and a business-intelligence engine — and we bet a company on it.**
>
> Today we're launching **Parametric Memory**.
>
> It's a memory substrate for AI agents. Not a notes file and not a vector database — a system where every fact your AI learns becomes an addressable *atom* in a SHA-256 Merkle tree, recalled in under a millisecond, and ranked by a prediction layer that anticipates what the agent needs next.
>
> Three reasons that matters commercially:
>
> **1. It's auditable by construction.** Every recalled fact comes back with a cryptographic proof against the tree root, and RFC 6962 consistency proofs show the record evolved honestly over time. As regulation pushes toward provable logs of what an AI knew and when (the EU AI Act's record-keeping expectations are the clearest signal), "trust me, the model remembered" stops being good enough. We can show our work.
>
> **2. The value compounds.** A vector store retrieves. A substrate *learns the loop*. Every bug your AI solves, every correction you give it, every decision and its trade-off is stored once and surfaced the next time the same shape appears. The marginal cost of capturing a signal is one atom write; its value contributes to every future inference. The payoff isn't linear — it flips somewhere around the point your project has a few hundred atoms, and the AI starts each session already knowing what you'd otherwise re-explain.
>
> **3. You can query your business, not just your docs.** We run our own billing, provisioning, and operations on this. Instead of building dashboards and hiring analysts to read them, we ask the operational memory in plain language — "what needs a human today?" — and it answers from a verifiable history of everything the system has done. That's the part I'd point an executive at: business intelligence as a question, backed by proof, instead of a report backed by a person.
>
> If your AI writes code, it stops re-deriving the same lessons. If you're ingesting large volumes of data, you stop reading it and start interrogating it. If you're accountable for what your AI did, you can prove it.
>
> We built the entire company on the same memory we sell. It's MCP-native, so any compatible client — Claude, Cursor, Cline — connects and gains persistent, verifiable memory immediately.
>
> Plans from $5/month. Details and live demos at parametric-memory.dev.
>
> Happy to compare notes with anyone building agent systems where memory has to be *accountable*, not just available.

**Alt hooks (swap line 1 to A/B test):**
- *Proof drop:* "We run our company's billing, provisioning, and ops on the same AI-memory product we sell. Last month an AI told us what needed a human — from memory, not a dashboard."
- *Confession:* "We stopped building internal dashboards. We ask our operational memory questions instead — and it can prove every answer."

**Notes:** keep it text-only (no emoji, per brand). First two lines are what shows above "see more" — they carry the post. Don't paste the link in the body if you can put it in the first comment (LinkedIn suppresses reach on posts with outbound links; parking the URL in comment #1 is the common workaround).

---

## 2) Show HN submission — entityone (playful genius)

### Title (pick one — direct, no superlatives)

- **Show HN: I built an AI memory engine in 10 days, then needed a project to prove it works** ← chosen
- Show HN: I built verifiable AI memory in 10 days, then spent months finding something to remember
- Show HN: I built the memory first, then built a whole company to have something to remember
- Show HN: Parametric Memory – Merkle-verified, Markov-predictive memory for AI agents (spec-style fallback)

> HN guideline reminder: the title should be plain and factual. The *story* (and the persona) goes in your first comment, below.

### First comment (post this as your own first reply, immediately)

> Hi HN, entityone here.
>
> Short version of how this exists: I was pair-programming with an LLM and got tired of re-explaining the same context every morning. So I spent about ten days building it a memory. Atoms (named, versioned strings) hashed into a SHA-256 Merkle tree, an RFC 6962 consistency proof so I could verify the tree evolved honestly, and a Prediction-by-Partial-Matching model over the recall sequence so it pre-fetches the next atom before I ask. Sub-millisecond recall. I was very pleased with myself.
>
> Then I hit the problem that is, in hindsight, extremely funny: I had built a memory system and had nothing to remember. A proof of honesty over an empty tree proves nothing. You cannot evaluate a memory substrate on a toy. It needs a real project with real bugs, real corrections, real state that changes under you and lies to you.
>
> So I built one. The "test harness" turned into an actual SaaS — billing, provisioning, DigitalOcean orchestration, the works — written almost entirely with the same AI, using the ten-day memory engine as its long-term memory the entire time. Roughly eight months. The product became the experiment. The experiment became the product. I am aware this is backwards.
>
> A few things I did not expect:
>
> - **Corrections become durable.** The first time I told it "ask, don't guess," it wrote that as a procedure atom with a couple of graph edges and reinforced it. It has loaded on every session since. I taught it once.
> - **Bug shapes are retrievable.** A three-hour crash-loop debug (event loop draining because an unref'd timer died) is now one atom. Next time a process exits clean with no stack trace, that's the first thing it reaches for. It does not re-pay the three hours.
> - **The compounding is real but it's slow at first.** Marginally-better for a few weeks. Around 200–300 atoms it flips and the thing starts sessions already knowing what I'd have re-explained. I can't unsee it now; working without it feels like amnesia.
>
> It's MCP-native (Claude, Cursor, Cline connect with no SDK), there's a REST API, and it ships a 3D Merkle-tree visualiser because I wanted to watch the proofs.
>
> **Honest limitations:** the 64% Markov next-atom hit rate is measured on my own agent sessions — your traffic will differ, and I'd genuinely like more external numbers. It is single-tenant by design (you get your own substrate), so there's no shared-corpus magic across customers. And the discipline is still on the human: the substrate only knows what you bother to make it remember.
>
> Writeup with the actual atom keys and the four moments that changed how I work: [LINK TO WRITEUP]. Repo: github.com/wjm2202/Parametric-Memory. Happy to get torn apart in the comments — the Merkle and PPM internals are the fun part to argue about.

**Persona dial:** the over-the-top genius reads as *self-aware*, not boastful — the brag is undercut by "I am aware this is backwards." HN punishes arrogance about the product but rewards a maker who's precise, honest about limits, and clearly enjoys the internals. Keep the literal, slightly-tangential footnote energy; don't add superlatives about the product itself.

---

## 3) The dedicated writeup (Show HN link target) — entityone

> Save as a blog post (e.g. `content/blog/2026-06-23-i-built-the-memory-then-the-problem.mdx`) and point the Show HN comment at its URL. Alternatively, link the existing dogfooding post (`2026-04-26-building-parametric-memory-with-parametric-memory`) — but this one carries the entityone voice and the timeline HN will want.

---

**Title:** I Built the Memory First, Then Went Looking for Something to Remember

**Subtitle:** A backwards origin story for Parametric Memory — a Merkle-verified, Markov-predictive memory substrate for AI agents — told in the order it actually happened.

The correct way to build a product is to find a problem and solve it. I did it the other way around, and I'd like to walk through the timeline, because the mistake turned out to be the whole point.

**Day 0.** I'm pair-programming with an LLM. Every session starts the same way: I re-explain the architecture, the decisions, the thing we figured out yesterday that it has already forgotten. The context window is not memory. It's a goldfish with a very good vocabulary.

**Days 1–10.** I build it a memory. The design constraints I cared about, in order:

- *Verifiable.* I did not want a probabilistic store that might quietly hand back a corrupted or hallucinated fact. Every piece of knowledge is an **atom** — a named, versioned string — hashed with SHA-256 into a Merkle tree. Recall returns the value *and* a proof path. If the substrate were lying, the proof would fail. It hasn't.
- *Honest over time.* RFC 6962 consistency proofs (the Certificate Transparency trick) let me prove the tree evolved honestly between any two versions. Nobody rewrote history.
- *Predictive.* A Prediction-by-Partial-Matching model watches the order I access atoms and pre-fetches the next one. On my own sessions it lands the next atom about 64% of the time.

Recall came in under a millisecond. I was, briefly, a genius.

**Day 11.** The genius problem: I had a memory system and nothing to remember. You cannot evaluate memory on a toy dataset. A proof of integrity over three test atoms is theatre. The thing only means anything if it's carrying months of real, messy, changing knowledge about a real system — the kind where state goes stale, where you correct the AI and it should *stay* corrected, where a bug you fixed in February comes back wearing a different hat in May.

So I needed a hard, long-running project to point it at. I didn't have one. So I made one.

**Days 12 to ~240.** The "test harness" became a real SaaS: billing, entitlements, Stripe webhooks, per-customer provisioning on DigitalOcean, an operations layer. I wrote almost all of it with the same AI — and the whole time, the ten-day memory engine was its long-term memory. Every architecture decision, every root cause, every correction I gave it went in as an atom. The product I was selling was, simultaneously, the instrument measuring whether it worked.

Four moments from that history that sold me on my own thing:

1. **The correction that stuck.** I caught it guessing instead of asking — it had assumed a sprint order and started writing code on a fact it didn't have. I told it: over-ask, don't wrong-guess. It stored that as a procedure atom, wired two graph edges, reinforced it three times. It has loaded on every session since. I taught it the lesson once. That's the part people who haven't tried memory-backed AI don't appreciate yet: **corrections become durable.**

2. **The bug I didn't debug twice.** A production crash loop — service comes up, runs, dies clean, no stack trace. Three hours to find it: a database pool idle timeout plus an unref'd timer draining the event loop. One atom captured the shape. The next time a process exited clean with no trace, that shape was the first thing the AI reached for. The three hours were paid once.

3. **The migration that lied.** A `CREATE TABLE IF NOT EXISTS` that silently no-op'd because an earlier migration already made the table with a different schema. Deprovisioning quietly broke two weeks later. We stored the root cause; now the AI checks migration history before suggesting a new table, and we have a lint rule. The specific story is in memory, not a generic platitude.

4. **The billing bug that compounded the right way.** Three database writes on a successful payment, not wrapped in a transaction; a network blip left customers with credits but no entitlement. We fixed it transactionally — and weeks later, when a *different* code path had the same half-succeed shape, the AI surfaced the old atom at design time and we wrote it transactional from the start. No second incident. That's the real product: not "the AI remembers," but "the AI's experience of building this codebase compounds."

**Now.** The company runs its own operations on the substrate. Instead of building dashboards, I ask it questions — "what needs a human today?" — and it answers from a verifiable history of everything it has done. That's the use case I'm most interested in beyond coding: an organisation's operational memory as something you *query in plain language*, with a proof attached to every answer, instead of a report a person had to assemble.

So that's the backwards story. I built the memory, realised a memory with nothing in it proves nothing, and built an entire business to give it something worth remembering. The irony is load-bearing: the only way to prove a memory substrate is to live inside it long enough that forgetting would hurt.

If you want to try it: it's MCP-native, so Claude, Cursor, or Cline connect and get persistent, verifiable memory immediately. There's a REST API and a live 3D Merkle-tree visualiser if you, like me, enjoy watching the proofs. Plans from $5/month at parametric-memory.dev. Repo at github.com/wjm2202/Parametric-Memory.

The single most valuable habit it changed: **store the corrections.** When you tell your assistant "no, like this," that's the highest-signal moment in the whole session. Let it live in a substrate and you teach it once. Let it live in the context window and you'll teach it again next week.

---

## 4) X / Twitter thread — entityone (launch-day, mirrors the HN story)

> Post while the Show HN is live so they cross-amplify. Keep each tweet under 280 chars. No hashtags mid-thread (they hurt reach on X); one or two only in the final tweet if at all. Pin tweet 1.

**1/**
I built an AI memory engine in ten days.

Then I realised I had nothing to remember.

A proof of honesty over an empty tree proves nothing. So I built a whole company just to give the thing something worth remembering.

It's backwards. It worked. Here's the story.

**2/**
The engine: every fact the AI learns becomes an atom — a named, versioned string hashed into a SHA-256 Merkle tree. Recall returns the value AND a proof. If memory were lying, the proof fails.

Plus a Markov model that pre-fetches the next atom before you ask. Sub-millisecond.

**3/**
The day-11 problem: you can't evaluate memory on a toy dataset. It needs real bugs, real corrections, real state that changes under you and lies to you.

I didn't have a project like that. So I made one.

**4/**
The "test harness" became an actual SaaS — billing, provisioning, DigitalOcean orchestration — built almost entirely with the same AI, using the ten-day engine as its long-term memory the whole way.

~8 months. The product became the experiment.

**5/**
What I didn't expect: corrections become durable.

First time I told it "ask, don't guess," it stored that as a procedure with graph edges and reinforced it. It's loaded on every session since.

I taught it once.

**6/**
Bug shapes become retrievable too. A three-hour crash-loop debug is now a single atom the AI reaches for the moment it sees the same symptom. It doesn't re-pay the three hours.

The experience of building the codebase compounds.

**7/**
Honest limits: the 64% next-atom hit rate is measured on my own sessions — yours will differ. It's single-tenant by design (your own substrate), so no shared-corpus magic across customers. And it only knows what you bother to make it remember.

**8/**
It's MCP-native — Claude, Cursor, Cline connect with no SDK. There's a REST API and a 3D Merkle-tree visualiser because I wanted to watch the proofs.

parametric-memory.dev — plans from $5/mo.

Tear it apart; the Merkle/PPM internals are the fun part to argue about.

**Alt opener for tweet 1 (sharper):**
"I spent ten days building my AI a perfect memory, then spent eight months building it something worth remembering. The second part was the actual product. 🧵" *(drop the emoji if keeping brand-consistent with LinkedIn)*

---

## 5) LinkedIn post #2 — Glen Osborne ("a skeptic challenged my launch")

> Repurposes the HN Q&A. Real-name byline. Hashtags on last line; link in first comment.

A developer on Hacker News told me he didn't buy my launch. Three questions, all sharp. I answered them honestly instead of defending — including the parts where he was right.

I launched Parametric Memory this week. Within a day, a commenter pushed back with three questions that were better than most of my own marketing. Here's what he asked, and what I told him.

**1. "What's the real benefit of cryptographically proving what my AI stored, and when? Sounds expensive."**

Honest answer: today, for most developers, the benefit is latent. The real reason it's there is a bet on where regulation is heading — the EU AI Act already carries record-keeping and logging duties for higher-risk AI, and "prove what your AI knew, and when" looks like it drifts from optional to expected over the next few years. The cost to add it is tiny — one hash per memory, ~0.03ms to verify a recall — so it's cheap insurance now versus retrofitting provenance onto a year of accumulated memory later. If none of that is your situation, you should weight it near zero. I'm not going to pretend a solo dev needs it on a Tuesday.

**2. "Why should I let you decide the type system for my knowledge — and what if you've got it wrong?"**

It's a default, not a cage. The types exist so the system can mechanically answer "is this still true?" — but we already run different memory structures for different jobs. Our own company runs its operations on a separate, differently-shaped substrate, so we can ask it "what needs a human today?" and get an answer back from our billing and provisioning history. Which is the part people always poke at, so I'll say it plainly: we built the memory engine first, then built an entire SaaS with it as the AI's memory, just to have something real to test it against. We run on it every day.

**3. "Prove your session bootstrap beats me writing my own agent instructions and a CLI alias."**

I can't — I don't have a published head-to-head, and I told him so. For a small, stable project, your file wins; write the file. The substrate earns its place when your memory outgrows what you can paste into a prompt: it ranks against your current objective, surfaces facts that contradict each other before they bite you, and predicts from your actual usage rather than my guess about your priorities.

The lesson: conceding the limits honestly did more for trust than any feature list I could have written.

And the open question he prompted, which I'll put to you too — would you want to design your own memory formats (your own types, conflict rules, decay) for a specific purpose? That's where the roadmap might go, if enough people actually want it.

`#AI #AICompliance #DigitalMemory #BusinessIntelligence #Claude`
First comment: `parametric-memory.dev`

---

## Posting playbook (from current best-practice research)

**Hacker News (Show HN)**
- Best window: Tue–Thu, ~9am–12pm US Eastern. First 30–60 minutes are decisive; ~30–50 upvotes in the first hour to reach the front page.
- Post the maker comment immediately as your first reply (why you built it, the stack, one honest limitation). Done above.
- Title must be plain and specific. **No superlatives** (fastest/best/first) — HN reads through marketing-speak; modest language is stronger.
- **Never ask for upvotes** or share the direct link for others to vote — both risk a shadowban, and seeded votes don't count. Just post and reply.
- Be present in the thread for the first hour; answer critiques substantively (the Merkle/PPM internals are your strongest ground).

**LinkedIn**
- The first 1–2 lines are the whole ad — they're what shows before "see more." Lead with the proof/confession hook, pay it off immediately (the algorithm now weighs dwell time and saves, and penalises clickbait that doesn't deliver).
- Consider putting parametric-memory.dev in the first **comment** rather than the post body to avoid outbound-link reach suppression.
- A launch is a sequence, not one post: this is the anchor; plan 2–3 follow-ups (a short demo video of the 3D visualiser, the "what needs a human today" BI angle, one of the four bug stories) over the following 1–2 weeks.

**Sources:** [How to do a successful HN launch (Lucas da Costa)](https://www.lucasfcosta.com/blog/hn-launch) · [How to launch a dev tool on Hacker News (markepear)](https://www.markepear.dev/blog/dev-tool-hacker-news-launch) · [HN marketing for dev tools (daily.dev)](https://business.daily.dev/resources/hacker-news-marketing-developer-tools-show-hn-launch-day-sustained-coverage/) · [LinkedIn three-phase B2B launch framework (ppc.land)](https://ppc.land/linkedins-three-phase-b2b-launch-framework-why-one-day-is-not-enough/) · [How to write a LinkedIn launch post (Ligo)](https://ligosocial.com/blog/how-to-write-a-linkedin-launch-post-templates-examples-and-best-practices-2025)
