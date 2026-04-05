"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { TIER_ORDER, getTierLabel, getTierPrice } from "@/config/tiers";
import { RotationStepper, type RotationStatus } from "@/components/ui/RotationStepper";
import { UpdateInstructions } from "@/components/ui/UpdateInstructions";

// ── Billing Status Types ────────────────────────────────────────────────────

interface BillingStatus {
  tier: string;
  status: "active" | "trialing" | "past_due" | "suspended" | "cancelled";
  renewsAt: string | null;
  trialEndsAt: string | null;
  lastPaymentFailed: boolean;
  hasStripeCustomer: boolean;
  tierDisplay: {
    name: string;
    atomsUsed: number;
    atomsLimit: number;
    bootstrapsUsed: number;
    bootstrapsLimit: number;
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(iso: string | null): number {
  if (!iso) return Infinity;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ── Manage Billing helper ─────────────────────────────────────────────────────

async function openBillingPortal() {
  const res = await fetch("/api/billing/portal");
  if (res.status === 422) {
    // No Stripe customer yet — shouldn't happen on a paid plan but be safe
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

// ── Billing Widget ────────────────────────────────────────────────────────────

function BillingWidget({ billing }: { billing: BillingStatus }) {
  const { status, tier, renewsAt, trialEndsAt, lastPaymentFailed, tierDisplay } = billing;

  // Payment warning takes priority over normal active display
  if (lastPaymentFailed && status !== "suspended") {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
              <span>⚠</span> Payment issue — we&apos;ll retry
            </p>
            <p className="text-surface-400 mt-1 text-sm">
              Your last payment didn&apos;t go through. Stripe will automatically retry. Your
              account remains fully active.
            </p>
          </div>
          <button
            onClick={openBillingPortal}
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
            <p className="text-surface-400 mt-1 text-sm">
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
              className="border-surface-700 text-surface-400 rounded-md border px-3 py-1.5 text-xs font-medium transition hover:text-white"
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
            <p className="text-surface-400 flex items-center gap-2 text-sm font-semibold">
              <span className="text-surface-600">○</span> No active subscription
            </p>
            <p className="text-surface-500 mt-1 text-sm">
              Your plan was cancelled. Memory is preserved for 90 days.
            </p>
          </div>
          <Link
            href="/pricing"
            className="bg-brand-500 hover:bg-brand-400 shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-white transition"
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
  const priceLabel =
    tier === "indie"
      ? "$9/month"
      : tier === "pro"
        ? "$29/month"
        : tier === "team"
          ? "$79/month"
          : null;

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
          <p className="text-surface-400 text-xs">
            {statusLabel}
            {priceLabel && status !== "trialing" && ` · ${priceLabel}`}
            {status === "trialing" && priceLabel && `, then ${priceLabel}`}
          </p>
          {tierDisplay.atomsLimit > 0 && (
            <div className="space-y-1 pt-1">
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
            </div>
          )}
        </div>
        <button
          onClick={openBillingPortal}
          className="border-surface-700 text-surface-400 shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition hover:border-zinc-500 hover:text-white"
        >
          Manage billing →
        </button>
      </div>
    </div>
  );
}

// ── Renewal Banner ────────────────────────────────────────────────────────────

function RenewalBanner({ renewsAt }: { renewsAt: string }) {
  const DISMISS_KEY = `renewal_banner_dismissed_${renewsAt.slice(0, 10)}`;
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    return !localStorage.getItem(DISMISS_KEY);
  });

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  const days = daysUntil(renewsAt);
  if (days > 7 || days < 0) return null;

  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
      <span>
        ℹ Your plan renews on <strong className="text-white">{formatDate(renewsAt)}</strong>.{" "}
        <button
          onClick={openBillingPortal}
          className="underline underline-offset-2 hover:text-white"
        >
          Manage billing
        </button>
      </span>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 text-blue-400 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}

// ── Types ───────────────────────────────────────────────────────────────────

interface AccountInfo {
  id: string;
  email: string;
  name: string | null;
  tier: string | null;
  status: string;
  balanceCents: number;
  createdAt: string;
}

interface ProvisioningProgress {
  queueStatus: string;
  phase: string | null;
  dropletId: number | null;
  dropletIp: string | null;
  startedAt: string | null;
}

interface HealthInfo {
  droplet?: { status: string; ip: string | null; sshReady: boolean };
  substrate: { status: string; mcpEndpoint: string | null; reachable: boolean | null };
  https: { configured: boolean; endpoint: string | null };
}

interface SubstrateHistoryItem {
  id: string;
  slug: string;
  tier: string;
  status: string;
  hostingModel: string;
  mcpEndpoint: string | null;
  provisionedAt: string | null;
  createdAt: string;
}

interface SubstrateInfo {
  id: string | null;
  slug: string | null;
  tier: string;
  status: string;
  mcpEndpoint: string | null;
  hostingModel: string;
  provisioning: ProvisioningProgress | null;
  health: HealthInfo | null;
  maxAtoms: number;
  maxBootstrapsMonth: number;
  maxStorageMB: number;
  atomCount: number;
  bootstrapCountMonth: number;
  storageUsedMB: number;
  provisionedAt: string | null;
  gracePeriodEndsAt: string | null;
  cancelAt: string | null;
  keyUnclaimed: boolean;
  history?: SubstrateHistoryItem[];
}

// ── Constants (imported from @/config/tiers — canonical registry) ────────────

// ── Helper Components ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    running: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    provisioning: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    read_only: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    suspended: "bg-red-500/20 text-red-400 border-red-500/30",
    deprovisioned: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    destroyed: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    provision_failed: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  const labels: Record<string, string> = {
    running: "Running",
    provisioning: "Provisioning...",
    read_only: "Read Only",
    suspended: "Suspended",
    deprovisioned: "Deprovisioned",
    destroyed: "Destroyed",
    provision_failed: "Failed",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? "border-white/20 bg-white/10 text-white/50"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function UsageBar({
  label,
  current,
  max,
  unit,
}: {
  label: string;
  current: number;
  max: number;
  unit: string;
}) {
  const isUnlimited = max === -1;
  const percent = isUnlimited ? 0 : Math.min((current / max) * 100, 100);
  const isOverage = !isUnlimited && current > max;
  const barColor = isOverage ? "bg-red-500" : percent > 80 ? "bg-amber-500" : "bg-indigo-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-white">
          {current.toLocaleString()}
          {isUnlimited ? "" : ` / ${max.toLocaleString()}`} {unit}
          {isOverage && (
            <span className="ml-1.5 text-red-400">
              (+{(current - max).toLocaleString()} overage)
            </span>
          )}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      )}
      {isUnlimited && <div className="text-xs text-zinc-500">Unlimited</div>}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
    >
      {copied ? (
        <>
          <svg
            className="h-3.5 w-3.5 text-emerald-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}

// ── Provisioning Steps ──────────────────────────────────────────────────────

/** Map hosting model + phase to ordered step list with completion state. */
function getProvisioningSteps(
  hostingModel: string,
  phase: string | null,
  status: string,
): { label: string; state: "done" | "active" | "pending" }[] {
  const isDedicated = hostingModel === "dedicated";

  // Phase progression for dedicated: host_acquire → container_deploy → health_check → traefik_config
  // Phase progression for shared:    container_deploy → health_check → traefik_config
  const allPhases = isDedicated
    ? ["host_acquire", "container_deploy", "health_check", "traefik_config"]
    : ["container_deploy", "health_check", "traefik_config"];

  const labels: Record<string, string> = {
    host_acquire: "Creating droplet",
    container_deploy: "Deploying containers",
    health_check: "Health check",
    traefik_config: "Configuring HTTPS",
  };

  if (status === "running") {
    return allPhases.map((p) => ({ label: labels[p], state: "done" }));
  }

  const currentIndex = phase ? allPhases.indexOf(phase) : -1;

  return allPhases.map((p, i) => ({
    label: labels[p],
    state: i < currentIndex ? "done" : i === currentIndex ? "active" : "pending",
  }));
}

function ProvisioningSteps({
  hostingModel,
  provisioning,
  status,
}: {
  hostingModel: string;
  provisioning: ProvisioningProgress | null;
  status: string;
}) {
  const steps = getProvisioningSteps(hostingModel, provisioning?.phase ?? null, status);

  return (
    <div className="space-y-3">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-3">
          {step.state === "done" && (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20">
              <svg
                className="h-3.5 w-3.5 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          )}
          {step.state === "active" && (
            <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-blue-500">
              <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            </div>
          )}
          {step.state === "pending" && (
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700">
              <div className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
            </div>
          )}
          <span
            className={`text-sm ${
              step.state === "done"
                ? "text-emerald-400"
                : step.state === "active"
                  ? "text-blue-400"
                  : "text-zinc-500"
            }`}
          >
            {step.label}
            {step.state === "active" && "..."}
          </span>
          {/* Show droplet IP once acquired */}
          {step.label === "Creating droplet" &&
            step.state === "done" &&
            provisioning?.dropletIp && (
              <span className="font-mono text-xs text-zinc-500">{provisioning.dropletIp}</span>
            )}
        </div>
      ))}
    </div>
  );
}

// ── Health Indicators ───────────────────────────────────────────────────────

function HealthBadge({ ok, label }: { ok: boolean | null; label: string }) {
  const styles =
    ok === true
      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
      : ok === false
        ? "bg-red-500/20 text-red-400 border-red-500/30"
        : "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          ok === true ? "bg-emerald-400" : ok === false ? "bg-red-400" : "bg-zinc-500"
        }`}
      />
      {label}
    </span>
  );
}

function HealthBadges({ health }: { health: HealthInfo }) {
  return (
    <>
      {health.droplet && <HealthBadge ok={health.droplet.sshReady} label="Droplet" />}
      <HealthBadge ok={health.substrate.reachable} label="Substrate" />
      <HealthBadge ok={health.https.configured} label="HTTPS" />
    </>
  );
}

// ── Main Dashboard ──────────────────────────────────────────────────────────

export default function DashboardClient({
  account,
  substrate,
}: {
  account: AccountInfo;
  substrate: SubstrateInfo | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loggingOut, setLoggingOut] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [revealingKey, setRevealingKey] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  // ── Key rotation state ───────────────────────────────────────────────────
  const [rotationStatus, setRotationStatus] = useState<RotationStatus>("none");
  const [rotationError, setRotationError] = useState<string | null>(null);
  const [rotationJobId, setRotationJobId] = useState<string | null>(null);
  const [rotationConfirmOpen, setRotationConfirmOpen] = useState(false);
  const [rotationStarting, setRotationStarting] = useState(false);
  const [rotationRateLimitMsg, setRotationRateLimitMsg] = useState<string | null>(null);
  const [claimKeyOpen, setClaimKeyOpen] = useState(false);
  const rotationPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unloadRef = useRef<((e: BeforeUnloadEvent) => string) | null>(null);

  const rotationActive =
    rotationStatus !== "none" && rotationStatus !== "complete" && rotationStatus !== "failed";

  async function startRotation() {
    setRotationStarting(true);
    setRotationRateLimitMsg(null);
    try {
      const res = await fetch("/api/v1/my-substrate/rotate-key", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          setRotationRateLimitMsg(data.error ?? "Rate limit reached.");
          setRotationConfirmOpen(false);
        } else {
          setRotationError(data.error ?? "Failed to start rotation.");
          setRotationStatus("failed");
          setRotationConfirmOpen(false);
        }
        return;
      }
      setRotationJobId(data.jobId);
      setRotationStatus("pending");
      setRotationError(null);
      setRotationConfirmOpen(false);
    } finally {
      setRotationStarting(false);
    }
  }

  function resetRotation() {
    setRotationStatus("none");
    setRotationError(null);
    setRotationJobId(null);
    setRotationRateLimitMsg(null);
  }
  const [cancelling, setCancelling] = useState(false);
  const [destroyConfirmText, setDestroyConfirmText] = useState("");
  const [destroying, setDestroying] = useState(false);

  // Billing status — drives the billing widget and renewal banner
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setBillingStatus(d);
      })
      .catch(() => {});
  }, []);

  // Check for checkout success/cancel query param
  const checkoutStatus = searchParams.get("checkout");

  // Poll for provisioning status
  const [liveSubstrate, setLiveSubstrate] = useState(substrate);
  const isProvisioning = liveSubstrate?.status === "provisioning";

  // True when user just came back from Stripe checkout and the webhook may not have fired yet
  const [awaitingWebhook, setAwaitingWebhook] = useState(checkoutStatus === "success");

  // Upgrade consent modal — shown before redirecting to Stripe for a tier change
  const [upgradeConsentTier, setUpgradeConsentTier] = useState<string | null>(null);
  const [upgradeConsentChecked, setUpgradeConsentChecked] = useState(false);

  const pollSubstrate = useCallback(async () => {
    try {
      const res = await fetch("/api/my-substrate");
      if (res.ok) {
        const data = await res.json();
        if (data.error === "no_substrate") {
          // No active substrate — but keep history visible if returned
          setLiveSubstrate((prev) =>
            data.history?.length
              ? ({ ...(prev ?? {}), history: data.history } as SubstrateInfo)
              : null,
          );
          return null;
        }
        setLiveSubstrate(data);
        return data;
      }
    } catch {
      // Ignore polling errors
    }
    return null;
  }, []);

  // Normal provisioning poll (every 5s while status === "provisioning")
  useEffect(() => {
    if (!isProvisioning) return;
    const interval = setInterval(pollSubstrate, 5000);
    return () => clearInterval(interval);
  }, [isProvisioning, pollSubstrate]);

  // ── Key rotation effects (must follow pollSubstrate declaration) ─────────

  // Register / clear beforeunload guard during active rotation
  useEffect(() => {
    if (rotationActive) {
      const handler = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        return "Key rotation is in progress. Navigating away will not stop the rotation, but you may miss the new key prompt.";
      };
      unloadRef.current = handler;
      window.addEventListener("beforeunload", handler);
      return () => window.removeEventListener("beforeunload", handler);
    } else if (unloadRef.current) {
      window.removeEventListener("beforeunload", unloadRef.current);
      unloadRef.current = null;
    }
  }, [rotationActive]);

  // Poll rotation status every 2s while active
  useEffect(() => {
    if (!rotationActive) {
      if (rotationPollRef.current) {
        clearInterval(rotationPollRef.current);
        rotationPollRef.current = null;
      }
      return;
    }
    const poll = async () => {
      try {
        const res = await fetch("/api/v1/my-substrate/key-rotation/status");
        if (!res.ok) return;
        const data = await res.json();
        const newStatus: RotationStatus = data.status ?? "none";
        setRotationStatus(newStatus);
        if (newStatus === "failed") {
          setRotationError(data.errorMessage ?? "Rotation failed.");
        }
        if (newStatus === "complete") {
          setClaimKeyOpen(true);
          pollSubstrate();
        }
      } catch {
        // Ignore transient poll errors
      }
    };
    rotationPollRef.current = setInterval(poll, 2000);
    return () => {
      if (rotationPollRef.current) clearInterval(rotationPollRef.current);
    };
  }, [rotationActive, pollSubstrate]);

  // Post-checkout aggressive poll: every 1.5s until substrate is running, max 60s
  useEffect(() => {
    if (!awaitingWebhook) return;
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      const data = await pollSubstrate();
      const isReady = data?.status === "running" || data?.status === "provisioning";
      if (isReady || attempts >= 40) {
        setAwaitingWebhook(false);
        clearInterval(interval);
        // Remove ?checkout=success from the URL once we have a substrate
        if (isReady) router.replace("/dashboard");
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [awaitingWebhook, pollSubstrate, router]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await fetch("/api/my-substrate/cancel", { method: "POST" });
      if (!res.ok) return;

      // Poll until cancelAt or status change is reflected (webhook may take a few seconds).
      // Max 30s (15 attempts × 2s) — after that the user can manually refresh.
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        await pollSubstrate();
        const sub = liveSubstrate;
        const settled = sub?.cancelAt != null || sub?.status !== "running";
        if (settled || attempts >= 15) clearInterval(pollInterval);
      }, 2000);
    } finally {
      setCancelling(false);
      setCancelConfirm(false);
    }
  }

  async function handleReactivate() {
    try {
      const res = await fetch("/api/my-substrate/reactivate", { method: "POST" });
      if (res.ok) await pollSubstrate();
    } catch {
      // Ignore — user can try again
    }
  }

  async function handleDestroy() {
    setDestroying(true);
    try {
      const res = await fetch("/api/my-substrate/deprovision", { method: "POST" });
      if (res.ok) await pollSubstrate();
    } finally {
      setDestroying(false);
      setDestroyConfirmText("");
    }
  }

  // Step 1: Show the consent modal before opening Stripe
  function handleUpgrade(tier: string) {
    setUpgradeConsentTier(tier);
    setUpgradeConsentChecked(false);
  }

  // Step 2: User confirmed consent — now redirect to Stripe
  async function confirmUpgradeCheckout() {
    if (!upgradeConsentTier || !upgradeConsentChecked) return;
    const tier = upgradeConsentTier;
    setUpgradeConsentTier(null);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.sessionUrl) {
        window.location.href = data.sessionUrl;
      }
    }
  }

  const currentTier = (liveSubstrate?.tier ??
    account.tier ??
    "free") as import("@/config/tiers").TierId;
  const currentTierIndex = TIER_ORDER.indexOf(currentTier);
  const sub = liveSubstrate;

  const mcpEndpoint = sub?.mcpEndpoint ?? null;

  const mcpConfig = mcpEndpoint
    ? JSON.stringify(
        {
          mcpServers: {
            "parametric-memory": {
              command: "npx",
              args: [
                "-y",
                "mcp-remote",
                mcpEndpoint,
                "--header",
                `Authorization: Bearer ${newApiKey ?? "<YOUR_API_KEY>"}`,
              ],
            },
          },
        },
        null,
        2,
      )
    : null;

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      {/* Background blur */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-0 right-1/4 h-[500px] w-[800px] rounded-full bg-indigo-600/5 blur-[160px]" />
      </div>

      {/* Rotation in-progress banner — fixed below site nav, above content */}
      {rotationActive && (
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-amber-700/40 bg-amber-950/80 px-6 py-2.5 backdrop-blur-sm">
          <svg
            className="h-4 w-4 flex-shrink-0 animate-spin text-amber-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p className="text-sm text-amber-300">
            <span className="font-medium">Key rotation in progress</span> — do not navigate away.
            Your containers will restart automatically. This takes ~15 seconds.
          </p>
        </div>
      )}
      {rotationStatus === "complete" && !claimKeyOpen && (
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-emerald-700/40 bg-emerald-950/80 px-6 py-2.5 backdrop-blur-sm">
          <span className="text-sm text-emerald-300">
            Rotation complete —{" "}
            <button onClick={() => setClaimKeyOpen(true)} className="underline hover:no-underline">
              claim your new key
            </button>
          </span>
        </div>
      )}

      <div className="relative mx-auto max-w-5xl px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Memory Substrate</h1>
            <p className="mt-1 text-sm text-zinc-400">{account.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/docs"
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              Docs
            </Link>
            <Link
              href="/admin"
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
              title="Dedicated droplet instances"
            >
              Instances
            </Link>
            {billingStatus?.hasStripeCustomer && (
              <button
                onClick={openBillingPortal}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
              >
                Billing
              </button>
            )}
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:opacity-50"
            >
              {loggingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>

        {/* Renewal banner — shown 7 days before renewal, dismissable */}
        {billingStatus?.renewsAt && billingStatus.status === "active" && (
          <RenewalBanner renewsAt={billingStatus.renewsAt} />
        )}

        {/* Post-checkout provisioning banner — shown while waiting for Stripe webhook */}
        {awaitingWebhook && (
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-300">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-indigo-400/30 border-t-indigo-400" />
            Payment received — activating your substrate…
          </div>
        )}

        {/* No active substrate — show empty state */}
        {(!sub || !sub.id) && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-12 text-center">
            <h2 className="text-lg font-medium">No substrate provisioned</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Choose a plan on the{" "}
              <Link href="/pricing" className="text-indigo-400 hover:text-indigo-300">
                pricing page
              </Link>{" "}
              to get started.
            </p>
          </div>
        )}

        {/* Billing widget — always shown when billing status is loaded */}
        {billingStatus && !awaitingWebhook && (
          <div className="mb-3">
            <BillingWidget billing={billingStatus} />
          </div>
        )}

        {sub && sub.id && (
          <div className="space-y-3">
            {/* Tier + Status row */}
            <div className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-lg font-semibold">{getTierLabel(currentTier)} Plan</span>
                  <StatusBadge status={sub.status} />
                  {sub.status === "running" && sub.health && <HealthBadges health={sub.health} />}
                  {sub.cancelAt && (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                      Cancels{" "}
                      {new Date(sub.cancelAt).toLocaleDateString("en-NZ", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-zinc-400">
                  {getTierPrice(currentTier) === 0
                    ? "Free forever"
                    : `$${getTierPrice(currentTier)}/month`}
                  {sub.gracePeriodEndsAt && (
                    <span className="ml-2 text-amber-400">
                      — Grace period ends{" "}
                      {new Date(sub.gracePeriodEndsAt).toLocaleDateString("en-NZ", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                {!sub.cancelAt && currentTier !== "team" && (
                  <button
                    onClick={() => handleUpgrade(TIER_ORDER[currentTierIndex + 1])}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium transition hover:bg-indigo-500"
                  >
                    Upgrade to {getTierLabel(TIER_ORDER[currentTierIndex + 1]) ?? "Next"}
                  </button>
                )}
                {sub.cancelAt && (
                  <button
                    onClick={handleReactivate}
                    className="rounded-md border border-indigo-500/40 px-4 py-2 text-sm font-medium text-indigo-400 transition hover:bg-indigo-500/10"
                  >
                    Reactivate
                  </button>
                )}
              </div>
            </div>

            {/* Connection */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4">
              <h2 className="mb-3 text-sm font-medium tracking-wider text-zinc-500 uppercase">
                Connection
              </h2>

              {mcpEndpoint && (
                <div className="space-y-3">
                  {/* MCP Endpoint */}
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">MCP Endpoint</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 font-mono text-sm text-indigo-400">
                        {mcpEndpoint}
                      </code>
                      <CopyButton text={mcpEndpoint} label="Copy URL" />
                    </div>
                  </div>

                  {/* Claude Desktop Config */}
                  {mcpConfig && (
                    <div
                      className={rotationActive ? "pointer-events-none opacity-40 select-none" : ""}
                    >
                      <label className="mb-1 block text-xs text-zinc-500">
                        Claude Desktop / Cowork Config
                        {rotationActive && (
                          <span className="ml-2 text-amber-500/70">🔒 updating after rotation</span>
                        )}
                      </label>
                      <div className="relative">
                        <pre className="overflow-x-auto rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-300">
                          {mcpConfig}
                        </pre>
                        <div className="absolute top-2 right-2">
                          <CopyButton text={mcpConfig} label="Copy" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {sub.status === "provisioning" && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-400">
                    Setting up your{" "}
                    {sub.hostingModel === "dedicated"
                      ? "dedicated server and memory substrate"
                      : "memory substrate"}
                    ...
                  </p>
                  <ProvisioningSteps
                    hostingModel={sub.hostingModel}
                    provisioning={sub.provisioning}
                    status={sub.status}
                  />
                </div>
              )}
            </div>

            {/* Usage */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4">
              <h2 className="mb-3 text-sm font-medium tracking-wider text-zinc-500 uppercase">
                Usage
              </h2>
              <div className="space-y-3">
                <UsageBar
                  label="Atoms stored"
                  current={sub.atomCount}
                  max={sub.maxAtoms}
                  unit="atoms"
                />
                <UsageBar
                  label="Bootstraps this month"
                  current={sub.bootstrapCountMonth}
                  max={sub.maxBootstrapsMonth}
                  unit="calls"
                />
                <UsageBar
                  label="Storage"
                  current={sub.storageUsedMB}
                  max={sub.maxStorageMB}
                  unit="MB"
                />
              </div>
            </div>

            {/* API Key */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium tracking-wider text-zinc-500 uppercase">
                  API Key
                </h2>
                {/* Rotate Key button — only when running and rotation is idle */}
                {sub.status === "running" &&
                  rotationStatus === "none" &&
                  !newApiKey &&
                  !liveSubstrate?.keyUnclaimed && (
                    <button
                      onClick={() => setRotationConfirmOpen(true)}
                      className="rounded-md border border-amber-700/40 px-3 py-1 text-xs text-amber-400 transition hover:border-amber-600 hover:bg-amber-900/20"
                    >
                      Rotate Key ↻
                    </button>
                  )}
                {/* Spinner button while active */}
                {rotationActive && (
                  <div className="flex items-center gap-1.5 rounded-md border border-amber-700/30 bg-amber-950/30 px-3 py-1 text-xs text-amber-400">
                    <svg
                      className="h-3 w-3 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Rotating…
                  </div>
                )}
              </div>

              {/* Rotation confirm dialog */}
              {rotationConfirmOpen && (
                <div className="mb-4 space-y-3 rounded-lg border border-amber-700/40 bg-amber-950/30 p-4">
                  <h3 className="text-sm font-medium text-amber-300">Rotate API Key?</h3>
                  <p className="text-xs leading-relaxed text-zinc-400">
                    This will restart your containers (~15 seconds). Your MCP clients will
                    disconnect and reconnect automatically. Your current key will be invalidated
                    once the new key is confirmed healthy.
                  </p>
                  <p className="text-xs text-amber-400/80">
                    You will be shown the new key once — save it before closing.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setRotationConfirmOpen(false)}
                      className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-500"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={startRotation}
                      disabled={rotationStarting}
                      className="rounded-md border border-amber-600/50 bg-amber-900/30 px-3 py-1.5 text-xs text-amber-300 transition hover:border-amber-500 hover:bg-amber-900/50 disabled:opacity-50"
                    >
                      {rotationStarting ? "Starting…" : "Rotate Key ↻"}
                    </button>
                  </div>
                </div>
              )}

              {/* Rate limit message */}
              {rotationRateLimitMsg && (
                <div className="mb-3 rounded-md border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-400">
                  {rotationRateLimitMsg}
                </div>
              )}

              {/* Active rotation stepper */}
              {rotationStatus !== "none" && rotationStatus !== "complete" && (
                <div className="mb-3">
                  <RotationStepper
                    status={rotationStatus}
                    errorMessage={rotationError}
                    onRetry={rotationStatus === "failed" ? startRotation : undefined}
                    retryDisabled={!!rotationRateLimitMsg}
                    retryDisabledMessage={rotationRateLimitMsg ?? undefined}
                  />
                  {rotationStatus === "failed" && (
                    <button
                      onClick={resetRotation}
                      className="mt-2 text-xs text-zinc-500 underline hover:text-zinc-400"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              )}

              {/* Key reveal section (first provision or post-rotation claim) */}
              {newApiKey ? (
                <div className="space-y-3">
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                    ⚠ <strong>Save this key now.</strong> It will not be shown again. If you lose
                    it, use <em>Rotate Key</em> to generate a new one.
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 font-mono text-sm text-emerald-400">
                      {newApiKey}
                    </code>
                    <CopyButton text={newApiKey} label="Copy" />
                  </div>
                  {/* Pre-filled MCP config with new key */}
                  {mcpEndpoint && (
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="text-xs text-zinc-500">Updated MCP Config</label>
                        <CopyButton
                          text={JSON.stringify(
                            {
                              mcpServers: {
                                "parametric-memory": {
                                  command: "npx",
                                  args: [
                                    "-y",
                                    "mcp-remote",
                                    mcpEndpoint,
                                    "--header",
                                    `Authorization: Bearer ${newApiKey}`,
                                  ],
                                },
                              },
                            },
                            null,
                            2,
                          )}
                          label="Copy config"
                        />
                      </div>
                      <pre className="overflow-x-auto rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-300">
                        {JSON.stringify(
                          {
                            mcpServers: {
                              "parametric-memory": {
                                command: "npx",
                                args: [
                                  "-y",
                                  "mcp-remote",
                                  mcpEndpoint,
                                  "--header",
                                  `Authorization: Bearer ${newApiKey}`,
                                ],
                              },
                            },
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </div>
                  )}
                  {/* Update instructions accordion */}
                  <UpdateInstructions />
                </div>
              ) : liveSubstrate?.keyUnclaimed || claimKeyOpen ? (
                <div className="space-y-2">
                  <p className="text-sm text-zinc-400">
                    {claimKeyOpen
                      ? "Your new key is ready. This is a one-time action — save it immediately."
                      : "Your API key is ready to be revealed. This is a one-time action — save it immediately."}
                  </p>
                  <button
                    onClick={async () => {
                      setRevealingKey(true);
                      try {
                        const res = await fetch("/api/my-substrate/claim-key", { method: "POST" });
                        if (res.ok) {
                          const data = await res.json();
                          setNewApiKey(data.apiKey);
                          setClaimKeyOpen(false);
                          // Refresh substrate so config block shows new key prefix
                          pollSubstrate();
                        }
                      } finally {
                        setRevealingKey(false);
                      }
                    }}
                    disabled={revealingKey}
                    className="rounded-md border border-emerald-700/50 bg-emerald-900/20 px-4 py-2 text-sm text-emerald-400 transition hover:border-emerald-600 hover:bg-emerald-900/40 disabled:opacity-50"
                  >
                    {revealingKey ? "Revealing…" : "Reveal API Key"}
                  </button>
                </div>
              ) : rotationStatus === "none" ? (
                <p className="text-sm text-zinc-400">
                  Your API key was shown when you first claimed your substrate. It is included in
                  the config block above.{" "}
                  {sub.status === "running" ? (
                    <>
                      Use <span className="text-amber-400">Rotate Key ↻</span> above to generate a
                      new one.
                    </>
                  ) : (
                    <>Contact support if you need to rotate your key.</>
                  )}
                </p>
              ) : null}
            </div>

            {/* Cancel / Danger zone */}
            {!sub.cancelAt && (
              <div className="rounded-xl border border-red-900/30 bg-red-950/20 px-5 py-4">
                <h2 className="mb-2 text-sm font-medium tracking-wider text-red-400/80 uppercase">
                  Danger Zone
                </h2>

                {currentTier === "free" ? (
                  /* Free tier — deprovision (no Stripe subscription to cancel) */
                  <div className="space-y-3">
                    <p className="text-sm text-zinc-400">
                      Permanently destroy this substrate. All memory data and keys will be deleted
                      immediately. This cannot be undone.
                    </p>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        placeholder='Type "destroy" to confirm'
                        value={destroyConfirmText}
                        onChange={(e) => setDestroyConfirmText(e.target.value)}
                        className="w-52 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:border-red-800 focus:outline-none"
                      />
                      <button
                        onClick={handleDestroy}
                        disabled={destroyConfirmText !== "destroy" || destroying}
                        className="shrink-0 rounded-md bg-red-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {destroying ? "Destroying…" : "Destroy Substrate"}
                      </button>
                    </div>
                  </div>
                ) : !cancelConfirm ? (
                  /* Paid tier — cancel subscription */
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-zinc-400">
                      Cancel your subscription. You keep access until the end of your billing
                      period. Data is preserved for 30 days in read-only mode after that.
                    </p>
                    <button
                      onClick={() => setCancelConfirm(true)}
                      className="ml-4 shrink-0 rounded-md border border-red-800/50 px-3 py-1.5 text-sm text-red-400 transition hover:border-red-700 hover:bg-red-950/30"
                    >
                      Cancel Subscription
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-red-300">
                      Are you sure? Your subscription will end at the close of the current billing
                      period. After that, your substrate becomes read-only and data is deleted after
                      30 days.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleCancel}
                        disabled={cancelling}
                        className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
                      >
                        {cancelling ? "Scheduling..." : "Yes, Cancel at Period End"}
                      </button>
                      <button
                        onClick={() => setCancelConfirm(false)}
                        className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500"
                      >
                        Keep Subscription
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Past substrates — always shown when history is available */}
        {(liveSubstrate?.history ?? []).length > 0 && (
          <div className="mt-6 space-y-2">
            <h2 className="text-sm font-medium tracking-wide text-zinc-500 uppercase">
              Past instances
            </h2>
            {(liveSubstrate?.history ?? []).map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-zinc-300">{h.slug}</span>
                  <StatusBadge status={h.status} />
                  <span className="text-xs text-zinc-500 capitalize">{h.tier}</span>
                </div>
                <span className="text-xs text-zinc-600">
                  {h.provisionedAt
                    ? `Provisioned ${new Date(h.provisionedAt).toLocaleDateString("en-NZ", { month: "short", day: "numeric", year: "numeric" })}`
                    : `Created ${new Date(h.createdAt).toLocaleDateString("en-NZ", { month: "short", day: "numeric", year: "numeric" })}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Upgrade consent modal ─────────────────────────────────────────────── */}
      {upgradeConsentTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d1117] p-6 shadow-2xl">
            <h2 className="mb-1 font-semibold text-white">
              Upgrade to{" "}
              {getTierLabel(upgradeConsentTier as import("@/config/tiers").TierId) ??
                upgradeConsentTier}
            </h2>
            <p className="mb-5 text-sm text-white/50">
              You&apos;ll be redirected to Stripe to complete your subscription.
            </p>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3.5 transition-colors hover:border-white/20">
              <input
                type="checkbox"
                checked={upgradeConsentChecked}
                onChange={(e) => setUpgradeConsentChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer rounded border-white/20 bg-white/5 accent-indigo-500"
              />
              <span className="text-xs leading-relaxed text-white/50">
                I agree to the{" "}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/70 underline underline-offset-2 hover:text-white"
                >
                  Terms of Service
                </a>{" "}
                and{" "}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/70 underline underline-offset-2 hover:text-white"
                >
                  Privacy Policy
                </a>
                , including recurring billing terms.
              </span>
            </label>

            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setUpgradeConsentTier(null)}
                className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/60 transition-colors hover:border-white/20 hover:text-white/80"
              >
                Cancel
              </button>
              <button
                onClick={confirmUpgradeCheckout}
                disabled={!upgradeConsentChecked}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Continue to payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
