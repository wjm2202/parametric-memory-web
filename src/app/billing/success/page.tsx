import Link from "next/link";

export default function BillingSuccessPage() {
  return (
    <main className="min-h-screen bg-surface-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 ring-1 ring-green-500/20">
          <svg
            className="h-8 w-8 text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>

        <h1 className="text-2xl font-semibold text-surface-100 mb-3">
          Payment successful
        </h1>
        <p className="text-surface-400 mb-2">
          Your account has been credited. It may take a few seconds to reflect in your balance.
        </p>
        <p className="text-surface-500 text-sm mb-8">
          A receipt has been sent to your email.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/admin"
            className="inline-flex items-center justify-center rounded-lg bg-brand-500 hover:bg-brand-400 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            Go to dashboard
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-lg bg-surface-800 hover:bg-surface-700 ring-1 ring-surface-700 px-5 py-2.5 text-sm font-semibold text-surface-200 transition-colors"
          >
            View pricing
          </Link>
        </div>
      </div>
    </main>
  );
}
