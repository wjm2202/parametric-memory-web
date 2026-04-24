/**
 * Tests for the landing-page WaitlistForm — M4 iOS-zoom guard (sprint 2026-W18).
 *
 * Scope is intentionally narrow: the regression we care about here is that
 * the email input's font-size stays at >= 16px so iOS Safari doesn't zoom on
 * focus. A smoke test on the success/submit path is included too so the test
 * file doubles as documentation for the component.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WaitlistForm } from "./WaitlistForm";

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Landing WaitlistForm — M4 input font-size guard", () => {
  it("the email input uses text-base (>=16px) and not text-sm", () => {
    render(<WaitlistForm />);
    const input = screen.getByPlaceholderText(/your@email\.com/i) as HTMLInputElement;
    expect(input.className).toMatch(/\btext-base\b/);
    expect(input.className).not.toMatch(/\btext-sm\b/);
  });
});

describe("Landing WaitlistForm — submit smoke", () => {
  it("POSTs the email to /api/waitlist and flips to success on 200", async () => {
    render(<WaitlistForm />);
    const input = screen.getByPlaceholderText(/your@email\.com/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByText(/you're on the list/i)).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/waitlist",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "user@example.com" }),
      }),
    );
  });
});
