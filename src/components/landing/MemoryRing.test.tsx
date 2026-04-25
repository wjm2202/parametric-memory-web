/**
 * Tests for MemoryRing — the static SVG hero diagram.
 *
 * Why this exists. MemoryRing replaced an R3F three.js scene that burned
 * 37+ seconds of TBT in Lighthouse. These tests guard the structural
 * contract:
 *   - exactly one SVG element, marked aria-hidden (decorative)
 *   - 4 shard hexagons + 1 root hexagon (the product semantic the diagram
 *     conveys)
 *   - all 4 shard labels (S0..S3)
 *   - prefers-reduced-motion is honoured via a CSS @media block
 *
 * If any of these fail in a refactor, the marketing page is visually broken
 * or accessibility-hostile.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRing } from "./MemoryRing";

describe("MemoryRing — structural contract", () => {
  it("renders exactly one root SVG element marked decorative", () => {
    const { container } = render(<MemoryRing />);
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBe(1);
    const svg = svgs[0];
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("role")).toBe("presentation");
  });

  it("renders 5 hexagons total — 4 shards + 1 root", () => {
    const { container } = render(<MemoryRing />);
    const polygons = container.querySelectorAll("polygon");
    expect(polygons.length).toBe(5);
  });

  it("renders all four shard labels S0..S3", () => {
    const { container } = render(<MemoryRing />);
    const text = container.textContent ?? "";
    expect(text).toContain("S0");
    expect(text).toContain("S1");
    expect(text).toContain("S2");
    expect(text).toContain("S3");
    expect(text).toContain("ROOT");
  });

  it("renders 4 connecting arcs (root -> shards)", () => {
    const { container } = render(<MemoryRing />);
    // Arcs are <line> elements with class mr-arc.
    const arcs = container.querySelectorAll("line.mr-arc");
    expect(arcs.length).toBe(4);
  });

  it("includes a prefers-reduced-motion media block in the inline CSS", () => {
    const { container } = render(<MemoryRing />);
    const styleEl = container.querySelector("style");
    expect(styleEl).toBeTruthy();
    expect(styleEl!.textContent ?? "").toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});
