"use client";

import { useState } from "react";
import Link from "next/link";
import { isValidTierId } from "@/config/tiers";
import { WaitlistForm } from "./WaitlistForm";

type CapacityStatus = "open" | "waitlist" | "paused";

interface TierCapacity {
  status: CapacityStatus;
  slotsRemaining: number | null;
  message: string | null;
}

interface PricingCTAProps {
  tierId: string;
  tierName: string;
  label: string;
  isLoggedIn: boolean;
  ctaLink?: string;
  /** @deprecated Trial period is not configured in Stripe — do not use. */
  trial?: boolean;
  capacityStatus?: CapacityStatus;
  capacityMessage?: string | null;
  /**
   * Event-driven capacity check — called on CTA click before proceeding to
   * checkout. Returns fresh tier capacity so we can gate if the tier is full.
   * When provided, the component checks capacity on click rather than relying
   * on server-rendered static props.
   */
  onCheckCapacity?: () => Promise<TierCapacity>;
  /** True while a capacity check is in flight (disables button). */
  checkingCapacity?: boolean;
}

/**
 * Pricing CTA button.
 *
 * Flow:
 *   - CTA click             → fresh capacity check (event-driven)
 *   - If open + logged in   → POST /api/checkout → redirect to Stripe Checkout
 *   - If open + not logged  → Redirect to /login?redirect=/pricing
 *   - If waitlist/paused    → WaitlistForm replaces button
 *   - Enterprise            → Email contact link (manual sales)
 */
export function PricingCTA({
  tierId,
  tierName,
  label,
  isLoggedIn,
  ctaLink,
  trial,
  capacityStatus,
  capacityMessage,
  onCheckCapacity,
  checkingCapacity,
}: PricingCTAProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  // Local state to track if capacity check returned waitlist/paused AFTER click
  const [blockedByCapacity, setBlockedByCapacity] = useState(false);
  const [blockMessage, setBlockMessage] = useState<string | null>(null);

  // Capacity gate — show waitlist if status was already known to be full
  // OR if we just checked on click and it came back full
  if (capacityStatus === "waitlist" || capacityStatus === "paused" || blockedByCapacity) {
    const displayName = tierName.includes("indie") || tierId === "indie" ? "Solo" : "Pro";
    return (
      <WaitlistForm
        tier={tierId}
        tierDisplayName={displayName}
        message={
          blockMessage ??
          capacityMessage ??
          `${displayName} slots are temporarily full. Join the waitlist and we'll notify you when space opens.`
        }
      />
    );
  }

  // Enterprise self-hosted: manual sales process
  if (tierId === "enterprise-self-hosted") {
    return (
      <div className="mb-8">
        <a
          href={
            ctaLink ?? "mailto:entityone22@gmail.com?subject=Enterprise%20Self-Hosted%20Inquiry"
          }
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

  // ── Billing tiers: solo ($9/indie), professional ($29/pro), team ($79) ─────────

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

  // Logged in → check capacity on click → if available, redirect to Stripe Checkout
  async function handleCheckout() {
    if (!agreedToTerms) {
      setError("Please agree to the Terms of Service before continuing.");
      return;
    }
    setLoading(true);
    setError(null);

    if (!isValidTierId(tierId)) {
      setError("This tier is not available for checkout.");
      setLoading(false);
      return;
    }

    // ── Event-driven capacity check ─────────────────────────────────────
    // Fire a fresh health check before proceeding to Stripe. This is the
    // primary trigger for capacity updates — no more ISR background polling.
    if (onCheckCapacity) {
      try {
        const fresh = await onCheckCapacity();
        if (fresh.status === "waitlist" || fresh.status === "paused") {
          setBlockedByCapacity(true);
          setBlockMessage(fresh.message);
          setLoading(false);
          return;
        }
      } catch {
        // Fail open — if capacity check errors, let them proceed to checkout.
        // The compute server does its own capacity check before provisioning.
      }
    }

    // ── Stripe checkout ─────────────────────────────────────────────────
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: tierId,
          agreedToTerms: true,
          termsVersion: "2026-04-05",
          ...(trial ? { trial: true } : {}),
        }),
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

  const isDisabled = loading || !agreedToTerms || checkingCapacity;

  return (
    <div className="mb-8 space-y-3">
      {/* Legal clickwrap — must be checked before Stripe opens */}
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 transition-colors hover:border-white/20">
        <input
          type="checkbox"
          checked={agreedToTerms}
          onChange={(e) => {
            setAgreedToTerms(e.target.checked);
            if (error) setError(null);
          }}
          className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer rounded border-white/20 bg-white/5 accent-indigo-500"
        />
        <span className="text-xs leading-relaxed text-white/50">
          I agree to the{" "}
          <Link
            href="/terms"
            target="_blank"
            className="text-white/70 underline underline-offset-2 hover:text-white"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            target="_blank"
            className="text-white/70 underline underline-offset-2 hover:text-white"
          >
            Privacy Policy
          </Link>
        </span>
      </label>

      <button
        onClick={handleCheckout}
        disabled={isDisabled}
        className="bg-brand-500 hover:bg-brand-400 ring-brand-400/30 hover:ring-brand-400/50 inline-flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white ring-1 transition-all disabled:cursor-not-allowed disabled:opacity-50"
      >
        {checkingCapacity ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Checking availability…
          </>
        ) : loading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Redirecting to payment…
          </>
        ) : (
          label || `Get ${tierName}`
        )}
      </button>
      {error && <p className="mt-2 text-center text-xs text-red-400">{error}</p>}
    </div>
  );
}
