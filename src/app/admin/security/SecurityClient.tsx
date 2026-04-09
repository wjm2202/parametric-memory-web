"use client";

import Link from "next/link";

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
      {/* Nav */}
      <div className="border-b border-white/5 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link
            href="/admin"
            className="text-sm text-white/40 transition-colors hover:text-white/70"
          >
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

        {/* ── Sign-in method ── */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
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
