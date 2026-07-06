# Emulating the Ranker: How to Win the "Parametric Memory" Collision

*A PageRank-lens teardown of why the name collision costs you rankings, and the
highest-leverage plays to be findable on your own merits. Decision on record:
**keep the name, win on authority.** No rename.*

Date: 2026-07-06 · Scope: strategy + prioritized action plan (no site edits in this pass)

---

## Bottom line

You do not have a content problem. You have a **graph problem.**

Ranking is decided by three machines stacked on top of each other — a relevance
matcher, a **link-graph authority score (PageRank)**, and an **entity
disambiguation layer** (the Knowledge Graph). Your existing work — the bridge
page, the L2-cache positioning, the FAQ/AEO pages, the JSON-LD — is almost
entirely aimed at the *first* machine. It's good work and it's mostly shipped.

But the collision is won or lost in the *second and third* machines, and those
are driven by **off-domain links and entity references you barely have yet.**
Your `sameAs` graph points to exactly one node (X). You have no independent
corroborating entities (Wikidata, GitHub org, Crunchbase, LinkedIn company) telling
Google that "Parametric Memory" is *a company* and not *a concept*. That is the
single biggest unclaimed lever on the board, and it's cheap.

The plan below is ordered by **leverage on the ranking algorithm**, not by effort.

---

## 1. How the ranking machine actually sees you

Think of a query resolving through four subsystems in sequence. For each, here is
what it "sees" when someone searches near your name.

### Machine 1 — Lexical / relevance retrieval
Matches query tokens to page tokens (BM25-style), then re-ranks with learned
semantic models. **Verdict: you're competitive here.** Your pages now contain the
exact strings "parametric vs non-parametric memory," "verifiable AI memory," "L2
cache for AI," "MCP memory server." When a query's tokens match, you *can* be
retrieved. This machine is not why you lose.

### Machine 2 — PageRank / link-graph authority
Every page is a node; every link is a weighted vote. Your score is the
probability a random surfer lands on you. Authority flows through **inbound links
from pages that themselves have authority.** This is a *global* property of the
web graph — you cannot manufacture it on your own domain.

**Verdict: this is where you lose.** arxiv.org, medium.com, and the vocab sites
that own "parametric memory" have enormous accumulated PageRank and thousands of
scholarly inbound links. `parametric-memory.dev` is a young domain with a thin
backlink profile. On a head query where the algorithm must choose between "a
20-year-old ML concept documented by high-PageRank academic sources" and "a
2025 product on a low-PageRank domain," the concept wins by construction. **No
amount of on-page optimization overrides a link-graph deficit.**

### Machine 3 — Entity resolution / Knowledge Graph
Before ranking, Google tries to decide *which entity* the query and each candidate
page are about. "Parametric memory" currently resolves to a **concept node**
(a topic in ML). Your goal is to get Google to instantiate a **second, distinct
entity** — "Parametric Memory, the company/product (a.k.a. MMPM)" — and attach the
brand queries to *it*.

**Verdict: this is your highest-ROI battleground, and it's under-invested.** Entity
creation is driven by **corroboration across independent sources**: a Wikidata
item, a Crunchbase page, a GitHub org, a LinkedIn company page, and a rich
`sameAs` array that ties them all together. You have `alternateName: "MMPM"` (good)
but `sameAs` lists only X. The Knowledge Graph has almost nothing to build a
distinct entity from, so it keeps folding you into the concept.

### Machine 4 — Answer-engine synthesis (AEO)
AI Overviews, ChatGPT, Perplexity, Claude don't rank ten links — they synthesize
from 5–15 cited sources chosen for self-contained answers, schema, and E-E-A-T.
**Verdict: your best-designed lane, and correctly prioritized.** Your Q&A pages,
FAQPage schema, TL;DRs, and `/verify` proof asset are exactly what gets cited.
The constraint here is again corroboration: answer engines cite entities they
can *resolve and trust*, which loops back to Machine 3.

---

## 2. The diagnosis, in one paragraph per layer

- **Relevance:** solved. You appear for the terms. (248 impressions on
  "parametric memory" proves retrieval works.)
- **PageRank:** you're bringing a knife to an artillery duel on the head term.
  You will *never* out-authority arxiv for "parametric memory," and you shouldn't
  try. The move is to **redirect the fight to terms with no incumbent authority**
  ("verifiable AI memory," "L2 cache for AI," "MCP memory server") where the
  link-graph starts near zero for everyone and first-mover links compound.
- **Entity:** you are invisible *as an entity.* Google models you as a string
  inside a concept, not a thing in the world. Fixing this is what makes the brand
  query "parametric memory" start resolving to *you* — and it's mostly off-page
  profile creation, not engineering.
- **AEO:** well-built, but citation depends on the entity being resolvable and
  corroborated. AEO is downstream of the entity fix.

---

## 3. What you've already got right (don't redo these)

Credit where due — this is a mature stack:

- **The bridge page is live** (`parametric-vs-non-parametric-memory.mdx`) —
  captures the concept query at 0% CTR and routes it. Correct move.
- **Positioning pivot is correct.** "L2 cache for AI" and "verifiable AI memory"
  are uncontested lanes; the title lockup already leads with them, not the bare
  brand. This is the right way to *sidestep* the PageRank deficit rather than
  fight it head-on.
- **On-page entity signal started:** `alternateName: "MMPM"`, Organization +
  WebApplication + SoftwareApplication JSON-LD, llms.txt, actions manifest.
- **AEO content shipped:** Q&A pages for L2 cache, verifiable memory, Mem0/Zep
  alternatives, give-Claude-memory — all dated 2026-07-05 with FAQPage schema.

The strategy docs (`NAME-COLLISION-ANALYSIS`, `POSITIONING-L2-CACHE`,
`BEAT-THE-COMPETITION`, `TRAFFIC-STRATEGY`, `COMPETITOR-OUTRANK`) already
diagnose the collision and the content plays well. **This document does not
replace them — it re-sequences them by algorithmic leverage and fills the one
hole they under-weight: the off-domain graph.**

---

## 4. The gap they all under-weight

Every existing doc is a *content* plan. But re-read Machines 2 and 3: rankings on
the collision are decided by **the link graph and the entity graph**, which live
*off* your domain. You can publish the perfect page and still lose because the
random surfer never reaches it and the Knowledge Graph never resolves you.

So the plan's center of gravity has to shift from "publish more pages" to
**"acquire authority nodes and corroborating entities that point at those pages."**
Content is the ammunition; links and entities are the gun.

---

## 5. The action plan, ordered by leverage on the algorithm

### Tier A — Entity disambiguation (highest ROI, lowest effort, do this week)

The cheapest way to make "Parametric Memory" resolve to *you*. Each item is a
corroborating node; together they let Google mint a distinct brand entity.

1. **Fatten `sameAs` to a real identity graph.** Today it's `["x.com/parametricmem"]`.
   Add every profile you control: GitHub org, LinkedIn company page, Crunchbase,
   the whitepaper's DOI/arxiv/Zenodo record, a YouTube/demo channel, and a
   Wikidata item once it exists. *This is a one-line JSON-LD change with outsized
   effect* — `sameAs` is the primary machine-readable "these are all the same
   entity" signal.
2. **Create a Wikidata item** for "Parametric Memory (software) / MMPM," typed as
   *software* with `instance of`, `developer`, and official-website statements.
   Wikidata is a top feeder of Google's Knowledge Graph and is community-editable.
   This is the strongest single disambiguation asset you can create for free.
3. **Stand up the corroborating profiles** you don't have yet: GitHub org (even if
   only the verifier/CLI/spec repos live there), LinkedIn company page, Crunchbase.
   Each is an independent entity Google already trusts, all pointing back with the
   *same* name + `alternateName: MMPM`.
4. **Register in Google's canonical namespace:** verify the domain in Search
   Console (you already have GSC data, so this is likely done — confirm the
   Organization is claimed), and ensure the brand name + logo are consistent
   across all profiles (entity matching is literal about name/logo consistency).

*Why first:* it's hours of work, it's off-page (so it dodges your domain's
PageRank deficit entirely), and it's the precondition for Machines 3 and 4 to
ever attribute the brand query to you.

### Tier B — Link graph / borrowed authority (the actual PageRank move)

You can't grow domain authority by writing on your own domain. Acquire it.

5. **Claim every MCP directory listing** (Glama, Smithery, PulseMCP, MCP.so,
   mcp.directory) via `mcp-submit`. Each is a high-PageRank inbound link *and* an
   entity co-citation *and* a discovery surface. This is the fastest authority you
   can buy with time, not money. (Already scoped in `COMPETITOR-OUTRANK.md` — it's
   listed here because it's a top-3 PageRank lever, not a footnote.)
6. **Mirror your two best pages on DEV.to and Medium** with `rel=canonical` back
   to your domain. Those domains rank in days because *their* PageRank is already
   huge; you borrow it and funnel the click home. Target: the Mem0/Zep comparison
   and the give-Claude-memory guide.
7. **Get into the existing comparison listicles.** The "5 AI memory systems
   compared" posts *are* the category's high-PageRank front page and you're in
   none. One inclusion = a strong contextual backlink from a page that already
   ranks. Outreach with your honest wedge (verifiability + price) and a
   LongMemEval number.
8. **Ship a public GitHub surface** (verifier / `mmpm-cli` / `@parametric-memory/spec`).
   GitHub repos accrue links and stars and rank for "verify AI memory," "MCP
   memory CLI." It's an authority node you fully control and it's on-brand (it
   *proves* your core claim). Anchor its README links with category text, not the
   bare brand.

*Why anchor text matters (PageRank detail):* the algorithm attributes an inbound
link's topical relevance partly to its **anchor text**. Prefer "AI agent memory,"
"MCP memory server," "verifiable agent memory" over "Parametric Memory," so each
link pushes you up the *category* terms you can win, not the concept term you can't.

### Tier C — Sharpen the on-page you already have

Mostly done; these are refinements, not new pillars.

9. **Every `<title>`/H1 leads with the ownable category term, never the bare brand.**
   The homepage lockup does this; audit interior pages and docs for the same rule.
10. **Make the bridge page bidirectional.** It should rank for the concept *and*
    internally link (with category anchor text) to `/verify`, the L2-cache page,
    and the comparison — turning captured concept-traffic into product-intent
    flow. Confirm it does.
11. **Keep pushing the collision-free token "MMPM."** It has zero collision; every
    profile, repo, and directory listing should carry it so "MMPM" becomes a clean
    branded query the concept can't dilute.

### Tier D — Proof of parity (credibility gate for Tier B outreach)

12. **Run LongMemEval privately; publish only if competitive.** It's the shared
    axis every comparison cites. You need a number on that axis to be *added* to
    listicles (Tier B item 7). Pair it with verifiability — "comparable recall,
    plus cryptographic proof" — which is the one claim no competitor can match.

---

## 6. Simulated ranking scorecard

How the machine scores you *today* vs. *after this plan*, per query class.

| Query class | Example | Today | Root cause | After plan |
|---|---|---|---|---|
| Concept head term | "parametric memory" | Lose (buried under arxiv) | Machine 2: link-graph deficit vs academic corpus | **Don't contest** — capture via bridge page, route to product |
| Concept definition | "what is parametric memory" | Shown, 0% CTR | Machine 1 match, intent mismatch | Win the click with the honest bridge page |
| Brand term | "MMPM", "parametric memory dev" | Win (already #1 branded) | — | Reinforce; make MMPM the clean token |
| Uncontested category | "verifiable AI memory", "L2 cache for AI" | Winnable, thin authority | Machine 2: nobody has authority *yet* | **Win** — first-mover links compound |
| Discovery / buyer intent | "MCP memory server", "Mem0 alternative" | Absent | Machine 2: not in the link graph | **Win the MCP lane** via directories + listicles |
| Entity attribution | (Knowledge Panel for the brand) | None | Machine 3: no corroborating entities | **Create the entity** via Tier A |

The strategic core: **concede the head term, redirect PageRank competition to
zero-incumbent lanes, and spend your cheapest hours on the entity graph.**

---

## 7. What to measure (and when to revisit the name)

Watch in Search Console + the answer engines:

- **Non-branded impression share** — the % of impressions from category terms
  (not your name). This is the real "found on our own merits" number. It should
  climb as Tier B lands.
- **Entity resolution** — does a brand search eventually produce a Knowledge Panel?
  Does `sameAs` get picked up? (Check via the Rich Results test and a brand SERP.)
- **AEO citations** — are you quoted in AI Overviews / Perplexity / ChatGPT for
  "verifiable AI memory," "MCP memory server," "Mem0 alternative"? Track monthly.
- **Referring domains** — count of distinct linking domains. This is your literal
  PageRank input; it should go from single digits upward as directories/listicles land.

**Revisit the rename only if**, after Tier A + B have been live ~2 quarters,
non-branded impressions still won't grow *and* no distinct brand entity has formed.
That would be the signal the name is a hard ceiling — but the plan above solves the
collision without paying the rename's reset cost on equity and backlinks.

---

## 8. The one-sentence version

*Stop fighting arxiv for a concept term you can't out-authority; instead mint a
distinct brand entity off-domain (Wikidata + `sameAs` + profiles), buy real
PageRank through MCP directories and listicle inclusion, and let your already-good
content win the uncontested "verifiable / L2-cache / MCP memory" lanes where the
link graph starts at zero for everyone.*
