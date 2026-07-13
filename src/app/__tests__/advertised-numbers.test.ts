/**
 * Advertised-numbers accuracy guard (FABLE phase-2 review, 2026-07-04).
 *
 * Why this exists:
 *   1. Throughput drift — "6,423 ops/sec" was advertised on the site but
 *      matched NO harness run in markov-merkle-memory/tools/harness/results
 *      (recorded history topped out at 6,193 on old hardware; the most recent
 *      runs were 1,727 and 2,932 ops/sec). It was replaced with a conservative
 *      measured floor of ~2,900 ops/sec. The figure is hardcoded in THREE
 *      independent surfaces (FAQ copy, layout JSON-LD featureList, the llms.txt
 *      generator) plus the generated public/llms.txt — this test pins all four
 *      so they can never drift apart or resurrect the stale number.
 *   2. Edge-scoring claim — the ranker's edge-connectivity boost was retired
 *      (server.ts on sprint/semantics-phase2). "edges ... boost bootstrap
 *      scoring" / "uses ... edges for scoring" became misleading, so the FAQ
 *      was reworded. Edges still influence rank via domain boost + supersedes
 *      demotion, never by generic connectivity.
 *
 * Source-file assertions (same rationale as phase1-sso-a11y.test.tsx): the
 * literal claim strings are the precise surface we guard against regression.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8");

// Every surface that hardcodes an advertised throughput figure.
const CLAIM_SURFACES = [
  "src/app/faq/page.tsx",
  "src/app/layout.tsx",
  "scripts/build-llms-txt.ts",
  "public/llms.txt",
] as const;

const STALE_THROUGHPUT = /6,?423/;
const CORRECT_THROUGHPUT = "2,900 ops/sec";

// ── Latency (re-measured 2026-07-12, `ts-node tools/harness/cli.ts --preset smoke`)
//
// The site advertised "0.045ms p50 / 0.074ms p95 / 1.2ms p99". Two harness runs
// four months apart, on different hardware, agree on what is actually true:
//
//            p50        p95        p99      throughput
//   2026-07  0.0222ms   0.0459ms   0.0910ms  2,805 ops/sec
//   2026-05  0.0219ms   0.0765ms   4.17ms*   1,727 ops/sec   (*GC outlier)
//
// So "0.045ms p50" was the measured **p95**, mislabelled — the site was
// advertising a headline number ~2x WORSE than reality. "1.2ms p99" matched no
// run at all. A "1.22ms p50" figure circulated internally (a stale March
// "10-trial benchmark"); it matches no harness run and is retired.
//
// Advertise the conservative side of measured: p50 ~0.022ms, p95 ~0.046ms.
// Do NOT advertise a p99 — it is the one figure that moves (0.09ms vs 4.17ms
// depending on GC), and a claim that swings 46x is not a claim.
const RETIRED_LATENCY = /0\.045\s?ms p50|0\.074\s?ms|1\.2\s?ms p99|1\.22\s?ms p50/i;
const CORRECT_LATENCY = "0.022ms";

// Files that make a latency claim to a customer or an answer engine.
const LATENCY_SURFACES = [
  "src/app/faq/page.tsx",
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/lib/pricing/index.ts",
  "src/app/api/waitlist/route.ts",
  "scripts/build-llms-txt.ts",
  "public/llms.txt",
] as const;

describe("advertised throughput — no stale/unsupported figure", () => {
  it.each(CLAIM_SURFACES)("%s does not advertise the retired 6,423 ops/sec", (rel) => {
    expect(read(rel)).not.toMatch(STALE_THROUGHPUT);
  });

  it.each(CLAIM_SURFACES)("%s advertises the ~2,900 ops/sec floor", (rel) => {
    // Deliberately conservative: recent harness runs measured 1,727 and 2,932.
    // Do NOT raise this to the 3,888 from the older 10-trial benchmark — that is
    // how 6,423 happened.
    expect(read(rel)).toContain(CORRECT_THROUGHPUT);
  });
});

// ── The 37% claim (added 2026-07-13) ────────────────────────────────────────
//
// What 37% actually is: COMPACT PROOF SERIALISATION saves 37% of the tokens the
// verbose encoding would cost — 4,102 -> 2,580. It is a claim about the proof
// ENCODING, and nothing else.
//
// The homepage used to render it as "RFC 6962 Merkle proofs · 37% smaller than
// raw", which reads as a claim that the SUBSTRATE stores 37% less data than raw
// text. It doesn't say that, we've never measured that, and the true cost of
// carrying Merkle proofs is a number we do not publish at all. Someone repeating
// the homepage line back to us in a technical forum is the failure mode; the
// phrasing must stay pinned to what was measured.
const AMBIGUOUS_37 = /37%\s*smaller than raw/i;

describe("the 37% claim is about proof ENCODING, not stored size", () => {
  it.each(CLAIM_SURFACES)("%s does not say '37% smaller than raw'", (rel) => {
    expect(read(rel)).not.toMatch(AMBIGUOUS_37);
  });

  it("the homepage states the token figures that back the 37%", () => {
    const src = read("src/app/page.tsx");
    expect(src).toContain("37% fewer tokens");
    expect(src).toContain("4,102");
    expect(src).toContain("2,580");
  });
});

describe("advertised latency — measured, not mislabelled", () => {
  it.each(LATENCY_SURFACES)("%s does not advertise a retired/mislabelled figure", (rel) => {
    expect(read(rel)).not.toMatch(RETIRED_LATENCY);
  });

  it.each(LATENCY_SURFACES)("%s never advertises a p99 (it swings 46x with GC)", (rel) => {
    expect(read(rel)).not.toMatch(/p99/i);
  });

  it("the surfaces that quote a p50 quote the measured one", () => {
    for (const rel of LATENCY_SURFACES) {
      const text = read(rel);
      if (/p50/i.test(text)) expect(text).toContain(CORRECT_LATENCY);
    }
  });

  it("the generator and the generated llms.txt agree on the throughput line", () => {
    // guard:llms-txt enforces this at build time; assert here too so a manual
    // edit to one but not the other fails fast in unit tests.
    const genLine = read("scripts/build-llms-txt.ts").match(/- Throughput:[^\n"]*/)?.[0];
    const outLine = read("public/llms.txt").match(/- Throughput:[^\n]*/)?.[0];
    expect(genLine).toBeTruthy();
    expect(outLine).toBe(genLine);
  });
});

describe("edge-scoring copy — connectivity boost retired", () => {
  const faq = read("src/app/faq/page.tsx");

  it("FAQ no longer claims edges 'boost bootstrap scoring'", () => {
    expect(faq).not.toMatch(/boost bootstrap scoring/i);
  });

  it("FAQ no longer claims bootstrap uses edges 'for scoring'", () => {
    expect(faq).not.toMatch(/edges for scoring/i);
  });

  it("FAQ keeps the honest reframing (relevant memory never displaced by popular)", () => {
    expect(faq).toMatch(/never displaced by the most popular one/i);
  });
});
