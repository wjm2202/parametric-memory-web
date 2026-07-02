/**
 * HeroAnimatedSequence — server-rendered hero content.
 *
 * History: this used to cycle 5 taglines × 2s and only settle on the "close"
 * state H1 + CTAs after ~10 seconds. That made the H1 the LCP candidate and
 * delayed LCP to 14.2s in Lighthouse. Combined with state-driven opacity
 * (initial `shown: false` meant SSR painted at opacity 0), the hero was
 * effectively invisible to LCP for the entire trace.
 *
 * Now: pure server component, renders the hero immediately at full opacity so
 * LCP fires on first paint.
 *
 * 2026-07-01 (holistic design review, Page 1): copy rewritten benefit-first
 * per finding P1 — the hero now leads with the outcome ("Your AI remembers
 * everything now. / And it can prove it.") and the cryptography is demoted to
 * the capabilities/proof layers below. Primary CTA → /pricing, secondary
 * "Watch it verify itself" → /verify. Canonical testids preserved.
 *
 * Hover effects on the CTAs use Tailwind arbitrary-value classes — no JS
 * event handlers, so the file can stay server-side.
 */

import Link from "next/link";

const gradStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #36aaf5 0%, #22d3ee 55%, #f59e0b 100%)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
  display: "inline",
};

export function HeroAnimatedSequence() {
  return (
    <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-6 text-center">
      {/* Eyebrow */}
      <p className="text-brand-400 mb-5 font-mono text-[11px] tracking-[0.28em] uppercase">
        Persistent memory for AI agents
      </p>

      {/* Main heading — LCP candidate. Rendered fully on the server at full
          opacity so first paint satisfies LCP. */}
      <h1
        className="font-display mb-6 font-extrabold tracking-tight text-white"
        style={{
          fontSize: "clamp(32px, 4.5vw, 64px)",
          letterSpacing: "-0.04em",
          lineHeight: 1.05,
        }}
      >
        Your AI remembers everything now.
        <br />
        <span style={gradStyle}>And it can prove it.</span>
      </h1>

      {/* Sub — the outcome, in plain language */}
      <p
        className="font-body text-surface-300 mb-9 max-w-2xl leading-relaxed"
        style={{ fontSize: "clamp(15px, 1.7vw, 18px)" }}
      >
        A permanent, private memory for any AI agent — one that survives every session, tool and
        restart. Every recall comes with a cryptographic proof that nothing was altered behind your
        back. Add one config block; your AI never starts from zero again.
      </p>

      {/* CTAs — hover styles via Tailwind arbitrary values (no JS handlers). */}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <Link
          href="/pricing"
          data-testid="landing-hero-cta-primary"
          aria-label="Get your instance — $5 per month"
          className="inline-flex items-center gap-2 rounded-xl bg-[#0c8ee6] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_0_36px_rgba(12,142,230,0.4)] transition-all hover:bg-[#36aaf5] hover:shadow-[0_0_48px_rgba(54,170,245,0.55)]"
        >
          Get your instance — $5/mo
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
          href="/verify"
          data-testid="landing-hero-cta-secondary"
          aria-label="Watch it verify itself"
          className="inline-flex items-center gap-2 rounded-xl border border-[rgba(30,41,59,1)] bg-[rgba(15,23,42,0.6)] px-7 py-3.5 text-sm font-semibold text-[rgba(203,213,225,0.9)] backdrop-blur-sm transition-all hover:border-[rgba(54,170,245,0.4)] hover:text-white"
        >
          Watch it verify itself
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="#36aaf5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
            />
          </svg>
        </Link>
      </div>
    </div>
  );
}
