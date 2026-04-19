import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { PricingCardClient } from "./PricingCardClient";

// Mock next/link to render as a plain anchor
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

/** Helper: build a mock fetch response with tier capacity data. */
function mockCapacityResponse(
  tierOverrides: Record<
    string,
    {
      status: string;
      slotsRemaining: number | null;
      maxSlots?: number | null;
      message: string | null;
    }
  >,
) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        tiers: {
          indie: { status: "open", slotsRemaining: 10, maxSlots: 30, message: null },
          pro: { status: "open", slotsRemaining: 10, maxSlots: 30, message: null },
          team: { status: "open", slotsRemaining: 10, maxSlots: null, message: null },
          ...tierOverrides,
        },
      }),
  };
}

describe("PricingCardClient", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── Mount hydration ─────────────────────────────────────────────────

  it("fetches capacity on mount and hydrates the badge", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockCapacityResponse({ indie: { status: "open", slotsRemaining: 7, message: null } }),
    );

    await act(async () => {
      render(
        <PricingCardClient tierId="indie" tierName="Solo" ctaLabel="Get Solo" isLoggedIn={false}>
          <div>$9/month</div>
        </PricingCardClient>,
      );
    });

    // Mount fetch should hit GET /api/capacity
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/capacity",
      expect.objectContaining({ cache: "no-store" }),
    );

    // Badge should show "Available" (7 slots > 5 threshold)
    await waitFor(() => {
      expect(screen.getByText("Available")).toBeInTheDocument();
    });
  });

  it("shows 'Loading…' before mount fetch resolves", () => {
    // Never-resolving fetch to keep the component in loading state
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise(() => {}));

    render(
      <PricingCardClient tierId="indie" tierName="Solo" ctaLabel="Get Solo" isLoggedIn={false}>
        <div>$9/month</div>
      </PricingCardClient>,
    );

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  // ── maxSlots hydration (N / M display) ──────────────────────────────
  // The pricing card should surface the shared-host ceiling to customers so
  // they can see real headroom (e.g. "12 / 30 slots available") rather than a
  // bare number or an opaque "Available". maxSlots comes from compute's
  // compute_hosts.max_tenants and is passed through the API verbatim.
  it("hydrates the badge with 'N / M slots available' when maxSlots is present", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockCapacityResponse({
        indie: { status: "open", slotsRemaining: 12, maxSlots: 30, message: null },
      }),
    );

    await act(async () => {
      render(
        <PricingCardClient tierId="indie" tierName="Solo" ctaLabel="Get Solo" isLoggedIn={false}>
          <div>$9/month</div>
        </PricingCardClient>,
      );
    });

    await waitFor(() => {
      expect(screen.getByText("12 / 30 slots available")).toBeInTheDocument();
    });
  });

  it("hydrates the badge with 'N / M slots left' when low-capacity and maxSlots known", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockCapacityResponse({
        indie: { status: "open", slotsRemaining: 3, maxSlots: 30, message: null },
      }),
    );

    await act(async () => {
      render(
        <PricingCardClient tierId="indie" tierName="Solo" ctaLabel="Get Solo" isLoggedIn={false}>
          <div>$9/month</div>
        </PricingCardClient>,
      );
    });

    await waitFor(() => {
      expect(screen.getByText("3 / 30 slots left")).toBeInTheDocument();
    });
  });

  it("falls back to plain 'Available' when compute omits maxSlots (null)", async () => {
    // When the upstream response doesn't carry maxSlots (e.g. fail-open or
    // unlimited tier), the badge should render "Available" rather than a
    // broken "12 / null slots available" string.
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockCapacityResponse({
        team: { status: "open", slotsRemaining: 12, maxSlots: null, message: null },
      }),
    );

    await act(async () => {
      render(
        <PricingCardClient tierId="team" tierName="Team" ctaLabel="Contact us" isLoggedIn={false}>
          <div>$199/month</div>
        </PricingCardClient>,
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Available")).toBeInTheDocument();
    });
    expect(screen.queryByText(/\/ .* slots/)).not.toBeInTheDocument();
  });

  it("fails open when mount fetch errors — shows 'Available'", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await act(async () => {
      render(
        <PricingCardClient tierId="indie" tierName="Solo" ctaLabel="Get Solo" isLoggedIn={false}>
          <div>$9/month</div>
        </PricingCardClient>,
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Available")).toBeInTheDocument();
    });
  });

  // ── Not logged in ───────────────────────────────────────────────────

  it("shows login link when not logged in", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockCapacityResponse({}));

    await act(async () => {
      render(
        <PricingCardClient tierId="indie" tierName="Solo" ctaLabel="Get Solo" isLoggedIn={false}>
          <div>$9/month</div>
        </PricingCardClient>,
      );
    });

    const link = screen.getByRole("link", { name: "Get Solo" });
    expect(link).toHaveAttribute("href", "/login?redirect=/pricing");
  });

  // ── CTA click capacity check ────────────────────────────────────────

  it("triggers fresh capacity check on CTA click when logged in", async () => {
    // Use fake timers so we can advance past the 3 s debounce window
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;

    // Mount fetch
    fetchMock.mockResolvedValueOnce(mockCapacityResponse({}));

    await act(async () => {
      render(
        <PricingCardClient tierId="indie" tierName="Solo" ctaLabel="Get Solo" isLoggedIn={true}>
          <div>$9/month</div>
        </PricingCardClient>,
      );
    });

    // Advance past the 3 s debounce so CTA click triggers a fresh fetch
    await act(async () => {
      vi.advanceTimersByTime(3_100);
    });

    // CTA click fetch (fresh capacity)
    fetchMock.mockResolvedValueOnce(
      mockCapacityResponse({ indie: { status: "open", slotsRemaining: 5, message: null } }),
    );
    // Checkout fetch
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ sessionUrl: "https://checkout.stripe.com/test" }),
    });

    // Agree to terms and click CTA
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    const button = screen.getByRole("button", { name: "Get Solo" });
    await act(async () => {
      fireEvent.click(button);
    });

    // Should have called /api/capacity twice (mount + CTA click)
    await waitFor(() => {
      const capacityCalls = fetchMock.mock.calls.filter(
        (call: [string, ...unknown[]]) => call[0] === "/api/capacity",
      );
      expect(capacityCalls.length).toBe(2);
    });

    vi.useRealTimers();
  });

  it("shows waitlist form when CTA click capacity check returns full", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;

    // Mount fetch — tier is open
    fetchMock.mockResolvedValueOnce(mockCapacityResponse({}));

    await act(async () => {
      render(
        <PricingCardClient tierId="indie" tierName="Solo" ctaLabel="Get Solo" isLoggedIn={true}>
          <div>$9/month</div>
        </PricingCardClient>,
      );
    });

    // Advance past the 3 s debounce so CTA click triggers a fresh fetch
    await act(async () => {
      vi.advanceTimersByTime(3_100);
    });

    // CTA click fetch — tier just went to waitlist
    fetchMock.mockResolvedValueOnce(
      mockCapacityResponse({
        indie: { status: "waitlist", slotsRemaining: 0, message: "Solo slots are full." },
      }),
    );

    // Agree to terms and click CTA
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    const button = screen.getByRole("button", { name: "Get Solo" });
    await act(async () => {
      fireEvent.click(button);
    });

    // Should transition to waitlist form with the message from compute
    await waitFor(() => {
      expect(screen.getByText("Solo slots are full.")).toBeInTheDocument();
    });

    // Badge should update to show waitlist
    expect(screen.getByText("Full — join waitlist")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("fails open when CTA click capacity check errors — proceeds to checkout", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;

    // Mount fetch — succeeds
    fetchMock.mockResolvedValueOnce(mockCapacityResponse({}));

    await act(async () => {
      render(
        <PricingCardClient tierId="indie" tierName="Solo" ctaLabel="Get Solo" isLoggedIn={true}>
          <div>$9/month</div>
        </PricingCardClient>,
      );
    });

    // CTA click fetch — network error
    fetchMock.mockRejectedValueOnce(new Error("Network error"));
    // Checkout should still fire
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ sessionUrl: "https://checkout.stripe.com/test" }),
    });

    // Agree to terms and click CTA
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    const button = screen.getByRole("button", { name: "Get Solo" });
    fireEvent.click(button);

    // Should proceed to checkout despite capacity check failure
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/checkout",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  // ── Layout order ────────────────────────────────────────────────────

  it("renders children between badge and CTA", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockCapacityResponse({}));

    await act(async () => {
      render(
        <PricingCardClient
          tierId="pro"
          tierName="Professional"
          ctaLabel="Get Professional"
          isLoggedIn={false}
        >
          <div data-testid="price-block">$29/month</div>
        </PricingCardClient>,
      );
    });

    // Default mock now includes maxSlots=30 for pro, so the badge renders
    // the "N / M slots available" form rather than plain "Available".
    expect(screen.getByText("10 / 30 slots available")).toBeInTheDocument();
    expect(screen.getByTestId("price-block")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get Professional" })).toBeInTheDocument();
  });
});
