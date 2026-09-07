/**
 * HeroL2Cache
 *
 * Candidate replacement for the landing-page hero.
 * Left: headline, sub-copy, CTAs. Right: the animated L2-cache infographic
 * plus a three-row L1 / L2 / L3 legend that anchors the cache analogy.
 *
 * Server component — no client JS. All motion lives in L2CacheInfographic's
 * CSS. Mounted at /hero-preview while the copy and motion are refined;
 * swapping it into src/app/page.tsx is a two-line change.
 */

import Link from "next/link";
import { L2CacheInfographic } from "./L2CacheInfographic";

export const HERO_L2_COPY = {
  line1: "Plug in an expert.",
  line2: "Your AI just got an L2 cache.",
  sub: "An MMPM substrate holds your domain as verifiable memory atoms. Every prompt recalls what matters — grounded, Merkle-proven, and compounding with every session.",
  meta: "Works with Claude, GPT, and any MCP-compatible agent.",
  primary: { label: "Get Your Instance", href: "/pricing" },
  secondary: { label: "See It Live", href: "/knowledge" },
} as const;

export const HERO_L2_LEGEND = [
  {
    tier: "L1",
    name: "Model weights",
    note: "Fast. Fixed at training time. Knows the world, not your world.",
    color: "#94a3b8",
  },
  {
    tier: "L2",
    name: "MMPM substrate",
    note: "Your domain. A few hundred verified tokens that prime the context — never fill it.",
    color: "#22d3ee",
  },
  {
    tier: "L3",
    name: "Re-explaining",
    note: "Pasting docs, repeating yourself. Fills the window, every session.",
    color: "#475569",
  },
] as const;

const gradStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #36aaf5 0%, #22d3ee 55%, #f59e0b 100%)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
  display: "inline",
};

export function HeroL2Cache() {
  return (
    <section
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden pt-24 pb-16"
      aria-label="Hero — Parametric Memory"
      data-testid="hero-l2"
    >
      {/* backdrop */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background: `
            radial-gradient(ellipse 60% 50% at 70% 45%, rgba(12,142,230,0.14) 0%, transparent 70%),
            radial-gradient(ellipse 40% 40% at 20% 60%, rgba(34,211,238,0.06) 0%, transparent 70%),
            #020617
          `,
        }}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-[1fr_1.15fr] lg:gap-10">
        {/* ── copy ─────────────────────────────────────────────────────── */}
        <div className="text-center lg:text-left">
          <p className="mb-5 font-mono text-[11px] tracking-[0.2em] text-cyan-300/80 uppercase">
            Persistent · Verifiable · Predictive
          </p>

          <h1
            className="font-display mb-6 font-extrabold tracking-tight text-white"
            style={{
              fontSize: "clamp(34px, 4.2vw, 60px)",
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
            }}
          >
            {HERO_L2_COPY.line1}
            <br />
            <span style={gradStyle}>{HERO_L2_COPY.line2}</span>
          </h1>

          <p
            className="font-body text-surface-200/85 mx-auto mb-4 max-w-xl lg:mx-0"
            style={{ fontSize: "clamp(16px, 1.6vw, 19px)", lineHeight: 1.5 }}
          >
            {HERO_L2_COPY.sub}
          </p>

          <p className="font-body text-surface-400/70 mb-10 text-sm">{HERO_L2_COPY.meta}</p>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start">
            <Link
              href={HERO_L2_COPY.primary.href}
              className="bg-brand-500 hover:bg-brand-400 inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-semibold text-white shadow-[0_0_32px_rgba(12,142,230,0.4)] transition-all hover:shadow-[0_0_44px_rgba(54,170,245,0.55)]"
            >
              {HERO_L2_COPY.primary.label}
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                />
              </svg>
            </Link>

            <Link
              href={HERO_L2_COPY.secondary.href}
              className="border-surface-800 bg-surface-900/60 text-surface-200/90 hover:border-brand-400/40 inline-flex items-center gap-2 rounded-xl border px-7 py-3.5 text-sm font-semibold backdrop-blur-sm transition-all hover:text-white"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="#36aaf5"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
                />
              </svg>
              {HERO_L2_COPY.secondary.label}
            </Link>
          </div>
        </div>

        {/* ── infographic ──────────────────────────────────────────────── */}
        <div className="w-full">
          <div className="border-surface-800/60 bg-surface-950/40 rounded-2xl border p-4 backdrop-blur-sm sm:p-6">
            <L2CacheInfographic />
          </div>

          <dl className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="hero-l2-legend">
            {HERO_L2_LEGEND.map((l) => (
              <div
                key={l.tier}
                className="border-surface-800/50 bg-surface-900/30 rounded-lg border px-3 py-2.5"
              >
                <dt className="flex items-center gap-2 font-mono text-[11px] tracking-widest uppercase">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: l.color, boxShadow: `0 0 8px ${l.color}` }}
                    aria-hidden="true"
                  />
                  <span style={{ color: l.color }}>{l.tier}</span>
                  <span className="text-surface-200">{l.name}</span>
                </dt>
                <dd className="font-body text-surface-400 mt-1 text-xs leading-snug">{l.note}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
