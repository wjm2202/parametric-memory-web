/**
 * Tests for the Embedded Checkout drawer + adblock probe.
 *
 * Sprint 2026-05-18 D3 / D10.
 *
 * The Stripe libraries are mocked because (a) loadStripe makes a real network
 * call and (b) <EmbeddedCheckout> mounts an iframe that doesn't render
 * usefully under jsdom. Both stubs are simple enough that they exercise
 * everything we care about: the drawer's lifecycle, the fetchClientSecret
 * wiring, and the error/close paths.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mocks (must come BEFORE component import) ──────────────────────────────

const mockLoadStripe = vi.fn();
vi.mock("@stripe/stripe-js", () => ({
  loadStripe: (...args: unknown[]) => mockLoadStripe(...args),
}));

const lastFetchClientSecretCall: { fn: (() => Promise<string>) | null } = { fn: null };
vi.mock("@stripe/react-stripe-js", () => ({
  EmbeddedCheckoutProvider: ({
    children,
    options,
  }: {
    children: React.ReactNode;
    options: { fetchClientSecret: () => Promise<string> };
  }) => {
    // Capture the bound fetchClientSecret so tests can call it without
    // mounting a real iframe.
    lastFetchClientSecretCall.fn = options.fetchClientSecret;
    return <div data-testid="mock-embedded-checkout-provider">{children}</div>;
  },
  EmbeddedCheckout: () => <div data-testid="mock-embedded-checkout-iframe" />,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Only CheckoutDrawer is statically imported. The probeStripeAvailability
// tests use a dynamic `await import("./CheckoutDrawer")` inside each test
// so the module-singleton resets cleanly with vi.resetModules() in
// beforeEach — a static import here would bind the singleton to the FIRST
// load and the env-var / loadStripe-rejection tests would race the cache.
import { CheckoutDrawer } from "./CheckoutDrawer";

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  lastFetchClientSecretCall.fn = null;
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_drawer_xyz";
  // Default: loadStripe resolves to a non-null Stripe object.
  mockLoadStripe.mockResolvedValue({
    /* fake Stripe handle */
  });
  // Reset the module-singleton between tests — exported `probeStripeAvailability`
  // and the drawer share the same singleton, so we need to bust the cache.
  vi.resetModules();
});

// ── probeStripeAvailability ────────────────────────────────────────────────

describe("probeStripeAvailability", () => {
  it("returns { ok: true } when loadStripe resolves to a Stripe object", async () => {
    const { probeStripeAvailability: probe } = await import("./CheckoutDrawer");
    const result = await probe();
    expect(result).toEqual({ ok: true });
  });

  it("returns { ok: false, reason: 'stripe_unavailable' } when loadStripe resolves to null", async () => {
    mockLoadStripe.mockResolvedValue(null);
    const { probeStripeAvailability: probe } = await import("./CheckoutDrawer");
    const result = await probe();
    expect(result).toEqual({ ok: false, reason: "stripe_unavailable" });
  });

  it("returns { ok: false, reason: 'load_failed' } when loadStripe throws", async () => {
    mockLoadStripe.mockRejectedValue(new Error("network unreachable"));
    const { probeStripeAvailability: probe } = await import("./CheckoutDrawer");
    const result = await probe();
    expect(result).toEqual({ ok: false, reason: "load_failed" });
  });

  it("returns { ok: false, reason: 'stripe_unavailable' } when the publishable key is missing", async () => {
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    const { probeStripeAvailability: probe } = await import("./CheckoutDrawer");
    const result = await probe();
    expect(result).toEqual({ ok: false, reason: "stripe_unavailable" });
  });
});

// ── CheckoutDrawer ─────────────────────────────────────────────────────────

describe("CheckoutDrawer", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(
      <CheckoutDrawer open={false} onClose={() => {}} tierId="indie" tierName="Solo" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the drawer chrome + iframe shell when open=true", () => {
    render(
      <CheckoutDrawer
        open
        onClose={() => {}}
        tierId="indie"
        tierName="Solo"
        priceLabel="$9/month"
      />,
    );
    expect(screen.getByTestId("checkout-drawer")).toBeTruthy();
    expect(screen.getByText("Solo")).toBeTruthy();
    expect(screen.getByText("$9/month")).toBeTruthy();
    expect(screen.getByTestId("mock-embedded-checkout-provider")).toBeTruthy();
    expect(screen.getByTestId("mock-embedded-checkout-iframe")).toBeTruthy();
  });

  it("fires onClose when × is clicked", () => {
    const onClose = vi.fn();
    render(<CheckoutDrawer open onClose={onClose} tierId="indie" tierName="Solo" />);
    fireEvent.click(screen.getByTestId("checkout-drawer-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fires onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<CheckoutDrawer open onClose={onClose} tierId="indie" tierName="Solo" />);
    fireEvent.click(screen.getByTestId("checkout-drawer-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fetchClientSecret POSTs /api/checkout with { tier } and returns clientSecret on 200", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ clientSecret: "cs_test_secret_xyz" }),
    });

    render(<CheckoutDrawer open onClose={() => {}} tierId="indie" tierName="Solo" />);

    expect(lastFetchClientSecretCall.fn).toBeTruthy();
    const result = await lastFetchClientSecretCall.fn!();

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/checkout",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify({ tier: "indie" }),
      }),
    );
    expect(result).toBe("cs_test_secret_xyz");
  });

  it("renders the error notice when /api/checkout returns 409 capacity", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ message: "Solo is at capacity — try later." }),
    });

    render(<CheckoutDrawer open onClose={() => {}} tierId="indie" tierName="Solo" />);
    // Trigger fetchClientSecret manually (in real life Stripe.js calls it).
    await lastFetchClientSecretCall.fn!();
    // The drawer updates state → re-render renders the error body.
    await waitFor(() => {
      expect(screen.getByTestId("checkout-drawer-error")).toBeTruthy();
    });
    expect(screen.getByTestId("checkout-drawer-error").textContent).toContain(
      "Solo is at capacity",
    );
  });

  it("renders a friendly 401 message and short-circuits to empty string", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "unauthorized" }),
    });

    render(<CheckoutDrawer open onClose={() => {}} tierId="indie" tierName="Solo" />);
    const result = await lastFetchClientSecretCall.fn!();

    expect(result).toBe("");
    await waitFor(() => {
      expect(screen.getByTestId("checkout-drawer-error").textContent).toContain("sign in again");
    });
  });

  it("renders an error when /api/checkout returns no clientSecret", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    render(<CheckoutDrawer open onClose={() => {}} tierId="indie" tierName="Solo" />);
    const result = await lastFetchClientSecretCall.fn!();

    expect(result).toBe("");
    await waitFor(() => {
      expect(screen.getByTestId("checkout-drawer-error").textContent).toContain("no client secret");
    });
  });
});
