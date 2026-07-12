import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { HeroSceneWrapper } from "@/components/landing/HeroSceneWrapper";
import { HeroAnimatedSequence } from "@/components/landing/HeroAnimatedSequence";
import SiteNavbar from "@/components/ui/SiteNavbar";
import { getHomeMetaDescription, getAggregateOfferData } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Parametric Memory — Persistent, Verifiable Memory for AI",
  description: getHomeMetaDescription(),
  alternates: { canonical: "https://parametric-memory.dev" },
  // S1 (holistic review): the metadata.keywords array was deleted 2026-07-01.
  // Google has ignored the keywords meta for over a decade; ranking intent
  // lives in the H2s, FAQ answers and structured data instead.
  openGraph: {
    title: "Parametric Memory — Persistent, Verifiable Memory for AI",
    description: getHomeMetaDescription(),
    url: "https://parametric-memory.dev",
    siteName: "Parametric Memory",
    images: [
      {
        url: "https://parametric-memory.dev/brand/og.png",
        width: 1200,
        height: 630,
        alt: "Parametric Memory — Persistent, verifiable AI memory",
      },
    ],
    type: "website",
  },
};

// ── JSON-LD for this page ──────────────────────────────────────────────────
const landingJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": "https://parametric-memory.dev/#webpage",
  name: "Parametric Memory — Home",
  url: "https://parametric-memory.dev",
  description:
    "Verifiable memory for AI agents. Scores 76.6% on LongMemEval-S out of the box with zero LLM calls at ingest — nothing to configure — and 83.0% with typed ingest, both graded by the benchmark's own official GPT-4o judge and shipped in a sealed, Merkle-rooted bundle you can re-verify. Markov prediction keeps context warm before you ask (64% hit rate); Merkle proofs (RFC 6962) make every recall verifiable. From $5/mo USD.",
  datePublished: "2025-01-01",
  dateModified: new Date().toISOString().split("T")[0],
  inLanguage: "en-US",
  isPartOf: {
    "@type": "WebSite",
    "@id": "https://parametric-memory.dev/#website",
    name: "Parametric Memory",
    url: "https://parametric-memory.dev",
  },
  mainEntity: {
    "@type": "SoftwareApplication",
    "@id": "https://parametric-memory.dev/#softwareapplication",
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
      "Sub-millisecond access latency (0.022ms p50)",
      "MCP-native integration (11 tools)",
      "Compact proofs (37% token savings)",
      "Dedicated instances on Professional and Team; isolated substrate on every tier",
    ],
    publisher: {
      "@type": "Organization",
      "@id": "https://parametric-memory.dev/#organization",
      name: "Parametric Memory",
      url: "https://parametric-memory.dev",
    },
    offers: {
      "@type": "AggregateOffer",
      ...getAggregateOfferData(),
    },
  },
};

// ── FAQPage JSON-LD — triggers People Also Ask + AI Overview citations ────────
const homeFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://parametric-memory.dev/#faq-home",
  mainEntity: [
    {
      "@type": "Question",
      name: "How does Parametric Memory score on LongMemEval?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "83.0% on LongMemEval-S with typed ingest, and 76.6% out of the box with zero LLM calls at ingest — both graded by the benchmark's own official GPT-4o judge, not an in-house one. Retrieval is 94.0% hit@10. Every run ships as a sealed bundle containing the run, the hypotheses, the official judge's transcript and the code, under a single Merkle root hash, so the number can be independently re-verified rather than taken on trust. Weakest axis, stated openly: preference-style recall at 30%.",
      },
    },
    {
      "@type": "Question",
      name: "What does Parametric Memory do with no configuration?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "It scores 76.6% on LongMemEval-S out of the box — no extraction pipeline, no model API key, no prompts to tune. Ingest performs zero LLM calls, so writes are instant and deterministic and your conversations never leave your infrastructure to be processed by a third-party model. Typed ingest, one extraction pass at roughly a tenth of a cent per session, raises that to 83.0%.",
      },
    },
    {
      "@type": "Question",
      name: "What is Parametric Memory?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Parametric Memory (MMPM) is a persistent, cryptographically verifiable memory substrate for AI agents. It stores knowledge as named atoms in a SHA-256 Merkle tree, provides RFC 6962 consistency proofs on every read, and uses a Markov chain prediction layer to pre-fetch context before you ask for it. Isolated substrates from $5/month USD; dedicated on Professional and Team.",
      },
    },
    {
      "@type": "Question",
      name: "How is Parametric Memory different from Mem0 or Zep?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Parametric Memory provides cryptographic Merkle proofs on every memory read — as of their published documentation (July 2026), neither Mem0 nor Zep documents a cryptographic proof layer. Every customer gets an isolated substrate with their own Merkle tree and API key, and Professional and Team run on fully dedicated infrastructure. Markov-chain prediction pre-fetches context with a 64% hit rate. Knowledge graph edges are included at every tier, not paywalled.",
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
        text: "Yes. Parametric Memory ships with a Model Context Protocol (MCP) server with 11 tools. Add one config block to claude_desktop_config.json and Claude gains persistent memory immediately — no SDK required. It also works with Claude Code, Cowork, Cursor, Cline, and any MCP-compatible client.",
      },
    },
    {
      "@type": "Question",
      name: "How much does Parametric Memory cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Four plans: Starter at $5/month (1,000 memories, up to 6 Claude sessions/day), Solo at $9/month (10,000 memories, up to 33 sessions/day), Professional at $29/month (100,000 memories, up to 333 sessions/day), and Team at $79/month (500,000 memories, up to 667 sessions/day). Enterprise and self-hosted deployments are available — talk to us. All prices in US dollars (USD).",
      },
    },
    {
      "@type": "Question",
      name: "How long does setup take?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "In minutes. Sign up, claim your API key from your dashboard, add one config block to your MCP client, and your AI has persistent memory. No Docker, no self-hosting, no infrastructure work required.",
      },
    },
  ],
};

// ── BreadcrumbList for this page ───────────────────────────────────────────
const homeBreadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "@id": "https://parametric-memory.dev/#breadcrumbs-home",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://parametric-memory.dev",
    },
  ],
};

// ── Arrow icon ─────────────────────────────────────────────────────────────
function ArrowIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
    </svg>
  );
}

// ── Hero honest proof band (P2 — every metric qualified) ────────────────────
// LongMemEval-S figures are graded by the benchmark's OWN official GPT-4o judge
// and ship in a sealed, Merkle-rooted bundle (see /benchmark, /verify).
const proofBand = [
  { value: "76.6%", label: "LongMemEval-S, zero setup" },
  { value: "83.0%", label: "with typed ingest" },
  { value: "64%", label: "recalled before you ask" },
  { value: "Every read", label: "carries a proof" },
];

// ── Setup steps ─────────────────────────────────────────────────────────────
const setupSteps = [
  {
    n: "01",
    text: "Sign up and pick a plan — your substrate provisions automatically.",
  },
  { n: "02", text: "Claim your API key in your dashboard — your config block is ready to copy." },
  { n: "03", text: "Paste one MCP config block. Your AI has memory — permanently." },
];

const setupConfig = `{
  "mcpServers": {
    "parametric-memory": {
      "type": "streamable-http",
      "url": "https://silver-flat-6czf.droplet-mcp.nz/mcp",
      "headers": {
        "Authorization": "Bearer mmpm_live_••••••"
      }
    }
  }
}`;

// ── Capabilities (P1 — benefit-first heading, mechanism + honest stat below) ─
const capabilities = [
  {
    accent: "text-brand-400",
    iconStroke: "#36aaf5",
    iconPath:
      "M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z",
    headline: "It never forgets",
    sub: "Every fact, kept and committed.",
    body: "Each memory is written to a SHA-256 Merkle tree the moment it arrives. Tamper with one atom and the root hash changes — so your AI can verify its own memory without trusting the server.",
    stat: "RFC 6962 Merkle proofs · 37% smaller than raw",
  },
  {
    accent: "text-amber-400",
    iconStroke: "#f59e0b",
    iconPath:
      "M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5",
    headline: "It's warm before you ask",
    sub: "The next memory is already loaded.",
    body: "A Markov chain learns which memories tend to follow which, and pre-fetches the context before the query lands. Recent memories weigh more; old paths decay.",
    stat: "64% predictive hit rate on our substrate",
  },
  {
    accent: "text-cyan-400",
    iconStroke: "#22d3ee",
    iconPath: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
    headline: "It answers instantly",
    sub: "Recall in a fraction of a millisecond.",
    body: "LevelDB sharded across four independent Merkle trees keeps recall sub-millisecond. Professional and Team run on a dedicated droplet — zero contention, no noisy neighbours; every tier stays an isolated substrate.",
    stat: "0.022ms p50 · 0.046ms p95, measured in production",
  },
  {
    accent: "text-brand-400",
    iconStroke: "#36aaf5",
    iconPath: "M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5",
    headline: "You plug in, you don't integrate",
    sub: "The client your AI already speaks.",
    body: "A Model Context Protocol server with 11 tools over streamable HTTP. Works with Claude, Claude Code, Cursor, Cline and any MCP-compatible client. No SDK to learn.",
    stat: "11 MCP tools · OAuth2 + Bearer",
  },
];

// ── Agent-operable pillars (A1 — surface the dual human/AI accessibility) ────
const agentPillars = [
  {
    title: "Every action, twice",
    body: "A UI control and an API endpoint that does exactly the same thing.",
  },
  {
    title: "Discoverable",
    body: "A published actions manifest and llms.txt so agents can find their way.",
  },
  {
    title: "Accessible, enforced",
    body: "Semantic HTML and labels checked in CI — the build fails without them.",
  },
];

// ── Pricing preview (P4 — 4 tiers, Professional anchored, enterprise collapsed)
// The $1 entry tier (id "free" in tiers.ts) is intentionally NOT advertised
// here — owner directive 2026-07-01: never advertise the $1 tier to humans
// or AI. Advertised tiers start at Starter ($5).
const pricingPreview = [
  {
    slug: "starter",
    name: "Starter",
    price: "$5",
    memories: "1,000 memories",
    features: ["Up to 6 sessions/day", "Merkle proofs included", "MCP-native"],
    popular: false,
  },
  {
    slug: "solo",
    name: "Solo",
    price: "$9",
    memories: "10,000 memories",
    features: ["Up to 33 sessions/day", "Knowledge-graph edges", "Everything in Starter"],
    popular: false,
  },
  {
    slug: "pro",
    name: "Professional",
    price: "$29",
    memories: "100,000 memories",
    features: ["Up to 333 sessions/day", "Priority provisioning", "Everything in Solo"],
    popular: true,
  },
  {
    slug: "team",
    name: "Team",
    price: "$79",
    memories: "500,000 memories",
    features: ["Up to 667 sessions/day", "Shared substrate access", "Everything in Professional"],
    popular: false,
  },
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
          {/* R3F canvas — full bleed behind content (reduced-motion aware) */}
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

          {/* Hero content (server component — LCP-friendly) */}
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

        {/* ── HONEST PROOF BAND (P2) ────────────────────────────────────── */}
        <section
          className="border-surface-800/50 bg-surface-900/40 border-y backdrop-blur-sm"
          aria-label="Key metrics"
        >
          <div className="mx-auto max-w-5xl px-6 py-10">
            <dl className="grid grid-cols-2 gap-8 lg:grid-cols-4">
              {proofBand.map((s) => (
                <div key={s.label} className="text-center">
                  <dd
                    className="font-display text-3xl font-bold text-white"
                    style={{ letterSpacing: "-0.03em" }}
                  >
                    {s.value}
                  </dd>
                  <dt className="text-surface-400 mt-2 font-mono text-[11px] tracking-widest uppercase">
                    {s.label}
                  </dt>
                </div>
              ))}
            </dl>
            <p className="text-surface-500 mt-8 text-center font-mono text-[11px] tracking-wide">
              Latency and hit-rate measured on our own production substrate — not a customer
              benchmark.
            </p>
          </div>
        </section>

        {/* ── MEMORY HIERARCHY (L2-cache positioning visual) ────────────── */}
        <section className="mx-auto max-w-4xl px-6 py-20" aria-labelledby="hierarchy-heading">
          <p className="text-brand-400 mb-3 font-mono text-[11px] tracking-widest uppercase">
            The memory hierarchy
          </p>
          <h2
            id="hierarchy-heading"
            className="font-display mb-8 text-3xl font-extrabold text-white lg:text-4xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            Where we sit: the L2 cache for AI.
          </h2>
          <div className="space-y-2">
            <div className="border-surface-800 bg-surface-900/50 flex items-center gap-4 rounded-xl border px-5 py-4">
              <div className="text-surface-500 w-14 shrink-0 font-mono text-xs">L1</div>
              <div className="flex-1">
                <div className="font-body text-sm font-medium text-white">Context window</div>
                <div className="text-surface-500 text-xs">
                  Tiny · fastest · volatile — cleared every session
                </div>
              </div>
            </div>
            <div className="border-brand-500 bg-brand-500/10 flex items-center gap-4 rounded-xl border-2 px-5 py-5">
              <div className="text-brand-400 w-14 shrink-0 font-mono text-xs font-bold">L2</div>
              <div className="flex-1">
                <div className="font-display text-brand-400 text-base font-bold">
                  Parametric Memory — the L2 cache
                </div>
                <div className="text-surface-300 mt-1 text-sm">
                  Predictive prefetch (64% hit) · Merkle-verified · sub-ms recall · your hot working
                  set
                </div>
              </div>
              <div className="text-brand-400 hidden text-xs font-medium sm:block">
                warm before you ask
              </div>
            </div>
            <div className="border-surface-800 bg-surface-900/50 flex items-center gap-4 rounded-xl border px-5 py-4">
              <div className="text-surface-500 w-14 shrink-0 font-mono text-xs">Main</div>
              <div className="flex-1">
                <div className="font-body text-sm font-medium text-white">
                  Vector DB · knowledge base · files
                </div>
                <div className="text-surface-500 text-xs">Large · slow · cold storage</div>
              </div>
            </div>
          </div>
          <p className="text-surface-500 mt-6 max-w-2xl text-sm leading-relaxed">
            Your vector database is main memory. Parametric Memory is the L2 cache in front of it —
            the fast, predictive, verifiable tier that keeps the right context warm before your
            agent asks.{" "}
            <Link href="/verify" className="text-brand-400 hover:underline">
              Verify a memory yourself →
            </Link>
          </p>
        </section>

        {/* ── SETUP ─────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-24" aria-labelledby="setup-heading">
          <div className="mb-14 max-w-xl">
            <p className="text-brand-400 mb-3 font-mono text-[11px] tracking-widest uppercase">
              Setup
            </p>
            <h2
              id="setup-heading"
              className="font-display mb-4 text-3xl font-bold text-white lg:text-4xl"
              style={{ letterSpacing: "-0.025em" }}
            >
              From signup to remembering, in under a minute.
            </h2>
            <p className="font-body text-surface-400 text-base leading-relaxed">
              No Docker. No self-hosting. No SDK. Sign up, claim your key from your dashboard, and
              paste one config block into the AI client you already use.
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            {/* Steps */}
            <ol className="flex flex-col gap-6">
              {setupSteps.map((step) => (
                <li key={step.n} className="flex gap-4">
                  <span className="text-brand-400 font-mono text-sm font-bold select-none">
                    {step.n}
                  </span>
                  <p className="text-surface-300 text-base leading-relaxed">{step.text}</p>
                </li>
              ))}
            </ol>

            {/* Config code card */}
            <div className="border-surface-800 bg-surface-950/80 overflow-hidden rounded-2xl border">
              <div className="border-surface-800 bg-surface-900/60 flex items-center gap-2 border-b px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" aria-hidden="true" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#22d3ee]" aria-hidden="true" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]" aria-hidden="true" />
                <span className="text-surface-500 ml-2 font-mono text-xs">
                  claude_desktop_config.json
                </span>
              </div>
              <pre className="text-surface-300 overflow-x-auto p-5 font-mono text-xs leading-relaxed">
                {setupConfig}
              </pre>
            </div>
          </div>
        </section>

        {/* ── CAPABILITIES (P1) ─────────────────────────────────────────── */}
        <section
          className="border-surface-800/50 bg-surface-900/30 border-t py-24"
          aria-labelledby="features-heading"
          data-testid="landing-section-features"
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-16 max-w-xl">
              <p className="text-brand-400 mb-3 font-mono text-[11px] tracking-widest uppercase">
                What your AI gets
              </p>
              <h2
                id="features-heading"
                className="font-display mb-4 text-3xl font-bold text-white lg:text-4xl"
                style={{ letterSpacing: "-0.025em" }}
              >
                Four things it couldn&apos;t do before.
              </h2>
              <p className="font-body text-surface-400 text-base leading-relaxed">
                The benefit first. The mathematics that make it true, underneath.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              {capabilities.map((f) => (
                <article
                  key={f.headline}
                  className="group border-surface-800 bg-surface-900/50 hover:border-brand-500/30 hover:bg-surface-900/80 relative rounded-2xl border p-7 transition-colors"
                >
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl opacity-0 transition-opacity group-hover:opacity-100"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, rgba(54,170,245,0.5), transparent)",
                    }}
                    aria-hidden="true"
                  />
                  <div className="border-surface-800 bg-surface-800/60 mb-4 flex h-10 w-10 items-center justify-center rounded-xl border">
                    <svg
                      width="20"
                      height="20"
                      fill="none"
                      stroke={f.iconStroke}
                      strokeWidth="1.5"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d={f.iconPath} />
                    </svg>
                  </div>

                  <h3
                    className="font-display text-lg font-semibold text-white"
                    style={{ letterSpacing: "-0.01em" }}
                  >
                    {f.headline}
                  </h3>
                  <p className="text-surface-300 mt-1 mb-3 text-sm font-medium">{f.sub}</p>
                  <p className="text-surface-400 mb-4 text-sm leading-relaxed">{f.body}</p>
                  <p className={`font-mono text-xs ${f.accent}`}>{f.stat}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── AGENT-OPERABLE (A1) ───────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-24" aria-labelledby="agent-heading">
          <div
            className="relative overflow-hidden rounded-3xl border p-10 lg:p-16"
            style={{
              background: "linear-gradient(135deg, #0a1628 0%, #060f1e 100%)",
              borderColor: "rgba(54,170,245,0.15)",
            }}
          >
            <div
              className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full opacity-20"
              style={{ background: "radial-gradient(circle, #36aaf5, transparent 70%)" }}
              aria-hidden="true"
            />
            <div className="relative max-w-2xl">
              <p className="text-brand-400 mb-3 font-mono text-[11px] tracking-widest uppercase">
                Built for who&apos;s actually using it
              </p>
              <h2
                id="agent-heading"
                className="font-display mb-5 text-3xl font-bold text-white lg:text-4xl"
                style={{ letterSpacing: "-0.025em" }}
              >
                Operable by the humans and the agents.
              </h2>
              <p className="font-body text-surface-300 text-base leading-relaxed">
                Increasingly, the thing driving your dashboard isn&apos;t a person — it&apos;s
                Claude-in-Chrome, Operator, Atlas. So every button here has a stable handle and a
                documented API equal, and every page ships a machine-readable action manifest. A
                human clicks it; an agent calls it. Both just work.
              </p>
            </div>

            <div className="relative mt-10 grid gap-6 sm:grid-cols-3">
              {agentPillars.map((p) => (
                <div
                  key={p.title}
                  className="border-surface-800 bg-surface-900/50 rounded-2xl border p-6"
                >
                  <h3 className="font-display mb-2 text-base font-semibold text-white">
                    {p.title}
                  </h3>
                  <p className="text-surface-400 text-sm leading-relaxed">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── VERIFY (P3 — replaces self-referential social proof) ──────── */}
        <section className="border-surface-800/50 border-t py-24" aria-labelledby="verify-heading">
          <div className="mx-auto max-w-2xl px-6 text-center">
            <p className="text-brand-400 mb-4 font-mono text-[11px] tracking-widest uppercase">
              Trust, earned not asked
            </p>
            <h2
              id="verify-heading"
              className="font-display mb-5 text-3xl font-bold text-white lg:text-4xl"
              style={{ letterSpacing: "-0.025em", lineHeight: 1.15 }}
            >
              Don&apos;t take our word for it. Take the proof.
            </h2>
            <p className="font-body text-surface-400 mx-auto mb-8 max-w-xl text-base leading-relaxed">
              Drop a signed memory snapshot into your browser and verify it yourself — no API key,
              no account, not one line of our code in the loop. If a single atom was altered, the
              check fails in front of you. That&apos;s the whole point: you shouldn&apos;t have to
              trust us. Ask any memory vendor for the same artifact.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/verify"
                data-testid="landing-verify-cta"
                aria-label="Verify a snapshot yourself"
                className="bg-brand-500 hover:bg-brand-400 inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-semibold text-white shadow-[0_0_36px_rgba(12,142,230,0.4)] transition-all hover:shadow-[0_0_48px_rgba(54,170,245,0.5)]"
              >
                Verify a snapshot yourself
                <ArrowIcon />
              </Link>
              <Link
                href="/docs"
                data-testid="landing-verify-how"
                aria-label="See how it works"
                className="font-body text-brand-400 hover:text-brand-300 inline-flex items-center gap-2 text-sm transition-colors"
              >
                See how it works
                <ArrowIcon />
              </Link>
            </div>
            <p className="text-surface-500 mt-10 font-mono text-xs">
              We run our own company on it — 1,000+ Merkle-sealed atoms in production, and growing.
            </p>
          </div>
        </section>

        {/* ── PRICING PREVIEW (P4) ──────────────────────────────────────── */}
        <section
          className="border-surface-800/50 bg-surface-900/30 border-t py-24"
          aria-labelledby="pricing-heading"
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-14 max-w-xl">
              <p className="text-brand-400 mb-3 font-mono text-[11px] tracking-widest uppercase">
                Pricing
              </p>
              <h2
                id="pricing-heading"
                className="font-display mb-4 text-3xl font-bold text-white lg:text-4xl"
                style={{ letterSpacing: "-0.025em" }}
              >
                An isolated substrate from $5.
              </h2>
              <p className="font-body text-surface-400 text-base leading-relaxed">
                Every plan is an isolated substrate with its own Merkle tree and API key —
                Professional and Team run on dedicated infrastructure. Pick by how much your AI
                needs to remember.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {pricingPreview.map((tier) => (
                <Link
                  key={tier.slug}
                  href="/pricing"
                  data-testid={`landing-pricing-${tier.slug}`}
                  aria-label={`View ${tier.name} plan — ${tier.price} per month`}
                  className={`group relative flex flex-col rounded-2xl border p-6 transition-colors ${
                    tier.popular
                      ? "border-brand-500/50 bg-surface-900/80"
                      : "border-surface-800 bg-surface-900/50 hover:border-brand-500/30"
                  }`}
                >
                  {tier.popular && (
                    <span className="bg-brand-500 absolute -top-3 left-6 rounded-full px-3 py-1 font-mono text-[11px] font-semibold tracking-widest text-white uppercase">
                      Most popular
                    </span>
                  )}
                  <p className="text-surface-400 font-mono text-[11px] tracking-widest uppercase">
                    {tier.name}
                  </p>
                  <p
                    className="font-display mt-2 text-3xl font-bold text-white"
                    style={{ letterSpacing: "-0.03em" }}
                  >
                    {tier.price}
                    <span className="text-surface-500 text-base font-normal">/mo</span>
                  </p>
                  <p className="text-surface-300 mt-1 text-sm font-medium">{tier.memories}</p>
                  <ul className="border-surface-800 mt-4 flex flex-col gap-2 border-t pt-4">
                    {tier.features.map((feat) => (
                      <li key={feat} className="text-surface-400 text-sm leading-snug">
                        {feat}
                      </li>
                    ))}
                  </ul>
                </Link>
              ))}
            </div>

            {/* Enterprise collapse (P4) */}
            <Link
              href="/contact"
              data-testid="landing-pricing-enterprise"
              aria-label="Talk to us about enterprise and self-hosted deployments"
              className="border-surface-700 hover:border-brand-500/40 group mt-6 flex flex-col items-start justify-between gap-3 rounded-2xl border border-dashed p-6 transition-colors sm:flex-row sm:items-center"
            >
              <div>
                <p className="font-display text-base font-semibold text-white">
                  Enterprise &amp; self-hosted
                </p>
                <p className="text-surface-400 text-sm">
                  Dedicated clusters, on-prem deployment, custom capacity and SLAs.
                </p>
              </div>
              <span className="text-brand-400 group-hover:text-brand-300 inline-flex items-center gap-2 font-mono text-sm whitespace-nowrap">
                Talk to us
                <ArrowIcon />
              </span>
            </Link>

            <p className="text-surface-500 mt-6 text-center font-mono text-xs">
              All prices in USD · 7-day money-back guarantee · cancel anytime
            </p>
          </div>
        </section>

        {/* ── FINAL CTA — the close ─────────────────────────────────────── */}
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
              Start in minutes.
              <br />
              <span
                style={{
                  background: "linear-gradient(135deg, #36aaf5 0%, #22d3ee 60%, #f59e0b 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Never start from zero again.
              </span>
            </p>
            <p className="font-body text-surface-400 mb-10 text-lg leading-relaxed">
              Your own isolated substrate, cryptographic proofs and predictive recall — your own
              Merkle tree, not a row in someone else&apos;s database.
            </p>

            <Link
              href="/pricing"
              data-testid="landing-final-cta"
              aria-label="Get your instance — $5 per month"
              className="bg-brand-500 hover:bg-brand-400 mb-4 inline-flex items-center gap-2.5 rounded-xl px-10 py-4 text-base font-semibold text-white shadow-[0_0_40px_rgba(12,142,230,0.4)] transition-all hover:shadow-[0_0_56px_rgba(54,170,245,0.5)]"
            >
              Get your instance — $5/mo
              <ArrowIcon className="h-5 w-5" />
            </Link>

            <p className="text-surface-400 text-sm">7-day money-back guarantee · cancel anytime</p>
          </div>
        </section>
      </main>
    </>
  );
}
