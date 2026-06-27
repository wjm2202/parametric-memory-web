"use client";

/**
 * Billing tab of the account "Recent activity" page. Stripe-authoritative
 * invoices (all substrates) with their LINE ITEMS, so an upgrade shows the
 * unused-plan credit, the proration, and the one-time provisioning fee
 * explicitly — closing the "two invoices look like a double charge" confusion.
 * Refund annotations come from the compute ledger.
 *
 * Compact by design: shows the most recent few invoices and defers the full
 * list + payment-method management to the Stripe billing portal ("Manage
 * billing →"). Source: GET /api/billing/history (account-level proxy → compute,
 * which reads Stripe directly — never the local ledger as the authority).
 */

import { useEffect, useState } from "react";
import { formatUsdCents } from "./tier-change-copy";

interface BillingLine {
  description: string | null;
  amountCents: number;
}
interface BillingInvoice {
  id: string;
  number: string | null;
  createdIso: string;
  status: string | null;
  totalCents: number;
  amountPaidCents: number;
  currency: string;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  lines: BillingLine[];
}
interface BillingRefund {
  atIso: string;
  amountCents: number;
  reason: string;
  paymentIntentId: string | null;
}
interface BillingHistory {
  invoices: BillingInvoice[];
  refunds: BillingRefund[];
}

const COMPACT_LIMIT = 3;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
/** Signed money, so a credit reads "−$5.00" rather than "$-5.00". */
function fmtSigned(cents: number): string {
  return `${cents < 0 ? "−" : ""}${formatUsdCents(Math.abs(cents))}`;
}
function humaniseReason(reason: string): string {
  switch (reason) {
    case "failed_upgrade_full_refund":
      return "Refund — upgrade couldn't complete";
    case "cancellation_prorated":
      return "Refund — cancellation (pro-rata)";
    default:
      return "Refund";
  }
}

async function openBillingPortal(): Promise<void> {
  try {
    const res = await fetch("/api/billing/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (res.ok) {
      const data = (await res.json()) as { portalUrl?: string };
      if (data.portalUrl) {
        window.location.href = data.portalUrl;
        return;
      }
    }
  } catch {
    /* fall through */
  }
  // Fallback: the dashboard hosts the full "Manage billing" action.
  window.location.href = "/dashboard";
}

export function BillingHistorySection() {
  const [data, setData] = useState<BillingHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/billing/history", { signal: ctrl.signal });
        if (!res.ok) {
          setError("Couldn't load billing history.");
          return;
        }
        setData((await res.json()) as BillingHistory);
      } catch {
        if (!ctrl.signal.aborted) setError("Couldn't load billing history.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, []);

  const invoices = data?.invoices ?? [];
  const refunds = data?.refunds ?? [];
  const isEmpty = !!data && invoices.length === 0 && refunds.length === 0;
  const shown = invoices.slice(0, COMPACT_LIMIT);
  const hiddenCount = invoices.length - shown.length;

  return (
    <div data-testid="billing-history">
      {loading && (
        <p className="text-sm text-white/40" data-testid="billing-history-loading">
          Loading…
        </p>
      )}

      {!loading && error && (
        <p className="text-sm text-amber-300/80" data-testid="billing-history-error">
          {error}
        </p>
      )}

      {!loading && !error && isEmpty && (
        <p className="text-sm text-white/40" data-testid="billing-history-empty">
          No invoices yet.
        </p>
      )}

      {!loading && !error && data && !isEmpty && (
        <div className="space-y-4">
          {shown.map((inv) => (
            <div
              key={inv.id}
              data-testid="billing-invoice"
              className="rounded-xl border border-white/5 bg-black/20 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-white/80">{fmtDate(inv.createdIso)}</span>
                  {inv.number && <span className="text-xs text-white/30">{inv.number}</span>}
                  {inv.status && (
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[11px] " +
                        (inv.status === "paid"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-white/10 text-white/60")
                      }
                    >
                      {inv.status}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-white">
                    {formatUsdCents(inv.totalCents)}
                  </span>
                  {inv.hostedInvoiceUrl && (
                    <a
                      href={inv.hostedInvoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-300 hover:text-indigo-200"
                    >
                      View
                    </a>
                  )}
                </div>
              </div>

              {/* Line items — the transparency payoff: credit, proration, fee. */}
              {inv.lines.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-white/5 pt-3">
                  {inv.lines.map((l, i) => (
                    <li key={i} className="flex items-center justify-between text-xs">
                      <span className="text-white/50">{l.description ?? "—"}</span>
                      <span className={l.amountCents < 0 ? "text-emerald-300/80" : "text-white/60"}>
                        {fmtSigned(l.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {refunds.length > 0 && (
            <div
              className="rounded-xl border border-white/5 bg-black/20 p-4"
              data-testid="billing-refunds"
            >
              <p className="text-xs tracking-wider text-white/30 uppercase">Refunds</p>
              <ul className="mt-2 space-y-1">
                {refunds.map((r, i) => (
                  <li key={i} className="flex items-center justify-between text-xs">
                    <span className="text-white/50">
                      {fmtDate(r.atIso)} · {humaniseReason(r.reason)}
                    </span>
                    <span className="text-emerald-300/80">−{formatUsdCents(r.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Defer the full list + payment-method management to the Stripe portal. */}
          <button
            type="button"
            onClick={openBillingPortal}
            data-testid="billing-manage"
            className="text-sm text-indigo-300 transition-colors hover:text-indigo-200"
          >
            {hiddenCount > 0
              ? `View all ${invoices.length} invoices & manage billing →`
              : "Manage billing & payment methods →"}
          </button>
        </div>
      )}
    </div>
  );
}
