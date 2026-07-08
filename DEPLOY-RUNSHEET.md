# Deploy Run Sheet — MMPM (all projects + images)

_Sequenced, safety-gated rollout of everything accumulated over recent sessions,
ending with a Google re-crawl request. Goal: ship it all with **zero dead URLs**
and **no over-claiming**, so the Google entity re-review is clean._

Date prepared: 2026-07-06 · Prepared for: Entity One

> **Human-only steps.** Claude does not run `git`, `docker`, deploys, `.env`
> changes, or Search Console actions. Every command below is for you to run.
> Fill in `<tag>` / `<host>` / registry names to match your pipeline.

---

## 0. Pre-flight — safety confirmations

- **Dead-URL check: PASS.** All three `sameAs` entries resolve:
  `https://x.com/_EntityOne` (live; 301-redirects through the pending rename),
  `https://doi.org/10.5281/zenodo.21213464` (verified → live Zenodo record),
  `https://www.wikidata.org/wiki/Q140446437` (created + live this session). No
  `<placeholder>` URLs ship (commented-out LinkedIn/Crunchbase/GitHub stay commented).
- **No over-claim:** the MCP tool now advertises "secrets rejected (HTTP 422)".
  That is enforced by SecretAtomGuard, which is in the **undeployed** substrate →
  the substrate must deploy **first** and have `MMPM_BLOCK_SECRET_ATOMS=1` set,
  or the claim is false. Handled by ordering + step A5 below.
- **Branch:** the substrate runtime changes are on `sprint/semantics-phase2`.
  Confirm your image build deploys from that branch, or merge to your deploy
  branch first.

## Ordering (dependencies drive this)

1. **Substrate image** first — ships SecretAtomGuard (the secret-rejection the MCP
   tool advertises) + ranker + metadata work.
2. **MCP-gateway image** second — after the substrate enforces what it describes.
3. **Website** any time (independent; no dead URLs now).
4. **Google re-crawl** last — after the website is live so Google re-reads the new
   entity signals.
5. **Connectors Directory** — separate track, after two small checks.

---

## A. Substrate image — `parametricmemory/substrate`

Source: `markov-merkle-memory` (`Dockerfile`), branch `sprint/semantics-phase2`.
Ships (committed, undeployed): SecretAtomGuard `a1c1394`; ranker reinforce-on-access

- spread-default-on `ae6f508`; S2/S6/S1′ metadata `991d602`/`f51dbe3`/`2361b36`.

1. `git status` — confirm no stray uncommitted runtime `src/` (only the MCP file +
   test + `tools/harness/associative/*` scratch are uncommitted; gitignore the scratch).
2. **Tests:** `npm test` (full suite). Codec/storage touched → `npm run audit:conformance` (254 vectors, proof-correctness gate).
3. **Bench the ranker change** (recall behaviour changed): `npm run bench:run` and
   compare p50/p95/p99 + prediction hit-rate + **proof failures (must be 0)** against
   `tools/harness/results/latest.json` from before.
4. **Build:** `docker build -f Dockerfile -t parametricmemory/substrate:<tag> .` → push.
5. **Env (yours):** set `MMPM_BLOCK_SECRET_ATOMS=1` on the substrate host so the
   secret-rejection is actually enforced (the MCP disclosure depends on it).
6. **Deploy:** pull + `docker compose up -d mmpm-service` (recreate substrate only).
7. **Verify:** `/health` and `/ready` → 200; POST a secret-looking atom (e.g. name
   `v1.fact.aws_secret_key`, value `AKIA…`) → expect **HTTP 422** (guard live);
   bench numbers sane.

**Rollback:** `docker compose up -d` with the previous `substrate:<oldtag>`.

---

## B. MCP-gateway image — `parametricmemory/mcp-gateway`

Source: `markov-merkle-memory` (`Dockerfile.mcp`, `tools/mcp/*`).
Ships: tool annotations + intent-led descriptions + append-only/secret/conflict
disclosures (uncommitted this session) + S2 metadata (committed).

1. **Commit** the two files:
   `git add tools/mcp/mmpm_mcp_server.ts src/__tests__/mcp_tool_annotations.test.ts`
   `git commit -m "MCP: tool annotations + intent-led, honest write-behaviour descriptions for Claude directory"`
   (Do **not** commit `tools/harness/associative/*` — bench scratch.)
2. **Tests:** `npx vitest run src/__tests__/mcp_tool_annotations.test.ts src/__tests__/mcp_tools.test.ts` (or `npm test`).
3. **Build:** `docker build -f Dockerfile.mcp -t parametricmemory/mcp-gateway:<tag> .` → push.
4. **Deploy AFTER A:** `docker compose up -d mmpm-mcp` (recreate MCP only). Confirm
   the `mmpm-oauth` volume (`MMPM_OAUTH_STATE_PATH`) is mounted so existing OAuth
   connections survive the restart (this was fixed — state persists to disk).
5. **Verify:** `/.well-known/oauth-authorization-server` + `/.well-known/oauth-protected-resource`
   return; **connect a FRESH Claude session** (the tool catalog is cached at session
   start — old sessions won't show the new descriptions) and confirm tools show the
   new titles, `readOnlyHint`/`destructiveHint`, and the append-only/secret/conflict text.

**Rollout scope:** substrates are per-customer (`docker-compose.customer.yml`).
Decide: just the public/directory-facing endpoint, or the whole fleet
(compute-fleet-ops operation). **Rollback:** redeploy previous `mcp-gateway:<oldtag>`.

---

## C. Website — `parametric-memory.dev`

Source: `mmpm-website`. Ships: `layout.tsx` (entity JSON-LD: `disambiguatingDescription`,
`knowsAbout`, `logo`, `alternateName`; `sameAs` = live X + DOI + Wikidata), `robots.txt`
(2026 citation bots), marketing docs (internal — not served).

1. **Tests:** `npx vitest run src/app/__tests__/entity-disambiguation.test.ts src/app/__tests__/seo-metadata.test.ts src/app/layout.test.ts`.
2. **Commit + deploy** via the site pipeline (cicd-web-deploy):
   `git add src/app/layout.tsx src/app/__tests__/ public/robots.txt docs/marketing/ DEPLOY-RUNSHEET.md whitepaper/`
3. **Verify (view-source of the live homepage):** Organization JSON-LD contains
   `disambiguatingDescription`, `knowsAbout`, `logo`, and `sameAs`
   `[x.com/_EntityOne, doi.org/10.5281/zenodo.21213464, wikidata.org/wiki/Q140446437]`;
   `/robots.txt` shows `OAI-SearchBot` + `Claude-SearchBot`; `/sitemap.xml` OK.
4. **(Optional)** point the site's whitepaper download at the new
   `whitepaper/parametric-memory-whitepaper-public.pdf` and retire the detailed one
   (the detailed version over-discloses internals — see `AI-FIRST-DISTRIBUTION-PLAYBOOK.md`).

**Rollback:** redeploy the previous commit. The X `sameAs` line is redirect-safe;
no rollback needed there.

---

## D. Google re-crawl / entity re-review _(after C is live)_

1. **Validate structured data:** run the **Rich Results Test** on `/` and `/about`
   → confirm the Organization entity parses and `sameAs` is picked up.
2. **Request re-crawl:** Search Console → **URL Inspection → Request Indexing** for
   `/`, `/about`, and the whitepaper page, so Google re-reads the new JSON-LD +
   entity graph promptly.
3. **Confirm the graph resolves end-to-end:** X (redirect), DOI, Wikidata all 200.
   _Note:_ the Zenodo record page is `noindex` (Zenodo default) — expected; the DOI
   is still a valid citable/`sameAs` node and is indexed via DataCite/OpenAIRE, it
   just won't appear as its own Google result.
4. **Expectations:** a distinct entity / Knowledge Panel forms over **weeks**, not
   days. Track non-branded impression share as the signal.

---

## E. Connectors Directory _(separate track — not Google)_

1. Verify `/.well-known/oauth-protected-resource` is served from the MCP origin.
2. Verify `/privacy` is public and substantive (missing = instant rejection).
3. Submit at **`clau.de/mcp-directory-submission`** (Team/Enterprise org). Plan in weeks.

---

## One-glance checklist

- [ ] A. Substrate: tests + bench green → build/push → `MMPM_BLOCK_SECRET_ATOMS=1` → deploy `mmpm-service` → 422 verify
- [ ] B. MCP: commit 2 files → tests → build/push → deploy `mmpm-mcp` (after A) → fresh-session verify
- [ ] C. Website: entity test → commit → deploy → view-source + robots verify
- [ ] D. Google: Rich Results Test → Request Indexing (`/`, `/about`, whitepaper)
- [ ] E. Directory: `.well-known/oauth-protected-resource` + `/privacy` → submit

**After Friday's X rename lands:** flip `layout.tsx` `sameAs` and the test from
`x.com/_EntityOne` → `x.com/parametricmem`, and add `P2002` (X username) to the
Wikidata item. Redeploy website only.
