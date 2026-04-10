"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface BillingStatus {
  tier: string;
  status: "active" | "trialing" | "past_due" | "suspended" | "cancelled";
  renewsAt: string | null;
  trialEndsAt: string | null;
  tierDisplay: { name: string };
}

interface SubstrateData {
  mcpEndpoint: string | null;
  status: string;
  keyUnclaimed?: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function CopyBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <code className="text-brand-300 bg-surface-800 flex-1 overflow-x-auto rounded-md border border-zinc-700 px-3 py-1.5 font-mono text-xs">
        {value}
      </code>
      <button
        onClick={handleCopy}
        className="border-surface-700 text-surface-400 shrink-0 rounded-md border px-2.5 py-1.5 text-xs transition hover:text-white"
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}

/**
 * Post-checkout success page.
 *
 * The user just paid (or started a trial) — this is the highest-motivation moment.
 * We show:
 *   1. Tier confirmation + trial/renewal dates
 *   2. 3-step Claude Desktop setup instructions
 *   3. Polling for the MCP endpoint (provisioning may take up to 60s)
 *
 * Polls /api/my-substrate every 3s for up to 60s until the substrate is running
 * and the MCP endpoint is available.
 */
export default function BillingSuccessClient() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [substrate, setSubstrate] = useState<SubstrateData | null>(null);
  const [polling, setPolling] = useState(true);
  const [elapsed, setElapsed] = useState(0); // seconds since mount

  // Fetch billing status once on mount
  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setBilling(d);
      })
      .catch(() => {});
  }, []);

  // Poll substrate until MCP endpoint is ready, max 60s
  useEffect(() => {
    let attempts = 0;
    const MAX_ATTEMPTS = 20; // 3s × 20 = 60s

    const interval = setInterval(async () => {
      attempts++;
      setElapsed((e) => e + 3);

      try {
        const res = await fetch("/api/my-substrate");
        if (res.ok) {
          const data = await res.json();
          if (data.mcpEndpoint) {
            setSubstrate(data);
            setPolling(false);
            clearInterval(interval);
            return;
          }
          if (data.status) {
            setSubstrate(data);
          }
        }
      } catch {
        // Keep polling
      }

      if (attempts >= MAX_ATTEMPTS) {
        setPolling(false);
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const tierName = billing?.tierDisplay?.name ?? "your plan";
  const isTrialing = billing?.status === "trialing";
  const mcpEndpoint = substrate?.mcpEndpoint;

  return (
    <main className="bg-surface-950 flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg">
        {/* Success mark */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
            <svg
              className="h-8 w-8 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>

          <h1 className="text-surface-100 mb-2 text-2xl font-semibold">You&apos;re all set.</h1>

          <p className="text-surface-300 text-base">
            Your <strong className="text-white">{tierName}</strong> plan is active.
          </p>

          {isTrialing && billing?.trialEndsAt && (
            <div className="mt-3 space-y-0.5 text-sm">
              <p className="text-surface-400">
                Trial period: 14 days free, then $
                {billing.tier === "indie" ? "9" : billing.tier === "pro" ? "29" : "79"}/month
              </p>
              <p className="text-surface-500 text-xs">
                First charge: {formatDate(billing.trialEndsAt)}
              </p>
            </div>
          )}

          {!isTrialing && billing?.renewsAt && (
            <p className="text-surface-400 mt-2 text-sm">
              Next renewal: {formatDate(billing.renewsAt)}
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="border-surface-800 mb-8 border-t" />

        {/* Setup steps */}
        <div className="mb-8">
          <h2 className="mb-5 text-base font-semibold text-white">
            Connect Claude Desktop in 3 steps
          </h2>

          <ol className="space-y-5">
            <li className="flex gap-4">
              <span className="bg-brand-500/20 text-brand-300 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold">
                1
              </span>
              <p className="text-surface-300 text-sm leading-relaxed">
                Open <strong className="text-white">Claude Desktop</strong> → Settings → MCP Servers
              </p>
            </li>
            <li className="flex gap-4">
              <span className="bg-brand-500/20 text-brand-300 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold">
                2
              </span>
              <div className="text-surface-300 text-sm leading-relaxed">
                <p>
                  Click <strong className="text-white">&ldquo;Add server&rdquo;</strong> → paste
                  your connection string:
                </p>
                {mcpEndpoint ? (
                  <CopyBlock value={mcpEndpoint} />
                ) : polling ? (
                  <div className="mt-2 flex items-center gap-2 text-xs text-indigo-400">
                    <span className="h-3 w-3 animate-spin rounded-full border border-indigo-400/30 border-t-indigo-400" />
                    Setting up your substrate{elapsed > 0 ? ` (${elapsed}s)` : ""}…
                  </div>
                ) : (
                  <p className="text-surface-500 mt-2 text-xs">
                    Connection string not ready yet. Check your{" "}
                    <Link href="/dashboard" className="text-indigo-400 underline">
                      dashboard
                    </Link>{" "}
                    in a minute.
                  </p>
                )}
              </div>
            </li>
            <li className="flex gap-4">
              <span className="bg-brand-500/20 text-brand-300 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold">
                3
              </span>
              <p className="text-surface-300 text-sm leading-relaxed">
                Start a new conversation with Claude. Say:{" "}
                <span className="bg-surface-800 rounded px-1.5 py-0.5 font-mono text-xs text-white">
                  Load your memory context
                </span>
              </p>
            </li>
          </ol>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="bg-brand-500 hover:bg-brand-400 inline-flex flex-1 items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            Go to dashboard
          </Link>
          <Link
            href="/docs"
            className="bg-surface-800 hover:bg-surface-700 ring-surface-700 text-surface-200 inline-flex flex-1 items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold ring-1 transition-colors"
          >
            Quickstart guide
          </Link>
        </div>
      </div>
    </main>
  );
}
