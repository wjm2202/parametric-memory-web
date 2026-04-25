/**
 * Tests for TeamInquiryForm — M4 iOS-zoom guard (sprint 2026-W18).
 *
 * TeamInquiryForm starts collapsed behind a CTA; the inputs only mount when the
 * user opens it. The M4 test opens the form first, then asserts the input
 * font-size. Narrow scope — broader coverage belongs in A2.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TeamInquiryForm } from "./TeamInquiryForm";

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TeamInquiryForm — M4 input font-size guard", () => {
  it("name and email inputs use text-base (>=16px) and not text-sm once the form is open", () => {
    render(<TeamInquiryForm />);
    // Expand the form from its collapsed CTA state.
    fireEvent.click(screen.getByRole("button"));

    const name = screen.getByPlaceholderText(/name/i) as HTMLInputElement;
    const email = screen.getByPlaceholderText(/email/i) as HTMLInputElement;

    for (const field of [name, email]) {
      expect(field.className).toMatch(/\btext-base\b/);
      expect(field.className).not.toMatch(/\btext-sm\b/);
    }
  });
});
