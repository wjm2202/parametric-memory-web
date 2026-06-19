"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getTierLabel } from "@/config/tiers";
import SubstrateStateBanner from "@/components/ui/SubstrateStateBanner";
import SiteNavbar from "@/components/ui/SiteNavbar";
import { readReauthFlag, redirectToReauth } from "@/lib/reauth";
import { CancelSubstrateDialog } from "./CancelSubstrateDialog";
import { CancelPendingBanner, CancelPendingBadge } from "./CancelPendingBanner";

import { mailto } from "@/config/site";
import { GRACE_PERIOD_DAYS } from "@/config/lifecycle";
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
  /**
   * ISO timestamp of when the subscription will end (the period_end of the
   * paying period). Populated by the webhook fan-out at
   * substrate-stripe.ts when `cancel_at_period_end` is set on the Stripe
   * subscription. Null while the subscription is fully active. Cleared back
   * to null by the same webhook fan-out when the user reactivates.
   *
   * Sprint 2026-05-18 E2: drives the cancel-pending banner + badge on the
   * dashboard substrate card. Surfaced by compute at
   * src/api/substrates/routes.ts:513 (`cancelAt: detail.cancel_at?.toISOString()`).
   */
  cancelAt: string | null;
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

/**
 * Opens the Stripe Billing Portal.
 *
 * Without `substrateSlug`: returns the full portal with every subscription on
 * the account. Used by the top-level "Manage billing" action.
 *
 * With `substrateSlug`: returns a portal session scoped via Stripe `flow_data`
 * directly to the cancel-this-subscription confirmation step for that one
 * substrate. Used by the per-substrate Cancel button. Compute server enforces
 * ownership (substrate.account_id = caller) before issuing the scoped session
 * — a forged slug returns 404 with `substrate_subscription_not_found`.
 */
async function openBillingPortal(substrateSlug?: string) {
  const res = await fetch("/api/billing/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(substrateSlug ? { substrateSlug } : {}),
  });
  // Compute's recent-auth middleware returns 401 with
  // `code: "reauth_required"` when the recent-auth window has expired
  // (factor-aware as of migration 083: 10 min for magic-link / OAuth,
  // 30 min for TOTP). See src/lib/reauth.ts for the full contract. The
  // user gets a clear reason via the alert and a single-click hop to
  // /login; after sign-in they land back on this dashboard with a fresh
  // last_reauth_at + last_reauth_factor and the next click works.
  if (await readReauthFlag(res)) {
    alert(
      "Sign in again to open the billing portal. For your security, this action requires you to have signed in recently. Click OK to sign in.",
    );
    redirectToReauth();
    return;
  }
  if (res.status === 422) {
    alert("No billing account found. Please subscribe first.");
    return;
  }
  if (res.status === 404 && substrateSlug) {
    // Substrate-scoped path: 404 means the substrate has no active/past_due
    // subscription to cancel (already cancelled, or never had one). Most
    // likely the page is stale and `hasActiveSubscription` flipped to false
    // between render and click — a refresh will hide the button.
    alert(
      "This substrate doesn't have an active subscription to cancel. The page may be out of date — refresh and try again.",
    );
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
    // F-BILLING-3: pending_payment used to fall through to the default gray
    // badge. Now surfaced with an amber "Payment Pending" pill so customers
    // can see at a glance that a substrate is waiting on their Stripe session.
    pending_payment: "bg-amber-500/20 text-amber-400 border-amber-500/30",
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
    pending_payment: "Payment Pending",
    read_only: "Read Only",
    cancelled: "Cancelled",
    suspended: "Suspended",
    deprovisioned: "Deprovisioned",
    destroyed: "Destroyed",
    provision_failed: "Provision Failed",
  };

  // F-BILLING-2: tooltips on every status so the dashboard explains itself on
  // hover. Particularly important for `read_only` — the badge colour reads as
  // "warning", but the customer needs to know WHY (billing issue, not an
  // outage) and HOW to resume (manage billing).
  const titles: Record<string, string> = {
    running: "This substrate is running and accepting reads and writes.",
    provisioning: "Your substrate is being created. Usually takes 1–2 minutes.",
    pending_payment: "Payment hasn't completed yet. Finish checkout to activate.",
    read_only: "Writes are paused. Reads still work. Check billing to resume writes.",
    cancelled: `Subscription cancelled. Memory preserved for ${GRACE_PERIOD_DAYS} days.`,
    suspended: "Account suspended after failed payment attempts.",
    deprovisioned: "This substrate has been deprovisioned and its data removed.",
    destroyed: "This substrate has been destroyed.",
    provision_failed:
      "Provisioning didn't complete. No charges were made — contact support to retry.",
  };

  return (
    <span
      title={titles[status] ?? undefined}
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
              Your last payment didn&apos;t go through. Stripe will automatically retry. Your
              account remains fully active.
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
              href={mailto("Account help")}
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
              Your plan was cancelled. Memory is preserved for {GRACE_PERIOD_DAYS} days.
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
              <span className="font-normal text-zinc-400">{"Active"}</span>
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
          data-testid="dashboard-billing-button"
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
      className="fixed top-[var(--site-nav-h)] right-0 bottom-0 left-0 z-40 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      data-testid="cancel-substrate-modal-backdrop"
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
  onActiveCancelRequest,
  onReactivated,
}: {
  substrate: SubstrateSummary;
  onCancelRequest: (slug: string) => void;
  onActiveCancelRequest: (slug: string) => void;
  /** E2: fires after a successful POST /api/substrates/:slug/reactivate. */
  onReactivated: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  // Show cancel only when the substrate is inactive AND Stripe still has an
  // active/past_due subscription attached. Once cancelled via Stripe portal,
  // the webhook flips substrate_subscriptions.status → 'cancelled' and this
  // flag goes false — the button disappears on the next poll.
  const isCancellable = INACTIVE_STATUSES.has(substrate.status) && substrate.hasActiveSubscription;
  // E2 cancel-pending state — `cancelAt` is set whenever the user has
  // clicked Cancel and the period hasn't ended yet. In this state we HIDE
  // the cancel button and show the banner + badge instead. The badge is
  // persistent; the banner is dismissable for the day.
  const cancelPending = Boolean(substrate.cancelAt);
  // E1: ACTIVE running substrate with a live sub → show the on-site cancel
  // button. Don't show during cancel-pending (E2 owns that surface via the
  // banner's Reactivate button).
  const isActiveCancellable =
    substrate.status === "running" && substrate.hasActiveSubscription && !cancelPending;

  return (
    <div
      data-testid={`substrate-card-${substrate.slug}`}
      className={`group relative rounded-xl border bg-white/[0.02] transition-all duration-200 ${
        isHovered ? "border-indigo-500/50 bg-white/[0.05]" : "border-white/10"
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Card body — navigates to admin */}
      <Link
        href={`/admin?slug=${encodeURIComponent(substrate.slug)}`}
        data-testid={`substrate-manage-${substrate.slug}`}
        className="block p-4 pb-3"
      >
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
          <p
            data-testid={`substrate-slug-${substrate.slug}`}
            className="font-mono text-sm break-all text-white/70"
          >
            {substrate.slug}
          </p>
          {/* E2: persistent badge while cancel-pending. The banner below
              the card carries the dismissable detail + reactivate button;
              this pill just keeps the state visible after dismissal. */}
          {cancelPending && substrate.cancelAt && (
            <CancelPendingBadge endsOn={formatDate(substrate.cancelAt)} />
          )}
        </div>

        {/* Tier badge */}
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-block rounded bg-zinc-800/60 px-2 py-1 text-xs font-medium text-zinc-300">
            {getTierLabel(substrate.tier)}
          </span>
        </div>

        {/* Status badge */}
        <div className="mb-4" data-testid={`substrate-status-${substrate.slug}`}>
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

      {/* Cancel subscription footer — only for inactive substrates with
          orphan Stripe subs. Routes to the Stripe portal (existing flow). */}
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

      {/* E1 (sprint 2026-05-18): on-site cancel for ACTIVE substrates. Opens
          CancelSubstrateDialog with the minimum-copy "ends on DD MMM YYYY"
          confirmation. No portal redirect. Hidden during cancel-pending. */}
      {isActiveCancellable && (
        <div className="border-t border-white/5 px-4 py-2.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onActiveCancelRequest(substrate.slug);
            }}
            data-testid={`substrate-card-cancel-${substrate.slug}`}
            className="text-xs text-white/40 transition hover:text-red-400"
          >
            Cancel subscription
          </button>
        </div>
      )}

      {/* E2 (sprint 2026-05-18): cancel-pending banner with Reactivate.
          Dismissable for the day via localStorage; the persistent badge
          next to the slug stays visible regardless. */}
      {cancelPending && substrate.cancelAt && (
        <CancelPendingBanner
          substrateId={substrate.id}
          endsOn={formatDate(substrate.cancelAt)}
          slug={substrate.slug}
          onReactivated={onReactivated}
        />
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
  // E1 (sprint 2026-05-18): on-site cancel target for ACTIVE substrates.
  // Distinct from cancelWarning (which targets INACTIVE orphan-Stripe-sub
  // substrates and redirects to the Stripe portal).
  const [activeCancelTarget, setActiveCancelTarget] = useState<{
    slug: string;
    endsOn: string;
  } | null>(null);

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
    // Capture the slug BEFORE clearing the modal — setCancelWarning is async
    // and `cancelWarning` could be null by the time openBillingPortal reads it
    // in some React batching scenarios. The portal call is then scoped to
    // exactly this substrate's Stripe subscription via flow_data on the
    // compute side, dropping the customer directly on the cancel
    // confirmation step instead of a list of indistinguishable subs.
    const slug = cancelWarning?.slug;
    setCancelWarning(null);
    openBillingPortal(slug);
  }

  /**
   * E1 (sprint 2026-05-18): on-site cancel trigger for ACTIVE substrates.
   * Looks up the substrate's next renewal date (renewsAt) to compute the
   * "ends on" string the dialog shows. If renewsAt is missing we fall back
   * to a generic phrase — the dialog still renders, just without the date.
   */
  function handleActiveCancelRequest(slug: string) {
    const sub = substrates.find((s) => s.slug === slug);
    if (!sub) return;
    const endsOn = sub.renewsAt ? formatDate(sub.renewsAt) : "your next billing date";
    setActiveCancelTarget({ slug, endsOn });
  }

  function handleActiveCancelSuccess() {
    setActiveCancelTarget(null);
    // Re-fetch substrates so the UI reflects cancel_at (E2's banner + badge
    // will key off this). Reuse the existing /api/my-substrate poll path —
    // the next tick of the existing pollInterval would do it, but the
    // explicit refetch removes the up-to-30s window where the substrate
    // card still looks fully-active after the cancel landed.
    fetch("/api/my-substrate")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.substrates)) {
          setSubstrates(data.substrates as SubstrateSummary[]);
        }
      })
      .catch(() => {
        // Silent — the existing pollInterval will pick up the new state.
      });
  }

  return (
    // M7: overflow-x-hidden guard — see AdminClient.tsx for rationale.
    <div className="min-h-screen overflow-x-hidden bg-[#030712] text-white">
      {/* Cancel subscription warning modal — INACTIVE substrates, routes
          to Stripe portal for orphan-sub cleanup. */}
      {cancelWarning && (
        <CancelWarningModal
          slug={cancelWarning.slug}
          status={cancelWarning.status}
          onConfirm={handleCancelConfirm}
          onDismiss={() => setCancelWarning(null)}
        />
      )}
      {/* E1 (sprint 2026-05-18): ACTIVE substrate cancel dialog — minimum
          copy, on-site POST to /api/substrates/:slug/cancel. */}
      {activeCancelTarget && (
        <CancelSubstrateDialog
          slug={activeCancelTarget.slug}
          endsOn={activeCancelTarget.endsOn}
          onSuccess={handleActiveCancelSuccess}
          onClose={() => setActiveCancelTarget(null)}
        />
      )}
      {/* Backdrop blur */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-0 right-1/4 h-[500px] w-[800px] rounded-full bg-indigo-600/5 blur-[160px]" />
      </div>

      {/* SiteNavbar — shared across the site, gives mobile users the
          hamburger drawer with primary nav + account actions
          (Billing / Security / Sign out). */}
      <SiteNavbar isLoggedIn={true} variant="standard" />

      {/* Page-level subheader. The "Memory Substrates" title is always
          visible. The desktop-only secondary actions row mirrors what the
          mobile drawer already exposes — kept so desktop users have a
          one-click Billing/Security/Sign-out without opening the drawer
          (which is hidden on md+ widths). */}
      <header className="relative border-b border-white/5 px-4 pt-20 pb-4 sm:px-6 sm:pt-24">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h1 className="font-[family-name:var(--font-syne)] text-xl font-semibold text-white sm:text-2xl">
            Memory Substrates
          </h1>
          <div className="hidden items-center gap-6 md:flex">
            <span className="text-sm text-white/40">{account.email}</span>
            <nav className="flex items-center gap-4">
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

        {/* F-BILLING-3 + F-PROV-1: per-substrate attention banners.
            SubstrateStateBanner returns null for healthy statuses, so we can
            render one per substrate without any filtering — the stack stays
            empty unless something actually needs the user's attention. */}
        <div className="space-y-3">
          {substrates.map((substrate) => (
            <SubstrateStateBanner
              key={`banner-${substrate.id}`}
              slug={substrate.slug}
              status={substrate.status}
              onBillingPortal={handleBillingPortal}
            />
          ))}
        </div>

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
                onActiveCancelRequest={handleActiveCancelRequest}
                onReactivated={handleActiveCancelSuccess}
              />
            ))}
            <AddSubstrateCTA />
          </div>
        </div>
      </main>
    </div>
  );
}
