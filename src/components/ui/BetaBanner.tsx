/**
 * BetaBanner — site-wide notice, rendered server-side, always visible.
 *
 * Communicates that Parametric Memory is pre-v1.0.0 experimental software
 * and that data loss is possible. Shown at the very top of every page.
 */
export function BetaBanner() {
  return (
    <div
      role="alert"
      aria-label="Public Beta notice"
      className="relative z-50 flex min-h-[42px] flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500/10 px-4 py-2 text-center ring-1 ring-amber-500/25 ring-inset"
    >
      {/* Badge */}
      <span className="flex flex-shrink-0 items-center gap-1.5 text-[11px] font-bold tracking-widest text-amber-400 uppercase">
        <svg
          className="h-3.5 w-3.5 flex-shrink-0"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        Public Beta
      </span>

      <span className="text-xs text-amber-200/60">
        Experimental software — pre-v1.0.0. Data loss is possible. Use at your own risk.
      </span>

      <a
        href="/pricing#early-access"
        className="flex-shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold text-amber-300 ring-1 ring-amber-400/35 transition-colors hover:bg-amber-400/10"
      >
        Request early access →
      </a>
    </div>
  );
}
