/**
 * Unit tests for SubstrateStateBanner.
 *
 * Covers the three shipped variants (pending_payment, provision_failed,
 * read_only), the "renders nothing for healthy statuses" contract that lets
 * callers render the banner unconditionally, dismissal behaviour on
 * pending_payment, the support-email mailto structure for provision_failed,
 * and the billing-portal CTA for read_only.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SubstrateStateBanner from "./SubstrateStateBanner";

describe("SubstrateStateBanner — null-rendering contract", () => {
  it("renders nothing for running", () => {
    const { container } = render(<SubstrateStateBanner slug="ok-one" status="running" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for provisioning", () => {
    const { container } = render(<SubstrateStateBanner slug="ok-two" status="provisioning" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for unknown statuses", () => {
    const { container } = render(
      <SubstrateStateBanner slug="ok-four" status="some-future-state" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SubstrateStateBanner — pending_payment (F-BILLING-3)", () => {
  it("renders the pending_payment variant with the slug and CTA", () => {
    render(
      <SubstrateStateBanner
        slug="bold-junction"
        status="pending_payment"
        onBillingPortal={vi.fn()}
      />,
    );

    const banner = screen.getByTestId("substrate-banner-bold-junction");
    expect(banner).toHaveAttribute("data-variant", "pending_payment");
    expect(banner).toHaveAttribute("role", "alert");
    expect(banner).toHaveTextContent(/Payment pending for/);
    expect(banner).toHaveTextContent("bold-junction");
    expect(screen.getByRole("button", { name: /Complete payment/i })).toBeInTheDocument();
  });

  it("invokes onBillingPortal when the CTA is clicked", () => {
    const onBillingPortal = vi.fn();
    render(
      <SubstrateStateBanner
        slug="bold-junction"
        status="pending_payment"
        onBillingPortal={onBillingPortal}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Complete payment/i }));
    expect(onBillingPortal).toHaveBeenCalledTimes(1);
  });

  it("dismisses locally when the ✕ is clicked", () => {
    render(
      <SubstrateStateBanner
        slug="bold-junction"
        status="pending_payment"
        onBillingPortal={vi.fn()}
      />,
    );

    expect(screen.getByTestId("substrate-banner-bold-junction")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Dismiss/i }));
    expect(screen.queryByTestId("substrate-banner-bold-junction")).not.toBeInTheDocument();
  });

  it("is safe to click the CTA when no onBillingPortal is provided", () => {
    // Guard against a runtime crash if a caller forgets the callback — the
    // banner shouldn't explode; it just no-ops. (Callers SHOULD pass the
    // callback, but the component's contract is "doesn't crash without it".)
    render(<SubstrateStateBanner slug="bold-junction" status="pending_payment" />);
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: /Complete payment/i })),
    ).not.toThrow();
  });
});

describe("SubstrateStateBanner — provision_failed (F-PROV-1)", () => {
  it("renders the provision_failed variant with the slug and support CTA", () => {
    render(<SubstrateStateBanner slug="doomed-slug" status="provision_failed" />);

    const banner = screen.getByTestId("substrate-banner-doomed-slug");
    expect(banner).toHaveAttribute("data-variant", "provision_failed");
    expect(banner).toHaveAttribute("role", "alert");
    expect(banner).toHaveTextContent(/Provisioning failed for/);
    expect(banner).toHaveTextContent("doomed-slug");
    expect(screen.getByRole("link", { name: /Contact support/i })).toBeInTheDocument();
  });

  it("links the CTA to a mailto: with the slug in the subject", () => {
    render(<SubstrateStateBanner slug="doomed-slug" status="provision_failed" />);

    const link = screen.getByRole("link", { name: /Contact support/i });
    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith("mailto:")).toBe(true);
    expect(href).toContain("entityone22@gmail.com");
    // Subject must contain the slug so support can triage immediately.
    expect(decodeURIComponent(href)).toContain("Provisioning failed for doomed-slug");
  });

  it("honours a custom supportEmail prop", () => {
    render(
      <SubstrateStateBanner
        slug="doomed-slug"
        status="provision_failed"
        supportEmail="ops@example.com"
      />,
    );

    const link = screen.getByRole("link", { name: /Contact support/i });
    expect(link.getAttribute("href")).toContain("ops@example.com");
    expect(link.getAttribute("href")).not.toContain("entityone22@gmail.com");
  });

  it("does NOT render a dismiss button — this is a hard error", () => {
    // provision_failed is a non-recoverable state from the customer's side;
    // the banner must stay visible until support manually clears the
    // substrate. No dismiss affordance.
    render(<SubstrateStateBanner slug="doomed-slug" status="provision_failed" />);
    expect(screen.queryByRole("button", { name: /Dismiss/i })).not.toBeInTheDocument();
  });
});

describe("SubstrateStateBanner — read_only (F-BILLING-2)", () => {
  it("renders the read_only variant with the slug and billing CTA", () => {
    render(
      <SubstrateStateBanner slug="frozen-peak" status="read_only" onBillingPortal={vi.fn()} />,
    );

    const banner = screen.getByTestId("substrate-banner-frozen-peak");
    expect(banner).toHaveAttribute("data-variant", "read_only");
    expect(banner).toHaveAttribute("role", "alert");
    expect(banner).toHaveTextContent(/Writes paused for/);
    expect(banner).toHaveTextContent("frozen-peak");
    expect(screen.getByRole("button", { name: /Manage billing/i })).toBeInTheDocument();
  });

  it("explains that reads still work (vs. total outage)", () => {
    // Critical for customer calm: read_only ≠ broken. Reads work; only writes
    // are blocked. The copy must make that distinction explicitly so users
    // don't think their data is inaccessible.
    render(<SubstrateStateBanner slug="frozen-peak" status="read_only" />);
    expect(screen.getByText(/reads still work/i)).toBeInTheDocument();
  });

  it("invokes onBillingPortal when the CTA is clicked", () => {
    const onBillingPortal = vi.fn();
    render(
      <SubstrateStateBanner
        slug="frozen-peak"
        status="read_only"
        onBillingPortal={onBillingPortal}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Manage billing/i }));
    expect(onBillingPortal).toHaveBeenCalledTimes(1);
  });

  it("is safe to click the CTA when no onBillingPortal is provided", () => {
    // Same robustness contract as pending_payment: if a caller forgets to
    // pass the callback the component must no-op, not crash.
    render(<SubstrateStateBanner slug="frozen-peak" status="read_only" />);
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: /Manage billing/i })),
    ).not.toThrow();
  });

  it("does NOT render a dismiss button — writes are ACTUALLY blocked", () => {
    // Unlike pending_payment (which is dismissible as a soft local override),
    // read_only enforces writes at the MCP middleware. Dismissing the banner
    // would let a customer try to write from Claude Desktop and hit a 403
    // with no dashboard context. Keep it visible until billing resolves.
    render(<SubstrateStateBanner slug="frozen-peak" status="read_only" />);
    expect(screen.queryByRole("button", { name: /Dismiss/i })).not.toBeInTheDocument();
  });
});
