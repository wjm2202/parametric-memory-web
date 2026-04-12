/**
 * Segment-scoped 404 for /docs/*.
 *
 * See the comment in `src/app/blog/not-found.tsx` for why each segment
 * with its own layout needs its own not-found boundary — the root
 * `src/app/not-found.tsx` is only used for completely unmatched routes.
 *
 * Slots into `src/app/docs/layout.tsx`, which already renders the
 * SiteNavbar and the docs sidebar, so this component only renders the
 * inner main-column content.
 */
import Link from "next/link";

export default function DocsNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <p className="font-mono text-xs tracking-widest text-violet-400/60">404 — DOC NOT FOUND</p>
      <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
        We couldn&apos;t find that page.
      </h1>
      <p className="text-surface-300/80 max-w-lg text-base leading-relaxed">
        The doc may have been renamed, moved, or removed. Browse the docs index on the left, or
        start from the getting-started guide.
      </p>
      <nav
        className="mt-4 flex flex-wrap items-center justify-center gap-3"
        aria-label="404 recovery links"
      >
        <Link
          href="/docs"
          className="bg-brand-500 hover:bg-brand-400 ring-brand-400/30 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white ring-1 transition-colors"
        >
          Docs index
        </Link>
        <Link
          href="/"
          className="bg-surface-800 text-surface-200 hover:bg-surface-700 ring-surface-200/10 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold ring-1 transition-colors"
        >
          Home
        </Link>
        <Link
          href="/blog"
          className="bg-surface-800 text-surface-200 hover:bg-surface-700 ring-surface-200/10 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold ring-1 transition-colors"
        >
          Blog
        </Link>
      </nav>
    </div>
  );
}
