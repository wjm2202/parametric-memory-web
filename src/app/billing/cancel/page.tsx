import Link from "next/link";

export default function BillingCancelPage() {
  return (
    <main className="bg-surface-950 flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* Icon */}
        <div className="bg-surface-800 ring-surface-700 mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full ring-1">
          <svg
            className="text-surface-400 h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>

        <h1 className="text-surface-100 mb-3 text-2xl font-semibold">Payment cancelled</h1>
        <p className="text-surface-400 mb-8">
          No charge was made. You can try again whenever you&apos;re ready.
        </p>

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/pricing"
            className="bg-brand-500 hover:bg-brand-400 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            Back to pricing
          </Link>
          <Link
            href="/"
            className="bg-surface-800 hover:bg-surface-700 ring-surface-700 text-surface-200 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold ring-1 transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
