/**
 * Tests for HeroAnimatedSequence — the landing hero content.
 *
 * Why this exists. The component previously cycled 5 taglines × 2s before
 * settling, which made the H1 the LCP candidate at ~12s and pushed
 * Lighthouse LCP to 14.2s. We rewrote it as a static server component that
 * renders the close-state H1 + CTAs at full opacity from t=0. These tests
 * guard the contract that:
 *   - the H1 ("Your AI's second brain.") is in the DOM on first render
 *   - the two CTAs are present and carry the canonical testids that other
 *     tests + analytics depend on
 *   - the gradient text styling on the second line is preserved
 *   - no tagline cycling code has crept back in (no setInterval/setTimeout
 *     references in the source)
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HeroAnimatedSequence } from "./HeroAnimatedSequence";

describe("HeroAnimatedSequence — static hero (LCP-friendly)", () => {
  it("renders the H1 immediately on first render — no waiting on JS state", () => {
    render(<HeroAnimatedSequence />);
    // The H1 contains both lines; line 1 is the LCP candidate text.
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toContain("Your AI's second brain.");
    expect(h1.textContent).toContain("Ready in 60 seconds.");
  });

  it("renders both CTAs with canonical testids", () => {
    render(<HeroAnimatedSequence />);
    expect(screen.getByTestId("landing-hero-cta-primary")).toBeTruthy();
    expect(screen.getByTestId("landing-hero-cta-secondary")).toBeTruthy();
  });

  it("primary CTA links to /pricing, secondary to /knowledge", () => {
    render(<HeroAnimatedSequence />);
    const primary = screen.getByTestId("landing-hero-cta-primary") as HTMLAnchorElement;
    const secondary = screen.getByTestId("landing-hero-cta-secondary") as HTMLAnchorElement;
    expect(primary.getAttribute("href")).toBe("/pricing");
    expect(secondary.getAttribute("href")).toBe("/knowledge");
  });

  it("preserves the gradient text style on the second H1 line", () => {
    const { container } = render(<HeroAnimatedSequence />);
    const span = container.querySelector("h1 span");
    expect(span).toBeTruthy();
    const style = (span as HTMLElement).getAttribute("style") ?? "";
    expect(style).toMatch(/background:\s*linear-gradient/);
    expect(style).toMatch(/background-clip:\s*text/);
    expect(style).toMatch(/-webkit-text-fill-color:\s*transparent/);
  });
});

describe("HeroAnimatedSequence — guard against regression", () => {
  it("source contains no tagline-cycling timers (no setInterval/setTimeout)", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/landing/HeroAnimatedSequence.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/\bsetInterval\b/);
    expect(src).not.toMatch(/\bsetTimeout\b/);
  });

  it("source has no client-state hooks (useState/useEffect/useRef) — must be a server component", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/landing/HeroAnimatedSequence.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/useState\b/);
    expect(src).not.toMatch(/useEffect\b/);
    expect(src).not.toMatch(/useRef\b/);
    expect(src).not.toMatch(/^\s*"use client"/m);
  });
});
