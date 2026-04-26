/**
 * Tests for HeroSceneWrapper — verifies the wrapper forwards to the hero
 * background video and ships no heavy client JS.
 *
 * History:
 *   - v1: dynamically imported R3F Three.js scene. Tanked Lighthouse TBT
 *     (37+ seconds of main-thread work).
 *   - v2: static SVG MemoryRing — visually inert, didn't read as "alive".
 *   - v3 (sprint 2026-W17): user-recorded looped video. Zero CPU after the
 *     first paint, audio stripped at encode, decorative.
 *
 * These tests now guard:
 *   1. The wrapper renders the v3 <video> via the `hero-video` testid.
 *   2. It is a <video>, decorative (aria-hidden), and the tree contains
 *      neither a <canvas> (the R3F red flag) nor an <svg> (the v2
 *      regression). If any of those appear in the hero again, this test
 *      fails before TBT does in production.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HeroSceneWrapper } from "./HeroSceneWrapper";

describe("HeroSceneWrapper", () => {
  it("renders the hero video element", () => {
    const { getByTestId } = render(<HeroSceneWrapper />);
    expect(getByTestId("hero-video")).toBeTruthy();
  });

  it("renders a <video> (decorative, no Canvas, no SVG — regression guard)", () => {
    const { getByTestId, container } = render(<HeroSceneWrapper />);
    const node = getByTestId("hero-video");

    // It IS the v3 video element.
    expect(node.tagName.toLowerCase()).toBe("video");

    // Decorative — the slogan lives in HeroAnimatedSequence as accessible
    // DOM text. The video itself must not be exposed to AT.
    expect(node.getAttribute("aria-hidden")).toBe("true");

    // Regression guards: neither the R3F Canvas (v1, 37+s TBT) nor the
    // static SVG MemoryRing (v2) should appear in the tree. If either
    // shows up here again, the hero implementation has reverted.
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });
});
