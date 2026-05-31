/**
 * PricingCTA — upgrade-vs-add chooser (SM-MULTI-5).
 *
 * When a logged-in customer who already owns a substrate
 * (hasExistingSubstrate=true) clicks a tier CTA, they get a chooser instead of
 * going straight to checkout: "Upgrade my existing instance" (→ /dashboard,
 * one subscription) vs "Add a new instance" (→ checkout, a second
 * subscription). New customers (hasExistingSubstrate=false) skip the chooser.
 *
 * CheckoutDrawer + probeStripeAvailability are mocked (same seam as the
 * adblock-fallback suite); next/navigation's useRouter is mocked to spy on the
 * upgrade redirect.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_chooser_xxx";

const { probeMock, pushMock } = vi.hoisted(() => ({
  probeMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("./CheckoutDrawer", () => ({
  probeStripeAvailability: probeMock,
  // Render a marker so the test can assert the checkout path was taken.
  CheckoutDrawer: () => <div data-testid="mock-checkout-drawer" />,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [k: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { PricingCTA } from "./PricingCTA";

beforeEach(() => {
  probeMock.mockReset();
  probeMock.mockResolvedValue({ ok: true }); // Stripe loads → embedded drawer path
  pushMock.mockReset();
});

/** Render the CTA and tick the required Terms checkbox. */
function renderAndAgree(props: Partial<React.ComponentProps<typeof PricingCTA>> = {}) {
  render(
    <PricingCTA
      tierId="pro"
      tierName="Professional"
      label="Get Professional"
      isLoggedIn
      {...props}
    />,
  );
  fireEvent.click(screen.getByRole("checkbox"));
}

describe("PricingCTA — upgrade-vs-add chooser (SM-MULTI-5)", () => {
  it("new customer (no existing substrate) → CTA goes straight to checkout, no chooser", async () => {
    renderAndAgree({ hasExistingSubstrate: false });
    fireEvent.click(screen.getByTestId("pricing-card-pro-cta"));

    await waitFor(() => {
      expect(screen.getByTestId("mock-checkout-drawer")).toBeTruthy();
    });
    expect(screen.queryByTestId("pricing-chooser")).toBeNull();
  });

  it("existing customer → CTA opens the chooser with both options", () => {
    renderAndAgree({ hasExistingSubstrate: true });
    fireEvent.click(screen.getByTestId("pricing-card-pro-cta"));

    expect(screen.getByTestId("pricing-chooser")).toBeTruthy();
    expect(screen.getByTestId("pricing-chooser-upgrade")).toBeTruthy();
    expect(screen.getByTestId("pricing-chooser-add")).toBeTruthy();
    // Chooser replaces the CTA; no checkout started yet.
    expect(screen.queryByTestId("mock-checkout-drawer")).toBeNull();
  });

  it("chooser → 'Upgrade my existing instance' routes to the dashboard, no checkout", () => {
    renderAndAgree({ hasExistingSubstrate: true });
    fireEvent.click(screen.getByTestId("pricing-card-pro-cta"));
    fireEvent.click(screen.getByTestId("pricing-chooser-upgrade"));

    expect(pushMock).toHaveBeenCalledWith("/dashboard");
    expect(screen.queryByTestId("mock-checkout-drawer")).toBeNull();
  });

  it("chooser → 'Add a new instance' proceeds to checkout (new subscription)", async () => {
    renderAndAgree({ hasExistingSubstrate: true });
    fireEvent.click(screen.getByTestId("pricing-card-pro-cta"));
    fireEvent.click(screen.getByTestId("pricing-chooser-add"));

    await waitFor(() => {
      expect(screen.getByTestId("mock-checkout-drawer")).toBeTruthy();
    });
    expect(pushMock).not.toHaveBeenCalled();
  });
});
