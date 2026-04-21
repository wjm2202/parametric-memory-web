/**
 * Sprint 2026-W18 — M3 (SidePanel responsive width)
 *
 * The real assertion — "at viewport 320px with the panel open, there is no
 * horizontal scroll" — requires a real browser with a real viewport.
 * Playwright is the right tool but is not yet installed (see
 * SPRINT-MOBILE-FEEDBACK.md Ready-to-claim checklist).
 *
 * Until Playwright lands, this file guards M3 with a source-contract test:
 * read the SidePanel component source and assert it contains the responsive
 * width token. This catches the commonest regression (someone reverts to
 * `w-80` or a fixed `w-*`) without needing to mount the whole Zustand +
 * fetch stack.
 *
 * When Playwright ships, the `.skip` block at the bottom becomes the
 * authoritative test and this contract test downgrades to a sanity check.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE_PATH = join(__dirname, "SidePanel.tsx");
const source = readFileSync(SOURCE_PATH, "utf8");

describe("SidePanel — M3 responsive width (contract test)", () => {
  it("uses the responsive width token `w-[min(88vw,320px)]`", () => {
    expect(source).toMatch(/w-\[min\(88vw,320px\)\]/);
  });

  it("does not regress to a fixed `w-80` on the panel root", () => {
    // Narrow match: only fail if `w-80` appears in a className string. The
    // token could legitimately appear inside a JS comment or string
    // literal, so we scope to the className we care about.
    const classNameMatches = source.match(/className=\{?`[^`]*w-80[^`]*`/g);
    expect(classNameMatches).toBeNull();
  });

  it("carries the pre-registered `data-testid` from docs/DUAL-ACCESSIBILITY.md", () => {
    expect(source).toMatch(/data-testid="knowledge-sidepanel"/);
  });
});

/**
 * PENDING — activates once Playwright is installed (M2 + M3 + M7 share it).
 *
 * To enable:
 *   npm i -D @playwright/test playwright
 *   npx playwright install webkit chromium
 *   # then move this suite to tests/e2e/mobile-sidepanel.spec.ts
 */
describe.skip("SidePanel — M3 real mobile assertion (requires Playwright)", () => {
  it("does not force horizontal scroll at 320px with panel open", async () => {
    // Example shape — implement in Playwright once installed:
    //   await page.setViewportSize({ width: 320, height: 568 });
    //   await page.goto("/knowledge");
    //   await page.getByTestId("knowledge-sidepanel").waitFor();
    //   const overflowed = await page.evaluate(
    //     () => document.documentElement.scrollWidth > window.innerWidth,
    //   );
    //   expect(overflowed).toBe(false);
  });
});
