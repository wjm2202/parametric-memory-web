/**
 * Sprint 2026-W18 — M1 (viewport export)
 *
 * Verifies the `viewport` constant exported from `src/app/layout.tsx`
 * matches the mobile-first indexing requirements captured in the sprint plan
 * (SPRINT-MOBILE-FEEDBACK.md §Track M / M1).
 *
 * The full visual assertion (no horizontal scroll, no iOS zoom-on-focus) is
 * covered by the Playwright WebKit-mobile smoke test in M2/M3/M4/M7. That
 * suite is pending Playwright install — tracked in the Ready-to-claim
 * checklist at the bottom of SPRINT-MOBILE-FEEDBACK.md.
 *
 * This file covers the "did the constant land" half of the test plan and
 * runs in the existing vitest + jsdom harness.
 */

import { describe, it, expect, vi } from "vitest";

// ──────────────────────────────────────────────────────────────────────────
// next/font/google is a Next.js-runtime loader that doesn't execute under
// vitest + jsdom. Stub each font factory with a tiny object matching the
// shape the layout actually consumes (`.variable`). Without this, importing
// `./layout` throws `(0, Syne) is not a function`.
// vi.mock is hoisted, so placement before the `./layout` import is not
// required — but we put it here for readability.
// ──────────────────────────────────────────────────────────────────────────
vi.mock("next/font/google", () => {
  const stub = (name: string) => () => ({
    variable: `--font-${name}`,
    className: `font-${name}`,
    style: { fontFamily: name },
  });
  return {
    Syne: stub("syne"),
    Outfit: stub("outfit"),
    JetBrains_Mono: stub("jetbrains-mono"),
  };
});

import { viewport, metadata } from "./layout";

describe("RootLayout viewport export (M1)", () => {
  it("sets width to device-width", () => {
    expect(viewport.width).toBe("device-width");
  });

  it("sets initialScale to 1", () => {
    expect(viewport.initialScale).toBe(1);
  });

  it("allows pinch-zoom up to 5× (WCAG — never disable user-scalable)", () => {
    expect(viewport.maximumScale).toBe(5);
    // Explicit regression guard: if anyone sets userScalable:false or
    // maximumScale:1, we want the build to fail. Those break accessibility.
    expect((viewport as unknown as { userScalable?: boolean }).userScalable).not.toBe(false);
    expect(viewport.maximumScale).toBeGreaterThanOrEqual(2);
  });

  it("declares dark colorScheme so iOS renders status-bar text light", () => {
    expect(viewport.colorScheme).toBe("dark");
  });

  it("sets themeColor to the brand dark surface", () => {
    // #030712 = Tailwind slate-950. Keeps the iOS address-bar blended with
    // our dark body background.
    expect(viewport.themeColor).toBe("#030712");
  });
});

/**
 * Sanity check that the existing metadata contract is untouched by M1 — we
 * only added a new `viewport` export and a `Viewport` import. If any of
 * these break, M1's edit clobbered something it shouldn't have.
 */
describe("RootLayout metadata (regression from M1)", () => {
  it("still sets metadataBase to parametric-memory.dev", () => {
    expect(metadata.metadataBase?.toString()).toBe("https://parametric-memory.dev/");
  });

  it("still exposes robots.index = true", () => {
    const robots = metadata.robots as { index?: boolean };
    expect(robots?.index).toBe(true);
  });

  it("still declares /site.webmanifest", () => {
    expect(metadata.manifest).toBe("/site.webmanifest");
  });
});

/**
 * 2026-07-08 — Bing Webmaster Tools site verification.
 *
 * Bing had ZERO pages of this site indexed; ChatGPT Search, Copilot, and
 * DuckDuckGo all ride the Bing index. The msvalidate.01 meta tag proves site
 * ownership to Bing. It must stay in the head FOREVER — Bing periodically
 * re-checks and un-verifies the site if the tag disappears, which silently
 * kills the Webmaster Tools property (and with it, sitemap submission).
 */
describe("RootLayout metadata — Bing site verification", () => {
  it("declares the msvalidate.01 verification token", () => {
    const verification = metadata.verification as {
      other?: Record<string, string | number | (string | number)[]>;
    };
    expect(verification?.other?.["msvalidate.01"]).toBe("DB5282BEA4BFD32D9831FA7B542DF247");
  });
});
