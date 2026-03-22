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
export function PricingCTA({ tierId }: PricingCTAProps) {
  // Enterprise self-hosted: manual sales process, not blocked by Beta
  if (tierId === "enterprise-self-hosted") {
    return (
      <a
        href="mailto:entityone22@gmail.com?subject=Enterprise%20Self-Hosted%20Inquiry"
        className="bg-surface-800 text-surface-200 hover:bg-surface-700 ring-surface-200/10 relative mb-8 inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold ring-1 transition-all"
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
        className="bg-surface-800/40 text-surface-500 ring-surface-700/40 relative inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold ring-1 select-none"
      >
        <svg
          className="text-surface-600 h-3.5 w-3.5 flex-shrink-0"
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
      <p className="text-surface-600 text-[11px]">Available at v1.0.0</p>
    </div>
  );
}
