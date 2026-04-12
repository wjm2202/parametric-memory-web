/**
 * Segment-scoped 404 for /blog/*.
 *
 * Next.js looks for the nearest `not-found.tsx` within the segment tree
 * when `notFound()` is thrown inside that segment. The root
 * `src/app/not-found.tsx` is NOT used for nested segments — each segment
 * with its own layout needs its own not-found boundary.
 *
 * This file slots into `src/app/blog/layout.tsx`, which already renders
 * the SiteNavbar, so we only render the inner content here (no navbar,
 * no min-h-screen wrapper).
 */
import Link from "next/link";

export default function BlogNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <p className="font-mono text-xs tracking-widest text-violet-400/60">
        404 — POST NOT FOUND
      </p>
      <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
        We couldn&apos;t find that post.
      </h1>
      <p className="text-surface-300/80 max-w-lg text-base leading-relaxed">
        The post may have been renamed or removed. Browse the blog index
        for the latest writing, or head back to the homepage.
      </p>
      <nav
        className="mt-4 flex flex-wrap items-center justify-center gap-3"
        aria-label="404 recovery links"
      >
        <Link
          href="/blog"
          className="bg-brand-500 hover:bg-brand-400 ring-brand-400/30 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white ring-1 transition-colors"
        >
          Blog index
        </Link>
        <Link
          href="/"
          className="bg-surface-800 text-surface-200 hover:bg-surface-700 ring-surface-200/10 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold ring-1 transition-colors"
        >
          Home
        </Link>
        <Link
          href="/docs"
          className="bg-surface-800 text-surface-200 hover:bg-surface-700 ring-surface-200/10 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold ring-1 transition-colors"
        >
          Docs
        </Link>
      </nav>
    </main>
  );
}
