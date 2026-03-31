"use client";

import { useState } from "react";
import Link from "next/link";
import { isValidTierId } from "@/config/tiers";

interface PricingCTAProps {
  tierId: string;
  tierName: string;
  label: string;
  isLoggedIn: boolean;
  ctaLink?: string;
}

/**
 * Pricing CTA button.
 *
 * Flow:
 *   - Logged in              → POST /api/checkout → redirect to Stripe (all tiers incl. free $1/mo)
 *   - Not logged in          → Redirect to /login?redirect=/pricing
 *   - Enterprise self-hosted → Email contact link (manual sales)
 *   - Enterprise cloud       → Email contact link (custom pricing)
 */
export function PricingCTA({ tierId, tierName, label, isLoggedIn, ctaLink }: PricingCTAProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Enterprise self-hosted: manual sales process
  if (tierId === "enterprise-self-hosted") {
    return (
      <div className="mb-8">
        <a
          href={ctaLink ?? "mailto:entityone22@gmail.com?subject=Enterprise%20Self-Hosted%20Inquiry"}
          className="bg-surface-800 text-surface-200 hover:bg-surface-700 ring-surface-200/10 inline-flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold ring-1 transition-all"
        >
          Contact Sales
        </a>
      </div>
    );
  }

  // Enterprise cloud: also manual/custom
  if (tierId === "enterprise-cloud") {
    return (
      <div className="mb-8">
        <a
          href="mailto:entityone22@gmail.com?subject=Enterprise%20Cloud%20Inquiry"
          className="bg-surface-800 text-surface-200 hover:bg-surface-700 ring-surface-200/10 inline-flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold ring-1 transition-all"
        >
          Contact Sales
        </a>
      </div>
    );
  }

  // ── Billing tiers: free ($1), indie ($9), pro ($29), team ($79) ────────────────

  // Not logged in → send to login with redirect back to pricing
  if (!isLoggedIn) {
    return (
      <div className="mb-8">
        <Link
          href="/login?redirect=/pricing"
          className="bg-brand-500 hover:bg-brand-400 ring-brand-400/30 hover:ring-brand-400/50 inline-flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white ring-1 transition-all"
        >
          {label || `Get ${tierName}`}
        </Link>
      </div>
    );
  }

  // Logged in → call /api/checkout → redirect to Stripe Checkout
  async function handleCheckout() {
    setLoading(true);
    setError(null);

    if (!isValidTierId(tierId)) {
      setError("This tier is not available for checkout.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tierId }),
      });

      if (res.status === 401) {
        // Session expired — redirect to login
        window.location.href = "/login?redirect=/pricing";
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Checkout failed. Please try again.");
        setLoading(false);
        return;
      }

      // Redirect to Stripe Checkout
      if (data.sessionUrl) {
        window.location.href = data.sessionUrl;
      } else {
        setError("No checkout URL returned. Please try again.");
        setLoading(false);
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <div className="mb-8">
      <button
        onClick={handleCheckout}
        disabled={loading}
        className="bg-brand-500 hover:bg-brand-400 ring-brand-400/30 hover:ring-brand-400/50 inline-flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white ring-1 transition-all disabled:opacity-50 disabled:cursor-wait"
      >
        {loading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Redirecting to payment…
          </>
        ) : (
          label || `Get ${tierName}`
        )}
      </button>
      {error && (
        <p className="mt-2 text-center text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
