"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getTierLabel } from "@/config/tiers";
import { SudoChallenge } from "@/components/ui/SudoChallenge";

interface AccountInfo {
  id: string;
  email: string;
  name?: string | null;
  tier: string | null;
  status: string;
  balanceCents: number;
  createdAt: string;
}

interface InstanceInfo {
  id: string;
  dropletSize: string;
  region: string;
  state: "provisioning" | "traefik_pending" | "running" | "paused" | "destroying" | "destroyed";
  subdomain: string | null;
  traefikStatus: "pending" | "registered" | "failed" | null;
  mcpEndpointUrl: string | null;
  endpointUrl: string | null;
  startedAt: string | null;
  createdAt: string;
}

interface InstanceDetail extends InstanceInfo {
  healthStatus: "healthy" | "unhealthy" | "unknown";
  masterKey?: string;
  vizKey?: string;
}

// TIER_LABELS and TIER_PRICES are imported from @/config/tiers (canonical registry)

function formatBalance(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    suspended: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    closed: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colours[status] ?? "border-white/20 bg-white/10 text-white/50"}`}
    >
      {status}
    </span>
  );
}

export default function AdminClient({
  account,
  totpEnrolled = false,
}: {
  account: AccountInfo;
  totpEnrolled?: boolean;
}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [totpNudgeDismissed, setTotpNudgeDismissed] = useState(false);
  const showTotpNudge = !totpEnrolled && !totpNudgeDismissed;

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  }

  const hasTier = Boolean(account.tier);

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-0 right-1/4 h-[500px] w-[800px] rounded-full bg-indigo-600/5 blur-[160px]" />
      </div>

      <header className="relative border-b border-white/5 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link
            href="/"
            className="font-[family-name:var(--font-syne)] font-semibold text-white/60 transition-colors hover:text-white"
          >
            Parametric Memory
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/40">{account.email}</span>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-indigo-400 transition-colors hover:text-indigo-300"
            >
              My Substrate →
            </Link>
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
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="mb-1 font-[family-name:var(--font-syne)] text-2xl font-bold">Instances</h1>
          <p className="text-sm text-white/40">Your dedicated Parametric Memory droplets</p>
        </div>

        {/* ── 2FA nudge banner ── */}
        {showTotpNudge && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
                <svg
                  className="h-5 w-5 text-amber-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-white/90">
                  Secure your account with two-factor authentication
                </p>
                <p className="mt-0.5 text-xs text-white/40">
                  Add an authenticator app as a second step when signing in.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/admin/security"
                className="shrink-0 rounded-lg bg-amber-600/80 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-amber-500"
              >
                Set up 2FA
              </Link>
              <button
                onClick={() => setTotpNudgeDismissed(true)}
                className="shrink-0 rounded-lg p-2 text-white/30 transition-colors hover:bg-white/5 hover:text-white/60"
                aria-label="Dismiss"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <p className="mb-1 text-xs tracking-wider text-white/40 uppercase">Account</p>
            <p className="truncate text-sm text-white/80">{account.email}</p>
            <div className="mt-2">
              <StatusBadge status={account.status} />
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <p className="mb-1 text-xs tracking-wider text-white/40 uppercase">Plan</p>
            <p className="text-sm text-white/80">
              {hasTier ? getTierLabel(account.tier) : "No active plan"}
            </p>
            {!hasTier && (
              <Link
                href="/pricing"
                className="mt-2 inline-flex items-center text-xs text-indigo-400 transition-colors hover:text-indigo-300"
              >
                Get started →
              </Link>
            )}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <p className="mb-1 text-xs tracking-wider text-white/40 uppercase">Balance</p>
            <p className="text-sm text-white/80">{formatBalance(account.balanceCents)}</p>
            {account.balanceCents < 500 && hasTier && (
              <p className="mt-1 text-xs text-amber-400">Low balance</p>
            )}
          </div>
        </div>

        {hasTier ? (
          <InstanceSection accountId={account.id} totpEnrolled={totpEnrolled} />
        ) : (
          <NoPlanBanner />
        )}
      </main>
    </div>
  );
}

/* ── No-plan CTA ─────────────────────────────────────────────────────────── */
function NoPlanBanner() {
  return (
    <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/20">
        <svg
          className="h-6 w-6 text-indigo-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M5 12h14M12 5l7 7-7 7"
          />
        </svg>
      </div>
      <h2 className="mb-2 font-[family-name:var(--font-syne)] text-lg font-semibold">
        No active instance
      </h2>
      <p className="mx-auto mb-5 max-w-sm text-sm text-white/50">
        Purchase a plan to get your dedicated Parametric Memory instance with your own MCP endpoint.
      </p>
      <Link
        href="/pricing"
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
      >
        View plans
      </Link>
    </div>
  );
}

/* ── Instance section ────────────────────────────────────────────────────── */
function InstanceSection({
  accountId,
  totpEnrolled,
}: {
  accountId: string;
  totpEnrolled: boolean;
}) {
  const [instances, setInstances] = useState<InstanceInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchInstances = useCallback(async () => {
    try {
      const res = await fetch(`/api/compute/instances`);
      if (!res.ok) throw new Error("Failed to load instances");
      const data = (await res.json()) as { instances: InstanceInfo[] };
      setInstances(data.instances);
    } catch {
      setError("Could not load instance data. Please refresh.");
    }
  }, []);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  // Poll: fast (5s) during transitional states, slow (30s) for running instances
  useEffect(() => {
    const transitional = instances?.some(
      (i) =>
        i.state === "provisioning" || i.state === "traefik_pending" || i.state === "destroying",
    );
    const hasLive = instances?.some((i) => i.state === "running" || i.state === "paused");

    if (!transitional && !hasLive) return;

    const interval = transitional ? 5_000 : 30_000;
    const timer = setInterval(fetchInstances, interval);
    return () => clearInterval(timer);
  }, [instances, fetchInstances]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (instances === null) {
    return (
      <div className="space-y-4">
        <h2 className="font-[family-name:var(--font-syne)] text-base font-semibold text-white/80">
          Your instance
        </h2>
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-6">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-indigo-400" />
          <span className="text-sm text-white/50">Loading…</span>
        </div>
      </div>
    );
  }

  if (instances.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="font-[family-name:var(--font-syne)] text-base font-semibold text-white/80">
          Your instance
        </h2>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 text-center">
          <p className="text-sm text-white/60">
            No instance found. Your provisioning may still be queued.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-[family-name:var(--font-syne)] text-base font-semibold text-white/80">
        Your instance
      </h2>
      {instances.map((instance) => (
        <InstanceCard
          key={instance.id}
          instance={instance}
          accountId={accountId}
          totpEnrolled={totpEnrolled}
        />
      ))}
    </div>
  );
}

/* ── Individual instance card ────────────────────────────────────────────── */
function InstanceCard({
  instance,
  totpEnrolled,
}: {
  instance: InstanceInfo;
  accountId: string;
  totpEnrolled: boolean;
}) {
  const [detail, setDetail] = useState<InstanceDetail | null>(null);
  const [keysCopied, setKeysCopied] = useState<Record<string, boolean>>({});
  const [showDestroy, setShowDestroy] = useState(false);

  const fetchDetail = useCallback(async () => {
    const res = await fetch(`/api/compute/instances/${instance.id}`);
    if (!res.ok) return;
    const data = (await res.json()) as InstanceDetail & {
      instance: InstanceInfo;
      healthStatus: string;
    };
    setDetail({
      ...data.instance,
      healthStatus: data.healthStatus as InstanceDetail["healthStatus"],
      masterKey: data.masterKey,
      vizKey: data.vizKey,
    });
  }, [instance.id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Poll: fast (5s) during transitions, slow (30s) for running/paused
  useEffect(() => {
    const live = detail ?? instance;
    const transitional =
      live.state === "provisioning" ||
      live.state === "traefik_pending" ||
      live.state === "destroying";
    const isLive = live.state === "running" || live.state === "paused";

    if (!transitional && !isLive) return;

    const interval = transitional ? 5_000 : 30_000;
    const timer = setInterval(fetchDetail, interval);
    return () => clearInterval(timer);
  }, [detail, instance, fetchDetail]);

  async function copyKey(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setKeysCopied((prev) => ({ ...prev, [label]: true }));
    setTimeout(() => setKeysCopied((prev) => ({ ...prev, [label]: false })), 2000);
  }

  const live = detail ?? instance;
  const stateColours: Record<string, string> = {
    provisioning: "bg-amber-400 animate-pulse",
    traefik_pending: "bg-indigo-400 animate-pulse",
    running: "bg-emerald-400 shadow-[0_0_6px_2px] shadow-emerald-400/40",
    paused: "bg-slate-400",
    destroying: "bg-red-400",
    destroyed: "bg-red-600",
  };

  const stateLabel: Record<string, string> = {
    provisioning: "Provisioning",
    traefik_pending: "Setting up SSL",
    running: "Running",
    paused: "Paused",
    destroying: "Destroying",
    destroyed: "Destroyed",
  };

  const [urlCopied, setUrlCopied] = useState(false);
  const [configCopied, setConfigCopied] = useState(false);

  async function copyMcpUrl(url: string) {
    await navigator.clipboard.writeText(url);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  }

  async function copyDesktopConfig(url: string) {
    const json = JSON.stringify({ mcpServers: { memory: { url } } }, null, 2);
    await navigator.clipboard.writeText(json);
    setConfigCopied(true);
    setTimeout(() => setConfigCopied(false), 2000);
  }

  return (
    <div className="space-y-5 rounded-xl border border-white/10 bg-white/[0.03] p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${stateColours[live.state] ?? "bg-white/30"}`}
          />
          <div>
            {live.subdomain ? (
              <span className="font-mono text-sm font-medium text-white/90">{live.subdomain}</span>
            ) : (
              <span className="text-sm font-medium text-white/80 capitalize">
                {stateLabel[live.state] ?? live.state}
              </span>
            )}
            {live.subdomain && (
              <span className="ml-2 text-xs text-white/30 capitalize">
                · {stateLabel[live.state] ?? live.state}
              </span>
            )}
          </div>
          {live.state === "running" && detail?.healthStatus && (
            <span
              className={`rounded-full border px-2 py-0.5 text-xs ${
                detail.healthStatus === "healthy"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                  : detail.healthStatus === "unhealthy"
                    ? "border-red-500/20 bg-red-500/10 text-red-400"
                    : "border-white/10 bg-white/5 text-white/30"
              }`}
            >
              {detail.healthStatus}
            </span>
          )}
          {/* SSL status badge — hide when destroyed */}
          {live.state !== "destroyed" && live.traefikStatus === "registered" && (
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
              SSL ●
            </span>
          )}
          {live.state !== "destroyed" && live.traefikStatus === "failed" && (
            <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
              SSL failed
            </span>
          )}
        </div>
        <span className="font-mono text-xs text-white/30">
          {live.dropletSize} · {live.region}
        </span>
      </div>

      {/* Provisioning progress */}
      {live.state === "provisioning" && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/15 bg-amber-500/5 px-4 py-3 text-xs text-amber-300/70">
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-amber-400/20 border-t-amber-400/60" />
          Your droplet is being created — typically 2–3 minutes. This page updates automatically.
        </div>
      )}

      {/* SSL setup in progress */}
      {live.state === "traefik_pending" && (
        <div className="flex items-center gap-3 rounded-lg border border-indigo-500/15 bg-indigo-500/5 px-4 py-3 text-xs text-indigo-300/70">
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-indigo-400/20 border-t-indigo-400/60" />
          Droplet is ready — issuing your SSL certificate. Usually takes 30–60 seconds.
        </div>
      )}

      {/* Destroyed tombstone — shown instead of MCP panel */}
      {live.state === "destroyed" && (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-4 text-center">
          <p className="text-sm text-white/30">
            This instance has been destroyed. All data and keys are permanently deleted.
          </p>
          <Link
            href="/pricing"
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-indigo-400/70 transition-colors hover:text-indigo-400"
          >
            Launch a new instance →
          </Link>
        </div>
      )}

      {/* MCP Connection panel — the main event (hidden when destroyed) */}
      {live.state !== "destroyed" &&
        (live.mcpEndpointUrl ? (
          <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/[0.06] p-4">
            <p className="mb-3 text-xs font-semibold tracking-wider text-indigo-300/80 uppercase">
              MCP Connection URL
            </p>

            {/* URL + copy */}
            <div className="mb-4 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-indigo-500/25 bg-black/30 px-3 py-2 font-mono text-sm text-indigo-200">
                {live.mcpEndpointUrl}
              </code>
              <button
                onClick={() => copyMcpUrl(live.mcpEndpointUrl!)}
                className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
              >
                {urlCopied ? "Copied!" : "Copy"}
              </button>
            </div>

            {/* Claude Desktop config */}
            <p className="mb-2 text-xs text-white/40">
              Add to Claude Desktop{" "}
              <code className="text-white/30">claude_desktop_config.json</code>:
            </p>
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs leading-relaxed text-white/50">
                {`{
  "mcpServers": {
    "memory": {
      "url": "${live.mcpEndpointUrl}"
    }
  }
}`}
              </pre>
              <button
                onClick={() => copyDesktopConfig(live.mcpEndpointUrl!)}
                className="absolute top-2 right-2 rounded bg-white/10 px-2 py-1 text-xs text-white/50 transition-colors hover:bg-white/20 hover:text-white/80"
              >
                {configCopied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        ) : live.traefikStatus === "failed" ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-400/80">
            SSL certificate setup failed. Contact support with your instance ID:{" "}
            <code className="font-mono text-red-300/70">{live.id}</code>
          </div>
        ) : null)}

      {/* One-time key reveal */}
      {(detail?.masterKey || detail?.vizKey) && (
        <div className="space-y-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-4">
          <p className="text-xs font-medium text-indigo-300">
            Your API keys — copy these now. They will not be shown again.
          </p>
          {detail.masterKey && (
            <KeyReveal
              label="Master key"
              value={detail.masterKey}
              copied={keysCopied["master"]}
              onCopy={() => copyKey("master", detail.masterKey!)}
            />
          )}
          {detail.vizKey && (
            <KeyReveal
              label="Visualise key (read-only)"
              value={detail.vizKey}
              copied={keysCopied["viz"]}
              onCopy={() => copyKey("viz", detail.vizKey!)}
            />
          )}
        </div>
      )}

      {/* Danger zone — only show for active instances */}
      {live.state !== "destroyed" && live.state !== "destroying" && (
        <div className="border-t border-white/5 pt-4">
          <p className="mb-3 text-xs tracking-wider text-white/30 uppercase">Danger zone</p>
          <button
            onClick={() => setShowDestroy(true)}
            className="rounded-lg border border-red-500/20 px-4 py-2 text-sm text-red-400/70 transition-colors hover:border-red-500/40 hover:text-red-400"
          >
            Destroy instance
          </button>
        </div>
      )}

      {live.state === "destroying" && (
        <div className="flex items-center gap-2 border-t border-white/5 pt-4 text-sm text-red-400/60">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-400/20 border-t-red-400/60" />
          Destroying…
        </div>
      )}

      {/* Destroy modal */}
      {showDestroy && (
        <DestroyModal
          instanceId={instance.id}
          totpEnrolled={totpEnrolled}
          onClose={() => setShowDestroy(false)}
          onDestroyed={() => {
            // Stay on /admin — close the modal and re-fetch so the card flips to
            // "destroying" state immediately. The existing 5s poll takes it from there.
            setShowDestroy(false);
            fetchDetail();
          }}
        />
      )}
    </div>
  );
}

/* ── Destroy modal ───────────────────────────────────────────────────────── */
function DestroyModal({
  instanceId,
  totpEnrolled,
  onClose,
  onDestroyed,
}: {
  instanceId: string;
  totpEnrolled: boolean;
  onClose: () => void;
  onDestroyed: () => void;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Step 1: type "destroy". Step 2: TOTP sudo challenge (only if enrolled).
  const [step, setStep] = useState<"confirm" | "sudo">("confirm");
  const confirmed = input === "destroy";

  async function executeDestroy(sudoToken?: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/compute/instances/${instanceId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sudoToken ? { sudoToken } : {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to destroy instance. Please try again.");
        // If sudo token is invalid/expired, go back to sudo step
        if (data.error === "sudo_token_invalid" && totpEnrolled) {
          setStep("sudo");
        }
        return;
      }
      onDestroyed();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleConfirmStep() {
    if (!confirmed) return;
    if (totpEnrolled) {
      setStep("sudo");
      setError(null);
    } else {
      executeDestroy();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-2xl border border-red-500/30 bg-[#0d0d14] p-6 shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/15">
            <svg
              className="h-5 w-5 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-syne)] text-base font-semibold text-white">
              Destroy instance
            </h2>
            <p className="mt-1 text-sm text-white/50">
              This will permanently delete your droplet and all data on it. Your API keys will stop
              working immediately. <strong className="text-white/70">This cannot be undone.</strong>
            </p>
          </div>
        </div>

        {step === "confirm" && (
          <>
            <div className="mb-4">
              <label className="mb-1.5 block text-xs text-white/50">
                Type <span className="font-mono text-red-400">destroy</span> to confirm
              </label>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmed && handleConfirmStep()}
                placeholder="destroy"
                autoFocus
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-sm text-white placeholder-white/20 transition-colors focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 focus:outline-none"
              />
            </div>

            {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 rounded-lg border border-white/10 py-2 text-sm text-white/50 transition-colors hover:border-white/20 hover:text-white/80 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmStep}
                disabled={!confirmed || loading}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-30"
              >
                {loading ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Destroying…
                  </>
                ) : totpEnrolled ? (
                  "Continue →"
                ) : (
                  "Destroy instance"
                )}
              </button>
            </div>
          </>
        )}

        {step === "sudo" && (
          <>
            {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
            <SudoChallenge
              action="destroy_instance"
              title="Verify identity to destroy instance"
              onSuccess={({ sudoToken }) => executeDestroy(sudoToken)}
              onCancel={() => {
                setStep("confirm");
                setError(null);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ── Key reveal row ──────────────────────────────────────────────────────── */
function KeyReveal({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied?: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-white/40">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded border border-white/10 bg-white/5 px-2 py-1.5 font-mono text-xs text-white/70">
          {value}
        </code>
        <button
          onClick={onCopy}
          className="shrink-0 rounded bg-indigo-600/80 px-2.5 py-1.5 text-xs text-white transition-colors hover:bg-indigo-500"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
