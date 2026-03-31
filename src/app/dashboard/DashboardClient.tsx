"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { TIER_ORDER, getTierLabel, getTierPrice } from "@/config/tiers";

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
  };
  const labels: Record<string, string> = {
    running: "Running",
    provisioning: "Provisioning...",
    read_only: "Read Only",
    suspended: "Suspended",
    deprovisioned: "Deprovisioned",
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
  const barColor = isOverage
    ? "bg-red-500"
    : percent > 80
      ? "bg-amber-500"
      : "bg-indigo-500";

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
      {isUnlimited && (
        <div className="text-xs text-zinc-500">Unlimited</div>
      )}
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
          <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
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
    state:
      i < currentIndex ? "done" : i === currentIndex ? "active" : "pending",
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
  const steps = getProvisioningSteps(
    hostingModel,
    provisioning?.phase ?? null,
    status,
  );

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
              <span className="font-mono text-xs text-zinc-500">
                {provisioning.dropletIp}
              </span>
            )}
        </div>
      ))}
    </div>
  );
}

// ── Health Indicators ───────────────────────────────────────────────────────

function HealthBadge({
  ok,
  label,
}: {
  ok: boolean | null;
  label: string;
}) {
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
          ok === true
            ? "bg-emerald-400"
            : ok === false
              ? "bg-red-400"
              : "bg-zinc-500"
        }`}
      />
      {label}
    </span>
  );
}

function HealthBadges({ health }: { health: HealthInfo }) {
  return (
    <>
      {health.droplet && (
        <HealthBadge ok={health.droplet.sshReady} label="Droplet" />
      )}
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
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Check for checkout success/cancel query param
  const checkoutStatus = searchParams.get("checkout");

  // Poll for provisioning status
  const [liveSubstrate, setLiveSubstrate] = useState(substrate);
  const isProvisioning = liveSubstrate?.status === "provisioning";

  // True when user just came back from Stripe checkout and the webhook may not have fired yet
  const [awaitingWebhook, setAwaitingWebhook] = useState(checkoutStatus === "success");

  const pollSubstrate = useCallback(async () => {
    try {
      const res = await fetch("/api/my-substrate");
      if (res.ok) {
        const data = await res.json();
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

  async function handleUpgrade(tier: string) {
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

  const currentTier = liveSubstrate?.tier ?? account.tier ?? "free";
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

      <div className="relative mx-auto max-w-5xl px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Memory Substrate
            </h1>
            <p className="mt-1 text-sm text-zinc-400">{account.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/docs"
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              Docs
            </Link>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:opacity-50"
            >
              {loggingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>

        {/* Post-checkout provisioning banner — shown while waiting for Stripe webhook */}
        {awaitingWebhook && (
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-300">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-indigo-400/30 border-t-indigo-400" />
            Payment received — activating your substrate…
          </div>
        )}

        {/* No substrate yet — show provisioning progress or empty state */}
        {!sub && (
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

        {sub && (
          <div className="space-y-3">
            {/* Tier + Status row */}
            <div className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-lg font-semibold">
                    {getTierLabel(currentTier)} Plan
                  </span>
                  <StatusBadge status={sub.status} />
                  {sub.status === "running" && sub.health && (
                    <HealthBadges health={sub.health} />
                  )}
                  {sub.cancelAt && (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                      Cancels {new Date(sub.cancelAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
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
                      {new Date(sub.gracePeriodEndsAt).toLocaleDateString()}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                {!sub.cancelAt && currentTier !== "team" && (
                  <button
                    onClick={() =>
                      handleUpgrade(TIER_ORDER[currentTierIndex + 1])
                    }
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium transition hover:bg-indigo-500"
                  >
                    Upgrade to{" "}
                    {getTierLabel(TIER_ORDER[currentTierIndex + 1]) ?? "Next"}
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
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
                Connection
              </h2>

              {mcpEndpoint && (
                <div className="space-y-3">
                  {/* MCP Endpoint */}
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
                      MCP Endpoint
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 font-mono text-sm text-indigo-400">
                        {mcpEndpoint}
                      </code>
                      <CopyButton text={mcpEndpoint} label="Copy URL" />
                    </div>
                  </div>

                  {/* Claude Desktop Config */}
                  {mcpConfig && (
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">
                        Claude Desktop / Cowork Config
                      </label>
                      <div className="relative">
                        <pre className="overflow-x-auto rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-300">
                          {mcpConfig}
                        </pre>
                        <div className="absolute right-2 top-2">
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
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
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
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
                API Key
              </h2>

              {newApiKey ? (
                <div className="space-y-2">
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                    Save this key and the config block above now — they won&apos;t be shown again.
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 font-mono text-sm text-emerald-400">
                      {newApiKey}
                    </code>
                    <CopyButton text={newApiKey} label="Copy" />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-400">
                  Your API key was shown when you first claimed your substrate.
                  It is included in the config block above when visible.
                  Contact support if you need to rotate your key.
                </p>
              )}
            </div>

            {/* Cancel / Danger zone */}
            {currentTier !== "free" && !sub.cancelAt && (
              <div className="rounded-xl border border-red-900/30 bg-red-950/20 px-5 py-4">
                <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-red-400/80">
                  Danger Zone
                </h2>
                {!cancelConfirm ? (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-zinc-400">
                      Cancel your subscription. You keep access until the end of your billing period.
                      Data is preserved for 30 days in read-only mode after that.
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
      </div>
    </div>
  );
}
