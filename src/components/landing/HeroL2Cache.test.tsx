/**
 * Tests for HeroL2Cache.
 *
 * Covers:
 *   1. Section landmark + aria-label preserved from the current hero
 *      (so nothing downstream that targets "Hero — Parametric Memory" breaks).
 *   2. Single h1 containing both headline lines.
 *   3. Primary CTA → /pricing, secondary CTA → /knowledge (same targets as
 *      the live hero — conversion path unchanged).
 *   4. Infographic is mounted exactly once.
 *   5. Legend shows L1 / L2 / L3 in that order with the substrate on L2.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { HeroL2Cache, HERO_L2_COPY, HERO_L2_LEGEND } from "./HeroL2Cache";

afterEach(cleanup);

describe("HeroL2Cache", () => {
  it("renders a labelled hero section", () => {
    render(<HeroL2Cache />);
    const section = screen.getByRole("region", { name: "Hero — Parametric Memory" });
    expect(section.tagName.toLowerCase()).toBe("section");
  });

  it("renders exactly one h1 with both headline lines", () => {
    render(<HeroL2Cache />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toContain(HERO_L2_COPY.line1);
    expect(h1s[0].textContent).toContain(HERO_L2_COPY.line2);
  });

  it("keeps the existing CTA targets", () => {
    render(<HeroL2Cache />);
    const primary = screen.getByRole("link", { name: HERO_L2_COPY.primary.label });
    const secondary = screen.getByRole("link", { name: HERO_L2_COPY.secondary.label });
    expect(primary).toHaveAttribute("href", "/pricing");
    expect(secondary).toHaveAttribute("href", "/knowledge");
  });

  it("mounts the infographic once", () => {
    render(<HeroL2Cache />);
    expect(screen.getAllByTestId("l2-infographic")).toHaveLength(1);
  });

  it("renders the L1/L2/L3 legend in order with MMPM at L2", () => {
    render(<HeroL2Cache />);
    const legend = screen.getByTestId("hero-l2-legend");
    const terms = within(legend).getAllByRole("term");
    expect(terms.map((t) => t.textContent?.slice(0, 2))).toEqual(["L1", "L2", "L3"]);
    expect(terms[1].textContent).toContain("MMPM");
    expect(HERO_L2_LEGEND[1].tier).toBe("L2");
  });

  it("renders sub-copy and meta line", () => {
    render(<HeroL2Cache />);
    expect(screen.getByText(HERO_L2_COPY.sub)).toBeInTheDocument();
    expect(screen.getByText(HERO_L2_COPY.meta)).toBeInTheDocument();
  });
});
