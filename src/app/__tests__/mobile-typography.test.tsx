/**
 * M6 — Tap-target + typography batch regression guard.
 *
 * These are SOURCE-FILE assertions, not render-time assertions. They protect
 * the concrete className contracts M6 put in place against later regressions.
 *
 * Why source-file and not render-tree:
 *   - `HomePage` (src/app/page.tsx) is an async Next 15 Server Component that
 *     calls `cookies()` — rendering it in jsdom requires mocking next/headers,
 *     resolving async, and stubbing the hero scene wrapper. The token-level
 *     contract ("these classes don't appear here") is cheaper and clearer as
 *     a string check.
 *   - `CopyButton` in AdminClient.tsx is not exported, so we can't import it
 *     in isolation without expanding the module surface.
 *
 * What this guards:
 *   1. No `text-[10px]` mono eyebrow remains on the landing page.
 *   2. No footer <Link> retains the original low-contrast `text-surface-600`.
 *   3. Copyright paragraph isn't using the undefined `text-surface-700` token
 *      or the old `text-[11px]` size.
 *   4. Admin CopyButton carries the 40px minimum tap target.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "../../..");
const pageSrc = readFileSync(resolve(repoRoot, "src/app/page.tsx"), "utf8");
const adminSrc = readFileSync(resolve(repoRoot, "src/app/admin/AdminClient.tsx"), "utf8");

describe("M6 — landing page typography contract", () => {
  it("has no text-[10px] mono eyebrows (normalised to text-[11px])", () => {
    expect(pageSrc).not.toMatch(/text-\[10px\]/);
  });

  it("has no footer Link with the old low-contrast text-surface-600", () => {
    // Footer links share an exact className; the M6 bump moved them to
    // text-surface-400. Any recurrence of the specific footer-link pattern
    // is a regression.
    expect(pageSrc).not.toMatch(
      /font-body text-surface-600 hover:text-surface-300 text-sm transition-colors/,
    );
    // Positive assertion: the new class is present and applied 9 times
    // (one per footer link).
    const matches = pageSrc.match(
      /font-body text-surface-400 hover:text-surface-200 text-sm transition-colors/g,
    );
    expect(matches?.length).toBe(9);
  });

  it("copyright paragraph uses text-surface-400 and text-xs (not the undefined text-surface-700 or 11px)", () => {
    // The copyright <p> is uniquely anchored by the © symbol in the next line.
    // We slice a narrow window around that marker and assert the className
    // on that specific <p>.
    const copyrightIdx = pageSrc.indexOf("© 2026 Parametric Memory");
    expect(copyrightIdx).toBeGreaterThan(-1);
    const windowAround = pageSrc.slice(copyrightIdx - 200, copyrightIdx);
    expect(windowAround).not.toMatch(/text-surface-700/);
    expect(windowAround).not.toMatch(/text-\[11px\]/);
    expect(windowAround).toMatch(/text-surface-400/);
    expect(windowAround).toMatch(/text-xs/);
  });
});

describe("M6 — admin CopyButton tap target", () => {
  it("CopyButton className includes min-h-[40px] and text-sm", () => {
    // Anchor on the unique CopyButton handler name so we stay robust if the
    // file's other buttons get tweaked later.
    const idx = adminSrc.indexOf("function CopyButton");
    expect(idx).toBeGreaterThan(-1);
    const block = adminSrc.slice(idx, idx + 800);
    expect(block).toMatch(/min-h-\[40px\]/);
    expect(block).toMatch(/text-sm/);
    // Regression: old className had py-2 text-xs.
    expect(block).not.toMatch(/px-3 py-2 text-xs/);
  });
});
