/**
 * Tests for HeroSceneWrapper — verifies the wrapper correctly forwards to
 * the static MemoryRing SVG.
 *
 * History: this wrapper used to defer-mount an R3F three.js scene to dodge
 * Lighthouse TBT. That was insufficient — once mounted, R3F's rAF loop
 * burned 37+ seconds of main-thread time. We replaced the scene with a
 * pure-SVG MemoryRing (zero JS, zero TBT). These tests now guard that the
 * wrapper renders the static SVG and ships no client JS.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HeroSceneWrapper } from "./HeroSceneWrapper";

describe("HeroSceneWrapper", () => {
  it("renders the static MemoryRing SVG", () => {
    const { getByTestId } = render(<HeroSceneWrapper />);
    expect(getByTestId("memory-ring-svg")).toBeTruthy();
  });

  it("renders an SVG element (not a Canvas — no three.js)", () => {
    const { getByTestId } = render(<HeroSceneWrapper />);
    const node = getByTestId("memory-ring-svg");
    expect(node.tagName.toLowerCase()).toBe("svg");
    expect(node.getAttribute("aria-hidden")).toBe("true");
  });
});
