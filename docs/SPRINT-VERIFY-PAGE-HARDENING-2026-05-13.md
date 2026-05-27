# Sprint — Verify Page Hardening & Trust Polish

**Status:** Planning · Blocked on substrate snapshot upload (V3.1)
**Date:** 2026-05-13
**Owner:** entityone22
**Tier:** mostly haiku (copy + small React edits) · one infra item (V1.3, JWKS CORS) · one Wave-3 item (V3.3, multi-version) sits as opus
**Size:** ~400 LOC production · ~600 LOC tests · ~12 K tokens
**Gate:** all V1 items green · `npm run lint` · `npm run typecheck` · `npm run test` · `npm run build` clean · drag-and-drop verify round-trip green inside `pm-web-dev` container after each item

---

## 1. Context

The `/verify` page is the trust artifact — the surface that converts a skeptical buyer or auditor into a believer. Today it works (signature + Merkle recompute + audit log + value-bind all verify correctly against a real signed snapshot) but reads as engineering-grade, not audit-grade. A senior audit partner walking the page right now would record three concerns that the page currently doesn't address:

1. **`keySource=embedded-fallback-jwks-unreachable`** in the Ed25519 signature card — the verifier could not reach the JWKS endpoint and fell back to the public key embedded inside the signed payload, which is logically a weaker trust chain (the same party who controls the signature chose which key to embed). This single line undermines the strongest claim the page makes.
2. **No "what this proves / does not prove" scope statement** — auditors live for explicit scope statements; without one the page over-claims by implication.
3. **Truncated hashes, no copy affordance, no "computed" on PASS** — auditors want to grab full hashes and verify out-of-band; right now they can see only the first 32 chars and only on FAIL.

In parallel, the page can be made meaningfully more compelling as marketing without inventing new claims. The four Tier-1 items below close the auditor critique. Tier 2 and Tier 3 add proof-by-demonstration features (tamper button, multi-version consistency demo) that turn the page from "we say this works" into "watch this work, then break it on purpose."

This sprint also lands the demo-snapshot swap that's been tracked since the masterRoot regression on 2026-05-12. The current shipped demo is a `keystone-moss.droplet-mcp.nz` redacted snapshot (64 atoms, treeVersion 1) — usable but reads "test fixture" not "production substrate" to an auditor. We're swapping it for an `mmpm.co.nz` export (treeVersion 10, 3 397 atoms) that matches the substrate the conformance audit already blessed.

### Out of scope (explicit non-goals)

- Rewriting `verifier.ts` — the cryptographic verification logic is correct and self-consistent with `mm-memory/src/merkle.ts`. We only re-render its output more usefully.
- New format versions / spec changes — anything that bumps `formatVersion` to `2.0.0`.
- Wallet-style "verify another user's snapshot from a URL" — explicit V3+ item, not this sprint.

---

## 2. Pre-requisites

| Dep | Artefact | Status |
|-----|----------|--------|
| Dynamic demo-meta loader | `VerifyClient.tsx` reads file metadata on mount, drives button label + dialog copy | Complete (this conversation, 2026-05-13) |
| Self-consistent demo snapshot file | `public/demo-snapshots/mmpm-research-snap.json` exported by current substrate (no v0.2.0 masterRoot bug) | Complete (keystone-moss export, 2026-05-13) |
| MMPM-research export | Larger redacted snapshot from `mmpm.co.nz`, treeVersion ≥ 10, ≥ 3000 atoms, `redactValues: true` | **PENDING — user is exporting** |
| Verifier algorithm parity | `verifier.ts` byte-equal with `mm-memory/src/merkle.ts` | Verified 2026-05-13 (Python independent recompute matches both) |
| Conformance audit pass on prod substrate | `npm run audit:research` (mm-memory) — all 15 vectors green | Verified 2026-05-13 |

---

## 3. Sprint items

Items are grouped by tier. **V1 closes the auditor critique** and should land before any marketing push. V2 is proof-by-demonstration that lifts the page from descriptive to interactive. V3 is the strategic move once V1/V2 are stable.

Every item includes a Test block — per the project rule "we write tests for everything we make."

---

### V1.1 — "What this verification proves / does not prove" panel

| Metadata | Value |
|---|---|
| **Files** | `src/app/verify/VerifyClient.tsx` (new panel above result hero) · new `VerifyClient.scope.test.tsx` |
| **Depends on** | None |
| **Blocks** | V1.4 (panel sits next to the freshness timestamp) |
| **Size** | ~40 LOC production · ~80 LOC test |
| **Tier** | haiku |
| **Scope risk** | Low — additive, no logic change |

**Why.** This is the single highest-leverage change for an auditor reading the page. Without an explicit scope statement, the page implicitly over-claims ("Verified! Signed by Parametric Memory!") in a way that doesn't survive contact with a thoughtful reader. Listing what *isn't* proven is what separates engineering trust artifacts from marketing.

**What.** Render a new `<ScopePanel>` between the `DropZone` and the `ResultPanel`, visible only after a successful verification (`state.kind === "done"`). Two columns:

> **This verification proves**
> – Every atom and edge in this snapshot is bit-exact what the signer committed to at export time.
> – The Ed25519 signature was produced by the holder of the private key matching the published fingerprint `8d:20:…`.
> – The audit-log entries shown are authentic and in their original order.
> – The Merkle commitments (shard roots → master root) are internally consistent.
>
> **This verification does NOT prove**
> – That the substrate is *complete* (a substrate operator can sign a snapshot that omits atoms; only out-of-band attestation prevents that).
> – That atom *contents* are accurate to source — only that the leaf hashes commit to a value the signer chose.
> – That the published public key belongs to the entity you believe owns it (separate identity verification, see "Public keys" panel below).

Style: thin border, slightly different background tone from the result hero, no green/red colouring (this panel is informational, not pass/fail).

**Test.**

- **Unit:** `VerifyClient.scope.test.tsx` — render the page in `done` state, assert both column headings exist and that the "proves" column contains substrings `bit-exact`, `Ed25519`, `audit-log`, `Merkle`; the "does NOT prove" column contains `omits atoms`, `accurate to source`, `belongs to the entity`.
- **Visual smoke:** drag the demo file in the container, confirm the panel renders between the drop zone and result hero, not overlapping either.

**Acceptance.**

- ScopePanel renders only on `state.kind === "done"`, never on idle/error/verifying.
- Both columns visible without scrolling on a 1440×900 viewport.
- Lint + typecheck + tests pass.

---

### V1.2 — Move "Public keys published independently" above the fold

| Metadata | Value |
|---|---|
| **Files** | `src/app/verify/VerifyClient.tsx` (reorder + extract `PublicKeysPanel`) · `VerifyClient.publicKeys.test.tsx` |
| **Depends on** | None |
| **Blocks** | V1.3 (URL + curl one-liner come from this panel) |
| **Size** | ~30 LOC production · ~50 LOC test |
| **Tier** | haiku |
| **Scope risk** | Low |

**Why.** "Public keys published independently" is currently rendered at the very bottom of the page, below the snapshot metadata table — invisible without scrolling on most viewports. It is the page's **strongest trust signal**: the entire signature claim collapses if the public key itself isn't published somewhere readers can verify out-of-band. Burying it is leaving trust on the table.

**What.** Extract the existing "Public keys published independently" block into a `<PublicKeysPanel>` component. Render it directly under the result hero on success. Include:

- The JWKS URL (`https://mmpm.co.nz/.well-known/jwks.json` or whatever the actual canonical path is — read `snap.signature.keyUri` from the verified file).
- A one-line `curl` command in a `<code>` block that fetches the JWKS and pipes through `grep <kid>` so a reader can verify the embedded key matches the published one in 5 seconds.
- The fingerprint, full not truncated (it's only ~95 chars).
- A short sentence: "The public key used to verify this signature is published at the URL above. Anyone can fetch it and confirm it matches the fingerprint shown here."

**Test.**

- **Unit:** assert `PublicKeysPanel` renders the JWKS URL from `snap.signature.keyUri`, the full fingerprint (no `…`), and a `<code>` element containing `curl` + `grep`.
- **Manual:** copy the curl command, run it in a fresh terminal, confirm it returns a JWKS document containing the kid shown on the page. Document this manual step in the test file as a code comment so future contributors know to redo it after JWKS URL changes.

**Acceptance.**

- PublicKeysPanel visible above the fold on 1440×900 (no scroll needed to see it after the result hero).
- Fingerprint rendered in full.
- Curl command in the panel actually works when copy-pasted.

---

### V1.3 — Fix JWKS reachability (CORS + canonical URL)

| Metadata | Value |
|---|---|
| **Files** | mm-memory or mmpm-compute (wherever the JWKS endpoint is served — `src/server.ts` likely) · website `verifier.ts` only if URL changes |
| **Depends on** | V1.2 (so the published URL we point users at actually works from the browser) |
| **Blocks** | None — but until this lands, the Ed25519 card keeps reading `embedded-fallback-jwks-unreachable` which actively reduces trust |
| **Size** | ~20 LOC production (CORS headers + maybe a route) · ~30 LOC test |
| **Tier** | sonnet (touches backend + needs a CORS test) |
| **Scope risk** | Medium — backend change, requires deploy |

**Why.** This is the auditor's top concern. The verifier currently falls back to the embedded public key because `fetch(snap.signature.keyUri)` is failing from the browser — either CORS, wrong URL, or the endpoint isn't being served. The fallback is technically valid (the embedded key is covered by the signature so it can't be silently swapped) but it weakens the trust narrative significantly: it reads as "we publish keys… except when we don't."

**What.** Three steps:

1. Identify the canonical JWKS URL from `snap.signature.keyUri`. Confirm it resolves to a real HTTPS endpoint, returns a valid JWKS document on GET, and contains the `kid` referenced in the signature.
2. Add CORS headers so a browser request from `https://parametric-memory.dev` (and `http://localhost:3001` for dev) reaches the endpoint without preflight failure:
   ```
   Access-Control-Allow-Origin: https://parametric-memory.dev
   Access-Control-Allow-Methods: GET, OPTIONS
   Access-Control-Allow-Headers: Content-Type
   ```
   (Plus `http://localhost:3001` allowlisted in dev environments.)
3. After deploy: confirm `Ed25519 signature` card now reads `keySource=jwks` instead of `keySource=embedded-fallback-jwks-unreachable`.

**Test.**

- **Unit (backend):** integration test against the JWKS route asserting OPTIONS preflight + GET return the expected CORS headers for the production origin, and 403 (or omitted ACAO) for a hostile origin.
- **E2E (browser):** in the container running mockDO, navigate to `/verify`, drag the demo, expect signature card to say `keySource=jwks` not `embedded-fallback-jwks-unreachable`. Capture screenshot to compare before/after.
- **Negative test:** mutate `snap.signature.keyUri` to a 404 URL via the in-place tamper helper (V2.1), confirm card explicitly says "JWKS unreachable" rather than silently falling back — verifier already does this; just confirm the message renders.

**Acceptance.**

- Production JWKS endpoint reachable from a browser at `https://parametric-memory.dev`.
- Dev JWKS endpoint reachable from a browser at `http://localhost:3001` (i.e. CORS allowlist includes localhost for dev environments).
- After deploy: live `/verify` page shows `keySource=jwks` on the demo, not the fallback string.

---

### V1.4 — Surface freshness timestamp in result hero

| Metadata | Value |
|---|---|
| **Files** | `src/app/verify/VerifyClient.tsx` (result hero render) · existing `VerifyClient.test.tsx` |
| **Depends on** | None — `demoMeta.exportedAtIso` is already loaded by the metadata fetch landed earlier today |
| **Blocks** | None |
| **Size** | ~15 LOC production · ~20 LOC test |
| **Tier** | haiku |
| **Scope risk** | Trivial |

**Why.** Stale snapshots are suspicious. A trust artifact that doesn't show "when was this signed" leaves readers guessing whether they're looking at last week's data or last year's. Surface it prominently.

**What.** In the result hero block, add a small line under the `summary` text:

> Signed by `keystone-moss.droplet-mcp.nz` (exporter v0.3.0), exported `2026-05-13T04:53:39Z` — 45 minutes ago.

Use the existing `exporter.host`, `exporter.version`, `exporter.exportedAtIso` from the verified snapshot. Compute "X minutes/hours/days ago" client-side from `Date.now() - new Date(iso).getTime()`. Re-render every 60s while the page is open so "45 minutes ago" doesn't go stale during a long auditor session.

**Test.**

- **Unit:** with `exportedAtIso` set to `5 minutes` before `mockSystemTime`, assert the rendered string contains `5 minutes ago`. Repeat for `1 hour ago`, `2 days ago`, `just now` (< 1 min).
- **Visual:** drag demo, confirm freshness line renders without breaking the existing hero layout.

**Acceptance.**

- Freshness line shows exporter host, exporter version, ISO timestamp, and human-readable relative time.
- Relative time updates every 60s while page is open.
- All test cases (just now, 5m, 1h, 2d, 30d) format correctly.

---

### V2.1 — Tamper button (demonstrate a bit-flip fails)

| Metadata | Value |
|---|---|
| **Files** | `src/app/verify/VerifyClient.tsx` (new `<TamperControls>` component) · new `VerifyClient.tamper.test.tsx` |
| **Depends on** | V1.1 (scope panel renders alongside the tamper controls) |
| **Blocks** | V1.3's negative test (uses this helper to mutate `keyUri` for a JWKS-unreachable assertion) |
| **Size** | ~80 LOC production · ~120 LOC test |
| **Tier** | sonnet (state machine + re-verification) |
| **Scope risk** | Low-medium — must not mutate the original snapshot in memory in a way that contaminates further drops |

**Why.** A page that *says* "tamper detection works" is a brochure. A page that *lets you tamper and watch it fail* is a proof. This is the single feature most likely to make a marketing-savvy buyer share the page on LinkedIn.

**What.** After a successful verify, render a `<TamperControls>` panel with three buttons:

- **Flip a bit in `tree.masterRoot`** → re-runs verifier, expect `masterRoot` card to flip to FAIL with diff. Also expects `signature` to FAIL (signature covers tree).
- **Re-order two atoms** → swap `atoms[0]` and `atoms[1]`, re-run. Expect `shardRoots` for shard 0 to FAIL.
- **Drop an audit entry** → remove `auditLogExcerpt.entries[0]`, re-run. Expect `auditLogRoot` to FAIL.

Each button mutates a *deep clone* of the in-memory snapshot, runs `verifySnapshot`, replaces the result panel in place. A "Restore original" button reverts.

Render the mutated card with a visual indicator that this is a tamper demo, not a real attack — e.g. a yellow ribbon overlay on the result hero: `⚠ TAMPER DEMO — one bit flipped in masterRoot`.

**Test.**

- **Unit:** for each tamper button, assert (a) only the in-memory copy is mutated, never `state.rawSnap` itself; (b) the verifier returns the expected FAIL pattern; (c) "Restore original" returns to the pre-tamper state.
- **Concurrency:** confirm clicking two tamper buttons in quick succession doesn't compound (each button starts from the original, not the previously-tampered state).
- **Visual:** screenshot the tamper-demo state to compare against future regressions.

**Acceptance.**

- Three tamper modes all work and produce the expected per-card FAILs.
- "Restore original" returns the page to clean verified state.
- No mutation leaks to subsequent drops (drop another file → fresh state).
- Tamper-demo ribbon is visually distinct from real FAIL state (e.g. yellow vs red).

---

### V2.2 — Click-to-expand / copy full hashes

| Metadata | Value |
|---|---|
| **Files** | `src/app/verify/VerifyClient.tsx` (`<CheckCard>` and `<ShardRootsTable>` render) · `VerifyClient.copy.test.tsx` |
| **Depends on** | None |
| **Blocks** | None |
| **Size** | ~50 LOC production · ~60 LOC test |
| **Tier** | haiku |
| **Scope risk** | Trivial |

**Why.** Auditors are touch-and-feel readers. They want to grab the bytes, run `sha256sum` in a terminal, and compare. Currently the page truncates every hash at 32 chars with no way to expand. Frustrating.

**What.**

1. On `<CheckCard>`: clicking the `expected` or `computed` hash expands to show the full hash inline.
2. Add a small "copy" icon button next to each full hash. On click, `navigator.clipboard.writeText(fullHash)` and flash a brief "copied" tooltip.
3. Same for shard root rows in `<ShardRootsTable>` — each truncated hash is click-to-expand + copy.
4. Same for `publicKey fingerprint` in `<SnapshotMeta>`.

**Test.**

- **Unit:** mock `navigator.clipboard.writeText`, click the copy button on a CheckCard, assert the function was called with the full hash (not the truncated form).
- **Unit:** click the truncated hash, assert the full hash is rendered.
- **A11y:** copy button has `aria-label="copy <field name> hash"`; keyboard-accessible (Tab focuses, Enter activates).

**Acceptance.**

- Every hash on the page is one click away from full-form display.
- Copy button puts the full hash on the clipboard.
- Page passes existing a11y guard (`npm run guard:testids`).

---

### V2.3 — Show `computed` alongside `expected` on PASS cards

| Metadata | Value |
|---|---|
| **Files** | `src/app/verify/VerifyClient.tsx` (`<CheckCard>` render) · `VerifyClient.computedOnPass.test.tsx` |
| **Depends on** | V2.2 (uses the same expand/copy interaction) |
| **Blocks** | None |
| **Size** | ~25 LOC production · ~40 LOC test |
| **Tier** | haiku |
| **Scope risk** | Trivial |

**Why.** Currently PASS cards show only `expected`. FAIL cards show both `expected` and `computed`. This is backwards from a trust perspective: seeing `computed === expected` is the proof; hiding the computed value asks the reader to take our word that the verifier did the work.

**What.** In `<CheckCard>`, always render both `expected` and `computed` rows when both are present. On PASS, render `computed` in the same colour as `expected` (white/30) with a small green ✓ marker showing they match. On FAIL, keep the existing red tint on `computed`.

**Test.**

- **Unit:** verifier returns `{ok: true, expected: 'aaa…', computed: 'aaa…'}` → CheckCard renders both rows with the match indicator.
- **Unit:** verifier returns `{ok: false, expected: 'aaa…', computed: 'bbb…'}` → CheckCard renders both rows with the existing FAIL highlighting.
- **Snapshot test:** verify the new PASS rendering doesn't break the existing layout grid.

**Acceptance.**

- PASS and FAIL cards both render `expected` and `computed`.
- Match indicator on PASS is visible but not loud (green ✓ inline, no large green box).

---

### V2.4 — Context line: what these atoms represent

| Metadata | Value |
|---|---|
| **Files** | `src/app/verify/VerifyClient.tsx` (`<SnapshotMeta>` block) · `VerifyClient.context.test.tsx` |
| **Depends on** | V3.1 (the swapped MMPM-research snapshot will have the real atom count; copy adjusts) |
| **Blocks** | None |
| **Size** | ~15 LOC production · ~25 LOC test |
| **Tier** | haiku |
| **Scope risk** | Trivial |

**Why.** "64 atoms" (or 3 397 after the swap) is a number with no anchor. A reader has no idea whether that's a real substrate or a test fixture. One sentence of context fixes that.

**What.** Add a single sentence under the metadata table:

> These atoms are MMPM agent memory entries — facts, procedures, hub atoms — same atom types used in production. Atom plaintext is redacted; only the cryptographic leaf hashes are exposed.

**Test.**

- **Unit:** assert the sentence renders under the metadata table on `state.kind === "done"`.
- **Content check:** the sentence does NOT mention specific atom counts hard-coded (those come from `demoMeta` so any swap of the snapshot updates the numbers shown elsewhere automatically).

**Acceptance.**

- Sentence visible under the metadata table.
- No hard-coded atom counts in the copy.

---

### V3.1 — Swap demo snapshot to MMPM-research export

| Metadata | Value |
|---|---|
| **Files** | `public/demo-snapshots/mmpm-research-snap.json` (replace) |
| **Depends on** | User-supplied `mmpm.co.nz` redacted export — **blocked, awaiting upload** |
| **Blocks** | V2.4 copy review (numbers in context might warrant tweaking), V3.3 (multi-version demo needs a real production substrate as the base) |
| **Size** | 1 file replaced + container rebuild |
| **Tier** | n/a (Claude verifies + cps; no React change) |
| **Scope risk** | Low (verified before commit) |

**Why.** The current demo is from `keystone-moss.droplet-mcp.nz` — usable, signed, self-consistent. But it reads "test substrate" to a careful auditor: treeVersion 1, 64 atoms, 31 KB. Production reality is much larger: the conformance audit already proved `mmpm.co.nz` is at treeVersion 10 with 3 397 atoms. Swap for the real story.

**What.** On receipt of the user-supplied snapshot file:

1. Run the same pre-flight inspection script used 2026-05-13: format version, treeVersion, atomCount, redaction status, masterRoot self-consistency recompute. All four must pass before copy.
2. `cp uploaded-file → public/demo-snapshots/mmpm-research-snap.json`.
3. Rebuild the `pm-web-dev` container (`docker compose down && npm run local:mockDO`) so the standalone Next.js build embeds the new asset.
4. Confirm `/verify` shows the new file, all checks green including `masterRoot`, `treeVersion: 10`, `atomCount: 3 397`, `exporter.host: MMPM-research`.

**Test.**

- **Pre-commit:** `python3` inspection script asserts `redacted == True`, `treeVersion >= 10`, `atomCount >= 3000`, `stored_masterRoot == recomputed_masterRoot`.
- **Post-commit:** drag-and-drop in container → all green → screenshot captured for record.

**Acceptance.**

- New `mmpm-research-snap.json` in place with the expected metadata.
- Container rebuilt, demo download serves the new file (size matches inspection).
- All verifier checks green in the dev container.

---

### V3.2 — Transparency log link

| Metadata | Value |
|---|---|
| **Files** | new `src/app/verify/TransparencyPanel.tsx` · wire into `VerifyClient.tsx` · `TransparencyPanel.test.tsx` |
| **Depends on** | A transparency log endpoint existing — likely a static append-only file at `https://logs.parametric-memory.dev/snapshots.json` or a Sigstore Rekor entry, infra decision |
| **Blocks** | None |
| **Size** | ~60 LOC production + log infra (separate ticket) · ~80 LOC test |
| **Tier** | sonnet |
| **Scope risk** | Medium — depends on the log existing |

**Why.** "We sign snapshots" is a claim. "Every snapshot's masterRoot is recorded in our public append-only log at `<URL>`" is a verifiable claim. Lifts the trust model from "we said so" to "anyone can audit." This is the move that turns a marketing page into a trust artifact.

**What.**

1. Define the transparency log shape — minimum:
   ```
   { "timestamp": "...", "masterRoot": "...", "treeVersion": ..., "publicKeyFingerprint": "..." }
   ```
   one entry per signed export, append-only.
2. Decide hosting: simplest is a static file on the website (publicly readable, write-controlled by deploy pipeline). Sigstore Rekor is the gold standard but adds a dependency.
3. After verify, render `<TransparencyPanel>` that:
   - Fetches the log from its public URL.
   - Looks up the entry matching `snap.tree.masterRoot`.
   - Shows: "This snapshot's masterRoot is recorded in the public log at `<URL>` on `<timestamp>` — entry `N` of `M`."
   - Links to the raw log for independent inspection.

**Test.**

- **Unit:** mock the log fetch with a fixture containing the demo snapshot's masterRoot; assert the panel renders the matched entry.
- **Unit:** fixture with no match → panel renders "Not yet logged" (don't fail loud — log lag is normal).
- **Manual:** export a fresh snapshot from prod, confirm the log gets an entry within X minutes, confirm the verify page picks it up.

**Acceptance.**

- TransparencyPanel renders after verify.
- Log URL is public and human-readable.
- Snapshot masterRoot is findable in the log via plain text grep (not requiring a database query).

---

### V3.3 — Multi-version demo with consistency proof

| Metadata | Value |
|---|---|
| **Files** | `public/demo-snapshots/mmpm-research-snap-v2.json` (new, version after v1) · `VerifyClient.tsx` UI tabs · new `VerifyClient.multiversion.test.tsx` |
| **Depends on** | V3.1 (v1 baseline must be the real prod export, not keystone-moss) |
| **Blocks** | None |
| **Size** | ~120 LOC production · ~180 LOC test |
| **Tier** | opus (consistency-proof math + UI for two snapshots + reasoning about monotonic-history claim) |
| **Scope risk** | Medium — requires understanding the consistency-proof spec section and the substrate's two-version export support |

**Why.** Today the demo verifies a *single* signed snapshot. That proves integrity. It doesn't prove **monotonic history** — the strongest claim in MMPM's value proposition ("memory grows but doesn't rewrite"). Without a multi-version demo, "append-only" is just a claim.

**What.**

1. Export `v1.json` and `v2.json` from the same substrate at different `treeVersion`s, where `v2` is a consistent extension of `v1` (no atoms re-ordered, no history rewritten). `v2.json` includes the `consistencyProof` block (`fromShardRoots`, `toShardRoots`, `fromRoot`, `toRoot`, `fromVersion`, `toVersion`) that `verifier.ts` already knows how to validate.
2. Add a UI mode: drop *two* files in sequence. The verifier already supports consistency-proof checking — just wire the UI to drop both, run verify on each plus the consistency proof linking them.
3. Show: "v1 (treeVersion 10, 3 397 atoms) → v2 (treeVersion 11, 3 412 atoms): 15 atoms added, 0 atoms re-ordered, 0 atoms rewritten. History is append-only by construction."

**Test.**

- **Unit:** consistency-proof verification on the actual exported v1+v2 pair returns `{ok: true}`.
- **Negative:** mutate `v2.shardRoots[0]` (break consistency), verifier returns `{ok: false}` with diff.
- **UI:** assert the two-drop mode renders both verify results stacked and the consistency-proof card below them.

**Acceptance.**

- v1 + v2 both verify green individually.
- Consistency proof between them verifies green.
- The "history is append-only by construction" claim is now backed by a verifiable demo, not a marketing line.

---

### V3.4 — "What you just did" human-tone header on success

| Metadata | Value |
|---|---|
| **Files** | `src/app/verify/VerifyClient.tsx` (result hero render) · update `VerifyClient.test.tsx` |
| **Depends on** | V1.1 (the scope panel handles the technical "what this proves"; this is the warm complement) |
| **Blocks** | None |
| **Size** | ~10 LOC production · ~20 LOC test |
| **Tier** | haiku |
| **Scope risk** | Trivial |

**Why.** After PASS the page is currently competent but cold. One human sentence closes the emotional loop and acknowledges what the reader just accomplished. Buyers and auditors are both more likely to share, screenshot, or remember a page that addresses them as a person.

**What.** Above the existing result-hero summary line, add a single sentence:

> You just independently verified an MMPM signed memory snapshot in your browser. No server trust, no API key, no Parametric Memory code path. Welcome.

Same typographic weight as the summary, lighter colour. Renders only on `state.kind === "done"` with `result.overallOk === true`.

**Test.**

- **Unit:** state=`done` + `overallOk: true` → sentence renders.
- **Unit:** state=`done` + `overallOk: false` → sentence does NOT render (don't congratulate someone whose verify just failed).
- **Unit:** state=`error` or `verifying` → sentence does NOT render.

**Acceptance.**

- Sentence renders only on successful verify.
- Lint + typecheck + tests pass.
- One round of "does this read sincere or cringy?" gut-check by Entity One before merge.

---

## 4. Sequencing

Build order — each step ends green before the next starts:

1. **V3.1 first** (unblock the demo numbers) — user uploads MMPM-research export, Claude validates + cps + rebuilds, confirms verify green.
2. **V1.1, V1.2, V1.4 in parallel** — three small React additions, each <50 LOC. Land in one commit per item.
3. **V1.3** — backend change, needs deploy. Schedule independently. After deploy, confirm Ed25519 card flips from `embedded-fallback-jwks-unreachable` to `jwks`.
4. **V2.2** then **V2.3** — V2.2 introduces the expand+copy primitive, V2.3 reuses it for the PASS-card `computed` row. Linear, same component.
5. **V2.1** — tamper button. Heaviest of the V2 items, do after V2.2/2.3 are stable.
6. **V2.4** — context sentence, lands once V3.1 is in and V2.1's tamper-demo ribbon style is settled.
7. **V3.2** — transparency log. Needs the log infra first; that's a separate ticket. Don't block this sprint on it.
8. **V3.3** — multi-version demo. Largest item. Schedule for a follow-up sprint once V3.1 has had a week of stability.
9. **V3.4** — final polish, lands last.

---

## 5. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Substrate snapshot upload (V3.1) has a malformed signature | Low | Sprint stalls until re-export | Pre-flight inspection script catches before commit; fallback to keystone-moss demo if needed |
| JWKS CORS fix (V1.3) requires backend deploy + DNS check | Medium | V1.3 slips a week | Land V1.1/V1.2/V1.4 in parallel; V1.3 is unblocked but independent |
| Tamper button (V2.1) state machine leaks mutation into subsequent drops | Medium | Bad UX, looks broken | Deep-clone before every mutation; test for this explicitly |
| Transparency log (V3.2) needs infra not yet built | High | V3.2 slips entirely | Carve out as a separate sprint once log shape + hosting decided |
| Multi-version demo (V3.3) exposes a substrate bug in consistency-proof export | Low | Larger investigation | First export v1+v2 manually and verify before wiring into UI |

---

## 6. Definition of done (whole sprint)

- All V1 items merged and live.
- V2 items merged, gated behind a feature flag if any UX concern; tamper button and copy interactions tested end-to-end in the dev container.
- V3.1 merged; V3.2 and V3.3 either merged or formally carved into a follow-up sprint with their own pre-requisites listed.
- `npm run preflight` (the existing meta-script that runs format/lint/typecheck/guards/test/build) passes.
- Manual journey-click on `localhost:3001/verify` in `pm-web-dev` container: download demo → drag back → all green → click each tamper button → see expected FAIL → restore → confirm clean state → expand a hash → confirm copy works.
- Screenshot of the post-sprint `/verify` page committed under `docs/screenshots/verify-post-sprint-2026-05-13.png` for marketing reference.

---

## 7. Sign-off

- [ ] Sprint plan reviewed by Entity One
- [ ] V3.1 unblocked (snapshot uploaded)
- [ ] V1.x merged
- [ ] V2.x merged
- [ ] V3.1 merged
- [ ] V3.2 / V3.3 either merged or carved into next sprint
- [ ] Post-sprint screenshot committed
- [ ] Memory: this sprint's outcomes checkpointed to MMPM with `member_of` edges to `v1.other.hub_sprint_state` and `v1.other.hub_visualization` (verify page is the substrate viewer's marketing companion)
