# AI-First Distribution Playbook for MMPM

*Research + prioritized action plan, July 2026. Two parts: (1) how the AI-search
exposure landscape is shifting and what to do now, (2) how to make MMPM a
first-class citizen in Claude. Every claim flagged **[proven]** (primary/official
or peer-reviewed) or **[emerging]** (vendor/single-source). Sources at the end.*

---

## The one finding that reframes the plan

**Getting listed in an MCP registry (Glama, Smithery, PulseMCP, mcp.so) is NOT how
you become first-class in Claude.** Anthropic's **Connectors Directory** — the
catalog users actually see inside Claude.ai, Desktop, Mobile, Code, and Cowork — is
a *separate, Anthropic-vetted* surface that does **not** ingest the open MCP
Registry. Publishing to registry.modelcontextprotocol.io feeds downstream
aggregators, not Claude. **[proven]** So the plays in `COMPETITOR-OUTRANK.md`
(directory listings) are good for backlinks and third-party discovery, but the
*real* "first-class in Claude" lever is a direct submission to Anthropic's
Connectors Directory — which is **free, self-serve, and explicitly "not pay-to-play
and never will be."** That is the headline action, and MMPM is already most of the
way to qualifying.

---

# Part 1 — The shifting AI-search exposure landscape (mid-2026)

## What's actually proven

**Crawler access is now per-purpose, and this is the highest-leverage lever you
control.** Each major engine now runs *separate* bots for search/citation vs.
training vs. live user-fetch, and they're independently controllable in robots.txt
**[proven, first-party OpenAI + Anthropic docs]**:

| Engine | ALLOW to be cited | (Training bot you may block) |
|---|---|---|
| Google | `Googlebot` (mandatory — powers AI Overviews & AI Mode; you can't opt out of AI answers without leaving Search) | `Google-Extended` (Gemini/Vertex training only) |
| ChatGPT | `OAI-SearchBot` | `GPTBot` |
| Claude | `Claude-SearchBot` | `ClaudeBot` |
| Perplexity | `PerplexityBot` | — |
| (third-party training) | — | `CCBot`, `Applebot-Extended`, `Bytespider` |

Blocking a training bot does **not** cost you citations — the search bots are what
get you quoted. **This is the single most concrete, proven action for an AI-first
site.** **[proven]**

**GEO/AEO tactics with real evidence** (Princeton/Georgia Tech/AI2, KDD 2024,
peer-reviewed, GEO-bench of 10,000 queries) **[proven]**:
- Adding **original statistics ≈ +41%** citation visibility; **quotations, cited
  sources, and an authoritative voice** each add ~30–40%. These are the strongest-
  evidence levers in the entire space.
- **Freshness is cross-engine:** AI engines cite content ~26% fresher than classic
  search; pages updated within ~2 months earn materially more citations. Keep
  `dateModified` current and put visible years in titles/headings. **[emerging, converging vendor data]**
- **Off-site distribution beats owned polish.** Brand mentions correlate with LLM
  citations more strongly than backlinks (~3× across studies); earned media across
  many publications reportedly lifts citations up to ~325% vs. publishing only on
  your own domain. Citation share is *concentrated* — ~30 domains earn ~67% of
  citations in a topic, dominated by Wikipedia, YouTube, Reddit, G2. **[emerging]**
- **ChatGPT ≈ the Bing index:** ~87% of ChatGPT-cited pages map to Bing top
  results. If you're not in Bing, you're invisible to ChatGPT Search. **[emerging, converging]**
- **Google page 1 is still a prerequisite** for AI Overviews/AI Mode even though
  URL-level citation overlap is only ~14%. **[proven-ish]**

**Two schema facts that change your on-site plan** **[proven, Google docs]**:
- **Google deprecated FAQ rich results effective May 7, 2026.** Your `FAQPage`
  JSON-LD no longer earns rich results. Keep the Q&A *content* (it's still great for
  answer-engine extraction), but stop treating FAQPage schema as a rich-result win.
- Google states **no special schema is required** for AI Overviews/AI Mode; schema
  is an entity-clarity/trust signal, not an AI ranking switch. Keep
  Organization/SoftwareApplication/Article schema for entity disambiguation (which
  is exactly why we hardened yours), but don't bank on schema *alone* for citations.
- Caveat: the widely-quoted "structured data → 2.3× more AI citations / +73%"
  multipliers are **vendor-only and unverified**; use them as directional, not fact. **[emerging]**

**llms.txt — reset expectations.** ~10% adoption; **Google says outright it does
nothing** for AI Overviews/AI Mode (Mueller compared it to the dead keywords meta
tag); no major answer engine has *publicly confirmed* using it as a citation signal.
Its real, proven use is as a routing layer for **AI coding agents** (Cursor, Claude
Code, Copilot). **Keep yours — it's cheap and helps agent consumption — but don't
count it as an AI-search-visibility driver.** **[proven that Google ignores it; emerging that others use it]**

## What's emerging (watch, don't bet the quarter on)

- **The infrastructure shift is real:** Cloudflare will, from **Sept 15, 2026**,
  *default-block* "mixed-use" crawlers (search+training+agent blended) on ad-hosting
  pages, and is moving from "Pay Per Crawl" to **"Pay Per Use"** (pay publishers when
  content appears in an answer). The **IETF AIPREF** working group is standardizing a
  `Content-Usage` HTTP header + robots.txt extension (distinct `train-ai` vs `search`
  preferences), heading to the IESG ~Aug 2026. **RSL 1.0** (Really Simple Licensing,
  Dec 2025) adds machine-readable AI licensing with `ai-index`/`ai-input` categories.
  **[proven]** For an AI-first SaaS that *wants* to be crawled and cited (not
  monetizing content), the takeaway is defensive: **make sure nothing is accidentally
  blocking the citation bots** (especially if you're behind Cloudflare), and plan to
  adopt the per-purpose access model.
- **Agent-native surfaces are ahead of adoption.** Microsoft **NLWeb** ("MCP for the
  web," uses your schema.org data, exposes an `/mcp` endpoint), Google's **Agentic
  Resource Discovery** (`/.well-known/ai-catalog.json`, June 2026 — a census a day
  after launch found ~**zero** live manifests), and a fragmented "manifest zoo"
  (`ai-agent.json`, `agents.txt`, PAM). **[proven]** Real direction, near-zero
  adoption today. **MCP itself is the one that's actually working as a distribution
  channel** — which is your tailwind (see Part 2).

## Part 1 — action plan for MMPM (by leverage)

1. **Audit `robots.txt` and any Cloudflare/WAF rules to explicitly ALLOW the
   citation bots** — `Googlebot`, `OAI-SearchBot`, `Claude-SearchBot`,
   `PerplexityBot`. Decide your training-bot stance (blocking `GPTBot`/`ClaudeBot`/
   `Google-Extended`/`CCBot` costs no citations). *Highest-leverage, proven, one
   file.* **[proven]**
2. **Get into Bing's index** (Bing Webmaster Tools) — you have Google Search Console
   but ChatGPT Search rides Bing. Submit the sitemap there too. **[emerging-but-cheap]**
3. **Inject original statistics + quotes + named citations into your key pages.**
   You are *rich* in this — 0.045ms p50, 64% Markov hit, ~2,900 ops/sec, RFC 6962,
   your honest benchmark table. The +41% "statistics" lever is the best-evidenced
   tactic in the field and you already have the numbers. **[proven]**
4. **Double down on off-site distribution** (the ~3×/+325% lever): the comparison
   listicles, a YouTube `/verify` demo, a G2 listing, Reddit/DEV.to presence — this
   is where AI citations actually come from, and it reinforces `COMPETITOR-OUTRANK.md`.
5. **Reallocate FAQPage effort:** keep the Q&A content for answer extraction, but
   stop counting on FAQ rich results (dead since May 2026). Keep Organization/
   SoftwareApplication schema (entity clarity — already done). **[proven]**
6. **Keep `llms.txt`, reset its purpose** to "AI coding-agent routing," not search
   visibility. Optional: point it at your MCP setup + the whitepaper.

---

# Part 2 — Making MMPM a first-class citizen in Claude

There are four distribution surfaces, in order of reach. MMPM's MCP-native design
means it can occupy nearly all of them, and it already has the hard parts (OAuth2,
Streamable HTTP, isolated substrates, well-named `memory_*` tools, and a shipped
`mmpm-memory` Skill).

## Surface 1 — the Anthropic Connectors Directory (the main event) **[proven]**

This is the catalog inside Settings > Connectors across **every** Claude product,
and directory entries are automatically eligible for **Suggested Connectors** —
Claude proactively recommending your connector in-chat. Custom (user-added) connectors
are *never* suggested. That "Suggested" eligibility is precisely what "Claude reaches
for MMPM when a user needs memory" means. Ranking is usage-based, app-store style.

**It's free and self-serve.** Submit at **`clau.de/mcp-directory-submission`**.
Anthropic functionally tests every tool with a real account, then policy-scans.

**Hard requirements (each a common rejection cause):**
- Remote MCP over **HTTPS with `Origin`-header validation**. ✅ MMPM is remote MCP.
- **OAuth 2.0** — self-serve paths are **DCR (RFC 7591)** or **CIMD** (Client ID
  Metadata Document). ⚠️ **Action: confirm MMPM does DCR or CIMD — a user-pasted
  `static_bearer` token is NOT supported by the directory**, and pure machine-to-
  machine `client_credentials` (no user consent) is not supported. Register redirect
  URI `https://claude.ai/api/mcp/auth_callback`.
- **Tool annotations, mandatory:** every tool needs a `title` plus `readOnlyHint:true`
  or `destructiveHint:true`, and **read vs. write must be separate tools** (a catch-all
  `api_request(method=...)` is auto-rejected). ⚠️ **Action: annotate MMPM's ~11
  `memory_*` tools** — e.g. `memory_search`/`memory_session_bootstrap` = readOnly,
  `session_checkpoint`/tombstone = write/destructive.
- **Public privacy policy** — missing/incomplete = **immediate rejection**.
- Server calls your **own first-party APIs** (✅), tool names ≤64 chars (✅), no
  prompt-injection patterns in descriptions.

MMPM is close. The gap is: verify OAuth flow is DCR/CIMD (not just bearer), add the
read/write tool annotations, and ensure a public privacy policy URL. Then submit.

## Surface 2 — the tool descriptions (why Claude picks you) **[proven]**

At *every* layer — MCP tool selection, Skill activation, plugin discovery — **the
`description` is the load-bearing signal.** Anthropic's own guidance: "extremely
detailed descriptions are **by far the most important factor** in tool performance…
aim for at least 3–4 sentences per tool," state boundaries vs. adjacent tools, and
name the intents that should trigger it. Tool-selection reliability degrades past
~30–50 loaded tools, so keep the surface tight. **[proven]**

**Action:** rewrite each `memory_*` tool description to (1) name the exact user
intents that should trigger it ("remember across sessions," "recall past facts,"
"load prior context," "save what we learned"), (2) state clear boundaries vs. other
tools, (3) keep the verb-first `memory_`-prefixed naming (already good). This is the
cheapest, highest-ROI change for "Claude reaches for MMPM."

## Surface 3 — a plugin (Claude Code + Cowork reach) **[proven]**

A plugin bundles your **MCP connector + a Skill + a `SETUP.md`** into one installable
unit. You can host your **own marketplace** (a public git repo with
`.claude-plugin/marketplace.json`; users run `/plugin marketplace add owner/repo`) —
**no application needed** — and/or submit to the official `claude-plugins-official`
directory (public repo required; run `claude plugin validate`; optional "Anthropic
Verified" badge after review).

**Action:** you already ship an `mmpm-memory` Skill — wrap it + the connector + a
`SETUP.md` (one-block MCP setup, which is already your homepage hook) into a plugin,
and stand up a public `parametric-memory/mmpm` marketplace repo. This doubles as the
public GitHub surface the entity-authority plan wanted.

## Surface 4 — Skills as the steering layer **[proven]**

A Skill's `description` is its trigger. A Skill can explicitly steer Claude toward
your MCP tools (Anthropic's own example: a skill that teaches a process + a bundled
connector). Skills aren't a standalone submission — **bundle them in the plugin.**
**Action:** ensure the `mmpm-memory` Skill description enumerates the memory intents
verbatim and instructs Claude to call the MMPM tools.

## Also do (but know what it does)

- **Publish to the official MCP Registry** (`mcp-publisher` CLI + `server.json`,
  namespace via GitHub/DNS). This feeds **downstream aggregators** (Glama, Smithery,
  PulseMCP) — good for discovery/backlinks — but **does not surface you in Claude.**
  Do it, but don't confuse it with Surface 1. **[proven]**
- **Optional `.mcpb` desktop extension** for local/offline users (one-click install
  in Claude Desktop; submit to the built-in Extensions directory via
  `clau.de/desktop-extention-submission`). Lower priority for a remote SaaS.

## What requires an Anthropic touchpoint (flagged)

- **Connectors Directory listing** — self-serve form + review (no fee, no agreement).
- **Anthropic-held OAuth client creds** (`oauth_anthropic_creds`) or per-tenant
  `custom_connection` — email `[email protected]`.
- **Enterprise-Managed Auth** provider support — separate Google Form.
- **Strategic/launch partnership** — **Anthropic-initiated only; there is no
  application** and explicitly no expedited/"preferred connector"/pay-to-play track.

---

## Consolidated roadmap (do in this order)

**This week — proven, cheap, high-leverage**
1. `robots.txt`/WAF: allow `Googlebot`, `OAI-SearchBot`, `Claude-SearchBot`,
   `PerplexityBot`; set training-bot policy. (Part 1 #1)
2. Rewrite the `memory_*` MCP tool descriptions to name trigger intents + boundaries;
   add `readOnlyHint`/`destructiveHint` annotations and split read vs. write. (Part 2
   Surfaces 1+2 — also unblocks the directory submission)
3. Submit the sitemap to Bing Webmaster Tools. (Part 1 #2)

**Next 2–4 weeks — the "first-class in Claude" push**
4. Confirm/upgrade the MCP OAuth flow to DCR or CIMD; publish a public privacy
   policy; prepare a reviewer test account → **submit to the Anthropic Connectors
   Directory** (`clau.de/mcp-directory-submission`). *This is the headline action.*
5. Package the `mmpm-memory` Skill + connector + `SETUP.md` into a **plugin**; stand
   up a public `parametric-memory` marketplace repo.
6. Add original stats/quotes/citations to the top pages (you already have the
   numbers); refresh `dateModified`. (Part 1 #3)

**Ongoing**
7. Off-site distribution: listicles, YouTube `/verify` demo, G2, Reddit/DEV.to.
   (Part 1 #4)
8. Publish to the official MCP Registry for downstream aggregators (not for Claude).
9. Watch: Cloudflare Sept-15 mixed-crawler default block, IETF `Content-Usage`
   header, RSL — adopt the per-purpose access posture as it lands.

---

## Sources

**Part 1 — crawlers & standards**
- OpenAI bots (first-party): https://developers.openai.com/api/docs/bots
- Anthropic crawler controls (first-party): https://support.claude.com/en/articles/8896518
- Google crawlers (first-party): https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers
- Google says llms.txt doesn't help (SEJ, May–Jun 2026): https://www.searchenginejournal.com/googles-llms-txt-guidance-depends-on-which-product-you-ask/575431/ · https://www.searchenginejournal.com/google-says-llms-txt-is-purely-speculative-for-now/577576/
- Cloudflare Pay-Per-Use + Sept-15 block (TechCrunch, Jul 1 2026): https://techcrunch.com/2026/07/01/cloudflares-new-policy-pushes-ai-companies-to-pay-for-publishers-content/
- IETF AIPREF drafts: https://datatracker.ietf.org/doc/draft-ietf-aipref-vocab/ · https://ietf-wg-aipref.github.io/drafts/draft-ietf-aipref-attach.html
- Perplexity stealth-crawling (Cloudflare, Aug 2025): https://blog.cloudflare.com/perplexity-is-using-stealth-undeclared-crawlers-to-evade-website-no-crawl-directives/

**Part 1 — GEO/AEO & schema**
- GEO study (Princeton et al., KDD 2024, peer-reviewed): https://arxiv.org/html/2311.09735v3
- Google deprecates FAQ rich results (May 2026): https://developers.google.com/search/docs/appearance/structured-data/faqpage · https://searchengineland.com/google-to-no-longer-support-faq-rich-results-476957
- Schema not an AI ranking switch: https://searchengineland.com/schema-ai-overviews-structured-data-visibility-462353
- Citation concentration (Contently, Apr 2026): https://contently.com/2026/04/29/top-sources-llms-cite/

**Part 1 — agent-native surfaces**
- Microsoft NLWeb (first-party, May 2025): https://news.microsoft.com/source/features/company-news/introducing-nlweb-bringing-conversational-interfaces-directly-to-the-web/
- RSL 1.0 (first-party, Dec 2025): https://rslstandard.org/press/rsl-1-specification-2025
- Google Agentic Resource Discovery (SEJ, Jun 2026): https://www.searchenginejournal.com/google-microsoft-back-draft-ai-agent-discovery-spec/579894/

**Part 2 — Claude ecosystem (all Anthropic/official)**
- Connectors Directory: https://claude.com/docs/connectors/directory
- Directory vs custom: https://claude.com/docs/connectors/building/directory-vs-custom
- Submission: https://claude.com/docs/connectors/building/submission (form: https://clau.de/mcp-directory-submission)
- Review criteria: https://claude.com/docs/connectors/building/review-criteria
- Authentication: https://claude.com/docs/connectors/building/authentication
- Partnership FAQ (not pay-to-play): https://claude.com/docs/connectors/building/partnership-faq
- Enterprise-Managed Auth: https://support.claude.com/en/articles/15537633
- Official MCP Registry: https://modelcontextprotocol.io/registry/about · https://modelcontextprotocol.io/registry/quickstart
- Plugins & marketplaces: https://code.claude.com/docs/en/plugin-marketplaces · https://claude.com/docs/plugins/submit
- Desktop Extensions (.mcpb): https://www.anthropic.com/engineering/desktop-extensions · https://github.com/modelcontextprotocol/mcpb
- Skills: https://support.claude.com/en/articles/12512198-how-to-create-custom-skills
- Writing tools for agents (tool descriptions = selection signal): https://www.anthropic.com/engineering/writing-tools-for-agents · https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use
