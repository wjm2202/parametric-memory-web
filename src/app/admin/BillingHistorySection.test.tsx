/**
 * BillingHistorySection — account-level Billing tab. Renders Stripe-authoritative
 * invoices with their line items (the unused-plan credit, the proration, the
 * provisioning fee), refund annotations, and a "Manage billing" portal link.
 * The credit line is the transparency payoff, so it's pinned here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BillingHistorySection } from "./BillingHistorySection";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const HISTORY = {
  invoices: [
    {
      id: "in_upgrade",
      number: "PM-0002",
      createdIso: "2026-06-26T00:00:00.000Z",
      status: "paid",
      totalCents: 3367,
      amountPaidCents: 3367,
      currency: "USD",
      hostedInvoiceUrl: "https://invoice.stripe.com/i/acct/test/in_upgrade",
      invoicePdfUrl: null,
      lines: [
        { description: "Unused time on Starter", amountCents: -500 },
        { description: "Remaining time on Pro", amountCents: 2900 },
        { description: "Provisioning fee", amountCents: 967 },
      ],
    },
    {
      id: "in_starter",
      number: "PM-0001",
      createdIso: "2026-06-26T00:00:00.000Z",
      status: "paid",
      totalCents: 500,
      amountPaidCents: 500,
      currency: "USD",
      hostedInvoiceUrl: null,
      invoicePdfUrl: null,
      lines: [{ description: "Parametric Memory — Starter", amountCents: 500 }],
    },
  ],
  refunds: [],
};

beforeEach(() => mockFetch.mockReset());

describe("BillingHistorySection", () => {
  it("fetches the ACCOUNT history and renders invoices + the unused-plan credit + manage link", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => HISTORY });

    render(<BillingHistorySection />);

    await waitFor(() => expect(screen.getAllByTestId("billing-invoice")).toHaveLength(2));
    // Account-level endpoint (no slug).
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/billing/history",
      expect.objectContaining({ signal: expect.anything() }),
    );
    // The transparency fix: the $5 Starter credit is visible, signed as a credit.
    expect(screen.getByText("Unused time on Starter")).toBeInTheDocument();
    expect(screen.getByText("−$5.00")).toBeInTheDocument();
    expect(screen.getByText("Provisioning fee")).toBeInTheDocument();
    expect(screen.getByText("$9.67")).toBeInTheDocument();
    expect(screen.getByText("$33.67")).toBeInTheDocument();
    // Stripe-hosted invoice link + the portal hand-off.
    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute(
      "href",
      "https://invoice.stripe.com/i/acct/test/in_upgrade",
    );
    expect(screen.getByTestId("billing-manage")).toBeInTheDocument();
  });

  it("renders refund annotations when present", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        invoices: [],
        refunds: [
          {
            atIso: "2026-06-26T00:00:00.000Z",
            amountCents: 3367,
            reason: "failed_upgrade_full_refund",
            paymentIntentId: "pi_x",
          },
        ],
      }),
    });

    render(<BillingHistorySection />);

    await waitFor(() => expect(screen.getByTestId("billing-refunds")).toBeInTheDocument());
    expect(screen.getByText(/upgrade couldn't complete/i)).toBeInTheDocument();
    expect(screen.getByText("−$33.67")).toBeInTheDocument();
  });

  it("shows an empty state when there are no invoices or refunds", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ invoices: [], refunds: [] }),
    });
    render(<BillingHistorySection />);
    await waitFor(() => expect(screen.getByTestId("billing-history-empty")).toBeInTheDocument());
  });

  it("shows an error state when the fetch fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 502 });
    render(<BillingHistorySection />);
    await waitFor(() => expect(screen.getByTestId("billing-history-error")).toBeInTheDocument());
  });
});
