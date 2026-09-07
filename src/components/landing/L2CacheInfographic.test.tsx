/**
 * Tests for L2CacheInfographic.
 *
 * Covers:
 *   1. Accessible SVG — role="img", title + desc wired via aria-labelledby.
 *   2. Structure — 12 atoms: 4 hit, 7 idle, 1 new; Merkle root badge;
 *      context-window bar; 7 packets on CSS motion paths.
 *   3. Captions — all five phase captions rendered, plus the static
 *      reduced-motion caption.
 *   4. Timeline sanity — parsed from the emitted <style>:
 *        - every animated selector has a matching @keyframes block
 *        - caption phases are contiguous and non-overlapping
 *        - each packet's offset-distance is monotonic non-decreasing
 *   5. Reduced-motion — a prefers-reduced-motion block disables animation
 *      and hides packets.
 *   6. No runtime JS — component is a plain function with no hooks.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  L2CacheInfographic,
  L2_CAPTIONS,
  L2_STATIC_CAPTION,
  L2_CYCLE_S,
} from "./L2CacheInfographic";

afterEach(cleanup);

function getCss(): string {
  const style = document.querySelector("[data-testid='l2-infographic'] style");
  expect(style).not.toBeNull();
  return style!.textContent ?? "";
}

/** Extract `{ selector: keyframeName }` for every `animation-name:` / `animation: name` declaration. */
function animatedNames(css: string): Set<string> {
  const names = new Set<string>();
  for (const m of css.matchAll(/animation-name:\s*([a-z0-9-]+)/g)) names.add(m[1]);
  for (const m of css.matchAll(/animation:\s*([a-z0-9-]+)\s+var\(--l2-cycle\)/g)) names.add(m[1]);
  return names;
}

function keyframeNames(css: string): Set<string> {
  return new Set([...css.matchAll(/@keyframes\s+([a-z0-9-]+)/g)].map((m) => m[1]));
}

/** Parse a @keyframes block into [{ stops:number[], decls:string }]. */
function parseKeyframes(css: string, name: string) {
  const re = new RegExp(`@keyframes\\s+${name}\\s*\\{([^}]*(?:\\}[^}]*)*?)\\}\\s*(?=\\n|@|\\.|$)`);
  const m = css.match(re);
  expect(m, `@keyframes ${name} missing`).not.toBeNull();
  const body = m![1];
  const frames: { stops: number[]; decls: string }[] = [];
  for (const f of body.matchAll(/([\d%,\s]+)\{([^}]*)\}/g)) {
    const stops = f[1]
      .split(",")
      .map((s) => parseFloat(s))
      .filter((n) => !Number.isNaN(n));
    frames.push({ stops, decls: f[2] });
  }
  return frames;
}

describe("L2CacheInfographic", () => {
  it("renders an accessible SVG with title and description", () => {
    render(<L2CacheInfographic />);
    const svg = screen.getByRole("img", { name: /L2 cache/i });
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.getAttribute("aria-labelledby")).toBe("l2-title l2-desc");
    expect(document.getElementById("l2-desc")?.textContent).toBe(L2_STATIC_CAPTION);
  });

  it("renders 12 atoms: 4 hit, 7 idle, 1 new", () => {
    render(<L2CacheInfographic />);
    expect(document.querySelectorAll("[data-atom]")).toHaveLength(12);
    expect(document.querySelectorAll("[data-atom='hit']")).toHaveLength(4);
    expect(document.querySelectorAll("[data-atom='idle']")).toHaveLength(7);
    expect(document.querySelectorAll("[data-atom='new']")).toHaveLength(1);
  });

  it("renders the Merkle root badge, context sliver and 7 packets", () => {
    render(<L2CacheInfographic />);
    expect(screen.getByTestId("l2-root").textContent).toMatch(/MERKLE ROOT/);
    expect(screen.getByTestId("l2-ctx")).toBeInTheDocument();
    expect(document.querySelectorAll(".l2-pk")).toHaveLength(7);
  });

  it("recall PRIMES the context window — sliver is ≤15% of the track, never a fill", () => {
    // Owner correction 2026-09-04: MMPM returns a small dense payload; the
    // diagram must never show the context window filling up.
    render(<L2CacheInfographic />);
    const sliver = screen.getByTestId("l2-ctx");
    const w = Number(sliver.getAttribute("width"));
    const track = Number(sliver.getAttribute("data-track-width"));
    expect(w / track).toBeLessThanOrEqual(0.15);
    expect(screen.getByTestId("l2-primed").textContent).toMatch(/PRIMED FROM PROMPT/);
    expect(L2_CAPTIONS[2]).toMatch(/primed from the prompt/i);
    expect(L2_CAPTIONS[2]).not.toMatch(/fill/i);
  });

  it("labels the three tiers L1 / L2 in the diagram", () => {
    render(<L2CacheInfographic />);
    expect(screen.getByText(/L1 · WEIGHTS/)).toBeInTheDocument();
    expect(screen.getByText(/L2 · YOUR DOMAIN/)).toBeInTheDocument();
    expect(screen.getByText(/MMPM SUBSTRATE/)).toBeInTheDocument();
  });

  it("renders all five phase captions and the static caption", () => {
    render(<L2CacheInfographic />);
    for (const c of L2_CAPTIONS) expect(screen.getByText(c)).toBeInTheDocument();
    // static caption appears in the caption strip AND as the SVG <desc>
    expect(screen.getAllByText(L2_STATIC_CAPTION).length).toBeGreaterThanOrEqual(1);
  });

  it("every animated selector has a matching @keyframes block", () => {
    render(<L2CacheInfographic />);
    const css = getCss();
    const used = animatedNames(css);
    const defined = keyframeNames(css);
    expect(used.size).toBeGreaterThan(10);
    for (const n of used) expect(defined.has(n), `missing @keyframes ${n}`).toBe(true);
  });

  it("caption phases are contiguous and non-overlapping across the cycle", () => {
    render(<L2CacheInfographic />);
    const css = getCss();
    // visible window for cap-i = [first stop with opacity:1, last stop with opacity:1]
    const windows = L2_CAPTIONS.map((_, i) => {
      const frames = parseKeyframes(css, `l2-cap-${i}`);
      const on = frames.filter((f) => /opacity:\s*1/.test(f.decls)).flatMap((f) => f.stops);
      return [Math.min(...on), Math.max(...on)] as const;
    });
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i][0], `cap ${i} must start after cap ${i - 1} ends`).toBeGreaterThan(
        windows[i - 1][1],
      );
      expect(
        windows[i][0] - windows[i - 1][1],
        `gap between cap ${i - 1} and ${i}`,
      ).toBeLessThanOrEqual(2);
    }
    expect(windows[0][0]).toBeLessThanOrEqual(1);
    expect(windows[windows.length - 1][1]).toBeGreaterThanOrEqual(90);
  });

  it("each packet's offset-distance is monotonic non-decreasing", () => {
    render(<L2CacheInfographic />);
    const css = getCss();
    for (const name of [
      "l2-pk-q",
      "l2-pk-req",
      "l2-pk-r1",
      "l2-pk-r2",
      "l2-pk-r3",
      "l2-pk-ans",
      "l2-pk-cp",
    ]) {
      const frames = parseKeyframes(css, name);
      const seq: [number, number][] = [];
      for (const f of frames) {
        const d = f.decls.match(/offset-distance:\s*(\d+)%/);
        if (d) for (const s of f.stops) seq.push([s, parseInt(d[1], 10)]);
      }
      seq.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < seq.length; i++) {
        expect(seq[i][1], `${name}: offset regresses at ${seq[i][0]}%`).toBeGreaterThanOrEqual(
          seq[i - 1][1],
        );
      }
      // packet must actually travel the whole path
      expect(seq.some(([, d]) => d === 100)).toBe(true);
    }
  });

  it("packets travel in story order: prompt → recall → atoms → answer → checkpoint", () => {
    render(<L2CacheInfographic />);
    const css = getCss();
    const arrival = (name: string) => {
      const frames = parseKeyframes(css, name);
      const f = frames.find(
        (fr) => /offset-distance:\s*100%/.test(fr.decls) && /opacity:\s*1/.test(fr.decls),
      );
      return Math.min(...f!.stops);
    };
    const order = ["l2-pk-q", "l2-pk-req", "l2-pk-r1", "l2-pk-ans", "l2-pk-cp"].map(arrival);
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
  });

  it("declares a reduced-motion block that disables animation and hides packets", () => {
    render(<L2CacheInfographic />);
    const css = getCss();
    const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/);
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/animation:\s*none\s*!important/);
    expect(block![1]).toMatch(/\.l2-pk[^{]*\{\s*display:\s*none/);
    expect(block![1]).toMatch(/\.l2-cap-static\s*\{\s*display:\s*block/);
  });

  it("uses the shared cycle length for the CSS variable", () => {
    render(<L2CacheInfographic />);
    expect(getCss()).toContain(`--l2-cycle: ${L2_CYCLE_S}s`);
  });

  it("applies a custom className to the root", () => {
    render(<L2CacheInfographic className="w-full" />);
    expect(screen.getByTestId("l2-infographic").className).toContain("w-full");
  });
});
