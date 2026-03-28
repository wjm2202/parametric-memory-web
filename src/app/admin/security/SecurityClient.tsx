"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface AccountInfo {
  id: string;
  email: string;
}

interface SecurityClientProps {
  account: AccountInfo;
  totpEnrolled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Enrolment wizard states
// ─────────────────────────────────────────────────────────────────────────────

type EnrolStep = "idle" | "scan" | "confirm" | "backup" | "done";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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
      className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/60 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white/90"
    >
      {copied ? (
        <span className="text-emerald-400">Copied</span>
      ) : (
        label
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function SecurityClient({ account, totpEnrolled: initialEnrolled }: SecurityClientProps) {
  const [enrolled, setEnrolled] = useState(initialEnrolled);

  // ── Enrolment state ──
  const [enrolStep, setEnrolStep] = useState<EnrolStep>("idle");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  // ── Disable state ──
  const [disableMode, setDisableMode] = useState(false);
  const [disableCode, setDisableCode] = useState("");

  // ── Shared ──
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Enrolment flow
  // ─────────────────────────────────────────────────────────────────────────

  async function startEnrolment() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/totp/enrol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json() as {
        ok?: boolean;
        error?: string;
        secret?: string;
        qrDataUrl?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Failed to start enrollment.");
        return;
      }
      setQrDataUrl(data.qrDataUrl ?? null);
      setTotpSecret(data.secret ?? null);
      setEnrolStep("scan");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmEnrolment() {
    if (confirmCode.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/totp/enrol/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: totpSecret, code: confirmCode }),
      });
      const data = await res.json() as {
        ok?: boolean;
        error?: string;
        backupCodes?: string[];
      };
      if (!res.ok) {
        setError(data.error ?? "Invalid code. Try again.");
        setConfirmCode("");
        return;
      }
      setBackupCodes(data.backupCodes ?? []);
      setEnrolStep("backup");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function finishEnrolment() {
    setEnrolled(true);
    setEnrolStep("done");
    setBackupCodes([]);
    setTotpSecret(null);
    setQrDataUrl(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Disable flow
  // ─────────────────────────────────────────────────────────────────────────

  async function submitDisable() {
    if (disableCode.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/totp/enrol", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Invalid code.");
        setDisableCode("");
        return;
      }
      setEnrolled(false);
      setDisableMode(false);
      setDisableCode("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      {/* Nav */}
      <div className="border-b border-white/5 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link href="/admin" className="text-sm text-white/40 transition-colors hover:text-white/70">
            ← Dashboard
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-sm text-white/70">Security</span>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 font-[family-name:var(--font-syne)] text-2xl font-semibold text-white">
          Security settings
        </h1>
        <p className="mb-8 text-sm text-white/50">{account.email}</p>

        {/* ── Two-factor authentication card ── */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <h2 className="font-semibold text-white">Two-factor authentication</h2>
              <p className="mt-0.5 text-sm text-white/50">
                Require a time-based one-time code (TOTP) after each sign-in link.
              </p>
            </div>
            <div className={`mt-0.5 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${enrolled ? "bg-emerald-500/15 text-emerald-400" : "bg-white/5 text-white/40"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${enrolled ? "bg-emerald-400" : "bg-white/30"}`} />
              {enrolled ? "Enabled" : "Disabled"}
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* ── Not enrolled, idle ── */}
          {!enrolled && enrolStep === "idle" && (
            <button
              onClick={startEnrolment}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Setting up…</>
              ) : "Enable two-factor authentication"}
            </button>
          )}

          {/* ── Step 1: Scan QR ── */}
          {enrolStep === "scan" && qrDataUrl && (
            <div className="space-y-4">
              <p className="text-sm text-white/70">
                Scan this QR code with your authenticator app (Authy, Google Authenticator, 1Password, etc).
              </p>
              <div className="flex justify-center">
                <div className="rounded-xl border border-white/10 bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="TOTP QR Code" width={200} height={200} className="block" />
                </div>
              </div>
              {totpSecret && (
                <div className="rounded-lg border border-white/5 bg-white/[0.03] px-4 py-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs text-white/40 uppercase tracking-wide">Manual entry key</span>
                    <CopyButton text={totpSecret} />
                  </div>
                  <code className="break-all font-mono text-sm text-white/70">{totpSecret}</code>
                </div>
              )}
              <button
                onClick={() => setEnrolStep("confirm")}
                className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
              >
                I&apos;ve scanned the code →
              </button>
            </div>
          )}

          {/* ── Step 2: Confirm code ── */}
          {enrolStep === "confirm" && (
            <div className="space-y-4">
              <p className="text-sm text-white/70">
                Enter the 6-digit code from your authenticator app to confirm setup.
              </p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                autoComplete="one-time-code"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, "").substring(0, 6))}
                placeholder="000000"
                className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-white placeholder-white/20 focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 focus:outline-none"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setEnrolStep("scan")}
                  className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 transition-colors hover:text-white"
                >
                  Back
                </button>
                <button
                  onClick={confirmEnrolment}
                  disabled={loading || confirmCode.length !== 6}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
                >
                  {loading ? "Verifying…" : "Confirm"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Backup codes ── */}
          {enrolStep === "backup" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.924-.833-2.695 0L3.268 16.5c-.77.833.193 2.5 1.732 2.5z" />
                  </svg>
                  <span className="text-xs font-semibold uppercase tracking-wide text-amber-400">
                    Recovery codes — shown once
                  </span>
                </div>
                <p className="mb-3 text-xs text-amber-400/70">
                  Save these 8 codes somewhere safe. Each can be used once to sign in if you lose access to your authenticator.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((code) => (
                    <code key={code} className="rounded bg-black/30 px-2 py-1.5 text-center font-mono text-xs text-amber-200/90">
                      {code}
                    </code>
                  ))}
                </div>
                <div className="mt-3 flex justify-end">
                  <CopyButton text={backupCodes.join("\n")} label="Copy all" />
                </div>
              </div>
              <button
                onClick={finishEnrolment}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
              >
                I&apos;ve saved my backup codes
              </button>
            </div>
          )}

          {/* ── Done ── */}
          {enrolStep === "done" && (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400">
              <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Two-factor authentication is now active.
            </div>
          )}

          {/* ── Enrolled: disable option ── */}
          {enrolled && enrolStep !== "done" && (
            <div className="mt-4 border-t border-white/5 pt-4">
              {!disableMode ? (
                <button
                  onClick={() => { setDisableMode(true); setError(null); }}
                  className="text-sm text-red-400/70 transition-colors hover:text-red-400"
                >
                  Disable two-factor authentication
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-white/60">
                    Enter your current TOTP code to confirm disabling 2FA.
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    autoFocus
                    autoComplete="one-time-code"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").substring(0, 6))}
                    placeholder="000000"
                    className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-4 py-2.5 text-center font-mono text-xl tracking-[0.4em] text-white placeholder-white/20 focus:border-red-500/40 focus:ring-1 focus:ring-red-500/20 focus:outline-none"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setDisableMode(false); setDisableCode(""); setError(null); }}
                      className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 transition-colors hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={submitDisable}
                      disabled={loading || disableCode.length !== 6}
                      className="flex-1 rounded-lg bg-red-600/80 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-40"
                    >
                      {loading ? "Disabling…" : "Disable 2FA"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Sign-in method ── */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="mb-0.5 font-semibold text-white">Sign-in method</h2>
          <p className="text-sm text-white/50">
            You sign in via magic link sent to{" "}
            <span className="text-white/70">{account.email}</span>. No password is stored.
          </p>
        </div>
      </div>
    </div>
  );
}
