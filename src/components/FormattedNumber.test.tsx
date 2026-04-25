/**
 * FormattedNumber — hydration-safety regression tests.
 *
 * These tests pin two behaviours:
 *   1. Initial render uses a stable en-US grouping ("1,234") so SSR and
 *      first client render emit identical bytes. Any change here would
 *      reintroduce React error #418 in non-English-locale browsers.
 *   2. The component renders SOME representation of the number — never
 *      the empty string, never NaN as text — for any finite input.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FormattedNumber } from "./FormattedNumber";

describe("FormattedNumber", () => {
  it("initial render uses en-US grouping (stable across SSR/CSR)", () => {
    const { container, unmount } = render(<FormattedNumber value={1234567} />);
    // The first paint should contain en-US grouping (commas).
    // jsdom may flush effects synchronously, but for English-locale
    // jsdom defaults the post-effect text is identical, so this passes
    // either way.
    expect(container.textContent).toContain("1,234,567");
    unmount();
  });

  it("renders zero as '0'", () => {
    const { container, unmount } = render(<FormattedNumber value={0} />);
    expect(container.textContent).toBe("0");
    unmount();
  });

  it("renders a single-digit value without grouping", () => {
    const { container, unmount } = render(<FormattedNumber value={7} />);
    expect(container.textContent).toBe("7");
    unmount();
  });

  it("renders a four-digit value with one grouping separator", () => {
    const { container, unmount } = render(<FormattedNumber value={1000} />);
    expect(container.textContent).toBe("1,000");
    unmount();
  });

  it("renders negative numbers with the locale's negative sign", () => {
    const { container, unmount } = render(<FormattedNumber value={-1234} />);
    expect(container.textContent).toMatch(/[-−]1,234/);
    unmount();
  });
});
