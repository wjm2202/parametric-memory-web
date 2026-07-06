# Wikidata item — ready to create (Parametric Memory)

*Copy-paste-ready. The whitepaper is now published with a DOI, which is the
reference Wikidata needs, so the item should survive the notability check.
Companion: ENTITY-AUTHORITY-KIT.md · PAGERANK-DIFFERENTIATION-STRATEGY.md*

---

## Before you start

- **Account:** you need a **Wikimedia account** (separate from Zenodo). Create one
  at wikidata.org → *Create account* (username + password + CAPTCHA — you do this;
  I can't create accounts or solve CAPTCHAs). One account works across Wikidata +
  Wikimedia Commons.
- **The reference you'll use:** the published whitepaper —
  `https://doi.org/10.5281/zenodo.21213464` (Zenodo concept DOI, authored by
  "Parametric Memory"). This is what makes the item defensible.

---

## 1. Create the item

wikidata.org → **Create a new item** ( /wiki/Special:NewItem ). Fill:

- **Language:** en
- **Label:** `Parametric Memory`
- **Description:** `verifiable persistent memory substrate for AI agents (software product)`
  *(Do NOT write "machine learning concept" — that's the collision. "software
  product" is what disambiguates you from the generic term in search.)*
- **Also known as (aliases):** `MMPM` | `Markov-Merkle Predictive Memory`

---

## 2. Add these statements

Add each with **+ add statement**. Property → value.

| Property (ID) | Value | Notes |
|---|---|---|
| instance of (P31) | `software` (Q7397) | add a second P31 value: `web service` (Q193424) |
| official website (P856) | `https://parametric-memory.dev` | |
| inception (P571) | `2025` | year only |
| programmed in (P277) | `TypeScript` (Q978185) | optional |
| operating system (P306) | `Docker` (Q2915204) | optional |
| described at URL (P973) | `https://parametric-memory.dev/about` | optional |
| main subject / topics (P921) | `Model Context Protocol`, `Merkle tree`, `Markov chain` | optional; only if items exist |

**Do NOT add** `developer (P178)` yet unless you first create a separate Wikidata
item for the company/legal entity — P178 expects an item, not text. Skip for now.

---

## 3. Add the reference (this is the important part)

On at least the **official website (P856)** and **instance of (P31)** statements,
click **add reference** and add:

- **reference URL (P854):** `https://doi.org/10.5281/zenodo.21213464`
- **title (P1476):** `Parametric Memory: The L2 Cache for AI — A Verifiable, Predictive Memory Substrate for Agents`
- **retrieved (P813):** `6 July 2026`

That ties every core claim to a published, DOI-registered source — which is what
Wikidata reviewers look for.

---

## 4. Identifiers (link the entity graph)

Scroll to the **Identifiers** section and add what's live:

- **DOI (P356):** `10.5281/zenodo.21213464` — the whitepaper. *(Optional: this
  identifies the paper; fine to include as a related identifier.)*
- **X username (P2002):** `parametricmem` — **ADD THIS ONLY AFTER the X handle
  rename lands.** Right now the handle is still @_EntityOne and @parametricmem
  doesn't resolve; adding it now would be a dead link. Come back once the rename
  is live (scheduled reminder is set).
- Add GitHub / LinkedIn / Crunchbase identifiers here too, each as it goes live.

---

## 5. After it's created

1. Copy the item's Q-number URL (e.g. `https://www.wikidata.org/wiki/Q1234567`).
2. Add it to the site's `sameAs` array in `src/app/layout.tsx` (uncomment the
   Wikidata slot and paste the real URL).
3. Add it to the Zenodo record too (Edit → related identifiers) so the DOI and the
   Wikidata item point at each other.

---

## Honest note on notability

Wikidata notability requires a "clearly identifiable entity described by serious,
publicly available references." An official website **plus** a DOI-registered
whitepaper generally clears that bar. Brand-new commercial items can still be
questioned by an editor; if it's ever flagged, the DOI reference is your strongest
defence, and adding the LinkedIn/Crunchbase identifiers as they go live makes the
entity progressively harder to contest. Don't create duplicate items or edit-war —
if challenged, respond on the item's talk page citing the DOI.
