/**
 * Sprint 2026-W18 — M2 (iOS Safari address-bar parity)
 * Sprint 2026-W17 — M2-fix (flex-1 child regression repaired)
 *
 * History:
 *   - The original M2 fix (commit 9138d07) replaced `h-screen` with
 *     `min-h-[100dvh] min-h-screen` to handle iOS Safari's retracting
 *     address bar without a layout jump.
 *   - That change broke the immersive pages: `flex-1` children only
 *     resolve to "fill available space" when the parent has a *definite*
 *     height. With `min-height` only, the parent's height is `auto`,
 *     the canvas div collapsed to ~content-height, and R3F rendered the
 *     3D scene into a thin band. Visible regression: /knowledge and
 *     /visualise no longer full-screen on web or mobile.
 *   - Sprint 2026-W17 restored a definite height (`h-screen`) and
 *     upgrades to `100dvh` via inline style on modern browsers (the
 *     inline rule is more specific than the class rule and silently
 *     ignored on browsers that don't recognise `dvh`).
 *
 * This contract test guards the *correct* invariant:
 *   1. Both immersive pages use the `h-screen` class (definite height,
 *      so `flex-1` resolves correctly across browsers).
 *   2. Both have an inline `style={{ height: "100dvh" }}` so dvh-capable
 *      browsers still get the address-bar-aware behaviour the original
 *      M2 commit was reaching for.
 *   3. Neither page reintroduces a `min-h-[100dvh]`/`min-h-screen` outer
 *     wrapper for the *flex column*, because that's what caused the
 *     thin-strip regression.
 *
 * The real mobile assertion ("no jump on address-bar collapse" + "canvas
 * fills viewport") lives in e2e/smoke/nav.spec.ts and runs under
 * Playwright. This source-level test only catches className regressions.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relPath: string): string {
  return readFileSync(join(__dirname, relPath), "utf8");
}

describe("Immersive pages — definite height + dvh upgrade (contract test)", () => {
  const knowledge = read("KnowledgeClient.tsx");
  const visualise = read("../visualise/VisualiseClient.tsx");

  it("KnowledgeClient outer wrapper uses h-screen (definite height for flex-1 children)", () => {
    // The flex column carrying the SiteNavbar + canvas region must be
    // anchored on `h-screen`. Tailwind v4 emits this as `height: 100vh`,
    // a definite value, so the `flex-1` Canvas div fills it.
    expect(knowledge).toMatch(/className="flex h-screen[^"]*flex-col[^"]*overflow-hidden/);
  });

  it("KnowledgeClient upgrades to 100dvh via inline style (modern dvh override)", () => {
    // Inline style is more specific than the class-emitted height rule,
    // so on browsers that recognise `dvh` (iOS 15.4+, modern Chrome/
    // Firefox) the address-bar-aware value wins. On older browsers the
    // inline rule is ignored and h-screen (100vh) provides the floor.
    expect(knowledge).toMatch(/style=\{\{\s*height:\s*"100dvh"\s*\}\}/);
  });

  it("KnowledgeClient does NOT use min-h-[100dvh] on the flex-column wrapper (regression guard)", () => {
    // Locking out the broken pattern from commit 9138d07: a flex column
    // anchored on min-height collapses flex-1 children to content height.
    expect(knowledge).not.toMatch(/className="flex min-h-\[100dvh\][^"]*flex-col/);
    expect(knowledge).not.toMatch(/className="flex min-h-screen[^"]*flex-col/);
  });

  it("VisualiseClient outer wrapper uses h-screen", () => {
    // VisualiseClient's wrapper is not a flex column (the immersive
    // navbar is absolute-positioned over the canvas), but the same
    // definite-height invariant holds: MerkleScene's R3F Canvas needs
    // the parent to have a real height to fill.
    expect(visualise).toMatch(/className="h-screen[^"]*overflow-hidden/);
  });

  it("VisualiseClient upgrades to 100dvh via inline style", () => {
    expect(visualise).toMatch(/style=\{\{\s*height:\s*"100dvh"\s*\}\}/);
  });

  it("VisualiseClient does NOT use min-h-[100dvh]/min-h-screen on the immersive wrapper", () => {
    expect(visualise).not.toMatch(/className="min-h-\[100dvh\][^"]*overflow-hidden/);
    expect(visualise).not.toMatch(/className="min-h-screen[^"]*overflow-hidden/);
  });
});

/**
 * PENDING — runs under Playwright (e2e/smoke/nav.spec.ts already covers
 * the bounding-box assertion; this describe.skip is a placeholder for
 * the more nuanced address-bar-collapse simulation that needs WebKit
 * mobile emulation).
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
