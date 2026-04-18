"use client";

import Link from "next/link";
import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { isApiError } from "@/types/api-error";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SignupResult {
  customerId: string;
  slug: string;
  tier: string;
  mcpEndpoint: string;
  apiKey: string;
  checkoutUrl: string;
  limits: {
    maxAtoms: number;
    maxBootstrapsPerMonth: number;
    maxStorageMB: number;
    maxMonthlyCents: number;
    maxSubstrates: number;
  };
  status: string;
  mcpConfig: {
    mcpServers: Record<string, { command: string; args: string[] }>;
  };
}

function isSignupResult(x: unknown): x is SignupResult {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.customerId === "string" &&
    typeof r.slug === "string" &&
    typeof r.tier === "string" &&
    typeof r.mcpEndpoint === "string" &&
    typeof r.apiKey === "string" &&
    typeof r.checkoutUrl === "string" &&
    typeof r.status === "string" &&
    typeof r.limits === "object" &&
    r.limits !== null &&
    typeof r.mcpConfig === "object" &&
    r.mcpConfig !== null
  );
}

// ── Cancel-landing banner (F-BILLING-1) ───────────────────────────────────────
//
// When a user cancels the Stripe checkout for a fresh signup, Stripe's
// cancel_url is `${baseUrl}/signup?checkout=cancelled` (see
// parametric-memory-compute/src/api/signup/routes.ts). Today they land back on
// a bare signup form with no context — it looks like nothing happened and they
// often assume their account wasn't created. Explain clearly: no charge was
// made, their account is waiting, and they can check their email or try again.
//
// Dismissible (local state only — URL param stays so a hard refresh still
// shows it). Only rendered while the form is visible; once the user re-submits
// and reaches CheckEmailView we suppress the banner — that view has its own
// "Complete payment →" CTA.

function SignupCancelBannerInner({ onDismiss }: { onDismiss?: () => void }) {
  const searchParams = useSearchParams();
  const cancelled = searchParams.get("checkout") === "cancelled";
  const [dismissed, setDismissed] = useState(false);

  if (!cancelled || dismissed) return null;

  return (
    <div
      role="alert"
      data-testid="signup-cancel-banner"
      className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
          <span aria-hidden="true">⏸</span>
          <span>Payment cancelled — no charge was made.</span>
        </p>
        <p className="mt-1 text-xs text-white/60">
          Your account is saved. Check your email for the sign-in link to retry checkout from your
          dashboard, or enter your email again below to restart.
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          onDismiss?.();
        }}
        className="shrink-0 text-amber-400/60 transition hover:text-amber-300"
      >
        ✕
      </button>
    </div>
  );
}

/** Suspense-wrapped cancel banner. useSearchParams requires a Suspense boundary. */
function SignupCancelBanner() {
  return (
    <Suspense fallback={null}>
      <SignupCancelBannerInner />
    </Suspense>
  );
}

// ── Copy button ───────────────────────────────────────────────────────────────

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
        <>
          <svg
            className="h-3.5 w-3.5 text-emerald-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-emerald-400">Copied</span>
        </>
      ) : (
        <>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}

// ── Check email view (shown after form submit) ────────────────────────────────

function CheckEmailView({
  email,
  isNewAccount,
  signupData,
}: {
  email: string;
  isNewAccount: boolean;
  signupData: SignupResult | null;
}) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500/15 ring-1 ring-indigo-500/25">
          <svg
            className="h-7 w-7 text-indigo-400"
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
        <h1 className="font-[family-name:var(--font-syne)] text-xl font-semibold text-white">
          Check your email
        </h1>
        <p className="mt-2 text-sm text-white/50">
          We sent a sign-in link to <span className="text-white/70">{email}</span>.
          <br />
          The link expires in 15 minutes.
        </p>
      </div>

      {/* New account: show API key and MCP config */}
      {isNewAccount && signupData && (
        <>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
            <p className="text-sm text-emerald-400">
              Account created — your substrate is provisioning at{" "}
              <span className="font-mono">{signupData.slug}.mmpm.co.nz</span>
            </p>
          </div>

          {/* Payment CTA — required to activate the substrate */}
          {signupData.checkoutUrl && (
            <div className="space-y-2">
              <p className="text-center text-sm text-white/60">
                Activate your substrate by completing payment.
              </p>
              <button
                type="button"
                onClick={() => {
                  window.location.href = signupData.checkoutUrl;
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
              >
                Complete payment →
              </button>
            </div>
          )}

          {/* API key — show once warning */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 flex-shrink-0 text-amber-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.924-.833-2.695 0L3.268 16.5c-.77.833.193 2.5 1.732 2.5z"
                  />
                </svg>
                <span className="text-xs font-semibold tracking-wide text-amber-400 uppercase">
                  API Key — shown once
                </span>
              </div>
              <CopyButton text={signupData.apiKey} label="Copy key" />
            </div>
            <code className="block rounded-lg bg-black/30 px-3 py-2.5 font-mono text-xs break-all text-amber-200/90">
              {signupData.apiKey}
            </code>
            <p className="mt-2 text-xs text-amber-400/70">
              Save this now. It cannot be retrieved again.
            </p>
          </div>

          {/* MCP config for Claude Desktop */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide text-white/50 uppercase">
                Claude Desktop config
              </span>
              <CopyButton text={JSON.stringify(signupData.mcpConfig, null, 2)} label="Copy JSON" />
            </div>
            <pre className="overflow-x-auto rounded-lg bg-black/30 px-3 py-2.5 font-mono text-xs leading-relaxed text-emerald-300/90">
              {JSON.stringify(signupData.mcpConfig, null, 2)}
            </pre>
          </div>
        </>
      )}

      {/* Existing account note */}
      {!isNewAccount && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
          <p className="text-sm text-white/60">
            Welcome back — click the link in your email to sign in.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Signup form ───────────────────────────────────────────────────────────────

function SignupForm({
  onComplete,
}: {
  onComplete: (email: string, isNew: boolean, data: SignupResult | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const trimmedEmail = email.trim();
    let isNewAccount = false;
    let signupData: SignupResult | null = null;

    try {
      // Step 1: Try to create the account
      const signupRes = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          agreedToTerms: true, // validated by checkbox (required=true)
          termsVersion: "2026-04-05", // current ToS version date
        }),
      });

      if (signupRes.ok) {
        // New account created successfully
        isNewAccount = true;
        const raw: unknown = await signupRes.json();
        if (!isSignupResult(raw)) {
          toast.error(
            "Account created but the checkout link is missing. Redirecting you to pricing.",
          );
          window.location.href = "/pricing";
          return;
        }
        if (!raw.checkoutUrl) {
          toast.error(
            "Account created but the checkout link is missing. Redirecting you to pricing.",
          );
          window.location.href = "/pricing";
          return;
        }
        signupData = raw;
      } else if (signupRes.status === 409) {
        // Account already exists — that's fine, we'll just send a magic link
        isNewAccount = false;
      } else if (signupRes.status === 422) {
        const data = await signupRes.json().catch(() => ({}));
        const fields = Array.isArray(data.fields) ? (data.fields as string[]).join(", ") : "";
        setError(fields ? `Validation error: ${fields}` : "Please check your email address.");
        return;
      } else {
        const data: unknown = await signupRes.json().catch(() => ({}));
        if (isApiError(data)) {
          setError(data.human_message);
        } else {
          setError(
            (data as Record<string, string>).error ?? "Something went wrong. Please try again.",
          );
        }
        return;
      }

      // Step 2: Send a magic link (works for both new and existing accounts)
      const linkRes = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      if (!linkRes.ok) {
        const data = await linkRes.json().catch(() => ({}));
        setError(
          (data as Record<string, string>).error ??
            "Failed to send sign-in link. Please try again.",
        );
        return;
      }

      // Done — show the "check your email" view
      onComplete(trimmedEmail, isNewAccount, signupData);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="mb-1 font-[family-name:var(--font-syne)] text-xl font-semibold text-white">
        Get started
      </h1>
      <p className="mb-6 text-sm text-white/50">
        Enter your email to create an account or sign in.
      </p>

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

        {/* Legal clickwrap — required for ToS / Privacy Policy consent audit trail */}
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3.5 transition-colors hover:border-white/20">
          <input
            type="checkbox"
            required
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer rounded border-white/20 bg-white/5 accent-indigo-500"
          />
          <span className="text-xs leading-relaxed text-white/50">
            I agree to the{" "}
            <Link
              href="/terms"
              target="_blank"
              className="text-white/70 underline underline-offset-2 transition-colors hover:text-white"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              target="_blank"
              className="text-white/70 underline underline-offset-2 transition-colors hover:text-white"
            >
              Privacy Policy
            </Link>
            , including the AI memory accuracy disclaimers and data retention terms.
          </span>
        </label>

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !email.trim() || !agreedToTerms}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Setting up…
            </>
          ) : (
            "Continue"
          )}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-white/40">
        We&apos;ll send a sign-in link to your email.
      </p>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SignupClient() {
  const [completed, setCompleted] = useState<{
    email: string;
    isNew: boolean;
    data: SignupResult | null;
  } | null>(null);

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
          {completed ? (
            <CheckEmailView
              email={completed.email}
              isNewAccount={completed.isNew}
              signupData={completed.data}
            />
          ) : (
            <>
              <SignupCancelBanner />
              <SignupForm
                onComplete={(email, isNew, data) => setCompleted({ email, isNew, data })}
              />
            </>
          )}
        </div>

        {/* Passive text removed — consent is now captured via the clickwrap checkbox in SignupForm */}
      </div>
    </div>
  );
}
