# Entity Authority Kit — making "Parametric Memory" a distinct, authoritative entity

*Companion to `PAGERANK-DIFFERENTIATION-STRATEGY.md`. This is the execution kit for
Tier A (entity disambiguation) + the identity graph. Goal: get Google's Knowledge
Graph and the answer engines to model **Parametric Memory (the company/product)**
as its own entity, separate from the ML concept "parametric memory."*

The mechanism is **corroboration + consistency**: the same name, logo, handle, and
one-liner repeated across several independent high-trust sources, all cross-linked
via `sameAs`. Inconsistency is the enemy — use the canonical block below *verbatim*
everywhere.

---

## 0. Canonical identity block — paste this verbatim everywhere

| Field | Value |
|---|---|
| **Name** | Parametric Memory |
| **Alternate names** | MMPM · Markov-Merkle Predictive Memory |
| **Handle** | @parametricmem (keep identical across X, GitHub, LinkedIn, YouTube) |
| **One-liner** | The L2 cache for your AI — fast, predictive, verifiable memory for AI agents. |
| **Category** | AI memory infrastructure · Developer tool · MCP server |
| **Disambiguator** | A commercial software product (not the ML concept). Parametric Memory / MMPM is an external, retrievable, Merkle-verifiable memory substrate for AI agents — i.e. *non-parametric* memory, distinct from "parametric memory" meaning knowledge stored in a model's weights. |
| **Logo** | `public/brand/favicon-512.png` (use the *same* mark everywhere — logo consistency is an entity-matching signal) |
| **Website** | https://parametric-memory.dev |
| **Founded** | 2025 |

> **Rule:** never introduce a new logo, a new tagline, or a personal-account handle
> for the brand. Every deviation gives the Knowledge Graph a reason to think these
> are different entities.

---

## 1. Wikidata item — skeleton ready to submit

Wikidata is the single highest-leverage free asset: it's a primary feeder of
Google's Knowledge Graph and is community-editable. Create one item at
wikidata.org (log in → *Create a new item*). Fill it exactly like this.

**Label:** `Parametric Memory`
**Description:** `verifiable persistent memory substrate for AI agents (software product)`
*(the description is what disambiguates it in search — do NOT write "machine learning
concept"; that's the collision. Keep "software product".)*
**Also known as (aliases):** `MMPM` · `Markov-Merkle Predictive Memory`

**Statements:**

| Property | Value | Note |
|---|---|---|
| `instance of` (P31) | `software` (Q7397) *and* `web service` (Q193424) | what it is |
| `subclass of` / `part of` | — | leave blank |
| `developer` (P178) | (your legal entity, once it has an item) | create if needed |
| `official website` (P856) | https://parametric-memory.dev | |
| `programmed in` (P277) | `TypeScript` (Q978185) | optional |
| `operating system` (P306) | `Linux` (Q388), `Docker` (Q2915204) | optional |
| `platform` (P400) | `Model Context Protocol` (if an item exists) | optional |
| `inception` (P571) | `2025` | |
| `described at URL` (P973) | https://parametric-memory.dev/about | |
| `logo image` (P154) | upload the logo to Wikimedia Commons first | optional but strong |

**Identifiers / sitelinks (this is the `sameAs` bridge):** add every external
profile as its Wikidata property so the graph interlinks — `X username` (P2002) =
`parametricmem`, plus GitHub, LinkedIn, Crunchbase identifiers once those exist.

> Wikidata rejects items with no references / notability. Cite the whitepaper (with
> a DOI — see §3), a launch post, and any third-party listing. Create the Wikidata
> item *after* you have 1–2 independent references, or it may be flagged.

---

## 2. `sameAs` activation — one edit as each profile goes live

The Organization JSON-LD in `src/app/layout.tsx` already has the placeholders. As
each profile goes live, **uncomment the matching line** in the `SAME_AS` array and
fill the real URL. Never add a URL before it resolves (a 404 in `sameAs` weakens the
signal — this is enforced by `entity-disambiguation.test.ts`).

```
const SAME_AS: string[] = [
  "https://x.com/parametricmem",                                   // ✅ live
  // "https://www.linkedin.com/company/parametric-memory",         // ← §4
  // "https://www.crunchbase.com/organization/parametric-memory",  // ← §4
  // "https://www.wikidata.org/wiki/QXXXXXXX",                      // ← §1
  // "https://github.com/<public-org-or-repo>",                     // ← §5
  // "https://doi.org/<whitepaper-zenodo-doi>",                     // ← §3
];
```

---

## 3. Publish the whitepaper with a DOI (Zenodo)

You already have `whitepaper/parametric-memory-whitepaper.pdf`. An in-repo PDF is
invisible to the entity graph. Publishing it to **Zenodo** (free, CERN-run) mints a
**DOI** — a citable, permanent scholarly identifier that (a) is a high-trust
`sameAs` node, (b) gives Wikidata a reference, and (c) makes the term "verifiable AI
memory" attach to *your* authored work in academic/answer-engine contexts.

Steps: zenodo.org → New upload → upload the PDF → type *Publication / Working paper*
→ author = Parametric Memory → title exactly as the paper → keywords: "verifiable AI
memory, AI agent memory, MCP, Merkle proofs, Markov prediction" → Publish → copy the
DOI into `SAME_AS` and Wikidata. arXiv is an alternative but has endorsement gating;
Zenodo is instant.

---

## 4. Corroborating company profiles (create in this order)

Each is an independent entity Google already trusts. Use the §0 block verbatim.
Every one must **link back** to https://parametric-memory.dev.

1. **LinkedIn Company Page** (not a personal profile) — highest-trust "this is a
   company" signal. Name, logo, one-liner, website, industry = "Software
   Development." Add the disambiguator line to the About section.
2. **Crunchbase** — company profile; strong KG corroboration. Same block; link site.
3. **Product Hunt / MCP directories** (Glama, Smithery, PulseMCP, MCP.so) — these
   double as backlinks *and* discovery (see `COMPETITOR-OUTRANK.md`). Use `mcp-submit`.
4. *(optional)* **YouTube channel** for a 60-sec `/verify` demo — video is
   disproportionately cited by AI answers and gives another `sameAs` node.

---

## 5. GitHub — recommended play (you asked for advice)

Your substrate repo is private, and it should **stay** private. But "no public
GitHub" leaves one of the strongest authority + entity nodes on the table: GitHub
repos rank fast, accrue links and stars, and are trusted `sameAs` targets.

**Recommendation: open a thin, on-brand *public* repo that exposes proof, not the
substrate.** Best-fit options, in priority:

- **`mmpm-verifier`** — a standalone snapshot verifier (verifies a signed Merkle
  snapshot with no account). This is the *ideal* GitHub surface: it literally
  demonstrates your one uncontested claim (verifiability), it's safe to open (it
  verifies, it doesn't store), and it ranks for "verify AI memory."
- **`@parametric-memory/spec`** — the canonical spec/schema package (you already
  planned this in a sprint). Publishing to npm adds an `npmjs.com` `sameAs` node too.
- **`mmpm-cli`** — the CLI, if it doesn't expose internals.

Put them under a **GitHub organization named `parametric-memory`** (not a personal
account) so the org URL is the clean `sameAs`. README: use the §0 block, link the
site, and anchor links with category text ("MCP memory server", "verifiable agent
memory") — anchor text passes topical relevance.

*If you'd rather not open code yet:* skip GitHub and lean harder on Wikidata (§1),
Zenodo (§3), LinkedIn/Crunchbase (§4), and directories. The plan still works — GitHub
just accelerates it.

---

## 6. X profile — assets + copy (ready now)

Two assets are generated and saved in `public/brand/`:

- **Header/banner:** `public/brand/x-header.png` (1500×500) — "The L2 cache for your
  AI," logo, graph motif, bottom-left kept clear for the avatar overlay.
- **Avatar:** `public/brand/x-avatar-400.png` (400×400) — your existing logo mark,
  X-sized. *Use the same mark you use everywhere* — don't make a bespoke one.

**Bio (160 char max, disambiguation built in):**
> The L2 cache for your AI. Verifiable, predictive memory for AI agents — Merkle-proofed, MCP-native. Not the ML concept; the product. parametric-memory.dev

**Handle:** keep `@parametricmem`. **Location:** your jurisdiction. **Website:**
parametric-memory.dev. **Pinned post:** the `/verify` demo or the L2-cache explainer
— reinforces the term you're trying to own.

---

## 7. Definition of done (what "authoritative" looks like)

- [ ] Wikidata item live, described as *software product*, with ≥2 references
- [ ] Whitepaper on Zenodo with a DOI
- [ ] LinkedIn Company Page + Crunchbase live, both linking the site
- [ ] Public GitHub org (`parametric-memory`) with at least the verifier repo
- [ ] Every one of the above added to `SAME_AS` (uncomment + fill) and to Wikidata
- [ ] X profile updated with the new header, avatar, and disambiguating bio
- [ ] `entity-disambiguation.test.ts` green in CI
- [ ] Re-check a brand SERP in ~4–6 weeks for a Knowledge Panel; confirm `sameAs`
      picked up via Google's Rich Results Test

When most of these are live and cross-linked, the brand query "parametric memory"
starts resolving to *you* as a distinct entity — which is the whole game.
