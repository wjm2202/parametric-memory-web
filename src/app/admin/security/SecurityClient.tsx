"use client";

import Link from "next/link";
import SiteNavbar from "@/components/ui/SiteNavbar";
import { TwoFactorStatusCard } from "@/components/TwoFactorStatusCard";

interface AccountInfo {
  id: string;
  email: string;
}

interface SecurityClientProps {
  account: AccountInfo;
}

export default function SecurityClient({ account }: SecurityClientProps) {
  return (
    <div className="min-h-screen bg-[#030712] text-white">
      {/* Shared SiteNavbar gives this page consistent mobile/desktop nav and
          the hamburger drawer so logged-in mobile users have a single menu. */}
      <SiteNavbar isLoggedIn={true} variant="standard" />

      {/* Breadcrumb — keeps the in-page context after the global nav. */}
      <div className="border-b border-white/5 px-4 pt-20 pb-4 sm:px-6 sm:pt-24">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link
            href="/dashboard"
            className="text-sm text-white/40 transition-colors hover:text-white/70"
          >
            ← Dashboard
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-sm text-white/70">Security</span>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="mb-1 font-[family-name:var(--font-syne)] text-xl font-semibold text-white sm:text-2xl">
          Security settings
        </h1>
        <p className="mb-6 text-sm break-all text-white/50 sm:mb-8">{account.email}</p>

        {/* ── Sign-in method ── */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <h2 className="mb-0.5 font-semibold text-white">Sign-in method</h2>
          <p className="text-sm text-white/50">
            You sign in via magic link sent to{" "}
            <span className="break-all text-white/70">{account.email}</span>. No password is stored.
          </p>
        </div>

        {/* ── Two-factor authentication ──
            TOTP enrolment status + manage CTA. The card owns its own /status
            fetch so the page stays static-friendly for everyone who hasn't
            yet looked at this section.

            Sprint 8 of the TOTP rollout (docs/sprint-totp-implementation.md).
            Future factor kinds (WebAuthn) will mount as additional cards
            here; the layout is deliberately a single-column stack so a third
            card slots in without reflow. */}
        <div className="mt-4">
          <TwoFactorStatusCard />
        </div>

        {/* ── Auth audit feed ──
            Sprint 7 of the TOTP rollout (docs/sprint-totp-implementation.md).
            Read-only feed of every auth-relevant event tied to the account.
            Lives at /admin/security/audit because the page is recent-auth
            gated — same security bar as the TOTP card above, same magic-link
            round-trip on a stale window. */}
        <div className="mt-4">
          <Link
            href="/admin/security/audit"
            data-testid="auth-audit-card-link"
            className="block rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:bg-white/[0.06] sm:p-6"
          >
            <h2 className="mb-0.5 font-semibold text-white">Recent activity</h2>
            <p className="text-sm text-white/50">
              See every sign-in, sign-out, and security setting change on your account. Useful for
              spotting suspicious access — opens a recent-auth-gated audit page.
            </p>
            <p className="mt-2 text-sm text-white/70">View activity →</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
