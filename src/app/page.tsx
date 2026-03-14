export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mx-auto max-w-3xl text-center">
        {/* Placeholder logo — Sprint W2 will replace */}
        <div className="bg-brand-500/10 ring-brand-500/20 mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl ring-1">
          <svg
            className="text-brand-400 h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
            />
          </svg>
        </div>

        <h1 className="mb-4 text-5xl font-bold tracking-tight text-white sm:text-6xl">
          Parametric Memory
        </h1>

        <p className="text-brand-300 mb-2 text-xl font-medium">
          Persistent, Verifiable Memory for AI
        </p>

        <p className="text-surface-200/70 mx-auto mb-10 max-w-xl text-lg">
          Enterprise-grade memory substrate with cryptographic proofs, Markov-chain prediction, and
          sub-millisecond recall. Built for AI systems that need to remember.
        </p>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href="/docs"
            className="bg-brand-500 shadow-brand-500/25 hover:bg-brand-400 hover:shadow-brand-400/25 inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all"
          >
            Read the Docs
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
              />
            </svg>
          </a>
          <a
            href="/pricing"
            className="text-surface-200 ring-surface-200/20 hover:bg-surface-200/5 hover:ring-surface-200/40 inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold ring-1 transition-all"
          >
            View Pricing
          </a>
        </div>

        {/* Version badge */}
        <div className="mt-16">
          <span className="bg-brand-500/10 text-brand-300 ring-brand-500/20 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            v0.1.1 — CI/CD Pipeline Live
          </span>
        </div>
      </div>
    </main>
  );
}
