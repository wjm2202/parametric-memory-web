/**
 * HeroAnimatedSequence — server-rendered hero content.
 *
 * History: this used to cycle 5 taglines × 2s and only settle on the "close"
 * state H1 + CTAs after ~10 seconds. That made the H1 the LCP candidate and
 * delayed LCP to 14.2s in Lighthouse. Combined with state-driven opacity
 * (initial `shown: false` meant SSR painted at opacity 0), the hero was
 * effectively invisible to LCP for the entire trace.
 *
 * Now: pure server component, renders the close state immediately at full
 * opacity. LCP fires on first paint. Marketing can re-add a tagline carousel
 * later as a separate decorative layer that doesn't gate the H1.
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
      {/* Main heading — LCP candidate. Rendered fully on the server at full
          opacity so first paint satisfies LCP. */}
      <h1
        className="font-display mb-5 font-extrabold tracking-tight text-white"
        style={{
          fontSize: "clamp(32px, 4.5vw, 64px)",
          letterSpacing: "-0.04em",
          lineHeight: 1.05,
        }}
      >
        Your AI&apos;s second brain.
        <br />
        <span style={gradStyle}>Ready in minutes.</span>
      </h1>

      {/* Subtitle */}
      <p
        className="font-body mb-3 font-medium"
        style={{ fontSize: "clamp(16px, 2vw, 20px)", color: "#7cc8fb" }}
      >
        Persistent, Verifiable Memory for AI
      </p>

      <p
        className="font-body mb-10"
        style={{ fontSize: "clamp(13px, 1.4vw, 15px)", color: "rgba(148,163,184,0.55)" }}
      >
        Built for developers using Claude, GPT, and any MCP-compatible agent.
      </p>

      {/* CTAs — hover styles via Tailwind arbitrary values (no JS handlers). */}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <Link
          href="/pricing"
          data-testid="landing-hero-cta-primary"
          className="inline-flex items-center gap-2 rounded-xl bg-[#0c8ee6] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_0_32px_rgba(12,142,230,0.4)] transition-all hover:bg-[#36aaf5] hover:shadow-[0_0_44px_rgba(54,170,245,0.55)]"
        >
          Get Your Instance
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
          href="/knowledge"
          data-testid="landing-hero-cta-secondary"
          className="inline-flex items-center gap-2 rounded-xl border border-[rgba(30,41,59,1)] bg-[rgba(15,23,42,0.6)] px-7 py-3.5 text-sm font-semibold text-[rgba(203,213,225,0.9)] backdrop-blur-sm transition-all hover:border-[rgba(54,170,245,0.4)] hover:text-white"
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
          See It Live
        </Link>
      </div>
    </div>
  );
}
