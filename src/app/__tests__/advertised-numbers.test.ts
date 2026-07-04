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

describe("advertised throughput — no stale/unsupported figure", () => {
  it.each(CLAIM_SURFACES)("%s does not advertise the retired 6,423 ops/sec", (rel) => {
    expect(read(rel)).not.toMatch(STALE_THROUGHPUT);
  });

  it.each(CLAIM_SURFACES)("%s advertises the ~2,900 ops/sec floor", (rel) => {
    expect(read(rel)).toContain(CORRECT_THROUGHPUT);
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
