/**
 * SiteFooter unit tests.
 *
 * Why: this component carries the canonical copyright line that must
 * appear on every page. If the wording, year, holder, or the link to
 * /copyright ever drifts, every page on the site is affected. Lock the
 * exact strings down here.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SiteFooter, {
  COPYRIGHT_HOLDER,
  COPYRIGHT_LINE,
  COPYRIGHT_YEAR_RANGE,
  SITE_FOOTER_COLUMNS,
} from "./SiteFooter";

describe("SiteFooter — canonical copyright line", () => {
  it("exposes a stable canonical copyright string", () => {
    // These are read by the test for the /copyright page and by
    // mobile-typography.test.tsx. They are the canonical wording.
    expect(COPYRIGHT_HOLDER).toBe("G. Osborne");
    expect(COPYRIGHT_YEAR_RANGE).toBe("2025–2026");
    expect(COPYRIGHT_LINE).toBe(
      "© 2025–2026 G. Osborne. All rights reserved. Authored in New Zealand.",
    );
  });

  it("renders the canonical copyright string verbatim", () => {
    render(<SiteFooter />);
    // Use a regex against just the © prefix because the link follows
    // the period; we want to confirm the leading legal sentence is intact.
    expect(screen.getByTestId("site-footer-copyright").textContent ?? "").toContain(COPYRIGHT_LINE);
  });

  it("renders a link to /copyright", () => {
    render(<SiteFooter />);
    const link = screen.getByTestId("site-footer-copyright-link");
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/copyright");
    expect(link.textContent).toMatch(/copyright/i);
  });

  it("uses semantic <footer> with role=contentinfo", () => {
    render(<SiteFooter />);
    const el = screen.getByTestId("site-footer");
    expect(el.tagName.toLowerCase()).toBe("footer");
    expect(el.getAttribute("role")).toBe("contentinfo");
  });
});

describe("SiteFooter — sitemap (dual-accessibility declutter, 2026-07-02)", () => {
  it("renders a <nav> sitemap landmark", () => {
    render(<SiteFooter />);
    const sitemap = screen.getByTestId("footer-sitemap");
    expect(sitemap.tagName.toLowerCase()).toBe("nav");
    expect(sitemap.getAttribute("aria-label")).toBe("Footer");
  });

  it("renders every registered footer link with the correct href", () => {
    render(<SiteFooter />);
    for (const col of SITE_FOOTER_COLUMNS) {
      for (const link of col.links) {
        const el = screen.getByTestId(link.testid);
        expect(el.getAttribute("href"), `${link.testid} → ${link.href}`).toBe(link.href);
      }
    }
  });

  it("keeps the legal pages reachable from the footer (Terms/Privacy/AUP/DPA)", () => {
    // These moved out of the top nav on 2026-07-02; the footer is now the
    // guaranteed reachability path from every page.
    render(<SiteFooter />);
    expect(screen.getByTestId("footer-link-terms").getAttribute("href")).toBe("/terms");
    expect(screen.getByTestId("footer-link-privacy").getAttribute("href")).toBe("/privacy");
    expect(screen.getByTestId("footer-link-aup").getAttribute("href")).toBe("/aup");
    expect(screen.getByTestId("footer-link-dpa").getAttribute("href")).toBe("/dpa");
  });
});
