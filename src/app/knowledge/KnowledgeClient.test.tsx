/**
 * Sprint 2026-W18 — M2 (replace h-screen with min-h-[100dvh])
 *
 * Covers BOTH KnowledgeClient.tsx and VisualiseClient.tsx in a single suite
 * because they share the same fix and the same failure mode (iOS Safari
 * address-bar collapse jumping layout).
 *
 * As with M3, the real mobile assertion ("no viewport jump on address-bar
 * collapse") requires Playwright. Until then, this contract test guards
 * the source so regressions fail CI.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relPath: string): string {
  return readFileSync(join(__dirname, relPath), "utf8");
}

describe("Immersive pages — M2 dvh with fallback (contract test)", () => {
  const knowledge = read("KnowledgeClient.tsx");
  const visualise = read("../visualise/VisualiseClient.tsx");

  it("KnowledgeClient uses min-h-[100dvh]", () => {
    expect(knowledge).toMatch(/min-h-\[100dvh\]/);
  });

  it("KnowledgeClient retains min-h-screen as fallback (iOS <15.4)", () => {
    expect(knowledge).toMatch(/min-h-screen/);
  });

  it("VisualiseClient uses min-h-[100dvh]", () => {
    expect(visualise).toMatch(/min-h-\[100dvh\]/);
  });

  it("VisualiseClient retains min-h-screen as fallback", () => {
    expect(visualise).toMatch(/min-h-screen/);
  });

  it("Neither page re-introduces h-screen (would re-trigger the bug)", () => {
    // We allow `min-h-screen` (fallback) but not `h-screen` in a className
    // string, since the fixed height is what causes the iOS jump.
    const knowledgeClasses = knowledge.match(/className=\{?`[^`]*h-screen[^`]*`/g) ?? [];
    const hasFixedHeightOnly = knowledgeClasses.some(
      (s) => /h-screen/.test(s) && !/min-h-screen/.test(s),
    );
    expect(hasFixedHeightOnly).toBe(false);

    const visualiseClasses = visualise.match(/className=\{?`[^`]*h-screen[^`]*`/g) ?? [];
    const vHasFixedHeightOnly = visualiseClasses.some(
      (s) => /h-screen/.test(s) && !/min-h-screen/.test(s),
    );
    expect(vHasFixedHeightOnly).toBe(false);
  });
});

/**
 * PENDING — requires Playwright install (see SPRINT Ready-to-claim checklist).
 */
describe.skip("Immersive pages — M2 real mobile assertion (Playwright)", () => {
  it("no jump when the iOS address bar collapses", () => {
    // Playwright WebKit-mobile at 390×664:
    //   1. goto('/knowledge')
    //   2. record initial paint scroll Y
    //   3. simulate address bar collapse via setViewportSize(390, 720)
    //   4. assert the page content did not shift > 1px
  });
});
