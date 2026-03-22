"use client";

/**
 * SiteNavbar — single shared navbar for all pages.
 *
 * Two variants:
 *   "standard"  — fixed, blurred dark background. Used on homepage, pricing, docs.
 *   "immersive" — absolute, transparent. Used on /visualise and /knowledge
 *                 (floats over full-screen canvas).
 *
 * Auth:
 *   - `isLoggedIn` is determined server-side from the session cookie and passed
 *     as a prop. This avoids a client-side flash on initial render.
 *   - Session is validated client-side via /api/auth/me on mount.
 *     401 → stale cookie, flips to Sign In. 503/network → can't validate,
 *     optimistically keeps the server-determined state.
 *
 * Nav items (all variants):
 *   Docs · Pricing · Substrate Viewer · Knowledge Graph · [Dashboard | Sign In]
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* ─── Logomark ───────────────────────────────────────────────────────────── */

function Logomark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" aria-hidden="true">
      <circle cx="36" cy="36" r="32" stroke="#36aaf5" strokeWidth="1.5" opacity="0.3" />
      <line x1="36" y1="36" x2="36" y2="4" stroke="#36aaf5" strokeWidth="1" opacity="0.4" />
      <line x1="36" y1="36" x2="68" y2="36" stroke="#36aaf5" strokeWidth="1" opacity="0.4" />
      <line x1="36" y1="36" x2="36" y2="68" stroke="#36aaf5" strokeWidth="1" opacity="0.4" />
      <line x1="36" y1="36" x2="4" y2="36" stroke="#36aaf5" strokeWidth="1" opacity="0.4" />
      <circle cx="36" cy="36" r="4" fill="#f59e0b" />
      <circle cx="36" cy="4" r="3.5" fill="#36aaf5" />
      <circle cx="68" cy="36" r="3.5" fill="#36aaf5" />
      <circle cx="36" cy="68" r="3.5" fill="#36aaf5" />
      <circle cx="4" cy="36" r="3.5" fill="#36aaf5" />
    </svg>
  );
}

/* ─── Icons ──────────────────────────────────────────────────────────────── */

function SubstrateIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function KnowledgeIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 3.75H6A2.25 2.25 0 0 0 3.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0 1 20.25 6v1.5m0 9V18A2.25 2.25 0 0 1 18 20.25h-1.5m-9 0H6A2.25 2.25 0 0 1 3.75 18v-1.5M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
      />
    </svg>
  );
}

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface SiteNavbarProps {
  /** Server-determined login state — avoids client flash */
  isLoggedIn: boolean;
  /** "standard" = fixed+blurred (homepage/pricing). "immersive" = absolute+transparent (canvas pages). */
  variant?: "standard" | "immersive";
  /** Immersive only: label shown on the right (e.g. "SUBSTRATE VIEWER") */
  pageLabel?: string;
  /** Immersive only: accent color class for the LIVE badge (e.g. "text-cyan-400") */
  accentColor?: "cyan" | "violet";
}

/* ─── Auth state hook ────────────────────────────────────────────────────── */

/**
 * Validates the session client-side and returns the user's email.
 *
 * `verified` starts optimistically equal to `isLoggedIn` (trusting the server
 * cookie check). Once /api/auth/me resolves:
 *   - 401 → session is stale/expired → `verified` flips to false (hides Dashboard)
 *   - 503/network error → compute is down → leave `verified` unchanged (can't check)
 *   - 200 → session is valid, email populated
 *
 * This prevents a stale mmpm_session cookie from permanently showing
 * the Dashboard button to a user whose session has actually expired.
 */
function useAuthState(isLoggedIn: boolean): { email: string | null; verified: boolean } {
  const [email, setEmail] = useState<string | null>(null);
  // Optimistic: trust the server's cookie check until the client validates
  const [verified, setVerified] = useState(isLoggedIn);

  useEffect(() => {
    if (!isLoggedIn) return;

    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => {
        if (res.status === 401) {
          // Session expired or revoked — hide Dashboard
          setVerified(false);
          return null;
        }
        if (!res.ok) {
          // Compute service down (503 etc.) — can't validate, leave verified as-is
          return null;
        }
        return res.json();
      })
      .then((data: { email?: string } | null) => {
        if (data?.email) setEmail(data.email);
      })
      .catch(() => {
        // Network error — leave verified unchanged (offline / compute unreachable)
      });
  }, [isLoggedIn]);

  return { email, verified };
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function SiteNavbar({
  isLoggedIn,
  variant = "standard",
  pageLabel,
  accentColor = "cyan",
}: SiteNavbarProps) {
  const pathname = usePathname();
  const { email, verified } = useAuthState(isLoggedIn);

  /* ── Shared link helpers ─────────────────────────────────────────────── */

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  /* ── Auth button ─────────────────────────────────────────────────────── */

  const authButton = verified ? (
    <Link
      href="/admin"
      className="bg-brand-500/15 text-brand-300 ring-brand-500/30 hover:bg-brand-500/25 hover:ring-brand-500/50 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition-all"
    >
      <UserIcon />
      <span className="hidden sm:inline">
        {email ? (
          <span title={email}>{email.length > 22 ? email.slice(0, 20) + "…" : email}</span>
        ) : (
          "Dashboard"
        )}
      </span>
      <span className="sm:hidden">{email ? email.split("@")[0] : "Admin"}</span>
    </Link>
  ) : (
    <Link
      href="/login"
      className="bg-brand-500/15 text-brand-300 ring-brand-500/30 hover:bg-brand-500/25 hover:ring-brand-500/50 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition-all"
    >
      Sign In
    </Link>
  );

  /* ── STANDARD variant ────────────────────────────────────────────────── */

  if (variant === "standard") {
    return (
      <nav className="border-surface-800/60 bg-surface-950/70 fixed top-0 right-0 left-0 z-50 border-b backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          {/* Logo */}
          <Link
            href="/"
            className="font-display flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-white"
          >
            <Logomark size={26} />
            <span className="hidden sm:inline">Parametric Memory</span>
            <span className="sm:hidden">PMEM</span>
          </Link>

          {/* Links */}
          <div className="flex items-center gap-1 sm:gap-2">
            <a
              href="/docs"
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                isActive("/docs") ? "text-white" : "text-surface-400 hover:text-white"
              }`}
            >
              Docs
            </a>
            <a
              href="/pricing"
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                isActive("/pricing")
                  ? "font-medium text-white"
                  : "text-surface-400 hover:text-white"
              }`}
            >
              Pricing
            </a>

            {/* Substrate Viewer */}
            <Link
              href="/visualise"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition-all ${
                isActive("/visualise")
                  ? "bg-cyan-500/20 text-cyan-300 ring-cyan-500/50"
                  : "bg-brand-500/12 text-brand-300 ring-brand-500/30 hover:bg-brand-500/20 hover:ring-brand-500/50"
              }`}
            >
              <SubstrateIcon />
              <span className="hidden md:inline">Substrate</span>
            </Link>

            {/* Knowledge Graph */}
            <Link
              href="/knowledge"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition-all ${
                isActive("/knowledge")
                  ? "bg-violet-500/20 text-violet-300 ring-violet-500/50"
                  : "bg-violet-500/10 text-violet-400 ring-violet-500/25 hover:bg-violet-500/20 hover:ring-violet-500/45"
              }`}
            >
              <KnowledgeIcon />
              <span className="hidden md:inline">Knowledge</span>
            </Link>

            {authButton}
          </div>
        </div>
      </nav>
    );
  }

  /* ── IMMERSIVE variant ───────────────────────────────────────────────── */

  const badgeClasses =
    accentColor === "violet"
      ? "bg-violet-500/10 text-violet-400 ring-violet-500/20"
      : "bg-cyan-500/10 text-cyan-400 ring-cyan-500/20";

  const labelClasses = accentColor === "violet" ? "text-violet-500/60" : "text-cyan-500/60";

  return (
    <nav className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 py-3 md:px-6 md:py-4">
      {/* Left — brand */}
      <Link
        href="/"
        className="flex items-center gap-2 font-mono text-xs font-semibold tracking-wider text-slate-400 transition-colors hover:text-white md:text-sm"
      >
        <Logomark size={18} />
        <span className="hidden sm:inline">PARAMETRIC MEMORY</span>
        <span className="sm:hidden">PMEM</span>
      </Link>

      {/* Right — page tools + auth */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Cross-links between immersive pages */}
        {isActive("/visualise") ? (
          <Link
            href="/knowledge"
            className="font-mono text-xs text-slate-500 transition-colors hover:text-violet-300"
          >
            Knowledge →
          </Link>
        ) : (
          <Link
            href="/visualise"
            className="font-mono text-xs text-slate-500 transition-colors hover:text-cyan-300"
          >
            Substrate →
          </Link>
        )}

        {/* Auth */}
        {verified ? (
          <Link
            href="/admin"
            className="font-mono text-xs text-slate-500 transition-colors hover:text-white"
            title={email ?? "Admin"}
          >
            {email ? <span>{email.split("@")[0]}</span> : <UserIcon />}
          </Link>
        ) : (
          <Link
            href="/login"
            className="font-mono text-xs text-slate-500 transition-colors hover:text-white"
          >
            Sign In
          </Link>
        )}

        {/* Page label + LIVE badge */}
        {pageLabel && (
          <div className="flex items-center gap-1">
            <span className={`hidden font-mono text-xs tracking-widest sm:inline ${labelClasses}`}>
              {pageLabel}
            </span>
            <span
              className={`ml-1 rounded-full px-2 py-0.5 font-mono text-[10px] ring-1 sm:ml-2 ${badgeClasses}`}
            >
              LIVE
            </span>
          </div>
        )}
      </div>
    </nav>
  );
}
