/**
 * MCP tool-count claim guard (holistic review P2 — honest claims).
 *
 * A real customer substrate's MCP client lists 11 tools (owner-verified
 * 2026-07-01 against a live customer instance — this empirical count is the
 * source of truth over the server's registered/config-gated count). The copy
 * had previously claimed the inflated "25+" and, briefly, "26" (derived from
 * the production compose flags); both are wrong for what a customer actually
 * sees. This guard locks 11 in and fails the build on any drift back to 25+/26.
 *
 * Source-level string test (no rendering) — read-only.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

// Every surface that carries the tool-count claim.
const SURFACES = [
  "src/app/page.tsx",
  "src/app/layout.tsx",
  "src/app/faq/page.tsx",
  "src/app/api/waitlist/route.ts",
  "public/llms.txt",
  "content/blog/2026-06-26-memory-that-compounds.mdx",
  "content/blog/2026-06-27-orchestration-and-rl-honest-answers.mdx",
];

// Wrong counts that must never reappear next to "tools": inflated 25(+) or 26.
const WRONG = /\b(25\+?|26)\s*(mcp\s+|memory\s+)?tools/i;

describe("MCP tool-count claim — honest number (11, what a customer sees)", () => {
  for (const rel of SURFACES) {
    it(`${rel} does not carry a wrong tool count (25+/26)`, () => {
      expect(read(rel)).not.toMatch(WRONG);
    });
  }

  it("the homepage states the honest count (11 tools)", () => {
    const page = read("src/app/page.tsx");
    expect(page).toContain("11 MCP tools");
    expect(page).toContain("MCP-native integration (11 tools)");
  });
});
