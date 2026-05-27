/**
 * BillingReturnClient — drives the post-Embedded-Checkout return page.
 *
 * Sprint 2026-05-18 D4 / D7.
 *
 * Stripe redirects the parent frame here with `?session_id=cs_…` once the
 * embedded iframe settles. This component:
 *
 *   1. Reads `session_id` from the URL, then immediately strips the query
 *      string via `history.replaceState` so the id can't leak via browser
 *      history, server access logs, or referrer headers. (P1-3.)
 *
 *   2. Fetches `/api/checkout/session/:id` ONCE to determine status:
 *        - `complete` → enter provisioning poll
 *        - `open`     → render retry instruction (the embedded iframe in
 *                       the pricing drawer is the canonical retry surface;
 *                       sending the user back to /pricing keeps the flow
 *                       reachable without rebuilding the drawer here)
 *        - 404 / error → render a generic error
 *
 *   3. While `substrate.status !== 'running'`, polls the same endpoint
 *      every 2s. When status becomes 'running', auto-redirects to
 *      /dashboard. After 90s of polling without 'running', falls back to
 *      a "still working — we'll email you" notice with a Back-to-dashboard
 *      action. (Q7-a in the locked decisions.)
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import SiteNavbar from "@/components/ui/SiteNavbar";

interface SessionPayload {
  status: "open" | "complete" | "expired" | null;
  customerEmail: string | null;
  tier: string | null;
  substrateId: string | null;
  substrateSlug: string | null;
  substrateStatus: string | null;
}

/** Drives the page state machine. */
type View =
  | { kind: "loading" }
  | { kind: "open"; tier: string | null }
  | { kind: "provisioning"; payload: SessionPayload; elapsedSec: number }
  | { kind: "ready"; payload: SessionPayload }
  | { kind: "timeout"; payload: SessionPayload }
  | { kind: "error"; message: string };

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 90_000;

export default function BillingReturnClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "loading" });

  // Captured once on first render. The URL is stripped immediately below so
  // re-reads via useSearchParams would return null on subsequent renders.
  const sessionIdRef = useRef<string | null>(null);
  if (sessionIdRef.current === null) {
    sessionIdRef.current = searchParams.get("session_id");
  }

  // ── URL hygiene (P1-3) ─────────────────────────────────────────────────
  // Replace the URL with the bare path the moment we've captured session_id.
  // Belt-and-braces alongside the metadata `referrer: 'no-referrer'` and
  // the BFF's ownership check — defence in depth against leakage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.search.includes("session_id")) {
      window.history.replaceState(null, "", "/billing/return");
    }
  }, []);

  // ── Initial session-status fetch + provisioning poll ───────────────────
  useEffect(() => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      setView({ kind: "error", message: "Missing session id in URL." });
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    async function pollOnce(): Promise<SessionPayload | null> {
      const res = await fetch(`/api/checkout/session/${encodeURIComponent(sessionId!)}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) {
        if (res.status === 404) {
          setView({
            kind: "error",
            message:
              "We couldn't find your checkout session. If you just paid, try refreshing the page in a few seconds.",
          });
        } else if (res.status === 401) {
          setView({
            kind: "error",
            message: "Please sign in again to complete your subscription.",
          });
        } else {
          setView({
            kind: "error",
            message: `Verification failed (HTTP ${res.status}).`,
          });
        }
        return null;
      }
      return (await res.json()) as SessionPayload;
    }

    async function run() {
      const initial = await pollOnce();
      if (cancelled || !initial) return;

      // Stripe says "still open" — payment didn't complete or the user
      // closed the iframe before settlement. Send them back to /pricing
      // where the drawer is the canonical retry surface (Q7 locked
      // decision — return page does NOT remount the drawer in-place).
      if (initial.status === "open" || initial.status === "expired") {
        setView({ kind: "open", tier: initial.tier });
        return;
      }

      // Status is 'complete'. Now poll substrate.status until 'running'.
      if (initial.substrateStatus === "running") {
        setView({ kind: "ready", payload: initial });
        return;
      }

      setView({
        kind: "provisioning",
        payload: initial,
        elapsedSec: Math.floor((Date.now() - startedAt) / 1000),
      });

      // ── Provisioning poll loop ────────────────────────────────────────
      // Re-query every POLL_INTERVAL_MS until status='running' or we hit
      // POLL_TIMEOUT_MS. Each poll re-uses the same /api/checkout/session
      // endpoint — it always reads the latest substrate row inline so the
      // status field stays fresh without a second endpoint.
      const interval = setInterval(async () => {
        if (cancelled) return;
        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs > POLL_TIMEOUT_MS) {
          clearInterval(interval);
          if (!cancelled) {
            setView({ kind: "timeout", payload: initial });
          }
          return;
        }

        const next = await pollOnce();
        if (cancelled || !next) {
          clearInterval(interval);
          return;
        }
        if (next.substrateStatus === "running") {
          clearInterval(interval);
          setView({ kind: "ready", payload: next });
          return;
        }
        setView({
          kind: "provisioning",
          payload: next,
          elapsedSec: Math.floor((Date.now() - startedAt) / 1000),
        });
      }, POLL_INTERVAL_MS);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Auto-redirect to dashboard once ready ──────────────────────────────
  const goDashboard = useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  useEffect(() => {
    if (view.kind === "ready") {
      const t = setTimeout(goDashboard, 1500);
      return () => clearTimeout(t);
    }
  }, [view.kind, goDashboard]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      {/* By the time the user hits /billing/return they have a session
          (Stripe sent them here after the iframe settled). Mirror the
          BillingSuccessClient navbar config — logged-in + standard. */}
      <SiteNavbar isLoggedIn={true} variant="standard" />
      <main className="mx-auto w-full max-w-2xl px-6 pt-[calc(var(--site-nav-h)+2rem)] pb-16">
        {view.kind === "loading" && <LoadingBody />}
        {view.kind === "provisioning" && (
          <ProvisioningBody payload={view.payload} elapsedSec={view.elapsedSec} />
        )}
        {view.kind === "ready" && <ReadyBody payload={view.payload} />}
        {view.kind === "timeout" && <TimeoutBody payload={view.payload} />}
        {view.kind === "open" && <OpenBody tier={view.tier} />}
        {view.kind === "error" && <ErrorBody message={view.message} />}
      </main>
    </>
  );
}

// ── Body components ──────────────────────────────────────────────────────

function LoadingBody() {
  return (
    <div data-testid="billing-return-loading" className="text-center">
      <Spinner />
      <p className="mt-4 text-sm text-white/60">Verifying your payment…</p>
    </div>
  );
}

function ProvisioningBody({
  payload,
  elapsedSec,
}: {
  payload: SessionPayload;
  elapsedSec: number;
}) {
  return (
    <div data-testid="billing-return-provisioning" className="text-center">
      <h1 className="font-[family-name:var(--font-syne)] text-2xl font-semibold text-white">
        Setting up your substrate
      </h1>
      <p className="mt-3 text-sm text-white/70">
        Payment confirmed{payload.tier ? ` for the ${payload.tier} plan` : ""}. We&apos;re
        provisioning your container now — this usually takes 30&ndash;60 seconds.
      </p>
      <div className="mt-6">
        <Spinner />
      </div>
      <p className="mt-3 text-xs text-white/40">{elapsedSec}s elapsed</p>
    </div>
  );
}

function ReadyBody({ payload }: { payload: SessionPayload }) {
  return (
    <div data-testid="billing-return-ready" className="text-center">
      <h1 className="font-[family-name:var(--font-syne)] text-2xl font-semibold text-white">
        Your substrate is ready
      </h1>
      <p className="mt-3 text-sm text-white/70">
        {payload.substrateSlug ?? "Your substrate"} is up and running. Taking you to the dashboard…
      </p>
      <div className="mt-6">
        <Link
          href="/dashboard"
          className="bg-brand-500 hover:bg-brand-400 ring-brand-400/30 inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white ring-1"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}

function TimeoutBody({ payload }: { payload: SessionPayload }) {
  return (
    <div data-testid="billing-return-timeout" className="text-center">
      <h1 className="font-[family-name:var(--font-syne)] text-2xl font-semibold text-white">
        Still working&hellip;
      </h1>
      <p className="mt-3 text-sm text-white/70">
        Provisioning is taking longer than expected. Your payment is confirmed and we&apos;ll email
        {payload.customerEmail ? ` ${payload.customerEmail}` : " you"} when your substrate is ready.
      </p>
      <div className="mt-6">
        <Link
          href="/dashboard"
          className="border-surface-700 text-surface-200 inline-flex items-center justify-center gap-2 rounded-lg border px-6 py-3 text-sm font-semibold"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

function OpenBody({ tier }: { tier: string | null }) {
  return (
    <div data-testid="billing-return-open" className="text-center">
      <h1 className="font-[family-name:var(--font-syne)] text-2xl font-semibold text-white">
        Checkout didn&apos;t complete
      </h1>
      <p className="mt-3 text-sm text-white/70">
        Your payment didn&apos;t go through. You can try again from the pricing page
        {tier ? ` — the ${tier} plan is still selected for you` : ""}.
      </p>
      <div className="mt-6">
        <Link
          href="/pricing"
          className="bg-brand-500 hover:bg-brand-400 ring-brand-400/30 inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white ring-1"
        >
          Back to pricing
        </Link>
      </div>
    </div>
  );
}

function ErrorBody({ message }: { message: string }) {
  return (
    <div data-testid="billing-return-error" className="text-center">
      <h1 className="font-[family-name:var(--font-syne)] text-2xl font-semibold text-white">
        Something went wrong
      </h1>
      <p className="mt-3 text-sm text-white/70">{message}</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          href="/dashboard"
          className="border-surface-700 text-surface-200 inline-flex items-center justify-center gap-2 rounded-lg border px-6 py-3 text-sm font-semibold"
        >
          Dashboard
        </Link>
        <Link
          href="/pricing"
          className="bg-brand-500 hover:bg-brand-400 ring-brand-400/30 inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white ring-1"
        >
          Pricing
        </Link>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      data-testid="billing-return-spinner"
      className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white"
    />
  );
}
