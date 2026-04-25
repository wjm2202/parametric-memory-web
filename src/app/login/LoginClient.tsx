"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import type { ProviderId } from "@/lib/auth/providers/types";

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: "The sign-in link is missing a token. Please request a new one.",
  invalid_token:
    "This sign-in link has expired or has already been used. Please request a new one.",
  server_error: "Something went wrong on our end. Please try again.",
  session_expired: "Your session has expired. Please sign in again.",
  // OAuth failure codes emitted by /api/auth/oauth/[provider]/callback.
  // Kept in sync with the ERROR_CODES table in oauth-callback.ts —
  // missing codes fall through to the generic "An error occurred".
  // Intentionally high-level / non-leaky; the audit log has detail.
  oauth_denied: "Sign-in was cancelled. Please try again if that wasn't intended.",
  oauth_state: "The sign-in attempt was interrupted. Please try again.",
  oauth_expired: "This sign-in attempt expired. Please try again.",
  oauth_server_error: "Something went wrong on our end. Please try again.",
  oauth_rejected: "We couldn't complete sign-in with that provider account. Please try again.",
};

/**
 * Visual metadata for OAuth sign-in buttons. Keyed by `ProviderId` so
 * the render loop stays a simple lookup. Adding a third provider is
 * one entry here + one entry in `getEnabledOauthProviders`'s table +
 * a registry adapter — no changes to this component's logic.
 *
 * Icon paths are inline SVG drawn at 24x24 viewBox — providers'
 * brand guidelines require monochrome-on-dark to be distinct from
 * their coloured logos. We use `currentColor` so the icon inherits
 * the button's text colour.
 */
type ProviderButtonMeta = {
  label: string;
  /** SVG path(s) drawn inside a 24x24 viewBox. `currentColor` fill. */
  icon: ReactNode;
};

const PROVIDER_BUTTON_META: Record<ProviderId, ProviderButtonMeta> = {
  google: {
    label: "Sign in with Google",
    icon: (
      // Google "G" — simplified single-path monochrome version. The
      // full multicolour logo requires four separate paths; for a
      // dark-mode button silhouette the outline-only form reads
      // cleanly and sidesteps brand-licensing colour requirements.
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path
          fill="currentColor"
          d="M12 10.8v2.7h4.54c-.2 1.16-.83 2.15-1.78 2.81v2.33h2.88c1.68-1.55 2.65-3.83 2.65-6.56 0-.65-.06-1.27-.17-1.86H12zm0 7.2c-2.07 0-3.82-1.4-4.44-3.3H4.6v2.07A7.52 7.52 0 0 0 12 19.5c2.02 0 3.72-.67 4.96-1.82l-2.88-2.33c-.8.54-1.82.85-2.93.85-2.25 0-4.16-1.52-4.84-3.56v-.01H4.6v2.07A7.5 7.5 0 0 0 12 18zm-4.84-6.3a4.5 4.5 0 0 1 0-2.88V6.77H4.6a7.5 7.5 0 0 0 0 6.72l2.56-2.03zM12 6.7c1.27 0 2.41.44 3.31 1.3l2.48-2.48A7.26 7.26 0 0 0 12 4.5a7.5 7.5 0 0 0-6.7 4.14l2.86 2.22C8.84 7.93 10.27 6.7 12 6.7z"
        />
      </svg>
    ),
  },
  github: {
    label: "Sign in with GitHub",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.23.68-.5 0-.25-.01-.9-.01-1.77-2.78.62-3.37-1.37-3.37-1.37-.46-1.18-1.11-1.5-1.11-1.5-.9-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.57 2.34 1.12 2.91.86.09-.67.35-1.12.63-1.38-2.22-.26-4.55-1.14-4.55-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.27 2.75 1.05a9.27 9.27 0 0 1 5 0c1.9-1.32 2.74-1.05 2.74-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.6.69.5A10.04 10.04 0 0 0 22 12.25C22 6.58 17.52 2 12 2z"
        />
      </svg>
    ),
  },
};

/**
 * Only a relative path starting with a single `/` is a valid returnTo.
 * Matches the open-redirect guard on `RedirectCookieSetter` below.
 * Exported-only-for-test pattern isn't needed — the behaviour is
 * asserted end-to-end through the rendered href.
 */
function sanitizeReturnTo(raw: string | null): string | null {
  if (raw === null) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null; // `//evil.com` is a protocol-relative URL
  return raw;
}

/**
 * OAuth provider buttons. Rendered above the email form when at least
 * one provider is enabled server-side. Reads `?redirect=` off the
 * current URL to forward as `returnTo` to the start route.
 */
function OauthButtons({ providers }: { providers: ProviderId[] }) {
  const searchParams = useSearchParams();
  const returnTo = sanitizeReturnTo(searchParams.get("redirect"));

  if (providers.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      {providers.map((id) => {
        const meta = PROVIDER_BUTTON_META[id];
        const params = new URLSearchParams({ intent: "signin" });
        if (returnTo !== null) params.set("returnTo", returnTo);
        const href = `/api/auth/oauth/${id}/start?${params.toString()}`;
        return (
          <a
            key={id}
            href={href}
            data-testid={`signin-${id}`}
            className="group flex min-h-[48px] w-full items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-white/90 transition-all hover:border-violet-400/40 hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030712] focus-visible:outline-none"
          >
            <span className="text-white/70 transition-colors group-hover:text-violet-300">
              {meta.icon}
            </span>
            {meta.label}
          </a>
        );
      })}

      {/* Divider — visible only when buttons are shown. The gradient
          matches the site's indigo→violet brand without being loud. */}
      <div className="flex items-center gap-3 pt-4">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
        <span className="text-[10px] font-medium tracking-widest text-white/30 uppercase">or</span>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10" />
      </div>
    </div>
  );
}

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

function RedirectCookieSetter() {
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");

  useEffect(() => {
    // Store the redirect destination in a cookie so the auth callback can use it.
    // Only allow relative paths starting with / to prevent open redirect attacks.
    if (redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//")) {
      document.cookie = `mmpm_redirect=${encodeURIComponent(redirectParam)};path=/;max-age=900;samesite=lax`;
    }
  }, [redirectParam]);

  return null;
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
        if (res.status === 429) {
          // Rate limit hit — show reset time if available
          const resetHeader = res.headers.get("X-RateLimit-Reset");
          if (resetHeader) {
            const resetMs = parseInt(resetHeader, 10) * 1000;
            const minutesUntil = Math.ceil((resetMs - Date.now()) / 60_000);
            const resetTime = new Date(resetMs).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            });
            setSubmitError(
              minutesUntil > 1
                ? `Too many sign-in links sent. You can request another at ${resetTime} (in ~${minutesUntil} minutes).`
                : `Too many sign-in links sent. You can request another at ${resetTime}.`,
            );
          } else {
            setSubmitError(
              "Too many sign-in links sent to this address. Please wait an hour before trying again.",
            );
          }
          return;
        }
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

      <form onSubmit={handleSubmit} className="space-y-4" data-testid="login-form">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm text-white/60">
            Email address
          </label>
          <input
            id="email"
            data-testid="login-email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-4 py-2.5 text-base text-white placeholder-white/25 transition-colors focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 focus:outline-none"
          />
        </div>

        {submitError && (
          <div
            data-testid="login-error"
            role="alert"
            className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
          >
            {submitError}
          </div>
        )}

        <button
          type="submit"
          data-testid="login-submit"
          disabled={loading || !email.trim()}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030712] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
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

/**
 * Props for `LoginClient`.
 *
 * `oauthProviders` is resolved server-side by `getEnabledOauthProviders(config)`
 * in `page.tsx`. Passing the resolved list as a prop (instead of the
 * client reading config at runtime) has three upsides:
 *
 *   1. The feature flag and client credentials never reach the browser
 *      bundle.
 *   2. No flash-of-no-buttons during hydration — the server HTML already
 *      includes the final button set.
 *   3. Tests can pass arbitrary provider lists without mocking config.
 */
export interface LoginClientProps {
  /**
   * Ordered list of OAuth providers to show. Default `[]` — the email
   * magic-link form is always the fallback. Rendered order matches
   * the array order (declared by `getEnabledOauthProviders`).
   */
  oauthProviders?: ProviderId[];
}

export default function LoginClient({ oauthProviders = [] }: LoginClientProps = {}) {
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-x-hidden bg-[#030712] px-4 py-12">
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
          <Suspense>
            <RedirectCookieSetter />
          </Suspense>
          {/* OAuth buttons render first — closest to a returning user's
              mental model of "the way I signed in last time". Wrapped
              in Suspense because `OauthButtons` uses `useSearchParams`. */}
          <Suspense>
            <OauthButtons providers={oauthProviders} />
          </Suspense>
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-white/40">
          First time?{" "}
          <Link
            href="/signup"
            className="-my-1 inline-block py-1 text-indigo-400 transition-colors hover:text-indigo-300"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
