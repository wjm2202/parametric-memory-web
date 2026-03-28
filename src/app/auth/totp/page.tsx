"use client";

import { Suspense, useState, FormEvent, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

// ─────────────────────────────────────────────────────────────────────────────
// TOTP challenge page
// ─────────────────────────────────────────────────────────────────────────────

/**
 * /auth/totp?pending=PENDING_TOKEN
 *
 * Shown when a magic link is verified but the account has TOTP enrolled.
 * The user enters their 6-digit authenticator code (or a backup code).
 *
 * On success: POST /api/auth/totp?action=challenge sets the httpOnly cookie
 * server-side (the session token never reaches the browser) and returns ok.
 * We then redirect to /admin.
 *
 * On failure: shows remaining attempt count, offers backup code link.
 */

function CodeInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={6}
      autoComplete="one-time-code"
      disabled={disabled}
      value={value}
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, "");
        if (v.length <= 6) onChange(v);
      }}
      placeholder="000000"
      className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-white placeholder-white/20 transition-colors focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function TotpChallengePageWrapper() {
  return (
    <Suspense>
      <TotpChallengePage />
    </Suspense>
  );
}

function TotpChallengePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const pendingToken = searchParams.get("pending") ?? "";

  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  // Missing pending token — redirect back to login
  useEffect(() => {
    if (!pendingToken) {
      router.replace("/login?error=missing_token");
    }
  }, [pendingToken, router]);

  async function handleTotpSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;

    setLoading(true);
    setError(null);

    try {
      // Server-side proxy sets the httpOnly cookie — session token never hits the browser
      const res = await fetch("/api/auth/totp?action=challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken, code }),
      });

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (res.status === 401) {
        const remaining =
          typeof data.attemptsRemaining === "number" ? data.attemptsRemaining : null;
        setAttemptsRemaining(remaining);
        if (remaining !== null && remaining <= 0) {
          setError("Too many attempts. Please sign in again.");
        } else {
          setError(
            remaining !== null
              ? `Invalid code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
              : "Invalid code.",
          );
        }
        setCode("");
        return;
      }

      if (!res.ok) {
        setError((data.error as string) ?? "Something went wrong. Please try again.");
        return;
      }

      // Cookie is set by the proxy — redirect to dashboard
      router.replace("/admin");
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  async function handleBackupSubmit(e: FormEvent) {
    e.preventDefault();
    if (!backupCode.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/totp?action=recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken, backupCode: backupCode.trim() }),
      });

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (res.status === 401) {
        setError("Invalid backup code. Please check and try again.");
        return;
      }
      if (!res.ok) {
        setError((data.error as string) ?? "Something went wrong. Please try again.");
        return;
      }

      router.replace("/admin");
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  if (!pendingToken) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#030712] px-4 py-12">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-white/70 transition-colors hover:text-white"
          >
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text font-[family-name:var(--font-syne)] text-2xl font-bold text-transparent">
              Parametric Memory
            </span>
          </Link>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm">
          {mode === "totp" ? (
            <>
              {/* TOTP mode */}
              <div className="mb-6 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500/15 ring-1 ring-indigo-500/25">
                  <svg className="h-7 w-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h1 className="font-[family-name:var(--font-syne)] text-xl font-semibold text-white">
                  Two-factor verification
                </h1>
                <p className="mt-1 text-sm text-white/50">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>

              <form onSubmit={handleTotpSubmit} className="space-y-4">
                <CodeInput value={code} onChange={setCode} disabled={loading} />

                {error && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {error}
                    {attemptsRemaining !== null && attemptsRemaining <= 0 && (
                      <div className="mt-2">
                        <Link
                          href="/login"
                          className="text-indigo-400 underline underline-offset-2"
                        >
                          Sign in again →
                        </Link>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Verifying…
                    </>
                  ) : (
                    "Verify"
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setMode("backup");
                  setError(null);
                  setCode("");
                }}
                className="mt-5 w-full text-center text-sm text-white/40 transition-colors hover:text-white/60"
              >
                Use a backup code instead
              </button>
            </>
          ) : (
            <>
              {/* Backup code mode */}
              <div className="mb-6 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/25">
                  <svg className="h-7 w-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <h1 className="font-[family-name:var(--font-syne)] text-xl font-semibold text-white">
                  Recovery code
                </h1>
                <p className="mt-1 text-sm text-white/50">
                  Enter one of your 8-character backup codes.
                </p>
              </div>

              <form onSubmit={handleBackupSubmit} className="space-y-4">
                <div>
                  <input
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={loading}
                    value={backupCode}
                    onChange={(e) =>
                      setBackupCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                    }
                    placeholder="XXXXXXXXXX"
                    maxLength={12}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-4 py-3 text-center font-mono text-lg tracking-widest text-white placeholder-white/20 uppercase transition-colors focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                {error && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || backupCode.trim().length < 8}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Verifying…
                    </>
                  ) : (
                    "Use recovery code"
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setMode("totp");
                  setError(null);
                  setBackupCode("");
                }}
                className="mt-5 w-full text-center text-sm text-white/40 transition-colors hover:text-white/60"
              >
                ← Back to authenticator code
              </button>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-white/30">
          Can&apos;t access your account?{" "}
          <Link
            href="/login"
            className="text-white/50 underline underline-offset-2 transition-colors hover:text-white/70"
          >
            Sign in again
          </Link>
        </p>
      </div>
    </div>
  );
}
