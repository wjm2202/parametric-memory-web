/**
 * PricingCTA — pricing is always "new" (the SM-MULTI-5 upgrade-vs-add chooser
 * was removed).
 *
 * Plan changes / migrations for an existing substrate are done from that
 * substrate's admin view (ChangePlanButton), never from pricing. So a logged-in
 * customer's CTA always goes straight to a NEW-substrate checkout — there is no
 * chooser, regardless of whether they already own a substrate.
 *
 * CheckoutDrawer + probeStripeAvailability are mocked (same seam as the
 * adblock-fallback suite).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_chooser_xxx";

const { probeMock } = vi.hoisted(() => ({
  probeMock: vi.fn(),
}));

vi.mock("./CheckoutDrawer", () => ({
  probeStripeAvailability: probeMock,
  // Render a marker so the test can assert the checkout path was taken.
  CheckoutDrawer: () => <div data-testid="mock-checkout-drawer" />,
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

describe("PricingCTA — pricing is always new (no chooser)", () => {
  it("logged-in CTA goes straight to checkout — no upgrade-vs-add chooser", async () => {
    renderAndAgree();
    fireEvent.click(screen.getByTestId("pricing-card-pro-cta"));

    await waitFor(() => {
      expect(screen.getByTestId("mock-checkout-drawer")).toBeTruthy();
    });
    // The chooser is gone — none of its elements should ever render.
    expect(screen.queryByTestId("pricing-chooser")).toBeNull();
    expect(screen.queryByTestId("pricing-chooser-upgrade")).toBeNull();
    expect(screen.queryByTestId("pricing-chooser-add")).toBeNull();
  });

  it("CTA is disabled until Terms are agreed (no checkout without consent)", () => {
    render(<PricingCTA tierId="pro" tierName="Professional" label="Get Professional" isLoggedIn />);
    const cta = screen.getByTestId("pricing-card-pro-cta") as HTMLButtonElement;

    // Disabled before consent — clicking does nothing, no checkout.
    expect(cta.disabled).toBe(true);
    fireEvent.click(cta);
    expect(screen.queryByTestId("mock-checkout-drawer")).toBeNull();

    // Ticking the Terms checkbox enables it.
    fireEvent.click(screen.getByRole("checkbox"));
    expect(cta.disabled).toBe(false);
  });
});
