/**
 * Tests for the pricing-page WaitlistForm — M4 iOS-zoom guard (sprint 2026-W18).
 *
 * The pricing variant is capacity-gated (shown when a tier is at-capacity) and
 * takes tier + display-name props. We only need the M4 regression plus a
 * minimal render smoke — broader coverage can come during A2.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WaitlistForm } from "./WaitlistForm";

describe("Pricing WaitlistForm — M4 input font-size guard", () => {
  it("the email input uses text-base (>=16px) and not text-sm", () => {
    render(<WaitlistForm tier="pro" tierDisplayName="Professional" message="At capacity" />);
    const input = screen.getByPlaceholderText(/your@email\.com/i) as HTMLInputElement;
    expect(input.className).toMatch(/\btext-base\b/);
    expect(input.className).not.toMatch(/\btext-sm\b/);
  });

  it("renders the passed-in message above the form", () => {
    render(<WaitlistForm tier="pro" tierDisplayName="Professional" message="Slots open in Q3" />);
    expect(screen.getByText(/slots open in q3/i)).toBeInTheDocument();
  });
});
