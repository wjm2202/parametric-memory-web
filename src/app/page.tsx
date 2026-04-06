import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { HeroSceneWrapper } from "@/components/landing/HeroSceneWrapper";
import { HeroAnimatedSequence } from "@/components/landing/HeroAnimatedSequence";
import SiteNavbar from "@/components/ui/SiteNavbar";

export const metadata: Metadata = {
  title: "Parametric Memory — Persistent, Verifiable Memory for AI",
  description:
    "Stop re-explaining. Give your AI a second brain with cryptographic Merkle proofs, Markov-chain prediction, and sub-millisecond recall. Dedicated instances from $9/mo.",
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
  datePublished: "2025-01-01",
  dateModified: new Date().toISOString().split("T")[0],
  inLanguage: "en-US",
  isPartOf: {
    "@type": "WebSite",
    name: "Parametric Memory",
    url: "https://parametric-memory.dev",
  },
  mainEntity: {
    "@type": "SoftwareApplication",
    name: "Parametric Memory",
    alternateName: "MMPM",
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: "AI Memory Infrastructure",
    softwareVersion: "1.0",
    description:
      "Persistent, verifiable memory substrate for AI agents. Cryptographic Merkle proofs, Markov-chain prediction, and MCP-native integration.",
    featureList: [
      "Cryptographic Merkle proofs (RFC 6962)",
      "Markov-chain predictive recall (64% hit rate)",
      "Sub-millisecond access latency (0.045ms p50)",
      "MCP-native integration (25+ tools)",
      "Compact proofs (37% token savings)",
      "Dedicated instances — no shared infrastructure",
    ],
    publisher: {
      "@type": "Organization",
      name: "Parametric Memory",
      url: "https://parametric-memory.dev",
    },
    offers: {
      "@type": "AggregateOffer",
      lowPrice: "9",
      highPrice: "499",
      priceCurrency: "USD",
      offerCount: "5",
    },
  },
};

// ── FAQPage JSON-LD — triggers People Also Ask + AI Overview citations ────────
const homeFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is Parametric Memory?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Parametric Memory (MMPM) is a persistent, cryptographically verifiable memory substrate for AI agents. It stores knowledge as named atoms in a SHA-256 Merkle tree, provides RFC 6962 consistency proofs on every read, and uses a Markov chain prediction layer to pre-fetch context before you ask for it. Dedicated instances from $9/month.",
      },
    },
    {
      "@type": "Question",
      name: "How is Parametric Memory different from Mem0 or Zep?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Parametric Memory provides cryptographic Merkle proofs on every memory read — Mem0 and Zep do not. Every customer gets a dedicated instance with their own PostgreSQL and Merkle tree — Mem0 and Zep use shared infrastructure. Markov-chain prediction pre-fetches context with a 64% hit rate. Knowledge graph edges are included at every tier, not paywalled.",
      },
    },
    {
      "@type": "Question",
      name: "What is a Merkle proof for AI memory?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A Merkle proof is a cryptographic audit path that proves a specific memory atom was stored in the tree at a specific version, without reading the entire tree. When your AI recalls a fact, it receives both the value and the proof. Verifying the proof takes 0.032ms and proves the memory has not been tampered with or quietly replaced.",
      },
    },
    {
      "@type": "Question",
      name: "Does Parametric Memory work with Claude?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Parametric Memory ships with a Model Context Protocol (MCP) server with 25+ tools. Add one config block to claude_desktop_config.json and Claude gains persistent memory immediately — no SDK required. It also works with Claude Code, Cowork, Cursor, Cline, and any MCP-compatible client.",
      },
    },
    {
      "@type": "Question",
      name: "How much does Parametric Memory cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Three plans: Indie at $9/month (10,000 memories, up to 33 Claude sessions/day), Pro at $29/month (100,000 memories, up to 333 sessions/day), and Team at $79/month (500,000 memories, unlimited sessions). Enterprise Cloud starts at $299/month. All paid plans include a 14-day free trial — no charge until day 15.",
      },
    },
    {
      "@type": "Question",
      name: "How long does setup take?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Under 60 seconds. Sign up, receive your instance credentials by email, add one config block to your MCP client, and your AI has persistent memory. No Docker, no self-hosting, no infrastructure work required.",
      },
    },
  ],
};

// ── BreadcrumbList for this page ───────────────────────────────────────────
const homeBreadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://parametric-memory.dev",
    },
  ],
};

// ── Logomark (inline, footer only) ────────────────────────────────────────
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
  { value: "<60s", label: "instance setup time" },
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeBreadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeFaqJsonLd) }}
      />

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <SiteNavbar isLoggedIn={isLoggedIn} variant="standard" />

      <main>
        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <section
          className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden pt-20"
          aria-label="Hero — Parametric Memory"
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

          {/* Animated hero sequence — taglines → close (client component) */}
          <HeroAnimatedSequence />

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
            <dl className="grid grid-cols-2 gap-8 lg:grid-cols-5">
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

            {/* Architecture CTA — text link only */}
            <div className="mt-10 flex flex-col items-center gap-5 sm:flex-row sm:justify-between">
              <Link
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
              </Link>

              {/* Repeated primary CTA */}
              <Link
                href="/pricing"
                className="bg-brand-500 hover:bg-brand-400 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(12,142,230,0.25)] transition-all hover:shadow-[0_0_32px_rgba(54,170,245,0.4)]"
              >
                Get Your Instance
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
            </div>
          </div>
        </section>

        {/* ── SOCIAL PROOF — We trust it with ours ──────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-24" aria-labelledby="trust-heading">
          <div
            className="relative overflow-hidden rounded-3xl border p-10 lg:p-16"
            style={{
              background: "linear-gradient(135deg, #0a1628 0%, #060f1e 100%)",
              borderColor: "rgba(54,170,245,0.15)",
            }}
          >
            {/* Corner glow */}
            <div
              className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full opacity-20"
              style={{ background: "radial-gradient(circle, #36aaf5, transparent 70%)" }}
              aria-hidden="true"
            />

            <div className="relative grid gap-12 lg:grid-cols-2 lg:items-center">
              {/* Left — the story */}
              <div>
                <p className="text-brand-400 mb-4 font-mono text-[11px] tracking-widest uppercase">
                  Built on our own product
                </p>
                <h2
                  id="trust-heading"
                  className="font-display mb-6 text-3xl font-bold text-white lg:text-4xl"
                  style={{ letterSpacing: "-0.025em", lineHeight: 1.15 }}
                >
                  We don&apos;t just sell you a second brain.
                  <br />
                  <span
                    style={{
                      background: "linear-gradient(135deg, #36aaf5 0%, #22d3ee 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    We trust it with ours.
                  </span>
                </h2>
                <p className="font-body text-surface-400 mb-6 text-base leading-relaxed">
                  Every billing event, health check, customer signup, and architecture decision at
                  Parametric Memory is a Merkle-sealed atom in our own MMPM substrate. The same
                  proofs that protect your data protect our audit trail.
                </p>
                <p className="font-body text-surface-400 text-base leading-relaxed">
                  If we trust it to run our company, you can trust it with your AI&apos;s memory.
                </p>
              </div>

              {/* Right — live proof indicators */}
              <div className="flex flex-col gap-4">
                {/* Live atom indicator */}
                <div
                  className="rounded-2xl border p-6"
                  style={{
                    background: "rgba(16,185,129,0.05)",
                    borderColor: "rgba(16,185,129,0.15)",
                  }}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className="h-2 w-2 animate-pulse rounded-full bg-emerald-400"
                      aria-hidden="true"
                    />
                    <span className="font-mono text-[11px] tracking-widest text-emerald-500 uppercase">
                      Our live substrate
                    </span>
                  </div>
                  <p
                    className="font-display text-4xl font-bold text-white"
                    style={{ letterSpacing: "-0.03em" }}
                  >
                    821+
                  </p>
                  <p className="text-surface-500 mt-1 font-mono text-xs">
                    atoms sealed · Merkle-verified · in production since March 2026
                  </p>
                </div>

                {/* Proof points */}
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Markov hit rate", value: "64%", color: "#f59e0b" },
                    { label: "Recall latency p50", value: "0.045ms", color: "#22d3ee" },
                    { label: "Merkle proofs issued", value: "Every read", color: "#36aaf5" },
                    { label: "Shared infrastructure", value: "None. Zero.", color: "#10b981" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="border-surface-800 bg-surface-900/50 rounded-xl border p-4"
                    >
                      <p
                        className="font-display text-lg font-bold text-white"
                        style={{ color: item.color }}
                      >
                        {item.value}
                      </p>
                      <p className="text-surface-500 mt-0.5 font-mono text-[11px] tracking-wide">
                        {item.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── LIVE DEMO CTA ─────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 pb-24" aria-labelledby="demo-heading">
          <div
            className="border-brand-500/20 relative overflow-hidden rounded-3xl border p-10 text-center lg:p-16"
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
              Real atoms. Real Merkle rehash cascades. Real Markov arc predictions. Connect to a
              live MMPM instance and watch memory form in real time.
            </p>
            <a
              href="/knowledge"
              className="border-surface-700 bg-surface-800/60 text-surface-200 hover:border-brand-500/40 inline-flex items-center gap-2.5 rounded-xl border px-8 py-4 text-sm font-semibold backdrop-blur-sm transition-all hover:text-white"
            >
              <svg
                className="text-brand-400 h-5 w-5"
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
              See It Live
            </a>
          </div>
        </section>

        {/* ── FINAL CTA — The close ──────────────────────────────────────── */}
        <section
          className="border-surface-800/50 border-t py-32"
          aria-labelledby="cta-heading"
          id="get-started"
        >
          <div className="mx-auto max-w-2xl px-6 text-center">
            <p className="text-brand-400 mb-4 font-mono text-[11px] tracking-widest uppercase">
              Get started today
            </p>
            <p
              id="cta-heading"
              className="font-display mb-5 text-4xl font-extrabold text-white lg:text-5xl"
              style={{ letterSpacing: "-0.03em", lineHeight: 1.1 }}
            >
              Start in 60 seconds.
              <br />
              <span
                style={{
                  background: "linear-gradient(135deg, #36aaf5 0%, #22d3ee 60%, #f59e0b 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Your AI will remember everything.
              </span>
            </p>
            <p className="font-body text-surface-400 mb-10 text-lg leading-relaxed">
              Dedicated substrate. Cryptographic proofs. Markov prediction.
              <br />
              Your own Merkle tree — not a row in someone else&apos;s database.
            </p>

            {/* Primary CTA — full and prominent */}
            <Link
              href="/pricing"
              className="bg-brand-500 hover:bg-brand-400 mb-4 inline-flex items-center gap-2.5 rounded-xl px-10 py-4 text-base font-semibold text-white shadow-[0_0_40px_rgba(12,142,230,0.4)] transition-all hover:shadow-[0_0_56px_rgba(54,170,245,0.5)]"
            >
              Get Your Instance
              <svg
                className="h-5 w-5"
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

            {/* Microcopy — removes friction */}
            <p className="text-surface-600 font-mono text-[12px]">
              Starting at $9/month · 14-day free trial · Cancel before day 15, pay nothing
            </p>

            {/* Tier hint */}
            <p className="text-surface-600 mt-3 font-mono text-[11px]">
              Indie $9 · Pro $29 · Team $79 · Enterprise Cloud $299 · Self-Hosted $499
            </p>
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
              <Link
                href="/docs"
                className="font-body text-surface-600 hover:text-surface-300 text-sm transition-colors"
              >
                Docs
              </Link>
              <Link
                href="/blog"
                className="font-body text-surface-600 hover:text-surface-300 text-sm transition-colors"
              >
                Blog
              </Link>
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
              <a
                href="/knowledge"
                className="font-body text-surface-600 hover:text-surface-300 text-sm transition-colors"
              >
                Knowledge
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
