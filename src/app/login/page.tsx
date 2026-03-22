"use client";

import { useState, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: "The sign-in link is missing a token. Please request a new one.",
  invalid_token:
    "This sign-in link has expired or has already been used. Please request a new one.",
  server_error: "Something went wrong on our end. Please try again.",
  session_expired: "Your session has expired. Please sign in again.",
};

// Isolated because useSearchParams() requires a Suspense boundary
function ErrorBanner() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const errorMessage = errorParam
    ? (ERROR_MESSAGES[errorParam] ?? "An error occurred. Please try again.")
    : null;

  if (!errorMessage) return null;

  return (
    <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
      {errorMessage}
    </div>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.error ?? "Failed to send sign-in link. Please try again.");
        return;
      }

      setSent(true);
    } catch {
      setSubmitError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="py-2 text-center">
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
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h2 className="mb-2 font-[family-name:var(--font-syne)] text-lg font-semibold text-white">
          Check your email
        </h2>
        <p className="text-sm text-white/50">
          We sent a sign-in link to <span className="text-white/70">{email}</span>.
          <br />
          The link expires in 15 minutes.
        </p>
        <button
          onClick={() => {
            setSent(false);
            setEmail("");
          }}
          className="mt-5 text-xs text-indigo-400 transition-colors hover:text-indigo-300"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-1 font-[family-name:var(--font-syne)] text-xl font-semibold text-white">
        Sign in
      </h1>
      <p className="mb-6 text-sm text-white/50">Enter your email to receive a sign-in link.</p>

      <Suspense>
        <ErrorBanner />
      </Suspense>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm text-white/60">
            Email address
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm text-white placeholder-white/25 transition-colors focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 focus:outline-none"
          />
        </div>

        {submitError && <p className="text-sm text-red-400">{submitError}</p>}

        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Sending…
            </>
          ) : (
            "Send sign-in link"
          )}
        </button>
      </form>
    </>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#030712] px-4">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo / brand */}
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
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-white/30">
          By signing in you agree to our{" "}
          <Link
            href="/terms"
            className="text-white/50 underline underline-offset-2 transition-colors hover:text-white/70"
          >
            Terms
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="text-white/50 underline underline-offset-2 transition-colors hover:text-white/70"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
