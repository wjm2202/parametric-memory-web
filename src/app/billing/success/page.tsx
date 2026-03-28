import Link from "next/link";

export default function BillingSuccessPage() {
  return (
    <main className="bg-surface-950 flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
          <svg
            className="h-8 w-8 text-emerald-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>

        <h1 className="text-surface-100 mb-3 text-2xl font-semibold">Subscription activated</h1>
        <p className="text-surface-400 mb-2">
          Your substrate is being provisioned. It will be ready within 60 seconds.
        </p>
        <p className="text-surface-500 mb-8 text-sm">
          Check your email for your MCP endpoint and API key.
        </p>

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="bg-brand-500 hover:bg-brand-400 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            Go to dashboard
          </Link>
          <Link
            href="/docs"
            className="bg-surface-800 hover:bg-surface-700 ring-surface-700 text-surface-200 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold ring-1 transition-colors"
          >
            Quickstart guide
          </Link>
        </div>
      </div>
    </main>
  );
}
