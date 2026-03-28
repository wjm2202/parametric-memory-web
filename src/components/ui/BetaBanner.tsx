/**
 * LaunchBanner — site-wide notice, rendered server-side, always visible.
 *
 * Lightweight announcement banner. Replace content as needed for promotions.
 */
export function BetaBanner() {
  return (
    <div
      role="status"
      aria-label="Launch announcement"
      className="relative z-50 flex min-h-[42px] flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-brand-500/10 px-4 py-2 text-center ring-1 ring-brand-400/25 ring-inset"
    >
      {/* Badge */}
      <span className="flex flex-shrink-0 items-center gap-1.5 text-[11px] font-bold tracking-widest text-brand-300 uppercase">
        <svg
          className="h-3.5 w-3.5 flex-shrink-0"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
            clipRule="evenodd"
          />
        </svg>
        Now Available
      </span>

      <span className="text-xs text-brand-200/60">
        Dedicated AI memory with cryptographic proofs. From $9/mo.
      </span>

      <a
        href="/pricing"
        className="flex-shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold text-brand-300 ring-1 ring-brand-400/35 transition-colors hover:bg-brand-400/10"
      >
        View pricing →
      </a>
    </div>
  );
}
