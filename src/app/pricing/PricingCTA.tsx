"use client";

interface PricingCTAProps {
  tierId: string;
  tierName: string;
  label: string;
}

/**
 * Pricing CTA — Beta state.
 *
 * All paid tiers show a disabled "Coming Soon" button during the public Beta.
 * Enterprise Self-Hosted retains the email contact link as it's a manual
 * engagement process that can proceed regardless of v1.0.0 readiness.
 *
 * Stripe checkout is wired but not exposed until v1.0.0.
 */
export function PricingCTA({ tierId, tierName: _tierName, label: _label }: PricingCTAProps) {
  // Enterprise self-hosted: manual sales process, not blocked by Beta
  if (tierId === "enterprise-self-hosted") {
    return (
      <a
        href="mailto:entityone22@gmail.com?subject=Enterprise%20Self-Hosted%20Inquiry"
        className="relative mb-8 inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-all bg-surface-800 text-surface-200 hover:bg-surface-700 ring-surface-200/10 ring-1"
      >
        Contact Sales
      </a>
    );
  }

  // All other tiers: disabled until v1.0.0
  return (
    <div className="mb-8 flex flex-col items-center gap-1.5">
      <button
        disabled
        aria-disabled="true"
        title="Purchasing opens at v1.0.0 — request early access below"
        className="relative w-full inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold cursor-not-allowed select-none bg-surface-800/40 text-surface-500 ring-1 ring-surface-700/40"
      >
        <svg
          className="h-3.5 w-3.5 flex-shrink-0 text-surface-600"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
        Coming Soon
      </button>
      <p className="text-[11px] text-surface-600">Available at v1.0.0</p>
    </div>
  );
}
