import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import SiteNavbar from "@/components/ui/SiteNavbar";

export const metadata: Metadata = {
  title: "Payment Cancelled",
  robots: { index: false, follow: false },
};

const SESSION_COOKIE = "mmpm_session";

/**
 * Determine login state for the navbar so the drawer shows the right
 * account section. The cookie's mere presence is enough — SiteNavbar
 * re-validates client-side via /api/auth/me. We don't need a network
 * round-trip here.
 */
async function getIsLoggedIn(): Promise<boolean> {
  const cookieStore = await cookies();
  return Boolean(cookieStore.get(SESSION_COOKIE)?.value);
}

export default async function BillingCancelPage() {
  const isLoggedIn = await getIsLoggedIn();
  return (
    <>
      <SiteNavbar isLoggedIn={isLoggedIn} variant="standard" />
      <main className="bg-surface-950 flex min-h-screen items-center justify-center px-4 pt-24 pb-12 sm:pt-28">
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
    </>
  );
}
