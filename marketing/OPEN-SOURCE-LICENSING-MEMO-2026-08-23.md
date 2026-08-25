# Open-sourcing MMPM with paid commercial use — licensing decision memo

**Date:** 2026-08-23 · **Stage:** planning, licence decision only · **Release plan:** held until the licence is chosen
**Stated constraints:** protect self-host commercial licences first · worried about reverse engineering · worried about future profitability · goal is adoption
**Status:** v2 — v1 recommended a revenue-threshold licence and was withdrawn after a red-team pass found it protects the wrong party and rests on two legal claims that don't survive checking. Corrections logged in §9.

---

## Bottom line

**Do not pick a licence yet. Four facts have to land first, and three of them change the question.**

**1. You already have the licence you described, and you already have the SKU.** `markov-merkle-memory/LICENSE` is the "Parametric Memory — Source Available License": free for personal/academic/non-revenue use, **any** company use requires a negotiated commercial licence. And `src/config/tiers.ts:349` sells **Enterprise Self-Hosted at $499/mo, contact-sales**, whose first listed feature is *"Full source code + commercial license."* So "open source with paid commercial use" is not a thing to design — it is shipping. The real question is whether to **publish the repository**.

**2. Publishing deletes a paid feature from your $499 tier.** Right now "full source code" is something a customer receives *because they paid*. Make the repo public and that line stops being a feature; the $499 tier collapses to commercial-licence-plus-support-plus-SLA. That is survivable — it is exactly what Mem0 and Supermemory sell — but it is a product change nobody has costed, and it needs to be a decision rather than a side effect.

**3. Your licence is not what protects that SKU. The sales gate is.** The tier is a `mailto:` with no self-serve path (`PricingCTA.tsx:128-133`). Nothing about a restrictive licence is doing work there that the contact-sales wall isn't already doing. This is the most important sentence in the memo: **you have been attributing your self-host protection to the licence when it is actually coming from the sales process — which survives any licence you choose.**

**4. Your reverse-engineering worry is real, but the thing you think is protected is not, and the thing that is protected stays protected regardless.** The ranker's calibrated constants, the protocols that produced them, and the alternatives you rejected are written out in source comments (`hybrid_scorer.ts:88`, `objective_scoring.ts:69`, `markov_contribution.ts:291`, `hlr.ts:50`). No licence prevents reading them. Meanwhile your belief that the **arc-weight data** is the moat holds up entirely: weights are runtime LevelDB state (`w:${padFrom}:${toHash}`), zero of it in source, and a fresh install reproduces none of your ranking behaviour.

### Recommendation: a sequence, not a licence

- **Now, no licence decision required (§7):** purge the customer data currently on `main`; incorporate; move the licence contact off gmail; register the trademark; fix a live website claim that says your source is published when it isn't.
- **Step 1 — Apache-2.0 the *feeder* components** (verifier, atom-format spec, the 254-vector Merkle conformance rig, MCP client, exporter). Not the substrate. This is the Zep→Graphiti move, it is already in your own strategy docs, it makes an existing website claim true, it exposes zero ranker calibration, and it is reversible.
- **Step 2 — after ~90 days of real demand data**, choose between **Apache-2.0 substrate + permanently closed control plane** (Qdrant model) and **AGPL-3.0 + commercial dual licence**. Both beat every source-available option for your stated goals. Reasoning in §5.

**What I am explicitly not recommending: any threshold or source-available licence on the substrate.** §4 explains why that combination gets you banned by enterprise procurement *and* leaves the only competitors who could hurt you free of charge.

---

## 1. What each licence actually permits

"Internal commercial free?" = a company runs it on its own machines, for its own business, in production, without paying you. **That is the line your $499/mo Enterprise Self-Hosted tier sits on.**

| Licence | Internal commercial free? | Third-party SaaS? | OSI? | Converts to OSS |
|---|---|---|---|---|
| **Your current licence** | **No** — all company use negotiated | No | No | Never |
| **PolyForm Small Business** | Only under 100 staff **and** <$1M (2019) rev | **Yes — no clause forbids it** | No | Never |
| **PolyForm Perimeter / Shield** | Yes | No, if competing | No | Never |
| **BSL 1.1** (bare, no grant) | **No** — non-production only | No | No | Yes, ≤4 yrs |
| **BSL 1.1** (HashiCorp-style grant) | Yes, explicitly | No, if competitive | No | Yes, 4 yrs |
| **FSL 1.1** (Sentry) | Yes, explicitly | No, if Competing Use | No | Yes, 2 yrs → Apache-2.0 |
| **Elastic v2** | Yes, unrestricted | **No** | No | **Never** |
| **AGPL-3.0 + CLA** | Yes — unmodified deployment triggers nothing | Yes, must publish mods | **Yes** | n/a |
| **Apache-2.0 open core** | Yes | Yes | Yes | n/a |

**Bare BSL is a trap worth naming.** Its base grant is *"the right to… make **non-production use**"*; production rights exist only to the extent you write an Additional Use Grant. Everyone assumes BSL means "free internally, paid for SaaS" — that is HashiCorp's *grant*, not the licence.

**FSL, ELv2 and AGPL are anti-*reseller* licences, not anti-*self-hoster* licences.** All three explicitly permit free internal commercial use. If your priority is genuinely the self-host SKU, none of them defends it — though see §5 for why AGPL nonetheless converts self-hosters into buyers by a different mechanism.

**One genuine ambiguity if FSL is considered:** its Competing Use limb 3 bars products offering *"the same or substantially similar functionality as the Software"* with no requirement that they compete with your business. Read literally that is broader than HashiCorp's BUSL grant, and Sentry's FAQ glosses it more narrowly than the text supports. Counsel question.

---

## 2. What the market in your category actually does

Every direct competitor is OSI-licensed. Not one uses a source-available licence.

| Project | Licence | Stars | How they charge |
|---|---|---|---|
| Mem0 | Apache-2.0 | 62.6k | Cloud tiers; **on-prem gated behind Enterprise sales**, not licence |
| Cognee | Apache-2.0 | 30.2k | Token metering |
| Graphiti (Zep) | Apache-2.0 | 30k | Funnel for Zep Cloud |
| Supermemory | MIT | 29k | Tiers; **self-host only on Scale+**, air-gapped on Enterprise |
| Letta | Apache-2.0 | 24k | Usage-based; self-hosting free and documented |
| Qdrant | Apache-2.0 engine | 34k | **Control plane has no public repo at all** |
| Chroma / Weaviate / LanceDB | Apache / BSD-3 / Apache | 29k / 16k / 11k | Cloud metering |

**Mem0 and Supermemory monetise on-prem exactly the way you already do: give the code away, gate self-hosting behind a sales conversation and an enterprise feature set.** The paywall is the product, not the licence. Your `enterprise-self-hosted` tier is already that pattern — it just also happens to withhold the source, which is the part publishing would end.

**Qdrant** — genuinely generous Apache-2.0 engine (quantization, hybrid search, GPU indexing, RBAC all in OSS). The moat is the Operator and Cloud Agent, which **have no public repository whatsoever** and ship as credentialed images under a proprietary EULA. Same commercial effect as relicensing, none of the community cost. $50M Series B in March 2026.

**Zep** — ran Apache-2.0 open core and *abandoned it* in April 2025, not by relicensing but by discontinuing the community edition. Chalef's reason is the sharpest warning in the research for a solo operator: *"Managing two related but different products… we often found ourselves making compromises… leading us to **under-invest in the open-source version**."* They redirected all OSS effort into **Graphiti**, chosen specifically because *"Graphiti doesn't compete directly with Zep's memory service."* Graphiti now has 30k stars; the old Zep server has 4.8k.

**That lesson — open-source the component that feeds the service, not the service — is Option E in §4, and it is what your own `COMPETITOR-OUTRANK.md` item #5 already proposes** (*"Ship an open-source hook for GitHub discovery… Open-source a verifier/CLI"*).

---

## 3. Evidence on the three things you're worried about

### "Will source-available kill adoption?"

Star growth, 12 months before vs after a licence switch:

| Project | Switch | Δ |
|---|---|---|
| MinIO | Apache → **AGPL** | **−2.8%** ← the control |
| Redis | → RSALv2/SSPL | −11% |
| Sentry | → BUSL | −12.5% |
| Terraform | → BUSL | −13% |
| CockroachDB | → BUSL | −28% |
| Elasticsearch | → SSPL | −31% |
| Akka | → BUSL | −44% |

Those are *established* projects losing something; you have nothing to lose. immudb — your closest precedent: single-vendor, cryptographically verifiable store, 72 lifetime contributors — moved to BSL 1.1 in a PR merged 85 minutes after it opened, announced nowhere. Reaction: one 😕, an HN post that scored **2 points**, no fork.

**But the flip side is the whole problem: a restrictive licence also doesn't *generate* adoption.** immudb is still at 9k stars and ~93 commits/year. RedMonk, March 2026: *"these licenses are not measurable in a statistically significant way. They remain extremely uncommon and are not trending."*

### "Will the licence choice protect future profitability?"

RedMonk charted revenue, net income and market cap for the four public relicensers (MongoDB, Elastic, HashiCorp, Confluent): *"Revenue increases after the license change, but **the rate of increase is not materially different than the rate of increase prior** to the license change."* HashiCorp and Confluent both traded below IPO valuation throughout their BUSL period. n=4, no counterfactual — but there is **no positive evidence that licence restriction drives revenue.**

**Be aware of what this memo does not answer.** You asked about profitability; this section answers only "does relicensing accelerate revenue growth" (no). It says nothing about your unit economics — DigitalOcean and Vault cost floor per tier, gross margin at $5/$9/$29/$79, churn, support cost per customer, or what subscriber volume reaches break-even. **The licence is not your profitability lever and this memo should not be read as having addressed that question.** It is a separate piece of work and probably a more valuable one.

### "Does the verifiability story sell?"

Uncomfortable, and you should see it before building a launch on it. Cryptographic verifiability behaves as a **procurement credential, not a product**:

- Docker Content Trust: ten years, free, opt-in — reached **0.05% of pulls**. Switched off Dec 2026.
- 97.1% of Maven Central artifacts are signed (mandated) vs **under 2%** on Docker Hub, PyPI and HuggingFace the same year with the same free tools. Mandates drive signing; demand does not.
- immudb's post-BSL engineering budget went into **PostgreSQL wire-protocol compatibility**. Its flagship customer story lists verification **third of five** reasons, behind *"no licensing fees."*
- **EU AI Act Article 12 says "automatic recording of events (logs)". The word "cryptographic" does not appear.** If Article 12 is load-bearing in your positioning, re-check it against the text.
- The graveyard: AWS QLDB killed July 2025, Factom bankrupt, ProvenDB acquired for $2.0M total.

Where money attaches: **sell the trusted artefact and give verification away** (Chainguard, $3.5B valuation, sells no verification product — the invoice is a remediation SLA), or **sell relief from the pain of verifying** (SSLMate, up to $1,000/mo for indexed access to free mandated logs). Both attach revenue to a *continuing obligation*. Neither charges for the proof.

**Carry this through to the licence decision rather than filing it under worries.** If verifiability is a checkbox, the differentiator behind a $499 self-host tier is a checkbox, and the tier's real value is operations — hosting, fleet, upgrades, retention, SSO/audit/air-gap, SLA. That is an argument for making the substrate free and selling the operational plane, i.e. §4 Option D.

---

## 4. The five real options

### A — Publish as-is (current Source Available License)
**Protects self-host revenue:** maximally. **Adoption:** near zero — no developer can legally evaluate at work without a conversation, which is the friction that kills organic trial. **Verdict:** the immudb outcome without immudb's prior community. Satisfies the stated priority, defeats the stated goal.

### B — Revenue-threshold source-available (PolyForm Small Business) — **withdrawn**
v1 of this memo recommended it. It is wrong, for four reasons:

1. **It protects you from the wrong party.** PolyForm SB has **no competing-use clause, no network clause, no service clause of any kind.** The only test is <100 people **and** <$1M (2019) revenue. A 30-person, $60M-raised, pre-revenue AI memory startup — the exact profile of every company in §2 — qualifies free, and may lawfully fork MMPM, rebrand it, and run it as a **competing hosted memory service** paying you nothing. It even grants an explicit **Distribution License** your current licence withholds. It charges the harmless 400-person insurer and frees the dangerous funded startup.
2. **Enterprise procurement auto-rejects it.** `PolyForm-Small-Business-1.0.0` is a valid SPDX ID sitting in the non-free bucket of default FOSSA / Black Duck / Snyk policy. It gets flagged in CI before a human sees it — the same mechanism that makes AGPL functionally banned at Google — and the policy doesn't care whether the company qualifies for the free tier. **No adoption AND no revenue.**
3. **No evaluation carve-out.** A developer at a 500-person company cannot lawfully spin it up to evaluate, not even in a sandbox. So above the threshold, B is identical to A.
4. **No enforcement mechanism you can operate.** CockroachDB's Nov 2024 licence — the precedent v1 cited — is not this shape. It uses a **$10M** revenue threshold with no headcount test, and free use requires registering in their Cloud Console, generating an annual licence key, and accepting mandatory telemetry with a **5-concurrent-transaction throttle** if telemetry stops for 7 days. It is registerware with a kill switch wearing a threshold as marketing. Strip the key, telemetry and throttle — as v1 advised — and what remains is an honour-system licence with no detection, held by an individual in New Zealand. **Compliance revenue with no detection and no credible enforcement converges on voluntary donation.**

*(If a threshold licence is ever revisited, PolyForm **Perimeter** or **Shield** close the competing-use gap and belong in the comparison. Note PolyForm SB also has no trademark clause, no governing law and no venue — FSL has all three.)*

### C — FSL 1.1 (Sentry's licence)
Free internal commercial use; blocks competing hosted services; converts to Apache-2.0 after 2 years.
**Protects self-host revenue:** no — gives it away. **Adoption:** best of the restrictive family; Sentry's star growth *accelerated* after adopting it (+3,291 → +4,001/yr) and no fork has ever emerged across two relicensings. **Verdict:** the right answer if you decide hosted is the business and resellers are the threat. Still non-OSI, so it hits the same procurement scanners as B — but unlike B it at least buys real protection in exchange.

### D — Apache-2.0 substrate, control plane never published (Qdrant model)
Give away `markov-merkle-memory`. `mmpm-website` and `parametric-memory-compute` — already closed, already holding 100% of the billing, tiering and provisioning logic — stay closed forever, as Qdrant's operator does. Revenue from hosted, the fleet/operator plane, enterprise support and SLA.
**Adoption:** maximum; matches the category norm; the audit says it is architecturally closest to ready. **Cost:** the $499 tier's "full source code" line disappears and the tier must be re-pitched around operations and support. **Verdict:** strongest long-term option, and stronger still with a registered trademark (§7).

### E — Apache-2.0 the *feeder* components only (Zep→Graphiti) ← **start here**
Publish four things and nothing else:
1. the **verifier** — `src/app/verify/verifier.ts` already carries a `github.com/wjm2202/mmpm-verify` comment, and the Apache-2.0 decision for `@parametric-memory/snapshot-verify` was already made on 2026-07-17;
2. the **atom-format spec and the 254-vector Merkle conformance rig** — this is the part of your test suite that is a *standard*, and standards get cited;
3. the **MCP client/gateway**;
4. the **exporter/importer** — portability is already a marketing claim.

Every one is useful standalone, contains **zero ranker calibration**, is cheap for one person to maintain, and makes the hosted service *more* valuable rather than substitutable. **Not one of them lets anyone run MMPM.** It buys GitHub discovery, MCP directory listings, and the "open source" headline **truthfully** — and it costs you nothing you were selling.

---

## 5. Why the sequence, and why AGPL belongs in the final round

**Start with E because it is the only option that is free, reversible, and informative.** It costs no revenue, exposes no calibration, resolves a live false claim on your website (§7), executes a plan you have already written down, and buys ~90 days of evidence on whether self-host demand is real — before you commit the substrate to anything.

**Then decide between D and AGPL+commercial on that evidence.** If nobody emails the $499 tier in 90 days, take D. If enterprise self-host interest is real, AGPL+commercial deserves the harder look, for a reason v1 of this memo missed:

**AGPL+commercial does not monetise §13 triggering. It monetises policy exclusion.** Companies with blanket AGPL bans — Google is the canonical case — buy the commercial licence not because they'd trip the network clause but because their engineering policy forbids AGPL in the tree at all. That is MongoDB pre-SSPL, Qt, Grafana's early model, MySQL's original model. Decades of track record.

| | PolyForm SB (B) | AGPL + commercial |
|---|---|---|
| Free-for-small-devs adoption | under threshold only | **everyone** |
| Blocks a funded competitor hosting it | **no** | partially — must publish mods |
| OSI / distro / registry / auto-scanners | **auto-denied** | **passes** |
| Can truthfully say "open source" | **no** | **yes** |
| Generates a paid-licence sales trigger | **no mechanism** | **yes — the customer's own policy** |
| Enterprise legal reaction | silent CI ban | ban → **which is a qualified inbound lead** |

**The honest counter, which you should also see:** Sentry's FSL FAQ argues AGPL is itself an adoption suppressant — *"it exposes users to serious risk of having to divulge their proprietary source code… FSL software can be adopted at organizations where AGPL is outside of policy."* That is real. AGPL costs you some adoption; it just costs less than B and buys a sales trigger B has no mechanism for.

**The asymmetry that governs all of this:** loosening is greeted with approval — Elastic's "open source, again" post scored **759 HN points with the lowest controversy ratio in the dataset**; Redis added AGPL in 2025; dbt went ELv2→Apache in June 2026. Tightening costs 11–44% and invites a fork. **But that asymmetry only holds while you control the copyright**, and §7 explains why publishing starts eroding that.

---

## 6. Your reverse-engineering worry, answered directly

**No licence prevents reading.** Source-available means the source is available. Every option except "don't publish" exposes the same code.

**What is actually exposed:** not just the algorithm — the *calibrated* algorithm plus your negative results. `DEFAULT_CONVERGENCE_BOOST = 0.3` at `hybrid_scorer.ts:88` ships with the promotion history 0.1→0.3, measured hit@1 15/25→19/25, hit@12 20/25→25/25, why 0.5 was rejected, and which probe families regress. `MEASURED_RELEVANCE_BAND_WIDTH = 0.0609` at `objective_scoring.ts:69` ships with its full re-measurement protocol. The core formula is in a file header comment. `markov_contribution.ts:47-99` documents the measured critical scale `s* = 4.935`.

**Note that Option E sidesteps this entirely** — none of those files are in the feeder set. The following applies only if and when you publish the substrate:

1. **Scrub the calibration comments to results-only.** Keep what a maintainer needs; delete the tuning history, rejected alternatives and measurement protocols. About a day's work, removes most of the real exposure. (`docs/` is already gitignored so the referenced evidence files wouldn't ship — but the comments summarise them well enough that this barely slows a reader.)
2. **Withhold the benchmark corpus and the tuning harness, not the ranker.** This is the cut v1 missed and it is the good one: constants without the probe set that produced them are hard to *improve on* and hard to *verify*. A competitor can copy `0.3` but cannot tell whether `0.35` is better without rebuilding your measurement rig. Cheap, no credibility cost, and it doesn't recreate Zep's two-products problem.
3. **Don't lift the ranker behind an interface.** Achievable but not free — leaf primitives (~2,200 lines) are already modular enough to stub, but the orchestration lives inline in the bootstrap route at `server.ts:3688–4500` (~800 lines) plus the decay path in `shard_worker.ts:2500–2830` (~300 lines). ~1,100 lines of refactor to protect tuning that (1) and (2) protect more cheaply.
4. **Accept that the arc-weight data is the moat, because it is.** Weights are runtime LevelDB state; a clean install starts at zero arcs. The code is the recipe; the weights are the wine.

---

## 7. Blockers — most of these need doing regardless of the licence

### 🔴 ~50 MB of live production substrate is tracked on `main` right now
`export-gate-fresh.ndjson` (38.8 MB, 5,303 atoms) landed in commit `e231926` on 2026-08-11 — `.gitignore` says `export-full*.ndjson` and the glob simply doesn't match. MMPM atom names are self-describing English, so names leak even without payloads. Confirmed present: a **real customer account UUID with a full 16-charge dunning and refund timeline**, **13 production IPv4 addresses including one belonging to a paying customer** encoded into atom *names*, live customer substrate slugs, per-tier instance caps, and `mmpm-compute` internals. Keyword counts in that one file: `stripe` 8,702, `billing` 4,809, `droplet` 8,199, `customer` 5,649, `invoice` 1,220.

**This is a customer-data handling problem before it is a publishing problem, and it does not wait for the licence decision.** Also present: `experiments/glasswing-vuln-substrate/` (runbook naming production secret env vars and the 17-process PM2 fleet), `atom-rename-proposals.md` (contains a Stripe account ID), and 56 MB of full exports in **`refs/stash`**, which survives `git clone --mirror`.

### 🔴 A live page says your source is published, and it appears not to be
`src/app/verify/page.tsx:106` — *"The verifier's source code **is published** as part of the Parametric Memory **open-source release**; you can audit it yourself."*
`src/app/faq/page.tsx:270` — *"…including a self-hosted instance using the **open-source server**."*

Both sit inside **FAQPage JSON-LD**, i.e. they are being served to Google and to AI answer engines as structured factual claims. Meanwhile `COMPETITOR-OUTRANK.md` still treats the verifier as unshipped (*"add once the open-source verifier/CLI ships"*), and the substrate is not open source under any definition. Either ship the verifier under Apache-2.0 — **Option E does this anyway** — or change the copy today. This is a live credibility exposure and a closer fit to a false-advertising problem than anything in the licence-naming debate.

### 🔴 No legal entity, and a gmail address in the commercial licence
`LICENSE:2` — `Copyright (c) 2026 Glen Osborne. All rights reserved.` `LICENSE:33` — *"To obtain a commercial license, contact: entityone22@gmail.com."* No entity, no company number, no governing law, no venue, no liability cap. Three identities appear across the artefacts (`Entity One`, `gd.osborne`, `wjm2202`) with nothing tying them together publicly.

For a $499/mo enterprise SKU this is disqualifying for a meaningful fraction of buyers: no W-8BEN-E without an entity, many AP systems structurally cannot raise a PO to an individual, and personal unlimited liability sits behind a boilerplate "AS IS" with no cap. An NZ limited company is roughly NZ$120 plus an IRD number; then reassign copyright to it and update the licence holder. **Replace the gmail address with `licensing@parametric-memory.dev` regardless.**

### 🔴 Trademark — the cheapest high-leverage action available, and v1 missed it entirely
**Ghost is BSD-3 licensed — maximally permissive — and its moat is the registered trademark plus a trademark policy.** Anyone may run the code; nobody may call it Ghost. That is a moat a solo operator can actually enforce: takedowns, registrar complaints, npm and Docker Hub disputes. Unlike a source-available threshold, it does not require discovering a violation and suing internationally.

Present state: no ™ notice in `LICENSE` or the repo, no trademark policy, no registration found, `npmjs.org/parametric-memory` returns **404 (unclaimed)**, and the `parametric-memory` GitHub org appears unclaimed while the verifier comment points at a personal handle. IPONZ is ~NZ$150/class; USPTO ~US$250–350/class; squatting the npm/PyPI/GitHub-org names is free and takes an hour.

**Do it before publishing** — a public repo creates third-party prior use and complicates registration. **A registered mark also makes Option D materially stronger than §4 alone suggests**: Apache-2.0 code plus a defended name plus a closed control plane is the Ghost/Qdrant pattern.

### 🟠 Fresh repo, not a squash
Squashing collapses history, not tree content, and the offending files are on `main` today. `filter-repo` would need to strip 6+ files across 27 branches, 2 stashes and 3 tags. The commit messages (`de crowd`, `post v2 tweeks`, `fix bug`) are not a portfolio asset.

### 🟠 `real-corpus.jsonl` is 500 real production atoms
Four test files depend on it, and `real_corpus.test.ts` is a golden-master hard-coding `.toBe(500)` **and a golden Merkle root** — regenerate synthetically **and re-baseline**, don't delete.

### 🟠 First-run is broken on every documented path
`docker compose up` dies because `env_file: .env` is gitignored. `node dist/server.js` dies at `server.ts:2142` because `MMPM_ATOM_FILE` is unset — while a valid `seeds.json` sits unread in the repo root. `docker run parametricmemory/substrate` fails on both `MMPM_API_KEY` and `MMPM_ATOM_FILE`. The path that works (`npm run setup && ./start.sh`) is undocumented. No `npx` path at all: no `bin`, no `files`, `"main"` points at a nonexistent file, and `"private"` is unset — publishing today would sweep 76 MB of exports to npm. **About a day's work**, and for a launch premised on "run it on your own machine" it is the highest-leverage day in this list.

### 🟡 Ownership and contributor mechanics
Three git author identities including `copilot-swe-agent[bot]` (2 commits). The two human identities are almost certainly both you, but **sole copyright is the premise the entire "you can loosen later" argument rests on and it has not been verified.** Worse, the current contributor clause (`LICENSE:44-45`) grants only that *"the copyright holder may use your contribution in commercial products"* — that is a **use** grant, not a **relicensing** grant. Accumulate PRs on a public repo under that clause and you may need every contributor's permission to move to Apache-2.0 later. **Add a DCO (lightest) or a CLA via CLA Assistant before the first external PR.**

### 🟡 Smaller, real
Silent embedding degradation: `server.ts:140-145` defaults `MODEL2VEC_VOCAB_PATH` to a `.json` absent from a clean clone, so auto-detection of the tracked 30 MB `.bin` never fires and both fresh clones and `docker run` fall back to n-gram hash embeddings with only a log line — **every first-time evaluator would be assessing a degraded MMPM.** Node pinned `>=24 <25` when most evaluators are on 22. Containers still run as root (`USER mmpm` commented out since a 2026-05-25 hotfix). `mmpm_oauth_provider.ts` is **507 lines with zero dedicated tests** — the largest untested security-relevant module, and under D it goes public with no `SECURITY.md` and no disclosure policy.

### 🟡 Support and maintenance burden — uncosted
Selling a self-host licence to a >100-person company means a security questionnaire, a DPA, a redlined MSA, proof of insurance, an SLA with response times, and a business-continuity answer — then annual renewal, invoicing and tax compliance in the buyer's jurisdiction. Weeks of non-engineering work per deal, from NZ, alone. A public repo separately brings issue triage, drive-by PRs, Dependabot noise and a public clock on the first stranger-reported auth vulnerability. **Zep's founder quit open core over exactly this load with a funded team.** Option E is the only choice here whose marginal support cost is "a GitHub issue".

### ✅ The good news, and it is substantial
There is **no billing, no tier logic, no licence enforcement, no Stripe, no metering and no phone-home anywhere in the substrate repo** — all of it lives in `mmpm-website` and `parametric-memory-compute`. Storage is pure local LevelDB. A strict-format credential scan of all 2,781 blobs on every ref found **no live secret in tracked source or git history** — the exposure is business and customer data, not credentials. And the test suite is a real asset: 3,916 cases across 262 files, test code outweighing source 1.66:1, with a 254-vector Merkle conformance rig. Shipping that publicly is a credibility argument by itself.

**One naming rule.** Under A, B or C, do not call it open source. Not for the legal reason v1 gave (see §9), but because it is inaccurate and it is the fastest way to turn a launch into an argument. "Source available" and "free for individuals, paid for companies" are accurate and defensible.

---

## 8. What I need from you to write the release plan

1. **Do you accept the sequence — housekeeping now, Option E next, D-vs-AGPL in ~90 days?** If you'd rather commit to a substrate licence immediately, say which and I'll plan for it.
2. **Are you willing to lose "full source code" as a $499-tier feature?** Every option except A costs you that line. If not, the answer is A and the adoption goal has to be dropped.
3. **Entity and trademark — will you do these before any publish?** My strong view is that neither the licence nor the release plan is worth writing until they're done.
4. **Does the purge + fresh-repo + first-run cleanup get its own sprint?** The customer-data purge and the website "open source" claim should start regardless of your answer to everything else.
5. **Optional but high-value:** put a self-serve or form-based path behind the Enterprise Self-Hosted tier instead of a `mailto:`, and count the submissions. Ninety days of that data is worth more than this entire memo for deciding step 2.

---

## 9. Corrections from v1, confidence, and sources

**Three claims in v1 were wrong and are retracted:**

1. **"BSL's covenant requires a GPLv2-compatible Change License, so Sentry/CockroachDB/Materialize's use of Apache-2.0 is a drafting error."** Wrong. The covenant reads *"the GPL Version 2.0 **or any later version**, or a license that is compatible with GPL Version 2.0 **or a later version**."* Apache-2.0 is GPLv3-compatible, so the covenant is satisfied. The covenant also runs from licensor to MariaDB as a trademark-use condition, not as a term binding licensees. Additionally, Sentry now uses FSL, not BSL. **Do not repeat this claim.**
2. **"Neo4j won *Neo4j v. Suhy* on Lanham Act false advertising, not copyright."** Wrong. The N.D. Cal. findings (2024-07-22) awarded **$597,000**, resting on a **DMCA §1202** violation for stripping the Commons Clause plus **trademark** infringement. And the risk direction is inverted: Neo4j was the plaintiff and mark owner — the position *you* would occupy. The case is authority that a licensor can sue a mislabelling forker, not that a licensor risks liability for a README badge. Its real lesson is §7's trademark point.
3. **The self-host SKU is "$99–299/mo".** Stale, from a July planning doc. The live tier is **$499/mo** (`tiers.ts:351`), contact-sales, and it explicitly promises source code.

**Verified directly for this memo:** licence terms in §1 quoted from each steward's canonical text (mariadb.com/bsl11, fsl.software, elastic.co/licensing, polyformproject.org, gnu.org/licenses/agpl-3.0); competitor licences in §2 read from the raw `LICENSE` file in each repo; §7 from a read-only audit of both local repos; the pricing tiers, both website "open source" claims, the gmail contact, the contributor clause and the three git author identities all confirmed by direct file read on 2026-08-23.

**Explicitly unverified — do not repeat as fact:** Mem0's round being a "Series A" and its AWS distribution deal ($24M total raised is confirmed; the rest is not); funding for Letta, Cognee, Supermemory; ARR or revenue for **any** memory-layer company (none is public — treat every "converted OSS to revenue" claim in this space as unproven); Fedora/Debian/Red Hat primary sources on SSPL rejection; the SPDX identifier of dbt's post-June-2026 licence; immudb's star count at the moment of its BSL change, which makes "no exodus" rest on the absence of a fork rather than a before/after series; whether `github.com/wjm2202/mmpm-verify` is currently public.

GitHub stars are an interest proxy, not adoption. The star-delta table in §3 draws on OSS Insight, which accumulates star events without subtracting un-stars — **use it for shape, not levels.** The contributor-impact literature is essentially one paper deep (Foster, arXiv:2411.04739). **Nothing in this memo is legal advice; the entity, trademark and licence-drafting steps need a lawyer.**
