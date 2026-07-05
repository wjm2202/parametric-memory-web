"use client";

/**
 * SiteNavbar — single shared navbar for all pages.
 *
 * Two variants:
 *   "standard"  — fixed, blurred dark background. Used on homepage, pricing, docs.
 *   "immersive" — absolute, transparent. Used on /visualise and /knowledge
 *                 (floats over full-screen canvas).
 *
 * IA (2026-07-02 declutter — see docs/DUAL-ACCESSIBILITY.md):
 *   The desktop row grew past its real estate (links overlapped the account
 *   chip). Fix keeps the top nav LEAN and pushes the long tail into a
 *   comprehensive footer sitemap (SiteFooter) that is always server-rendered
 *   — so both humans and crawlers/agents can reach every page from anywhere.
 *
 *     • PRIMARY_NAV  — high-intent links, always inline on desktop:
 *                      Verify, Enterprise, Docs, Pricing.
 *     • MORE_NAV     — secondary content links behind a "More" disclosure:
 *                      Blog, FAQ, About. The disclosure PANEL is always in
 *                      the DOM (toggled with `hidden`, never unmounted) so
 *                      AI agents and crawlers still see the links; humans get
 *                      an uncluttered row.
 *     • Knowledge    — kept as the accent chip (brand showcase).
 *     • Legal/Privacy — REMOVED from the nav; they now live only in the
 *                      footer sitemap (standard web IA; frees the row).
 *
 *   Signed-in state no longer prints the full email in the bar (it collided
 *   with the accent chip). Instead an avatar button (`nav-account-trigger`)
 *   opens an account menu (`nav-account-menu`) holding Dashboard / Billing /
 *   Security / Sign-out + the email. Same disclosure rules as "More".
 *
 * Mobile (< md):
 *   Below md the centre nav is hidden and replaced by a hamburger that opens
 *   a right-side drawer containing every nav link (PRIMARY + MORE + Knowledge)
 *   + an Account section when signed in. The drawer:
 *     - is a role="dialog" aria-modal region,
 *     - closes on ESC, on backdrop click, and on link tap,
 *     - locks body scroll while open,
 *     - returns focus to the hamburger button on close.
 *
 * testids + aria-labels follow docs/DUAL-ACCESSIBILITY.md (pre-registered).
 *
 * Auth:
 *   - `isLoggedIn` is determined server-side from the session cookie and passed
 *     as a prop. This avoids a client-side flash on initial render.
 *   - Session is validated client-side via /api/auth/me on mount.
 *     401 → stale cookie, flips to Sign In. 503/network → can't validate,
 *     optimistically keeps the server-determined state.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { openBillingPortal, signOut } from "@/lib/account-actions";

/* ─── Logomark ───────────────────────────────────────────────────────────── */

function Logomark({ size = 24 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/favicon-192.png"
      width={size}
      height={size}
      alt="Parametric Memory"
      style={{ borderRadius: "50%" }}
    />
  );
}

/* ─── Icons ──────────────────────────────────────────────────────────────── */

function KnowledgeIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
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
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="h-3 w-3 transition-transform duration-150"
      style={{ transform: open ? "rotate(180deg)" : "none" }}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 4.5 6 7.5 9 4.5" />
    </svg>
  );
}

function HamburgerIcon({ open }: { open: boolean }) {
  // Three-bar icon; the bars morph to an X when `open` is true.
  // `aria-hidden` because the button itself carries the label.
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line
        x1="3"
        y1={open ? "11" : "6"}
        x2="19"
        y2={open ? "11" : "6"}
        style={{
          transformOrigin: "center",
          transform: open ? "rotate(45deg)" : "none",
          transition: "transform 180ms ease, y 180ms ease",
        }}
      />
      <line
        x1="3"
        y1="11"
        x2="19"
        y2="11"
        style={{
          opacity: open ? 0 : 1,
          transition: "opacity 120ms ease",
        }}
      />
      <line
        x1="3"
        y1={open ? "11" : "16"}
        x2="19"
        y2={open ? "11" : "16"}
        style={{
          transformOrigin: "center",
          transform: open ? "rotate(-45deg)" : "none",
          transition: "transform 180ms ease, y 180ms ease",
        }}
      />
    </svg>
  );
}

/* ─── Types + nav data ───────────────────────────────────────────────────── */

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

interface NavItem {
  href: string;
  label: string;
  testid: string;
}

/**
 * High-intent links — always inline on desktop. Verify leads (cryptographic
 * verifier is a direct sales lever for regulated-industry buyers); Enterprise,
 * Docs and Pricing are the core buyer/developer journeys.
 */
const PRIMARY_NAV: NavItem[] = [
  { href: "/verify", label: "Verify", testid: "nav-link-verify" },
  { href: "/enterprise", label: "Enterprise", testid: "nav-link-enterprise" },
  { href: "/docs", label: "Docs", testid: "nav-link-docs" },
  { href: "/pricing", label: "Pricing", testid: "nav-link-pricing" },
];

/**
 * Secondary content links — behind the desktop "More" disclosure, but always
 * present in the mobile drawer and the footer sitemap. The disclosure panel is
 * rendered in the DOM at all times (toggled via `hidden`) so crawlers/agents
 * still discover these links.
 */
const MORE_NAV: NavItem[] = [
  { href: "/benchmark", label: "Benchmark", testid: "nav-link-benchmark" },
  { href: "/blog", label: "Blog", testid: "nav-link-blog" },
  { href: "/faq", label: "FAQ", testid: "nav-link-faq" },
  { href: "/about", label: "About", testid: "nav-link-about" },
];

/** Every nav link, in drawer order (PRIMARY then MORE). Knowledge is appended separately. */
const ALL_NAV: NavItem[] = [...PRIMARY_NAV, ...MORE_NAV];

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

/* ─── Menu / drawer state hooks ──────────────────────────────────────────── */

/**
 * Path-derived open state (RC-14, react-compiler-readiness). Rather than
 * synchronising "close on navigation" via a setState-in-effect, the open state
 * stores the pathname at which the menu was opened; `open` is derived as
 * "sentinel === current pathname". Any navigation changes `pathname` and
 * invalidates the open state automatically — no effect needed.
 *
 * Shared by the mobile drawer, the "More" disclosure, and the account menu.
 */
function useMenuAtPath(
  pathname: string,
): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void, () => void] {
  const [openAtPath, setOpenAtPath] = useState<string | null>(null);
  const open = openAtPath === pathname;
  const setOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      if (typeof next === "function") {
        setOpenAtPath((prevPath) => (next(prevPath === pathname) ? pathname : null));
      } else {
        setOpenAtPath(next ? pathname : null);
      }
    },
    [pathname],
  );
  const close = useCallback(() => setOpenAtPath(null), []);
  return [open, setOpen, close];
}

/**
 * Dismiss a popover on outside pointer-down and on Escape. On Escape, focus is
 * returned to the trigger for keyboard users.
 */
function useDismiss(
  open: boolean,
  close: () => void,
  containerRef: React.RefObject<HTMLElement | null>,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current && containerRef.current.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, containerRef, triggerRef]);
}

/**
 * Runs drawer side-effects: body scroll lock while open, ESC-to-close,
 * and focus return to the hamburger trigger on close.
 */
function useDrawerBehaviour(
  open: boolean,
  onClose: () => void,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
) {
  // Body scroll lock.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Return focus to the hamburger trigger when the drawer closes.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      triggerRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open, triggerRef]);
}

/* ─── "More" disclosure (desktop) ────────────────────────────────────────── */

function MoreMenu({
  isActive,
  pathname,
}: {
  isActive: (href: string) => boolean;
  pathname: string;
}) {
  const [open, setOpen, close] = useMenuAtPath(pathname);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useDismiss(open, close, containerRef, triggerRef);

  const anyActive = MORE_NAV.some((i) => isActive(i.href));

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-testid="nav-more-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="nav-more-menu"
        aria-label="More links"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
          anyActive || open ? "font-medium text-white" : "text-surface-400 hover:text-white"
        }`}
      >
        More
        <ChevronIcon open={open} />
      </button>

      {/* Panel is always in the DOM (toggled via `hidden`) so crawlers/agents
          discover Blog/FAQ/About even when the disclosure is closed. */}
      <div
        id="nav-more-menu"
        data-testid="nav-more-menu"
        hidden={!open}
        className="border-surface-800/70 bg-surface-950/95 absolute top-full right-0 mt-2 flex min-w-[10rem] flex-col gap-0.5 rounded-xl border p-1.5 shadow-2xl backdrop-blur-xl"
      >
        {MORE_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            data-testid={item.testid}
            onClick={close}
            className={`rounded-lg px-3 py-2 text-sm transition-colors ${
              isActive(item.href)
                ? "bg-surface-800/60 font-medium text-white"
                : "text-surface-300 hover:bg-surface-800/40 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ─── Account menu (desktop, signed in) ──────────────────────────────────── */

function AccountMenu({ email, pathname }: { email: string | null; pathname: string }) {
  const [open, setOpen, close] = useMenuAtPath(pathname);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useDismiss(open, close, containerRef, triggerRef);

  const initial = email ? email.trim().charAt(0).toUpperCase() : null;
  const triggerLabel = email ? `Account menu — signed in as ${email}` : "Account menu";

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-testid="nav-account-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="nav-account-menu"
        aria-label={triggerLabel}
        title={email ?? "Account"}
        onClick={() => setOpen((v) => !v)}
        className="bg-brand-500/15 text-brand-300 ring-brand-500/30 hover:bg-brand-500/25 hover:ring-brand-500/50 focus-visible:ring-brand-500/60 inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ring-1 transition-all focus:outline-none focus-visible:ring-2"
      >
        {initial ? <span aria-hidden="true">{initial}</span> : <UserIcon />}
      </button>

      <div
        id="nav-account-menu"
        data-testid="nav-account-menu"
        hidden={!open}
        className="border-surface-800/70 bg-surface-950/95 absolute top-full right-0 mt-2 flex min-w-[14rem] flex-col gap-0.5 rounded-xl border p-1.5 shadow-2xl backdrop-blur-xl"
      >
        {email && (
          <p
            data-testid="nav-account-email"
            className="text-surface-500 truncate px-3 pt-1.5 pb-2 text-xs"
          >
            Signed in as <span className="text-surface-300">{email}</span>
          </p>
        )}
        <Link
          href="/dashboard"
          data-testid="nav-auth-dashboard"
          aria-label="Open dashboard"
          onClick={close}
          className="text-surface-200 hover:bg-surface-800/50 flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
        >
          <UserIcon />
          Dashboard
        </Link>
        <button
          type="button"
          data-testid="nav-account-billing"
          onClick={() => {
            close();
            void openBillingPortal();
          }}
          className="text-surface-200 hover:bg-surface-800/50 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors"
        >
          <span>Billing</span>
          <span aria-hidden="true" className="text-surface-500 text-xs">
            ↗
          </span>
        </button>
        <Link
          href="/admin/security"
          data-testid="nav-account-security"
          onClick={close}
          className="text-surface-200 hover:bg-surface-800/50 rounded-lg px-3 py-2 text-sm transition-colors"
        >
          Security
        </Link>
        <button
          type="button"
          data-testid="nav-account-signout"
          onClick={() => {
            close();
            void signOut();
          }}
          className="mt-0.5 flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-rose-300/80 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
        >
          Sign out
        </button>
      </div>
    </div>
  );
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

  const [drawerOpen, setDrawerOpen, closeDrawer] = useMenuAtPath(pathname);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  useDrawerBehaviour(drawerOpen, closeDrawer, hamburgerRef);

  /* ── Shared link helpers ─────────────────────────────────────────────── */

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  /* ── Desktop auth control (pinned top-right, standard variant) ────────── */

  const authControl = verified ? (
    <AccountMenu email={email} pathname={pathname} />
  ) : (
    <Link
      href="/login"
      data-testid="nav-auth-signin"
      className="bg-brand-500/15 text-brand-300 ring-brand-500/30 hover:bg-brand-500/25 hover:ring-brand-500/50 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition-all"
    >
      Sign In
    </Link>
  );

  /* ── STANDARD variant ────────────────────────────────────────────────── */

  if (variant === "standard") {
    return (
      <>
        <nav
          aria-label="Primary"
          // Locked to --site-nav-h (defined in globals.css). Every overlay
          // across the site uses the same variable for its top inset so
          // the navbar always paints above the dim. Touching this height
          // means updating the variable, not editing this className.
          className="border-surface-800/60 bg-surface-950/70 fixed top-0 right-0 left-0 z-50 h-[var(--site-nav-h)] border-b backdrop-blur-xl"
        >
          <div className="relative mx-auto flex h-full max-w-6xl items-center px-4 sm:px-6">
            {/* ── Left: Logo (static anchor) ─────────────────────────────── */}
            <Link
              href="/"
              data-testid="nav-home"
              aria-label="Parametric Memory — home"
              className="font-display flex shrink-0 items-center gap-2.5 text-[15px] font-semibold tracking-tight text-white"
            >
              <Logomark size={26} />
              <span className="hidden sm:inline">Parametric Memory</span>
              <span className="sm:hidden">PMEM</span>
            </Link>

            {/* ── Centre: Nav links (desktop only — hidden below md) ─────── */}
            <div className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 md:flex md:gap-1.5">
              {PRIMARY_NAV.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-testid={item.testid}
                    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                      active ? "font-medium text-white" : "text-surface-400 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}

              {/* More disclosure (Blog / FAQ / About) */}
              <MoreMenu isActive={isActive} pathname={pathname} />

              {/* Knowledge Graph (accent — always visible on desktop nav) */}
              <Link
                href="/knowledge"
                data-testid="nav-link-knowledge"
                className={`ml-0.5 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition-all ${
                  isActive("/knowledge")
                    ? "bg-violet-500/20 text-violet-300 ring-violet-500/50"
                    : "bg-violet-500/10 text-violet-400 ring-violet-500/25 hover:bg-violet-500/20 hover:ring-violet-500/45"
                }`}
              >
                <KnowledgeIcon />
                <span className="hidden md:inline">Knowledge</span>
              </Link>
            </div>

            {/* ── Right: Auth + hamburger ─────────────────────────────────── */}
            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
              {authControl}

              {/* Hamburger — mobile only (< md) */}
              <button
                ref={hamburgerRef}
                type="button"
                data-testid="nav-hamburger"
                aria-label={drawerOpen ? "Close navigation menu" : "Open navigation menu"}
                aria-expanded={drawerOpen}
                aria-controls="nav-drawer"
                onClick={() => setDrawerOpen((v) => !v)}
                className="text-surface-300 hover:bg-surface-800/60 focus-visible:ring-brand-500/60 inline-flex h-11 w-11 items-center justify-center rounded-lg ring-1 ring-white/10 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 md:hidden"
              >
                <HamburgerIcon open={drawerOpen} />
              </button>
            </div>
          </div>
        </nav>

        {/* ── Mobile drawer (rendered only in standard variant) ─────────── */}
        <MobileDrawer
          open={drawerOpen}
          onClose={closeDrawer}
          isActive={isActive}
          verified={verified}
          email={email}
        />
      </>
    );
  }

  /* ── IMMERSIVE variant ───────────────────────────────────────────────── */

  const badgeClasses =
    accentColor === "violet"
      ? "bg-violet-500/10 text-violet-400 ring-violet-500/20"
      : "bg-cyan-500/10 text-cyan-400 ring-cyan-500/20";

  const labelClasses = accentColor === "violet" ? "text-violet-500/60" : "text-cyan-500/60";

  return (
    <nav
      aria-label="Primary"
      className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 py-3 md:px-6 md:py-4"
    >
      {/* Left — brand */}
      <Link
        href="/"
        data-testid="nav-immersive-home"
        aria-label="Parametric Memory — home"
        className="flex items-center gap-2 font-mono text-xs font-semibold tracking-wider text-slate-400 transition-colors hover:text-white md:text-sm"
      >
        <Logomark size={18} />
        <span className="hidden sm:inline">PARAMETRIC MEMORY</span>
        <span className="sm:hidden">PMEM</span>
      </Link>

      {/* Right — page tools + auth */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Auth */}
        {verified ? (
          <Link
            href="/dashboard"
            data-testid="nav-immersive-auth"
            aria-label="Open dashboard"
            className="font-mono text-xs text-slate-500 transition-colors hover:text-white"
            title={email ?? "My Substrate"}
          >
            {email ? <span>{email.split("@")[0]}</span> : <UserIcon />}
          </Link>
        ) : (
          <Link
            href="/login"
            data-testid="nav-immersive-auth"
            aria-label="Sign in"
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
              className={`ml-1 rounded-full px-2 py-0.5 font-mono text-[11px] ring-1 sm:ml-2 ${badgeClasses}`}
            >
              LIVE
            </span>
          </div>
        )}
      </div>
    </nav>
  );
}

/* ─── Mobile drawer component ────────────────────────────────────────────── */

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  isActive: (href: string) => boolean;
  verified: boolean;
  email: string | null;
}

function MobileDrawer({ open, onClose, isActive, verified, email }: MobileDrawerProps) {
  // Every link inside the drawer closes it on tap. Next.js Link navigation
  // happens synchronously; a parallel onClick is safe.
  const linkClose = () => onClose();

  return (
    <div
      // The outer wrapper is always rendered so CSS transitions can run.
      // `aria-hidden` + `inert`-like behaviour via pointer-events toggles.
      className={`fixed inset-0 z-[60] md:hidden ${
        open ? "pointer-events-auto" : "pointer-events-none"
      }`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close navigation menu"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Drawer panel */}
      <aside
        id="nav-drawer"
        data-testid="nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={`border-surface-800/60 bg-surface-950/95 absolute top-0 right-0 flex h-[100dvh] w-[min(86vw,320px)] flex-col border-l shadow-2xl backdrop-blur-xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header row — brand + close */}
        <div className="border-surface-800/60 flex items-center justify-between border-b px-5 py-4">
          <span className="font-display text-[15px] font-semibold tracking-tight text-white">
            Parametric Memory
          </span>
          <button
            type="button"
            data-testid="nav-drawer-close"
            aria-label="Close navigation menu"
            onClick={onClose}
            className="text-surface-300 hover:bg-surface-800/60 focus-visible:ring-brand-500/60 inline-flex h-11 w-11 items-center justify-center rounded-lg ring-1 ring-white/10 transition-colors hover:text-white focus:outline-none focus-visible:ring-2"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 4 L14 14 M14 4 L4 14" />
            </svg>
          </button>
        </div>

        {/* Scrollable nav body — locks the auth/account section to the bottom
            even when the link list is long, while still scrolling cleanly on
            short viewports. */}
        <div className="flex flex-1 flex-col overflow-y-auto">
          {/* Nav list — every primary + secondary link (Legal/Privacy live in
              the footer sitemap, reachable by scrolling any page). */}
          <nav aria-label="Mobile primary" className="flex flex-col gap-1 px-3 py-4">
            {ALL_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                data-testid={item.testid}
                onClick={linkClose}
                className={`rounded-lg px-4 py-3 text-base transition-colors ${
                  isActive(item.href)
                    ? "bg-surface-800/60 font-medium text-white"
                    : "text-surface-300 hover:bg-surface-800/40 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}

            {/* Knowledge Graph accent link */}
            <Link
              href="/knowledge"
              data-testid="nav-link-knowledge"
              onClick={linkClose}
              className={`mt-1 inline-flex items-center gap-2 rounded-lg px-4 py-3 text-base font-medium ring-1 transition-all ${
                isActive("/knowledge")
                  ? "bg-violet-500/20 text-violet-300 ring-violet-500/50"
                  : "bg-violet-500/10 text-violet-400 ring-violet-500/25 hover:bg-violet-500/20 hover:ring-violet-500/45"
              }`}
            >
              <KnowledgeIcon />
              Knowledge Graph
            </Link>
          </nav>

          {/* Account section — only when signed in. Pinned at bottom of the
              scroll body so primary nav stays at the top. */}
          {verified && (
            <div
              data-testid="nav-drawer-account"
              className="border-surface-800/60 mt-auto border-t px-3 pt-4 pb-2"
            >
              <p className="text-surface-500 px-4 pb-2 text-xs font-semibold tracking-wider uppercase">
                Account
              </p>
              <Link
                href="/dashboard"
                data-testid="nav-drawer-dashboard"
                onClick={linkClose}
                className={`flex items-center justify-between rounded-lg px-4 py-3 text-base transition-colors ${
                  isActive("/dashboard")
                    ? "bg-surface-800/60 font-medium text-white"
                    : "text-surface-300 hover:bg-surface-800/40 hover:text-white"
                }`}
              >
                <span>Dashboard</span>
                <UserIcon />
              </Link>
              <button
                type="button"
                data-testid="nav-drawer-billing"
                onClick={() => {
                  // Close the drawer first so the user sees the loading state
                  // of their browser nav, not a fading drawer over a redirect.
                  linkClose();
                  void openBillingPortal();
                }}
                className="text-surface-300 hover:bg-surface-800/40 flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-base transition-colors hover:text-white"
              >
                <span>Billing</span>
                <span aria-hidden="true" className="text-surface-500 text-xs">
                  ↗
                </span>
              </button>
              <Link
                href="/admin/security"
                data-testid="nav-drawer-security"
                onClick={linkClose}
                className={`flex items-center justify-between rounded-lg px-4 py-3 text-base transition-colors ${
                  isActive("/admin/security")
                    ? "bg-surface-800/60 font-medium text-white"
                    : "text-surface-300 hover:bg-surface-800/40 hover:text-white"
                }`}
              >
                <span>Security</span>
              </Link>
              <button
                type="button"
                data-testid="nav-drawer-signout"
                onClick={() => {
                  linkClose();
                  void signOut();
                }}
                className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-base text-rose-300/80 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
              >
                <span>Sign out</span>
              </button>
              {email && (
                <p className="text-surface-500 mt-1 truncate px-4 pt-1 pb-2 text-xs">
                  Signed in as <span className="text-surface-300">{email}</span>
                </p>
              )}
            </div>
          )}

          {/* Auth action pinned bottom (only when signed OUT — the account
              section above already covers the signed-in state). */}
          {!verified && (
            <div className="border-surface-800/60 mt-auto border-t px-5 py-4">
              <Link
                href="/login"
                data-testid="nav-auth-signin"
                onClick={linkClose}
                className="bg-brand-500/15 text-brand-300 ring-brand-500/30 hover:bg-brand-500/25 hover:ring-brand-500/50 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-base font-medium ring-1 transition-all"
              >
                Sign In
              </Link>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
