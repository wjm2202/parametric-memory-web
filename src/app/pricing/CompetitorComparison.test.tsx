/**
 * Tests for CompetitorComparison — M5b (sprint 2026-W18).
 *
 * Covers:
 *   - Both presentations (desktop table + mobile card list) render with the
 *     expected pricing-comparison* testids.
 *   - Both presentations contain one entry per row in `competitors`.
 *   - `featureSlug` is stable and matches the row testids in both layouts.
 *   - Every competitor value from the data is present in both layouts (so
 *     swapping layouts via CSS breakpoints does not silently drop content).
 *   - Sticky column has a z-index class (the audit fix).
 *   - Desktop table has the `hidden md:block` responsive toggle and the
 *     card list has `md:hidden` (ensures only one layout is visible per
 *     breakpoint).
 */

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import CompetitorComparison, { competitors, featureSlug } from "./CompetitorComparison";

describe("featureSlug", () => {
  it("lowercases and dashes non-word characters", () => {
    expect(featureSlug("Pricing model")).toBe("pricing-model");
    expect(featureSlug("SSL/TLS certificate")).toBe("ssl-tls-certificate");
    expect(featureSlug("Your data isolated")).toBe("your-data-isolated");
  });

  it("is idempotent on already-slugged input", () => {
    const once = featureSlug("Markov prediction");
    expect(featureSlug(once)).toBe(once);
  });

  it("never contains leading or trailing dashes", () => {
    for (const row of competitors) {
      const slug = featureSlug(row.feature);
      expect(slug.startsWith("-")).toBe(false);
      expect(slug.endsWith("-")).toBe(false);
    }
  });
});

describe("CompetitorComparison — section wrapper", () => {
  it("renders the top-level pricing-comparison section with aria-label", () => {
    render(<CompetitorComparison />);
    const section = screen.getByTestId("pricing-comparison");
    expect(section.tagName.toLowerCase()).toBe("section");
    expect(section).toHaveAttribute("aria-label", "Comparison with competitors");
  });
});

describe("CompetitorComparison — desktop table (≥ md)", () => {
  it("renders the pricing-comparison-table with the hidden md:block responsive toggle", () => {
    render(<CompetitorComparison />);
    const table = screen.getByTestId("pricing-comparison-table");
    expect(table.className).toContain("hidden");
    expect(table.className).toContain("md:block");
  });

  it("has z-index on the sticky first column to fix the value-bleed bug", () => {
    render(<CompetitorComparison />);
    const table = screen.getByTestId("pricing-comparison-table");
    const sticky = table.querySelectorAll(".sticky");
    // 1 header + 1 per body row
    expect(sticky.length).toBe(1 + competitors.length);
    sticky.forEach((el) => {
      expect((el as HTMLElement).className).toMatch(/\bz-10\b/);
    });
  });

  it("has one row per competitor entry with the correct testid", () => {
    render(<CompetitorComparison />);
    const table = screen.getByTestId("pricing-comparison-table");
    for (const row of competitors) {
      const tr = within(table).getByTestId(`pricing-comparison-row-${featureSlug(row.feature)}`);
      expect(tr.tagName.toLowerCase()).toBe("tr");
      // Feature name lives in the <th scope="row">. toHaveTextContent avoids
      // the "multiple matches" trap when two competitors share a string
      // (e.g. Dedicated instance has "No (shared)" for both Mem0 and Zep).
      const rowHeader = within(tr).getByRole("rowheader");
      expect(rowHeader).toHaveTextContent(row.feature);
      // Three <td>s in strict order: Parametric, Mem0, Zep.
      const cells = within(tr).getAllByRole("cell");
      expect(cells).toHaveLength(3);
      expect(cells[0]).toHaveTextContent(row.parametric);
      expect(cells[1]).toHaveTextContent(row.mem0);
      expect(cells[2]).toHaveTextContent(row.zep);
    }
  });
});

describe("CompetitorComparison — mobile cards (< md)", () => {
  it("renders the pricing-comparison-cards list with md:hidden", () => {
    render(<CompetitorComparison />);
    const cards = screen.getByTestId("pricing-comparison-cards");
    expect(cards.tagName.toLowerCase()).toBe("ul");
    expect(cards.className).toContain("md:hidden");
  });

  it("has one card per competitor entry with the correct testid", () => {
    render(<CompetitorComparison />);
    const cards = screen.getByTestId("pricing-comparison-cards");
    for (const row of competitors) {
      const card = within(cards).getByTestId(`pricing-comparison-row-${featureSlug(row.feature)}`);
      expect(card.tagName.toLowerCase()).toBe("li");
      // Feature name lives in the card's <h3>.
      expect(within(card).getByRole("heading", { level: 3 })).toHaveTextContent(row.feature);
      // <dl> renders three <dt>/<dd> pairs in strict order:
      //   Parametric Memory / Mem0 / Zep
      // Using tagName rather than ARIA role — jsdom's implicit role mapping
      // for <dt>/<dd> is not consistent across test-environment versions.
      const dts = Array.from(card.querySelectorAll("dt"));
      const dds = Array.from(card.querySelectorAll("dd"));
      expect(dts).toHaveLength(3);
      expect(dds).toHaveLength(3);
      expect(dts[0]).toHaveTextContent("Parametric Memory");
      expect(dds[0]).toHaveTextContent(row.parametric);
      expect(dts[1]).toHaveTextContent("Mem0");
      expect(dds[1]).toHaveTextContent(row.mem0);
      expect(dts[2]).toHaveTextContent("Zep");
      expect(dds[2]).toHaveTextContent(row.zep);
    }
  });

  it("lists each competitor label (Parametric Memory / Mem0 / Zep) inside every card", () => {
    render(<CompetitorComparison />);
    const cards = screen.getByTestId("pricing-comparison-cards");
    const cardEls = within(cards).getAllByRole("listitem");
    expect(cardEls).toHaveLength(competitors.length);
    for (const card of cardEls) {
      expect(within(card).getByText("Parametric Memory")).toBeInTheDocument();
      expect(within(card).getByText("Mem0")).toBeInTheDocument();
      expect(within(card).getByText("Zep")).toBeInTheDocument();
    }
  });
});

describe("CompetitorComparison — duplicate-testid reuse contract", () => {
  // Per docs/DUAL-ACCESSIBILITY.md, pricing-comparison-row-<slug> intentionally
  // appears once in the desktop layout and once in the mobile layout. This
  // mirrors the nav-link-* reuse rule. Tests in other files MUST use `within()`
  // to disambiguate. This test asserts that shape.
  it("renders exactly two DOM nodes per row — one per layout", () => {
    render(<CompetitorComparison />);
    for (const row of competitors) {
      const matches = screen.getAllByTestId(`pricing-comparison-row-${featureSlug(row.feature)}`);
      expect(matches).toHaveLength(2);
    }
  });
});
