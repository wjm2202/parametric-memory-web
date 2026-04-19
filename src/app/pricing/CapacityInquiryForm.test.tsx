/**
 * Tests for CapacityInquiryForm.
 *
 * Generalised from TeamInquiryForm in sprint 2026-W17 Item B. Coverage focuses on:
 *   - Renders for every canonical billing tier.
 *   - Tier comes from props and is NOT user-editable.
 *   - Both visual variants (primary / link) collapse and expand correctly.
 *   - Submit POSTs to the new endpoint with the correct payload, including
 *     the tier prop (so the inbox knows which plan the customer is on).
 *   - Error state renders on non-ok response.
 *   - Old payload field `teamSize` is NOT present in the submission body
 *     (regression guard against re-introducing the team-only field).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CapacityInquiryForm } from "./CapacityInquiryForm";
import type { TierId } from "@/config/tiers";

const PUBLIC_TIERS: Exclude<TierId, "free">[] = ["starter", "indie", "pro", "team"];

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Variant: primary ──────────────────────────────────────────────────────────

describe("CapacityInquiryForm — primary variant (Team card replacement)", () => {
  it("renders a collapsed 'Talk to us →' button by default", () => {
    render(<CapacityInquiryForm tier="team" variant="primary" />);
    expect(screen.getByRole("button", { name: /talk to us/i })).toBeInTheDocument();
    // Form fields should not be visible until expanded.
    expect(screen.queryByPlaceholderText(/name/i)).not.toBeInTheDocument();
  });

  it("expands the form on click", () => {
    render(<CapacityInquiryForm tier="team" variant="primary" />);
    fireEvent.click(screen.getByRole("button", { name: /talk to us/i }));
    expect(screen.getByPlaceholderText(/name/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
  });
});

// ── Variant: link ─────────────────────────────────────────────────────────────

describe("CapacityInquiryForm — link variant (subtle CTA on Starter/Solo/Pro)", () => {
  it("renders 'Need more capacity? Talk to us →' for non-team tiers", () => {
    render(<CapacityInquiryForm tier="pro" variant="link" />);
    expect(screen.getByRole("button", { name: /need more capacity/i })).toBeInTheDocument();
  });

  it("expands on click and shows the form", () => {
    render(<CapacityInquiryForm tier="indie" variant="link" />);
    fireEvent.click(screen.getByRole("button", { name: /need more capacity/i }));
    expect(screen.getByPlaceholderText(/name/i)).toBeInTheDocument();
  });
});

// ── Tier rendering & immutability ─────────────────────────────────────────────

describe("CapacityInquiryForm — tier prop is rendered and not user-editable", () => {
  const TIER_DISPLAY: Record<Exclude<TierId, "free">, string> = {
    starter: "Starter",
    indie: "Solo",
    pro: "Professional",
    team: "Team",
  };

  for (const tier of PUBLIC_TIERS) {
    it(`displays the human label for tier="${tier}" once expanded`, () => {
      render(<CapacityInquiryForm tier={tier} variant="link" />);
      fireEvent.click(screen.getByRole("button"));
      expect(screen.getByTestId(`capacity-tier-label-${tier}`)).toHaveTextContent(
        TIER_DISPLAY[tier],
      );
    });

    it(`carries tier="${tier}" in a hidden, read-only input`, () => {
      render(<CapacityInquiryForm tier={tier} variant="link" />);
      fireEvent.click(screen.getByRole("button"));
      const hidden = screen.getByTestId(`capacity-tier-input-${tier}`) as HTMLInputElement;
      expect(hidden.type).toBe("hidden");
      expect(hidden.value).toBe(tier);
      // readOnly enforces "tier is not editable client-side". Crucial guard:
      // if a future refactor swaps to a <select>, this test fails loudly.
      expect(hidden.readOnly).toBe(true);
    });
  }

  it("does NOT render any user-facing tier picker (regression: tier from props only)", () => {
    render(<CapacityInquiryForm tier="pro" variant="link" />);
    fireEvent.click(screen.getByRole("button"));
    // No <select> or radio buttons named "tier" — the tier is fixed by props.
    expect(screen.queryByRole("combobox", { name: /tier|plan/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: /tier|plan/i })).not.toBeInTheDocument();
  });
});

// ── Submit wiring ─────────────────────────────────────────────────────────────

describe("CapacityInquiryForm — submit", () => {
  it("POSTs to /api/capacity-inquiry with name, email, tier, message", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    render(<CapacityInquiryForm tier="pro" variant="link" />);

    fireEvent.click(screen.getByRole("button", { name: /need more capacity/i }));
    fireEvent.change(screen.getByPlaceholderText(/name/i), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: "ada@example.com" },
    });
    // Textarea: the placeholder copy varies per tier; match on what we know
    // is in both copies — "e.g."
    const textarea = screen.getByPlaceholderText(/^e\.g\./i);
    fireEvent.change(textarea, { target: { value: "Need 200k atoms please" } });

    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/capacity-inquiry");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body ?? "{}"));
    expect(body).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      tier: "pro",
      message: "Need 200k atoms please",
    });
  });

  it("regression guard: submission body NEVER includes legacy 'teamSize' field", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    render(<CapacityInquiryForm tier="team" variant="primary" />);

    fireEvent.click(screen.getByRole("button", { name: /talk to us/i }));
    fireEvent.change(screen.getByPlaceholderText(/name/i), { target: { value: "Ada" } });
    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/^e\.g\./i), {
      target: { value: "team of 15" },
    });

    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body ?? "{}"));
    expect(body).not.toHaveProperty("teamSize");
    // The shim at /api/team-inquiry handles the old field; the new form must not.
  });

  it("renders a success message when the API returns 200", async () => {
    render(<CapacityInquiryForm tier="indie" variant="link" />);
    fireEvent.click(screen.getByRole("button", { name: /need more capacity/i }));
    fireEvent.change(screen.getByPlaceholderText(/name/i), { target: { value: "Ada" } });
    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/^e\.g\./i), { target: { value: "more" } });

    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(screen.getByText(/we'll be in touch shortly/i)).toBeInTheDocument());
  });

  it("renders an error message when the API returns non-ok", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });

    render(<CapacityInquiryForm tier="indie" variant="link" />);
    fireEvent.click(screen.getByRole("button", { name: /need more capacity/i }));
    fireEvent.change(screen.getByPlaceholderText(/name/i), { target: { value: "Ada" } });
    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/^e\.g\./i), { target: { value: "x" } });

    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument());
  });

  it("renders an error message when fetch rejects (network error)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    render(<CapacityInquiryForm tier="starter" variant="link" />);
    fireEvent.click(screen.getByRole("button", { name: /need more capacity/i }));
    fireEvent.change(screen.getByPlaceholderText(/name/i), { target: { value: "Ada" } });
    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/^e\.g\./i), { target: { value: "x" } });

    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument());
  });
});

// ── Required-field enforcement (HTML5 validity) ───────────────────────────────

describe("CapacityInquiryForm — required-field enforcement", () => {
  it("name, email, message are marked required", () => {
    render(<CapacityInquiryForm tier="indie" variant="link" />);
    fireEvent.click(screen.getByRole("button"));

    const name = screen.getByPlaceholderText(/name/i) as HTMLInputElement;
    const email = screen.getByPlaceholderText(/email/i) as HTMLInputElement;
    const message = screen.getByPlaceholderText(/^e\.g\./i) as HTMLTextAreaElement;

    expect(name.required).toBe(true);
    expect(email.required).toBe(true);
    expect(message.required).toBe(true);
  });

  it("does not POST when fields are blank (HTML5 validity blocks submit)", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    render(<CapacityInquiryForm tier="indie" variant="link" />);
    fireEvent.click(screen.getByRole("button", { name: /need more capacity/i }));

    // jsdom honours `required` on form submit — clicking the submit button
    // with empty fields does NOT trigger the submit handler.
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    // Give any microtasks a beat to flush; expect the network call to NOT
    // have happened.
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
