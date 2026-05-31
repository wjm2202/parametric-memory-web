/**
 * PricingCTA — adblock-resilient hosted-redirect fallback
 *
 * SPRINT-CHECKOUT-ADBLOCKER-RESILIENCE-2026-05-29.md (D3.1)
 *
 * What's under test:
 *   When `probeStripeAvailability()` reports the page can't load
 *   `js.stripe.com` (i.e. an ad blocker has filtered it), `PricingCTA`
 *   POSTs `/api/checkout` with `{ mode: "hosted" }` and navigates the
 *   window to the returned Stripe-hosted URL — instead of showing the
 *   amber "disable adblocker" notice. The amber notice is now a
 *   last-resort, only shown if the hosted-redirect POST itself fails.
 *
 *   The "probe ok → drawer opens" path is already covered by
 *   PricingCardClient.test.tsx; this file is laser-focused on the
 *   probe-fail branch.
 *
 * Test seam strategy:
 *   `probeStripeAvailability` and `CheckoutDrawer` are both exported from
 *   `./CheckoutDrawer`. We mock the whole module so `probeStripeAvailability`
 *   returns whatever the test wants without going through `loadStripe`'s
 *   module-singleton cache. This keeps tests independent and avoids the
 *   dynamic-import dance the other suite uses.
 *
 * NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is set even though our mock
 * short-circuits CheckoutDrawer — `getStripe()` still reads the env var on
 * module load via `process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and an
 * undefined value would cause the embedded path to nullify the singleton.
 * Belt-and-braces.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_adblock_fallback_xxx";

// `vi.mock` factories are hoisted above top-level `const` declarations, so
// a plain `const probeMock = vi.fn()` lands in the temporal dead zone when
// the factory runs. `vi.hoisted` gives us a hoisted block that can declare
// the spies alongside the mock — both move above the import together.
const { probeMock, CheckoutDrawerMock } = vi.hoisted(() => ({
  probeMock: vi.fn(),
  CheckoutDrawerMock: vi.fn(() => null),
}));

vi.mock("./CheckoutDrawer", () => ({
  probeStripeAvailability: probeMock,
  CheckoutDrawer: (props: Record<string, unknown>) => {
    CheckoutDrawerMock(props);
    return null;
  },
}));

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

// PricingCTA calls useRouter for the SM-MULTI-5 chooser; stub it so render
// doesn't require an app-router context. (This suite renders the new-customer
// path — hasExistingSubstrate defaults false — so the chooser never opens.)
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Imported AFTER the mocks above so the component picks up the mocked
// probeStripeAvailability.
import { PricingCTA } from "./PricingCTA";

// ──────────────────────────────────────────────────────────────────────────
// window.location stub — jsdom's default is non-configurable. We replace
// it with a plain object so assignments to `.href` are observable. Restored
// in afterEach so other suites in the same file aren't affected.
// ──────────────────────────────────────────────────────────────────────────
const realLocation = window.location;
function stubLocation() {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { href: "about:blank", assign: vi.fn() },
  });
}
function restoreLocation() {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: realLocation,
  });
}

// Convenience — agree to ToS + click the CTA button.
async function clickCTA() {
  const checkbox = screen.getByRole("checkbox");
  fireEvent.click(checkbox);
  const button = screen.getByRole("button", { name: /Get Solo/ });
  await act(async () => {
    fireEvent.click(button);
  });
}

describe("PricingCTA — adblock-resilient hosted-redirect fallback", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    probeMock.mockReset();
    CheckoutDrawerMock.mockReset();
    stubLocation();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    restoreLocation();
  });

  // ── AB-1 ────────────────────────────────────────────────────────────────
  it("probe success: opens the drawer and does NOT POST /api/checkout", async () => {
    probeMock.mockResolvedValueOnce({ ok: true });

    render(<PricingCTA tierId="indie" tierName="Solo" label="Get Solo" isLoggedIn={true} />);

    await clickCTA();

    await waitFor(() => {
      expect(CheckoutDrawerMock).toHaveBeenCalledWith(
        expect.objectContaining({ open: true, tierId: "indie" }),
      );
    });

    // PricingCTA must not have fetched /api/checkout itself — that's the
    // drawer's job in the embedded path.
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const checkoutCalls = fetchMock.mock.calls.filter(
      (call: [string, ...unknown[]]) => call[0] === "/api/checkout",
    );
    expect(checkoutCalls).toHaveLength(0);
  });

  // ── AB-2 ────────────────────────────────────────────────────────────────
  it("probe fail + 2xx /api/checkout: navigates window to the hosted URL", async () => {
    probeMock.mockResolvedValueOnce({ ok: false, reason: "load_failed" });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          url: "https://checkout.stripe.com/c/pay/cs_test_hosted_redirect_ab2",
          tier: "indie",
          amountCents: 900,
        }),
    });

    render(<PricingCTA tierId="indie" tierName="Solo" label="Get Solo" isLoggedIn={true} />);

    await clickCTA();

    await waitFor(() => {
      expect(window.location.href).toBe(
        "https://checkout.stripe.com/c/pay/cs_test_hosted_redirect_ab2",
      );
    });

    // /api/checkout must have been called with the hosted-mode body.
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [[url, init]] = fetchMock.mock.calls;
    expect(url).toBe("/api/checkout");
    expect(JSON.parse(init.body)).toEqual({ tier: "indie", mode: "hosted" });

    // Amber notice must NOT have rendered — the hosted-redirect succeeded.
    expect(screen.queryByTestId("pricing-cta-adblock-notice")).not.toBeInTheDocument();
    // Drawer must NOT have opened.
    expect(CheckoutDrawerMock).not.toHaveBeenCalled();
  });

  // ── AB-3 ────────────────────────────────────────────────────────────────
  it("probe fail + 401 /api/checkout: shows sign-in error, no navigation", async () => {
    probeMock.mockResolvedValueOnce({ ok: false, reason: "load_failed" });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "unauthorized" }),
    });

    render(<PricingCTA tierId="indie" tierName="Solo" label="Get Solo" isLoggedIn={true} />);

    await clickCTA();

    await waitFor(() => {
      expect(screen.getByText(/sign in again before paying/i)).toBeInTheDocument();
    });
    expect(window.location.href).toBe("about:blank");
  });

  // ── AB-4 ────────────────────────────────────────────────────────────────
  it("probe fail + 409 /api/checkout: surfaces compute's capacity message", async () => {
    probeMock.mockResolvedValueOnce({ ok: false, reason: "load_failed" });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () =>
        Promise.resolve({
          error: "tier_at_capacity",
          message: "Solo slots are full — please join the waitlist.",
        }),
    });

    render(<PricingCTA tierId="indie" tierName="Solo" label="Get Solo" isLoggedIn={true} />);

    await clickCTA();

    await waitFor(() => {
      expect(
        screen.getByText("Solo slots are full — please join the waitlist."),
      ).toBeInTheDocument();
    });
    expect(window.location.href).toBe("about:blank");
  });

  // ── AB-5 ────────────────────────────────────────────────────────────────
  it("probe fail + 2xx but no url in response: shows retry error", async () => {
    probeMock.mockResolvedValueOnce({ ok: false, reason: "stripe_unavailable" });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ tier: "indie", amountCents: 900 }),
    });

    render(<PricingCTA tierId="indie" tierName="Solo" label="Get Solo" isLoggedIn={true} />);

    await clickCTA();

    await waitFor(() => {
      expect(
        screen.getByText("Stripe returned no checkout URL. Please retry."),
      ).toBeInTheDocument();
    });
    expect(window.location.href).toBe("about:blank");
  });

  // ── AB-6 ────────────────────────────────────────────────────────────────
  it("probe fail + fetch throw: falls back to amber adblock notice as last resort", async () => {
    probeMock.mockResolvedValueOnce({ ok: false, reason: "load_failed" });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network down between probe and redirect"),
    );

    render(<PricingCTA tierId="indie" tierName="Solo" label="Get Solo" isLoggedIn={true} />);

    await clickCTA();

    await waitFor(() => {
      expect(screen.getByTestId("pricing-cta-adblock-notice")).toBeInTheDocument();
    });
    expect(window.location.href).toBe("about:blank");
  });
});
