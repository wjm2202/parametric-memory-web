/**
 * Root 404 page.
 *
 * Rendered whenever `notFound()` is called in any route that doesn't have
 * a more specific `not-found.tsx` at a closer segment — blog/[slug],
 * docs/[...slug], and unmatched URLs all land here.
 *
 * Must stay a server component (no "use client") so it can be statically
 * generated and served with the correct 404 HTTP status. Next.js sets the
 * 404 status automatically when the global not-found boundary fires.
 */
import Link from "next/link";
import SiteNavbar from "@/components/ui/SiteNavbar";

export default function NotFound() {
  return (
    <div className="bg-surface-950 flex min-h-screen flex-col">
      <SiteNavbar isLoggedIn={false} variant="standard" />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
        <p className="font-mono text-xs tracking-widest text-violet-400/60">404 — PAGE NOT FOUND</p>
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          We couldn&apos;t find that page.
        </h1>
        <p className="text-surface-300/80 max-w-lg text-base leading-relaxed">
          The link may be broken, the page may have moved, or you may have typed the URL
          incorrectly. Try one of the paths below.
        </p>
        <nav
          className="mt-4 flex flex-wrap items-center justify-center gap-3"
          aria-label="404 recovery links"
        >
          <Link
            href="/"
            className="bg-brand-500 hover:bg-brand-400 ring-brand-400/30 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white ring-1 transition-colors"
          >
            Home
          </Link>
          <Link
            href="/docs"
            className="bg-surface-800 text-surface-200 hover:bg-surface-700 ring-surface-200/10 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold ring-1 transition-colors"
          >
            Docs
          </Link>
          <Link
            href="/blog"
            className="bg-surface-800 text-surface-200 hover:bg-surface-700 ring-surface-200/10 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold ring-1 transition-colors"
          >
            Blog
          </Link>
          <Link
            href="/pricing"
            className="bg-surface-800 text-surface-200 hover:bg-surface-700 ring-surface-200/10 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold ring-1 transition-colors"
          >
            Pricing
          </Link>
        </nav>
      </main>
    </div>
  );
}
