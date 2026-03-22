import Link from "next/link";

export default function BillingCancelPage() {
  return (
    <main className="min-h-screen bg-surface-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-surface-800 ring-1 ring-surface-700">
          <svg
            className="h-8 w-8 text-surface-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>

        <h1 className="text-2xl font-semibold text-surface-100 mb-3">
          Payment cancelled
        </h1>
        <p className="text-surface-400 mb-8">
          No charge was made. You can try again whenever you&apos;re ready.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-lg bg-brand-500 hover:bg-brand-400 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            Back to pricing
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-surface-800 hover:bg-surface-700 ring-1 ring-surface-700 px-5 py-2.5 text-sm font-semibold text-surface-200 transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
