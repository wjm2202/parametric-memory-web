/**
 * GraphRAG content guard (2026-09-08).
 *
 * Why this exists:
 *   The "graph RAG vs vector RAG" query cluster is the largest search demand
 *   adjacent to what we sell, and we had zero pages targeting it. This change
 *   added a blog post and six FAQ entries (which also feed the /faq FAQPage
 *   JSON-LD). This suite pins them so they cannot silently disappear, and
 *   pins the honesty constraints they were written under:
 *
 *   1. The six FAQ questions exist verbatim (they are the AEO surface — an
 *      answer engine quoting a question that no longer exists is worse than
 *      none).
 *   2. The blog post exists, its seoTitle fits the <title> budget, and it
 *      never claims to be a document-corpus indexer.
 *   3. No GraphRAG surface resurrects retired claims: edges boosting rank by
 *      connectivity (retired — see advertised-numbers.test.ts), or the stale
 *      latency/throughput figures.
 *   4. Every benchmark number quoted is one of the verified set and travels
 *      with its judge attribution.
 *
 * Source-level string tests (no rendering) — read-only.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const FAQ = "src/app/faq/page.tsx";
const BLOG = "content/blog/2026-09-08-graphrag-without-llm-extraction.mdx";
const SURFACES = [FAQ, BLOG] as const;

const GRAPHRAG_FAQ_QUESTIONS = [
  "Is Parametric Memory a GraphRAG system?",
  "How is Parametric Memory different from Microsoft GraphRAG?",
  "Does Parametric Memory use an LLM to build its knowledge graph?",
  "How does Parametric Memory stop its knowledge graph going stale?",
  "Should I use graph RAG or vector RAG for AI agent memory?",
  "Can I verify what the knowledge graph returned to my agent?",
] as const;

// Retired / never-true claims. Mirrors advertised-numbers.test.ts.
const RETIRED_EDGE_SCORING =
  /edges?\s+(?:\.\.\.\s+)?boosts?\s+(?:bootstrap\s+)?scoring|uses?\s+.*edges\s+for\s+scoring/i;
const RETIRED_THROUGHPUT = /6,?423|3,?888/;
const RETIRED_LATENCY = /0\.045\s?ms p50|0\.074\s?ms|1\.2\s?ms p99|1\.22\s?ms p50/i;

const SEO_TITLE_MAX = 40; // layout appends " | Parametric Memory" (20) → ≤ 60

describe("GraphRAG FAQ entries", () => {
  const src = read(FAQ);

  it.each(GRAPHRAG_FAQ_QUESTIONS)("FAQ contains %s", (q) => {
    expect(src).toContain(`question: "${q}"`);
  });

  it("every GraphRAG answer that quotes a LongMemEval score names the official judge or links the benchmark", () => {
    // Slice the FAQ source to just the GraphRAG block.
    const start = src.indexOf("── GRAPHRAG");
    const end = src.indexOf("What is parametric vs non-parametric memory in LLMs?");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    const answers = [...block.matchAll(/answer:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    expect(answers).toHaveLength(GRAPHRAG_FAQ_QUESTIONS.length);
    for (const a of answers) {
      if (/\b(76\.6|83\.0)%/.test(a)) {
        expect(a).toMatch(
          /official GPT-4o judge|benchmark's official|benchmark bundle|LongMemEval-S/,
        );
      }
    }
  });

  it("FAQ keywords include the GraphRAG query cluster", () => {
    for (const k of [
      "GraphRAG alternative",
      "graph RAG vs vector RAG",
      "GraphRAG without LLM extraction",
    ]) {
      expect(src).toContain(`"${k}"`);
    }
  });
});

describe("GraphRAG blog post", () => {
  it("exists", () => {
    expect(existsSync(join(process.cwd(), BLOG))).toBe(true);
  });

  it("has a seoTitle that fits the <title> budget", () => {
    const { data } = matter(read(BLOG));
    expect(typeof data.seoTitle).toBe("string");
    expect((data.seoTitle as string).length).toBeLessThanOrEqual(SEO_TITLE_MAX);
    expect(data.tags).toContain("graphrag");
  });

  it("states what it is not (not a document-corpus indexer) — honesty section is load-bearing", () => {
    const body = read(BLOG);
    expect(body).toMatch(/not a document-corpus indexer/i);
    expect(body).toMatch(/30%/); // publishes the weakest axis
  });

  it("contains a working session_checkpoint example with typed edges", () => {
    const body = read(BLOG);
    expect(body).toContain("session_checkpoint");
    for (const t of ["supersedes", "constrains", "member_of"]) {
      expect(body).toContain(`"type": "${t}"`);
    }
  });

  it("contains no MDX-breaking HTML comments", () => {
    expect(read(BLOG)).not.toMatch(/<!--/);
  });
});

describe("GraphRAG surfaces — no retired claims", () => {
  it.each(SURFACES)("%s does not claim edges boost scoring by connectivity", (rel) => {
    expect(read(rel)).not.toMatch(RETIRED_EDGE_SCORING);
  });

  it.each(SURFACES)("%s does not advertise retired throughput", (rel) => {
    expect(read(rel)).not.toMatch(RETIRED_THROUGHPUT);
  });

  it.each(SURFACES)("%s does not advertise retired latency", (rel) => {
    expect(read(rel)).not.toMatch(RETIRED_LATENCY);
  });

  it("blog post quotes only verified benchmark percentages", () => {
    const VERIFIED = new Set(["76.6", "83.0", "94.0", "30", "22", "64"]);
    const pct = [...read(BLOG).matchAll(/\b(\d{1,2}(?:\.\d)?)%/g)].map((m) => m[1]);
    expect(pct.length).toBeGreaterThan(0);
    for (const p of pct) expect(VERIFIED, `unverified percentage ${p}%`).toContain(p);
  });
});
