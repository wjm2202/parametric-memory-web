import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { WaitlistForm } from "@/components/landing/WaitlistForm";
import { HeroSceneWrapper } from "@/components/landing/HeroSceneWrapper";
import SiteNavbar from "@/components/ui/SiteNavbar";

export const metadata: Metadata = {
  title: "Parametric Memory — Persistent, Verifiable Memory for AI",
  description:
    "Cryptographic Merkle proofs, Markov-chain prediction, and sub-millisecond recall. Dedicated AI memory instances from $9/mo.",
  alternates: { canonical: "https://parametric-memory.dev" },
};

// ── JSON-LD for this page ──────────────────────────────────────────────────
const landingJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Parametric Memory — Home",
  url: "https://parametric-memory.dev",
  description:
    "Persistent, verifiable memory for AI agents. Cryptographic Merkle proofs (RFC 6962), Markov-chain prediction (64% hit rate), sub-millisecond recall (0.045ms p50). Dedicated instances from $9/mo.",
  mainEntity: {
    "@type": "SoftwareApplication",
    name: "Parametric Memory",
    applicationCategory: "DeveloperApplication",
    offers: { "@type": "AggregateOffer", lowPrice: "9", priceCurrency: "USD" },
  },
};

// ── Logomark SVG (inline, used in nav) ────────────────────────────────────
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

// ── Feature data ───────────────────────────────────────────────────────────
const features = [
  {
    icon: (
      <svg
        width="20"
        height="20"
        fill="none"
        stroke="#36aaf5"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
        />
      </svg>
    ),
    accent: "text-brand-400",
    label: "Merkle Proofs",
    headline: "Every atom is cryptographically committed.",
    body: "RFC 6962-compliant SHA-256 Merkle tree. Tamper with one atom — the root hash changes. AI clients verify integrity without trusting the server.",
    stat: "37% token savings vs raw proofs",
  },
  {
    icon: (
      <svg
        width="20"
        height="20"
        fill="none"
        stroke="#f59e0b"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5"
        />
      </svg>
    ),
    accent: "text-amber-400",
    label: "Markov Prediction",
    headline: "Your next memory is already warm.",
    body: "Variable-order Markov chain predicts which atoms you'll access next. Pre-fetches context before the query arrives. Weights decay at 0.5^(days/7) — recency matters.",
    stat: "64% hit rate in production",
  },
  {
    icon: (
      <svg
        width="20"
        height="20"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
        />
      </svg>
    ),
    accent: "text-cyan-400",
    label: "Sub-ms Recall",
    headline: "0.045ms p50. Not a typo.",
    body: "LevelDB with JumpHash sharding across 4 independent Merkle trees. Dedicated instance means zero contention. No shared cluster, no noisy neighbours.",
    stat: "0.045ms p50 · 1.2ms p99",
  },
  {
    icon: (
      <svg
        width="20"
        height="20"
        fill="none"
        stroke="#36aaf5"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"
        />
      </svg>
    ),
    accent: "text-brand-400",
    label: "MCP-Native",
    headline: "25+ tools. Plug in, don't integrate.",
    body: "Streamable HTTP MCP transport. Works with Claude, Cowork, and any MCP-compatible client. OAuth2 + Bearer auth. The client your AI already speaks.",
    stat: "25 MCP tools · Streamable HTTP",
  },
];

// ── How it works steps ─────────────────────────────────────────────────────
const steps = [
  {
    n: "01",
    title: "Atom arrives",
    desc: "API call or MCP tool deposits a memory atom. Immediately hashed and committed to the Merkle tree.",
  },
  {
    n: "02",
    title: "JumpHash routes to shard",
    desc: "The atom key is deterministically routed to one of 4 LevelDB shards via JumpHash — O(1), no coordination.",
  },
  {
    n: "03",
    title: "Markov arc fires",
    desc: "The transition is recorded. The Markov predictor updates its weight table and schedules predictive prefetch.",
  },
  {
    n: "04",
    title: "Proof returned",
    desc: "On read, the atom comes with a Merkle audit path. Client verifies root hash. Tamper-evident, always.",
  },
];

// ── Stats ──────────────────────────────────────────────────────────────────
const stats = [
  { value: "0.045ms", label: "p50 recall latency" },
  { value: "64%", label: "Markov hit rate" },
  { value: "37%", label: "token savings (compact proofs)" },
  { value: "$9/mo", label: "dedicated instance, starting" },
];

// ── Page ───────────────────────────────────────────────────────────────────
export default async function HomePage() {
  const cookieStore = await cookies();
  const isLoggedIn = Boolean(cookieStore.get("mmpm_session")?.value);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd) }}
      />

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <SiteNavbar isLoggedIn={isLoggedIn} variant="standard" />

      <main>
        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <section
          className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden pt-20"
          aria-labelledby="hero-heading"
        >
          {/* R3F canvas — full bleed behind content */}
          <HeroSceneWrapper />

          {/* Gradient vignette — softens edges, ensures text legibility */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `
                radial-gradient(ellipse 70% 60% at 50% 50%, transparent 30%, #020617 85%),
                radial-gradient(ellipse 100% 30% at 50% 0%, #020617 0%, transparent 100%),
                radial-gradient(ellipse 100% 30% at 50% 100%, #020617 0%, transparent 100%)
              `,
            }}
            aria-hidden="true"
          />

          {/* Hero text — sits above the canvas */}
          <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
            {/* Status badge */}
            <div className="border-brand-500/20 bg-brand-950/60 mb-8 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              <span className="text-brand-300 font-mono text-[11px] tracking-widest uppercase">
                Now Available
              </span>
            </div>

            <h1
              id="hero-heading"
              className="font-display mb-5 text-5xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl"
              style={{ letterSpacing: "-0.035em", lineHeight: 1.05 }}
            >
              Memory that
              <br />
              <span
                style={{
                  background: "linear-gradient(135deg, #36aaf5 0%, #22d3ee 50%, #f59e0b 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                proves itself.
              </span>
            </h1>

            <p className="font-body text-brand-300 mb-4 text-lg font-medium sm:text-xl">
              Persistent, Verifiable Memory for AI
            </p>

            <p className="font-body text-surface-400 mx-auto mb-10 max-w-xl text-base leading-relaxed sm:text-lg">
              Cryptographic Merkle proofs. Markov-chain prediction. Sub-millisecond recall.
              Dedicated instances — not shared infrastructure.
            </p>

            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <a
                href="/docs"
                className="bg-brand-500 hover:bg-brand-400 inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-semibold text-white shadow-[0_0_28px_rgba(12,142,230,0.35)] transition-all hover:shadow-[0_0_36px_rgba(54,170,245,0.4)]"
              >
                Read the Docs
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                  />
                </svg>
              </a>
              <a
                href="/visualise"
                className="border-surface-800 bg-surface-900/60 text-surface-200 hover:border-brand-500/40 hover:bg-surface-800/60 inline-flex items-center gap-2 rounded-xl border px-7 py-3.5 text-sm font-semibold backdrop-blur-sm transition-all hover:text-white"
              >
                <svg
                  className="text-brand-400 h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
                  />
                </svg>
                Watch it live
              </a>
            </div>
          </div>

          {/* Scroll cue */}
          <div
            className="absolute bottom-10 left-1/2 z-10 -translate-x-1/2 animate-bounce opacity-40"
            aria-hidden="true"
          >
            <svg
              className="text-surface-400 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </section>

        {/* ── STATS BAR ─────────────────────────────────────────────────── */}
        <section
          className="border-surface-800/50 bg-surface-900/40 border-y backdrop-blur-sm"
          aria-label="Key metrics"
        >
          <div className="mx-auto max-w-5xl px-6 py-10">
            <dl className="grid grid-cols-2 gap-8 lg:grid-cols-4">
              {stats.map((s) => (
                <div key={s.value} className="text-center">
                  <dt className="text-surface-500 mb-2 font-mono text-[11px] tracking-widest uppercase">
                    {s.label}
                  </dt>
                  <dd
                    className="font-display text-3xl font-bold text-white"
                    style={{ letterSpacing: "-0.03em" }}
                  >
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── FEATURES ──────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-24" aria-labelledby="features-heading">
          {/* Section header */}
          <div className="mb-16 max-w-xl">
            <p className="text-brand-400 mb-3 font-mono text-[11px] tracking-widest uppercase">
              Capabilities
            </p>
            <h2
              id="features-heading"
              className="font-display mb-4 text-3xl font-bold text-white lg:text-4xl"
              style={{ letterSpacing: "-0.025em" }}
            >
              Built on verifiable mathematics.
            </h2>
            <p className="font-body text-surface-400 text-base leading-relaxed">
              Not approximations or fuzzy similarity search. Every claim is provable, every number
              is measured in production.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <article
                key={f.label}
                className="group border-surface-800 bg-surface-900/50 hover:border-brand-500/30 hover:bg-surface-900/80 relative rounded-2xl border p-6 transition-colors"
              >
                {/* Top-edge shimmer on hover */}
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl opacity-0 transition-opacity group-hover:opacity-100"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(54,170,245,0.5), transparent)",
                  }}
                  aria-hidden="true"
                />

                {/* Icon */}
                <div className="border-surface-800 bg-surface-800/60 mb-4 flex h-10 w-10 items-center justify-center rounded-xl border">
                  {f.icon}
                </div>

                {/* Label pill */}
                <p className="text-surface-500 mb-3 font-mono text-[10px] tracking-widest uppercase">
                  {f.label}
                </p>

                <h3
                  className="font-display mb-2 text-[15px] leading-snug font-semibold text-white"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  {f.headline}
                </h3>

                <p className="text-surface-400 mb-4 text-sm leading-relaxed">{f.body}</p>

                <p className={`font-mono text-xs ${f.accent}`}>{f.stat}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── HOW IT WORKS ──────────────────────────────────────────────── */}
        <section
          className="border-surface-800/50 bg-surface-900/30 border-t py-24"
          aria-labelledby="how-heading"
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-16 max-w-xl">
              <p className="text-brand-400 mb-3 font-mono text-[11px] tracking-widest uppercase">
                Architecture
              </p>
              <h2
                id="how-heading"
                className="font-display mb-4 text-3xl font-bold text-white lg:text-4xl"
                style={{ letterSpacing: "-0.025em" }}
              >
                From atom to proof in four steps.
              </h2>
              <p className="font-body text-surface-400 text-base leading-relaxed">
                No black boxes. Every stage is deterministic, measurable, and verifiable.
              </p>
            </div>

            <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4" aria-label="How MMPM works">
              {steps.map((step, i) => (
                <li key={step.n} className="relative">
                  {/* Connector line (desktop) */}
                  {i < steps.length - 1 && (
                    <div
                      className="absolute top-6 left-full z-10 hidden h-px w-6 lg:block"
                      style={{
                        background: "linear-gradient(90deg, rgba(54,170,245,0.3), transparent)",
                      }}
                      aria-hidden="true"
                    />
                  )}
                  <div className="border-surface-800 bg-surface-900/50 h-full rounded-2xl border p-6">
                    <span className="text-surface-800 mb-4 block font-mono text-3xl font-bold select-none">
                      {step.n}
                    </span>
                    <h3
                      className="font-display mb-2 text-base font-semibold text-white"
                      style={{ letterSpacing: "-0.01em" }}
                    >
                      {step.title}
                    </h3>
                    <p className="text-surface-400 text-sm leading-relaxed">{step.desc}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-10 text-center">
              <a
                href="/docs"
                className="font-body text-brand-400 hover:text-brand-300 inline-flex items-center gap-2 text-sm transition-colors"
              >
                Full architecture documentation
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                  />
                </svg>
              </a>
            </div>
          </div>
        </section>

        {/* ── LIVE DEMO CTA ─────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-24" aria-labelledby="demo-heading">
          <div
            className="border-brand-500/20 bg-surface-900/60 relative overflow-hidden rounded-3xl border p-10 text-center lg:p-16"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(54,170,245,0.06) 0%, transparent 70%), #0f172a",
            }}
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(54,170,245,0.4), transparent)",
              }}
              aria-hidden="true"
            />

            <p className="text-brand-400 mb-4 font-mono text-[11px] tracking-widest uppercase">
              Live Demo
            </p>
            <h2
              id="demo-heading"
              className="font-display mb-4 text-3xl font-bold text-white lg:text-4xl"
              style={{ letterSpacing: "-0.025em" }}
            >
              Watch the memory substrate live.
            </h2>
            <p className="font-body text-surface-400 mx-auto mb-8 max-w-lg text-base leading-relaxed">
              Real atoms. Real Merkle rehash cascades. Real Markov arc predictions. The /visualise
              page connects to a live MMPM instance — 821 atoms and counting.
            </p>
            <a
              href="/visualise"
              className="bg-brand-500 hover:bg-brand-400 inline-flex items-center gap-2.5 rounded-xl px-8 py-4 text-sm font-semibold text-white shadow-[0_0_32px_rgba(12,142,230,0.3)] transition-all hover:shadow-[0_0_44px_rgba(54,170,245,0.4)]"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
                />
              </svg>
              Open Live Visualiser
            </a>
          </div>
        </section>

        {/* ── WAITLIST ───────────────────────────────────────────────────── */}
        <section
          className="border-surface-800/50 bg-surface-900/30 border-t py-24"
          aria-labelledby="waitlist-heading"
          id="waitlist"
        >
          <div className="mx-auto max-w-xl px-6 text-center">
            <p className="text-brand-400 mb-4 font-mono text-[11px] tracking-widest uppercase">
              Get Started
            </p>
            <h2
              id="waitlist-heading"
              className="font-display mb-4 text-3xl font-bold text-white"
              style={{ letterSpacing: "-0.025em" }}
            >
              Stay in the loop.
            </h2>
            <p className="font-body text-surface-400 mb-8 text-base leading-relaxed">
              Dedicated AI memory instance, full MCP integration,
              direct line to the founding team. Starting at $9/mo.
            </p>
            <WaitlistForm />
            <p className="text-surface-600 mt-4 font-mono text-[11px]">
              No spam. Product updates and new features only.
            </p>
          </div>
        </section>

        {/* ── PRICING CTA ───────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="flex flex-col items-center gap-6 text-center lg:flex-row lg:justify-between lg:text-left">
            <div>
              <h2
                className="font-display mb-2 text-2xl font-bold text-white"
                style={{ letterSpacing: "-0.025em" }}
              >
                Five tiers. No shared clusters.
              </h2>
              <p className="font-body text-surface-400 text-sm">
                Starter ($9) → Solo ($29) → Team ($79) → Enterprise Cloud ($299) → Self-Hosted
                ($499)
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-4">
              <Link
                href="/pricing"
                className="bg-brand-500 hover:bg-brand-400 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(12,142,230,0.25)] transition-all"
              >
                View All Plans
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                  />
                </svg>
              </Link>
              <Link
                href="/docs"
                className="border-surface-800 text-surface-200 hover:border-surface-700 inline-flex items-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold transition-all hover:text-white"
              >
                Read Docs
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="border-surface-800/50 border-t">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <Logomark size={20} />
              <span className="font-display text-surface-400 text-sm font-semibold">
                Parametric Memory
              </span>
            </div>
            <nav className="flex items-center gap-6" aria-label="Footer navigation">
              <a
                href="/docs"
                className="font-body text-surface-600 hover:text-surface-300 text-sm transition-colors"
              >
                Docs
              </a>
              <a
                href="/pricing"
                className="font-body text-surface-600 hover:text-surface-300 text-sm transition-colors"
              >
                Pricing
              </a>
              <a
                href="/visualise"
                className="font-body text-surface-600 hover:text-surface-300 text-sm transition-colors"
              >
                Visualise
              </a>
            </nav>
            <p className="text-surface-700 font-mono text-[11px]">
              © 2026 Parametric Memory · parametric-memory.dev
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
