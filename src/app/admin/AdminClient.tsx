"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getTierLabel } from "@/config/tiers";
import { RotationStepper, type RotationStatus } from "@/components/ui/RotationStepper";
import { UpdateInstructions } from "@/components/ui/UpdateInstructions";

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
  keyUnclaimed: boolean;
}

interface AdminBillingStatus {
  tier: string;
  status: string;
  renewalDate: string | null;
}

interface AdminClientProps {
  account: AccountInfo;
  slug: string;
  initialSubstrate: SubstrateInfo | null;
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    running: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    provisioning: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    read_only: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    suspended: "bg-red-500/20 text-red-400 border-red-500/30",
    deprovisioned: "bg-slate-500/20 text-slate-400 border-slate-500/30",
    destroyed: "bg-red-600/20 text-red-500 border-red-600/30",
    provision_failed: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colours[status] ?? "border-white/20 bg-white/10 text-white/50"}`}
    >
      {status}
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
  current: number | null | undefined;
  max: number | null | undefined;
  unit: string;
}) {
  const safeCurrentVal = current ?? 0;
  const safeMaxVal = max ?? 0;
  const percentage =
    safeMaxVal === -1 ? 0 : safeMaxVal === 0 ? 0 : (safeCurrentVal / safeMaxVal) * 100;
  const isOverage = safeMaxVal !== -1 && safeMaxVal > 0 && safeCurrentVal > safeMaxVal;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-white/50">{label}</p>
        <p className="text-xs text-white/70">
          {safeCurrentVal.toLocaleString()} /{" "}
          {safeMaxVal === -1 ? "∞" : safeMaxVal.toLocaleString()} {unit}
        </p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full transition-all ${isOverage ? "bg-red-500/60" : "bg-indigo-500/60"}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      {isOverage && <p className="mt-1 text-xs text-red-400">Overage detected</p>}
    </div>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

export default function AdminClient({ account, slug, initialSubstrate }: AdminClientProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [substrate, setSubstrate] = useState<SubstrateInfo | null>(initialSubstrate);
  const [billingStatus, setBillingStatus] = useState<AdminBillingStatus | null>(null);
  const [rotationStatus, setRotationStatus] = useState<RotationStatus>("none");
  const [keyRotating, setKeyRotating] = useState(false);
  const [showKeyReveal, setShowKeyReveal] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [deprovisionModalOpen, setDeprovisionModalOpen] = useState(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const beforeUnloadRef = useRef<((e: BeforeUnloadEvent) => void) | null>(null);

  // Fetch substrate details
  const fetchSubstrate = useCallback(async () => {
    try {
      const res = await fetch(`/api/substrates/${slug}`);
      if (res.ok) {
        const data = await res.json();
        // Handler returns the substrate object directly (no { substrate: ... } wrapper).
        // Fall back to data.substrate for any cached/proxy response that still wraps.
        setSubstrate(data.substrate ?? data);
      }
    } catch {
      // Silent fail, keep using cached data
    }
  }, [slug]);

  // Fetch billing status
  const fetchBillingStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/billing/status?slug=${slug}`);
      if (res.ok) {
        const data = await res.json();
        setBillingStatus(data);
      }
    } catch {
      // Silent fail
    }
  }, [slug]);

  // Poll substrate during provisioning
  useEffect(() => {
    if (substrate?.status === "provisioning") {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(fetchSubstrate, 5000);
      return () => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      };
    }
  }, [substrate?.status, fetchSubstrate]);

  // Poll rotation status
  useEffect(() => {
    if (keyRotating && rotationStatus !== "complete" && rotationStatus !== "failed") {
      const timer = setInterval(async () => {
        try {
          const res = await fetch(`/api/substrates/${slug}/key-rotation/status`);
          if (res.ok) {
            const data = await res.json();
            setRotationStatus(data.status);
            if (data.status === "complete" || data.status === "failed") {
              setKeyRotating(false);
              if (data.status === "complete") {
                // Refresh substrate so keyUnclaimed flips to true and the
                // "Claim your key" banner appears in the MCP CONNECTION section.
                await fetchSubstrate();
              }
            }
          }
        } catch {
          // Silent fail
        }
      }, 2000);
      return () => clearInterval(timer);
    }
  }, [keyRotating, rotationStatus, slug]);

  // beforeunload guard
  useEffect(() => {
    if (keyRotating || showKeyReveal) {
      beforeUnloadRef.current = (e) => {
        e.preventDefault();
        e.returnValue = "";
      };
      window.addEventListener("beforeunload", beforeUnloadRef.current);
      return () => {
        if (beforeUnloadRef.current) {
          window.removeEventListener("beforeunload", beforeUnloadRef.current);
        }
      };
    }
  }, [keyRotating, showKeyReveal]);

  useEffect(() => {
    fetchBillingStatus();
  }, [fetchBillingStatus]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  }

  async function handleRotateKey() {
    setKeyRotating(true);
    setRotationStatus("pending");
    try {
      const res = await fetch(`/api/substrates/${slug}/rotate-key`, {
        method: "POST",
      });
      if (!res.ok) {
        setRotationStatus("failed");
        setKeyRotating(false);
      }
    } catch {
      setRotationStatus("failed");
      setKeyRotating(false);
    }
  }

  async function handleClaimKey() {
    try {
      const res = await fetch(`/api/substrates/${slug}/claim-key`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.claimed && data.apiKey) {
          setRevealedKey(data.apiKey);
          setShowKeyReveal(true);
          // Refresh substrate so keyUnclaimed flips to false (prevents amber banner reappearing)
          await fetchSubstrate();
        }
      }
    } catch {
      // Error handling
    }
  }

  async function handleCancel() {
    try {
      const res = await fetch(`/api/substrates/${slug}/cancel`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchSubstrate();
        setCancelModalOpen(false);
      }
    } catch {
      // Error handling
    }
  }

  async function handleReactivate() {
    try {
      const res = await fetch(`/api/substrates/${slug}/reactivate`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchSubstrate();
      }
    } catch {
      // Error handling
    }
  }

  async function handleDeprovision() {
    try {
      const res = await fetch(`/api/substrates/${slug}/deprovision`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchSubstrate();
        setDeprovisionModalOpen(false);
      }
    } catch {
      // Error handling
    }
  }

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
            <Link
              href="/dashboard"
              className="text-sm text-indigo-400 transition-colors hover:text-indigo-300"
            >
              ← Back to Dashboard
            </Link>
            <span className="text-sm text-white/40">{account.email}</span>
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
        {/* Substrate header */}
        <div className="mb-8">
          <h1 className="mb-1 font-[family-name:var(--font-syne)] text-2xl font-bold">
            {substrate?.slug || slug}
          </h1>
          <p className="text-sm text-white/40">Substrate administration and management</p>
        </div>

        {/* Status section */}
        {substrate && (
          <div className="mb-8 space-y-5">
            {/* Billing widget */}
            {billingStatus && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs tracking-wider text-white/40 uppercase">Billing</p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {getTierLabel(billingStatus.tier)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      billingStatus.status === "active"
                        ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-400"
                        : billingStatus.status === "trialing"
                          ? "border-indigo-500/30 bg-indigo-500/20 text-indigo-400"
                          : billingStatus.status === "past_due"
                            ? "border-amber-500/30 bg-amber-500/20 text-amber-400"
                            : "border-red-500/30 bg-red-500/20 text-red-400"
                    }`}
                  >
                    {billingStatus.status}
                  </span>
                </div>
                {billingStatus.renewalDate && (
                  <p className="text-sm text-white/60">
                    Renewal: {new Date(billingStatus.renewalDate).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}

            {/* Tier + Status */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs tracking-wider text-white/40 uppercase">Status</p>
                  <div className="mt-2 flex items-center gap-3">
                    <StatusBadge status={substrate.status} />
                    {substrate.cancelAt && (
                      <span className="text-sm text-amber-400">
                        Cancel scheduled for {new Date(substrate.cancelAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {/* Health badges — only rendered when health data is present */}
                  {substrate.health && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {/* SSL */}
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          substrate.health.https.configured
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-zinc-600/50 bg-zinc-800/40 text-zinc-500"
                        }`}
                      >
                        <span>{substrate.health.https.configured ? "●" : "○"}</span>
                        SSL
                      </span>

                      {/* MCP reachable */}
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          substrate.health.substrate.reachable === true
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : substrate.health.substrate.reachable === false
                              ? "border-red-500/30 bg-red-500/10 text-red-400"
                              : "border-zinc-600/50 bg-zinc-800/40 text-zinc-500"
                        }`}
                      >
                        <span>{substrate.health.substrate.reachable === true ? "●" : "○"}</span>
                        MCP
                      </span>

                      {/* SSH */}
                      {substrate.health.droplet && (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            substrate.health.droplet.sshReady
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : "border-zinc-600/50 bg-zinc-800/40 text-zinc-500"
                          }`}
                        >
                          <span>{substrate.health.droplet.sshReady ? "●" : "○"}</span>
                          SSH
                        </span>
                      )}

                      {/* Droplet IP — shown as a dim pill when available */}
                      {substrate.health.droplet?.ip && (
                        <span className="inline-flex items-center rounded-full border border-zinc-700/50 bg-zinc-800/30 px-2.5 py-0.5 font-mono text-xs text-zinc-500">
                          {substrate.health.droplet.ip}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {substrate.status !== "running" && substrate.status !== "destroyed" && (
                    <button
                      onClick={() => router.push("/pricing")}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition-colors hover:bg-indigo-500"
                    >
                      Upgrade
                    </button>
                  )}
                  {substrate.cancelAt && (
                    <button
                      onClick={handleReactivate}
                      className="rounded-lg border border-indigo-500/30 px-4 py-2 text-sm text-indigo-400 transition-colors hover:border-indigo-500/50"
                    >
                      Reactivate
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Provision failed callout */}
            {substrate.status === "provision_failed" && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/15">
                    <svg
                      className="h-4 w-4 text-red-400"
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
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-300">Provisioning failed</p>
                    <p className="mt-1 text-sm text-white/50">
                      Something went wrong while setting up your substrate. Your billing has not
                      been affected. You can deprovision this substrate below and start fresh, or
                      contact support if you need help.
                    </p>
                    <div className="mt-4 flex gap-3">
                      <button
                        onClick={() => setDeprovisionModalOpen(true)}
                        className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 transition-colors hover:border-red-500/50 hover:bg-red-500/10"
                      >
                        Deprovision &amp; start fresh
                      </button>
                      <a
                        href={`mailto:support@parametric-memory.dev?subject=Provision%20failed%3A%20${encodeURIComponent(substrate.slug ?? slug)}`}
                        className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/50 transition-colors hover:border-white/20 hover:text-white/80"
                      >
                        Contact support
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Connection section */}
            {substrate.status === "running" && substrate.mcpEndpoint && (
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/[0.06] p-6">
                <p className="mb-5 text-xs font-semibold tracking-wider text-indigo-300/80 uppercase">
                  MCP Connection
                </p>

                {/* Endpoint URL */}
                <div className="mb-4">
                  <p className="mb-1.5 text-xs text-white/50">Endpoint URL</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded-lg border border-indigo-500/25 bg-black/30 px-3 py-2 font-mono text-sm text-indigo-200">
                      {substrate.mcpEndpoint}
                    </code>
                    <CopyButton text={substrate.mcpEndpoint} />
                  </div>
                </div>

                {/* Claim key banner — high visibility, only when unclaimed and not yet revealed */}
                {substrate.keyUnclaimed && !showKeyReveal && (
                  <div className="mb-4 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-amber-300">⚠ Claim your API key</p>
                        <p className="mt-0.5 text-xs text-amber-400/70">
                          Shown only once — store it somewhere safe before continuing.
                        </p>
                      </div>
                      <button
                        onClick={handleClaimKey}
                        className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
                      >
                        Claim Key →
                      </button>
                    </div>
                  </div>
                )}

                {/* Key revealed — prominent display with one-time warning */}
                {showKeyReveal && revealedKey && (
                  <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] p-4">
                    <p className="mb-2 text-xs font-semibold tracking-wider text-emerald-400 uppercase">
                      🔑 Your API key — copy it now. It will never be shown again.
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate rounded border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-emerald-300">
                        {revealedKey}
                      </code>
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(revealedKey);
                        }}
                        className="shrink-0 rounded bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}

                {/* mcp-remote config block */}
                <div className="mb-5">
                  <p className="mb-2 text-xs text-white/50">
                    Add to Claude Desktop{" "}
                    <code className="text-white/30">claude_desktop_config.json</code>:
                  </p>
                  <div className="relative">
                    <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-xs leading-relaxed text-white/60">
                      {`{
  "mcpServers": {
    "Memory-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${substrate.mcpEndpoint}",
        "--header",
        "Authorization:\${AUTH_HEADER}"
      ],
      "env": {
        "AUTH_HEADER": "${showKeyReveal && revealedKey ? `Bearer ${revealedKey}` : "Bearer ••••••••"}"
      }
    }
  }
}`}
                    </pre>
                    <button
                      onClick={async () => {
                        const authValue =
                          showKeyReveal && revealedKey
                            ? `Bearer ${revealedKey}`
                            : "Bearer YOUR_API_KEY_HERE";
                        const config = {
                          mcpServers: {
                            "Memory-mcp": {
                              command: "npx",
                              args: [
                                "-y",
                                "mcp-remote",
                                substrate.mcpEndpoint,
                                "--header",
                                "Authorization:${AUTH_HEADER}",
                              ],
                              env: { AUTH_HEADER: authValue },
                            },
                          },
                        };
                        await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
                      }}
                      className="absolute top-2 right-2 rounded bg-white/10 px-2 py-1 text-xs text-white/50 transition-colors hover:bg-white/20 hover:text-white/80"
                    >
                      Copy
                    </button>
                  </div>
                  {!showKeyReveal && (
                    <p className="mt-2 text-xs text-white/30">
                      {substrate.keyUnclaimed
                        ? "Claim your key above to populate AUTH_HEADER."
                        : "Rotate your key below to generate a new claimable key."}
                    </p>
                  )}
                </div>

                <UpdateInstructions />
              </div>
            )}

            {/* Provisioning progress */}
            {substrate.status === "provisioning" && substrate.provisioning && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
                <p className="mb-4 text-xs font-semibold tracking-wider text-amber-300/80 uppercase">
                  Provisioning Progress
                </p>
                <div className="space-y-2 text-sm text-white/70">
                  <p>Phase: {substrate.provisioning.phase || "pending"}</p>
                  {substrate.provisioning.dropletIp && (
                    <p>
                      Droplet IP:{" "}
                      <code className="text-white/50">{substrate.provisioning.dropletIp}</code>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Usage section */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <p className="mb-4 text-xs font-semibold tracking-wider text-white/60 uppercase">
                Resource Usage
              </p>
              <div className="space-y-4">
                <UsageBar
                  label="Atoms"
                  current={substrate.atomCount}
                  max={substrate.maxAtoms}
                  unit="atoms"
                />
                <UsageBar
                  label="Bootstraps (this month)"
                  current={substrate.bootstrapCountMonth}
                  max={substrate.maxBootstrapsMonth}
                  unit="requests"
                />
                <UsageBar
                  label="Storage"
                  current={substrate.storageUsedMB}
                  max={substrate.maxStorageMB}
                  unit="MB"
                />
              </div>
            </div>

            {/* API Key section — hidden for provision_failed (no substrate was ever running) */}
            {substrate.status !== "provision_failed" && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <p className="mb-4 text-xs font-semibold tracking-wider text-white/60 uppercase">
                  API Key Management
                </p>

                {keyRotating ? (
                  <div className="space-y-4">
                    <RotationStepper status={rotationStatus} />
                    {rotationStatus === "complete" && (
                      <p className="text-xs text-white/50">
                        Scroll up to the MCP Connection section to claim your new key.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-white/50">
                      Rotating invalidates your current key and generates a new claimable one.
                    </p>
                    <button
                      onClick={handleRotateKey}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition-colors hover:bg-indigo-500"
                    >
                      Rotate Key
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Danger zone — hidden for provision_failed (callout above owns that action) */}
            {substrate.status !== "provision_failed" && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
                <p className="mb-4 text-xs font-semibold tracking-wider text-red-300/80 uppercase">
                  Danger Zone
                </p>
                <div className="flex gap-2">
                  {substrate.tier !== "free" &&
                    !substrate.cancelAt &&
                    substrate.status !== "provision_failed" && (
                      <button
                        onClick={() => setCancelModalOpen(true)}
                        className="rounded-lg border border-red-500/20 px-4 py-2 text-sm text-red-400/70 transition-colors hover:border-red-500/40 hover:text-red-400"
                      >
                        Cancel Subscription
                      </button>
                    )}
                  {/* Deprovision available for free tier only here — provision_failed uses the callout above */}
                  {substrate.tier === "free" && substrate.status !== "provision_failed" && (
                    <button
                      onClick={() => setDeprovisionModalOpen(true)}
                      className="rounded-lg border border-red-500/20 px-4 py-2 text-sm text-red-400/70 transition-colors hover:border-red-500/40 hover:text-red-400"
                    >
                      Deprovision Substrate
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {!substrate && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-indigo-400" />
              <span className="text-sm text-white/50">Loading substrate details…</span>
            </div>
          </div>
        )}
      </main>

      {/* Cancel modal */}
      {cancelModalOpen && (
        <CancelModal onClose={() => setCancelModalOpen(false)} onConfirm={handleCancel} />
      )}

      {/* Deprovision modal */}
      {deprovisionModalOpen && (
        <DeprovisionModal
          onClose={() => setDeprovisionModalOpen(false)}
          onConfirm={handleDeprovision}
        />
      )}
    </div>
  );
}

function CancelModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    if (step === 1) {
      setStep(2);
    } else {
      setLoading(true);
      await onConfirm();
      setLoading(false);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
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
              Cancel subscription
            </h2>
            <p className="mt-1 text-sm text-white/50">
              Your substrate will be deprovisioned at the end of the current billing period.
            </p>
          </div>
        </div>

        <div className="mb-4 space-y-2 text-sm text-white/70">
          {step === 1 ? (
            <p>Are you sure you want to cancel your subscription?</p>
          ) : (
            <>
              <p className="font-medium">Please confirm you want to proceed.</p>
              <p className="text-xs">You will lose access to your substrate.</p>
            </>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-white/10 py-2 text-sm text-white/50 transition-colors hover:border-white/20 hover:text-white/80 disabled:opacity-40"
          >
            Keep subscription
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
          >
            {loading ? "Cancelling…" : step === 1 ? "Continue" : "Confirm cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeprovisionModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const confirmed = input === "destroy";

  async function handleConfirm() {
    setLoading(true);
    await onConfirm();
    setLoading(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
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
              Deprovision substrate
            </h2>
            <p className="mt-1 text-sm text-white/50">
              This will permanently delete your substrate and all data on it. This cannot be undone.
            </p>
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs text-white/50">
            Type <span className="font-mono text-red-400">destroy</span> to confirm
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmed && handleConfirm()}
            placeholder="destroy"
            autoFocus
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-sm text-white placeholder-white/20 transition-colors focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 focus:outline-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-white/10 py-2 text-sm text-white/50 transition-colors hover:border-white/20 hover:text-white/80 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!confirmed || loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {loading ? "Deprovisioning…" : "Deprovision"}
          </button>
        </div>
      </div>
    </div>
  );
}
