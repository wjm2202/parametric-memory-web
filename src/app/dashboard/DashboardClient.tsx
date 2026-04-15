"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getTierLabel } from "@/config/tiers";

// ── Types ────────────────────────────────────────────────────────────────────

interface AccountInfo {
  id: string;
  email: string;
  name: string | null;
  tier: string | null;
  status: string;
  balanceCents: number;
  createdAt: string;
}

interface SubstrateSummary {
  id: string;
  slug: string;
  tier: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  /** True when a substrate_subscriptions row is active or past_due for this substrate. */
  hasActiveSubscription: boolean;
  /** ISO timestamp of next Stripe billing date. Null when no active subscription. */
  renewsAt: string | null;
}

interface BillingStatus {
  tier: string;
  status: "active" | "trialing" | "past_due" | "suspended" | "cancelled";
  renewsAt: string | null;
  trialEndsAt: string | null;
  lastPaymentFailed: boolean;
  hasStripeCustomer: boolean;
  usageUnavailable?: boolean;
  tierDisplay: {
    name: string;
    atomsUsed: number;
    atomsLimit: number;
    bootstrapsUsed: number;
    bootstrapsLimit: number;
  };
}

// ── Utilities ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

async function openBillingPortal() {
  const res = await fetch("/api/billing/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (res.status === 422) {
    alert("No billing account found. Please subscribe first.");
    return;
  }
  if (!res.ok) {
    alert("Could not open billing portal. Please try again.");
    return;
  }
  const data = await res.json();
  if (data.portalUrl) {
    window.location.href = data.portalUrl;
  }
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    running: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    provisioning: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    read_only: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
    suspended: "bg-red-500/20 text-red-400 border-red-500/30",
    deprovisioned: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    destroyed: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    provision_failed: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  const labels: Record<string, string> = {
    running: "Running",
    provisioning: "Provisioning",
    read_only: "Read Only",
    cancelled: "Cancelled",
    suspended: "Suspended",
    deprovisioned: "Deprovisioned",
    destroyed: "Destroyed",
    provision_failed: "Provision Failed",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        styles[status] ?? "border-white/20 bg-white/10 text-white/50"
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}

// ── Billing Widget ───────────────────────────────────────────────────────────

function BillingWidget({
  billing,
  onBillingPortal,
}: {
  billing: BillingStatus;
  onBillingPortal: () => void;
}) {
  const { status, renewsAt, trialEndsAt, lastPaymentFailed, usageUnavailable, tierDisplay } =
    billing;

  // Payment warning takes priority over normal active display
  if (lastPaymentFailed && status !== "suspended") {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
              <span>⚠</span> Payment issue — we&apos;ll retry
            </p>
            <p className="mt-1 text-sm text-white/50">
              Your last payment didn&apos;t go through. Stripe will automatically retry. Your account
              remains fully active.
            </p>
          </div>
          <button
            onClick={onBillingPortal}
            className="shrink-0 rounded-md border border-amber-500/40 px-3 py-1.5 text-xs font-medium text-amber-300 transition hover:bg-amber-500/10"
          >
            Update payment →
          </button>
        </div>
      </div>
    );
  }

  if (status === "suspended") {
    return (
      <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-red-400">
              <span>✕</span> Account suspended
            </p>
            <p className="mt-1 text-sm text-white/50">
              Your subscription was cancelled after multiple failed payment attempts.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Link
              href="/pricing"
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500"
            >
              Reactivate →
            </Link>
            <a
              href="mailto:entityone22@gmail.com?subject=Account%20help"
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-white/50 transition hover:text-white"
            >
              Contact support
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/30 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-white/60">
              <span className="text-zinc-600">○</span> No active subscription
            </p>
            <p className="mt-1 text-sm text-white/50">
              Your plan was cancelled. Memory is preserved for 90 days.
            </p>
          </div>
          <Link
            href="/pricing"
            className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500"
          >
            Choose a plan →
          </Link>
        </div>
      </div>
    );
  }

  // Active or trialing
  const dotColor = status === "trialing" ? "bg-blue-400" : "bg-emerald-400";
  const statusLabel =
    status === "trialing"
      ? `Trial ends ${formatDate(trialEndsAt)}`
      : `Renews ${formatDate(renewsAt)}`;

  const atomPct =
    tierDisplay.atomsLimit > 0
      ? Math.min((tierDisplay.atomsUsed / tierDisplay.atomsLimit) * 100, 100)
      : 0;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${dotColor}`} />
            <span className="text-sm font-semibold text-white capitalize">
              {tierDisplay.name} plan &middot;{" "}
              <span className="font-normal text-zinc-400">
                {status === "trialing" ? "Trial" : "Active"}
              </span>
            </span>
          </div>
          <p className="text-xs text-white/50">{statusLabel}</p>
          {tierDisplay.atomsLimit > 0 && (
            <div className="space-y-1 pt-1">
              {usageUnavailable ? (
                <p className="text-xs text-zinc-500 italic">Usage data temporarily unavailable</p>
              ) : (
                <>
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>
                      {tierDisplay.atomsUsed.toLocaleString()} /{" "}
                      {tierDisplay.atomsLimit.toLocaleString()} memories
                    </span>
                    <span>{atomPct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`h-full rounded-full transition-all ${atomPct > 80 ? "bg-amber-500" : "bg-indigo-500"}`}
                      style={{ width: `${atomPct}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onBillingPortal}
          className="shrink-0 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-white/50 transition hover:border-zinc-500 hover:text-white"
        >
          Manage billing →
        </button>
      </div>
    </div>
  );
}

// ── Statuses where an inactive substrate may still have a live Stripe sub ────

const INACTIVE_STATUSES = new Set(["deprovisioned", "destroyed", "provision_failed"]);

// ── Cancel Warning Modal ──────────────────────────────────────────────────────

function CancelWarningModal({
  slug,
  status,
  onConfirm,
  onDismiss,
}: {
  slug: string;
  status: string;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const warningBody: Record<string, string> = {
    deprovisioned:
      "This substrate has been deprovisioned and its data removed. Cancelling ends any remaining billing associated with it. You won't be charged again.",
    destroyed:
      "This substrate has been permanently destroyed and its data deleted. Cancelling ends any remaining billing associated with it.",
    provision_failed:
      "This substrate failed to provision — no containers were ever started. Cancelling removes the associated billing. You will not be charged for any usage.",
  };

  const body = warningBody[status] ?? "Cancelling will end billing for this substrate.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-md rounded-xl border border-white/10 bg-zinc-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start gap-3">
          <span className="mt-0.5 text-lg text-amber-400">⚠</span>
          <div>
            <p className="font-semibold text-white">Cancel subscription for {slug}?</p>
            <p className="mt-2 text-sm leading-relaxed text-white/60">{body}</p>
            <p className="mt-3 text-sm text-white/40">
              You&apos;ll be taken to the Stripe billing portal to complete the cancellation.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onDismiss}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/50 transition hover:border-white/20 hover:text-white/80"
          >
            Keep it
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
          >
            Go to billing →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Substrate Card ───────────────────────────────────────────────────────────

function SubstrateCard({
  substrate,
  onCancelRequest,
}: {
  substrate: SubstrateSummary;
  onCancelRequest: (slug: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  // Show cancel only when the substrate is inactive AND Stripe still has an
  // active/past_due subscription attached. Once cancelled via Stripe portal,
  // the webhook flips substrate_subscriptions.status → 'cancelled' and this
  // flag goes false — the button disappears on the next poll.
  const isCancellable = INACTIVE_STATUSES.has(substrate.status) && substrate.hasActiveSubscription;

  return (
    <div
      className={`group relative rounded-xl border bg-white/[0.02] transition-all duration-200 ${
        isHovered ? "border-indigo-500/50 bg-white/[0.05]" : "border-white/10"
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Card body — navigates to admin */}
      <Link href={`/admin?slug=${encodeURIComponent(substrate.slug)}`} className="block p-4 pb-3">
        {/* Slug + health dot */}
        <div className="mb-3 flex items-center gap-2 pr-6">
          {substrate.status === "running" && (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          )}
          {substrate.status === "provision_failed" && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" title="Provision failed" />
          )}
          <p className="font-mono text-sm break-all text-white/70">{substrate.slug}</p>
        </div>

        {/* Tier badge */}
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-block rounded bg-zinc-800/60 px-2 py-1 text-xs font-medium text-zinc-300">
            {getTierLabel(substrate.tier)}
          </span>
        </div>

        {/* Status badge */}
        <div className="mb-4">
          <StatusBadge status={substrate.status} />
        </div>

        {/* Billing date — renewal when active, created date otherwise */}
        {substrate.hasActiveSubscription && substrate.renewsAt ? (
          <p className="text-xs text-white/40">Renews {formatDate(substrate.renewsAt)}</p>
        ) : (
          <p className="text-xs text-white/40">Created {formatDate(substrate.createdAt)}</p>
        )}

        {/* Hover chevron */}
        <div className="absolute top-4 right-4 text-white/20 transition-colors group-hover:text-indigo-400/60">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </Link>

      {/* Cancel subscription footer — only for inactive substrates */}
      {isCancellable && (
        <div className="border-t border-white/5 px-4 py-2.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancelRequest(substrate.slug);
            }}
            className="text-xs text-red-400/70 transition hover:text-red-400"
          >
            Cancel subscription →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Add Substrate CTA Card ───────────────────────────────────────────────────

function AddSubstrateCTA() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Link href="/pricing">
      <div
        className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
          isHovered ? "border-indigo-500/50 bg-indigo-500/5" : "border-zinc-700/60 bg-white/[0.02]"
        }`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <svg
          className={`mb-2 h-8 w-8 transition-colors ${isHovered ? "text-indigo-400" : "text-zinc-500"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <p
          className={`text-sm font-medium transition-colors ${isHovered ? "text-indigo-300" : "text-white/60"}`}
        >
          Add Substrate
        </p>
        <p className="mt-1 text-xs text-white/40">Choose a plan to get started</p>
      </div>
    </Link>
  );
}

// ── Post-Checkout Banner ─────────────────────────────────────────────────────

function PostCheckoutBanner({
  onSubstratesUpdate,
}: {
  onSubstratesUpdate: (substrates: SubstrateSummary[]) => void;
}) {
  const [visible, setVisible] = useState(true);
  const pollIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Poll more aggressively for 60 seconds after checkout success
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds
    const maxDuration = 60000; // 60 seconds

    const pollFn = async () => {
      if (Date.now() - startTime > maxDuration) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        return;
      }

      try {
        const res = await fetch("/api/substrates");
        if (res.ok) {
          const data: { substrates?: SubstrateSummary[] } = await res.json();
          if (data.substrates?.length) {
            onSubstratesUpdate(data.substrates);
            setVisible(false);
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          }
        }
      } catch {
        // Silently fail, will retry on next poll
      }
    };

    pollIntervalRef.current = setInterval(pollFn, pollInterval);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [onSubstratesUpdate]);

  if (!visible) return null;

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
          <span>✓</span> Payment received
        </p>
        <p className="mt-1 text-sm text-white/50">Activating your substrate...</p>
      </div>
      <button
        onClick={() => setVisible(false)}
        className="shrink-0 text-emerald-400/60 transition-colors hover:text-emerald-300"
      >
        ✕
      </button>
    </div>
  );
}

// ── Main Dashboard Client ────────────────────────────────────────────────────

export default function DashboardClient({
  account,
  substrates: initialSubstrates,
}: {
  account: AccountInfo;
  substrates: SubstrateSummary[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loggingOut, setLoggingOut] = useState(false);
  const [substrates, setSubstrates] = useState<SubstrateSummary[]>(initialSubstrates);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [billingError, setBillingError] = useState(false);
  const [cancelWarning, setCancelWarning] = useState<{ slug: string; status: string } | null>(null);

  const checkoutStatus = searchParams.get("checkout");

  // Fetch billing status on mount
  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (d && !d.error) setBillingStatus(d);
        else setBillingError(true);
      })
      .catch(() => setBillingError(true));
  }, []);

  // Poll substrates every 10 seconds
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch("/api/substrates");
        if (res.ok) {
          const data: { substrates?: SubstrateSummary[] } = await res.json();
          if (data.substrates) {
            setSubstrates(data.substrates);
          }
        }
      } catch {
        // Silently fail
      }
    }, 10000);

    return () => clearInterval(pollInterval);
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  }

  function handleBillingPortal() {
    openBillingPortal();
  }

  function handleCancelRequest(slug: string) {
    const sub = substrates.find((s) => s.slug === slug);
    if (sub) setCancelWarning({ slug, status: sub.status });
  }

  function handleCancelConfirm() {
    setCancelWarning(null);
    openBillingPortal();
  }

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      {/* Cancel subscription warning modal */}
      {cancelWarning && (
        <CancelWarningModal
          slug={cancelWarning.slug}
          status={cancelWarning.status}
          onConfirm={handleCancelConfirm}
          onDismiss={() => setCancelWarning(null)}
        />
      )}
      {/* Backdrop blur */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-0 right-1/4 h-[500px] w-[800px] rounded-full bg-indigo-600/5 blur-[160px]" />
      </div>

      {/* Header */}
      <header className="relative border-b border-white/5 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="font-[family-name:var(--font-syne)] font-semibold text-white">
            Memory Substrates
          </h1>
          <div className="flex items-center gap-6">
            <span className="text-sm text-white/40">{account.email}</span>
            <nav className="flex items-center gap-4">
              <a
                href="https://mmpm.co.nz/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-white/50 transition-colors hover:text-white/80"
              >
                Docs
              </a>
              <button
                onClick={handleBillingPortal}
                className="text-sm text-white/50 transition-colors hover:text-white/80"
              >
                Billing
              </button>
              <Link
                href="/admin/security"
                className="text-sm text-white/50 transition-colors hover:text-white/80"
              >
                Security
              </Link>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="text-sm text-white/50 transition-colors hover:text-white/80 disabled:opacity-40"
              >
                {loggingOut ? "Signing out…" : "Sign out"}
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative mx-auto max-w-6xl space-y-8 px-6 py-10">
        {/* Post-checkout banner */}
        {checkoutStatus === "success" && <PostCheckoutBanner onSubstratesUpdate={setSubstrates} />}

        {/* Billing widget */}
        {billingStatus && !billingError && (
          <BillingWidget billing={billingStatus} onBillingPortal={handleBillingPortal} />
        )}

        {/* Substrates grid */}
        <div>
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white">
              {substrates.length === 0 ? "No substrates yet" : "Your substrates"}
            </h2>
            <p className="mt-1 text-sm text-white/40">
              {substrates.length === 0
                ? "Create a new substrate to get started with Parametric Memory"
                : "Click a substrate to manage it"}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {substrates.map((substrate) => (
              <SubstrateCard
                key={substrate.id}
                substrate={substrate}
                onCancelRequest={handleCancelRequest}
              />
            ))}
            <AddSubstrateCTA />
          </div>
        </div>
      </main>
    </div>
  );
}
