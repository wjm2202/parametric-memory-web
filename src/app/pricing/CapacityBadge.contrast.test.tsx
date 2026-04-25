/**
 * Contrast-class regression test for CapacityBadge.
 *
 * Why this exists. Lighthouse a11y flagged `text-white/30` and
 * `text-white/40` on the CapacityBadge loading/checking states for failing
 * WCAG 4.5:1 contrast on the dark surface background. We bumped them to
 * `text-white/70` and `text-white/75` respectively. This test guards against
 * regression to the low-alpha values.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CapacityBadge } from "./CapacityBadge";

describe("CapacityBadge — contrast (a11y)", () => {
  it("Loading… (hydrated=false) uses text-white/70 — not text-white/30", () => {
    const { container } = render(
      <CapacityBadge status="open" slotsRemaining={null} hydrated={false} />,
    );
    const html = container.innerHTML;
    expect(html).toMatch(/Loading…/);
    expect(html).toMatch(/text-white\/70/);
    expect(html).not.toMatch(/text-white\/30\b/);
  });

  it("Checking availability… (checking=true) uses text-white/75 — not text-white/40", () => {
    const { container } = render(<CapacityBadge status="open" slotsRemaining={null} checking />);
    const html = container.innerHTML;
    expect(html).toMatch(/Checking availability…/);
    expect(html).toMatch(/text-white\/75/);
    expect(html).not.toMatch(/text-white\/40\b/);
  });
});
