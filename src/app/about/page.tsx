import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import SiteNavbar from "@/components/ui/SiteNavbar";

export const metadata: Metadata = {
  title: "About — Parametric Memory",
  description:
    "Parametric Memory is a persistent, cryptographically verifiable memory substrate for AI agents. One founder, built with Claude, operated the same way we sell it.",
  alternates: { canonical: "https://parametric-memory.dev/about" },
  keywords: [
    "Parametric Memory team",
    "AI memory company",
    "Merkle proof technology",
    "AI-first development",
    "AI agent collaboration",
  ],
  openGraph: {
    title: "About | Parametric Memory",
    description:
      "Built by one human and a fleet of AI agents. Parametric Memory gives every AI a second brain — with Merkle proofs, Markov prediction, and full data isolation.",
    url: "https://parametric-memory.dev/about",
    images: [
      {
        url: "https://parametric-memory.dev/brand/og.png",
        width: 1200,
        height: 630,
        alt: "Parametric Memory — About",
      },
    ],
  },
};

const aboutJsonLd = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: "About Parametric Memory",
  url: "https://parametric-memory.dev/about",
  description:
    "Parametric Memory is a persistent, cryptographically verifiable memory substrate for AI agents — built by one founder with a fleet of AI agents.",
  mainEntity: {
    "@type": "Organization",
    name: "Parametric Memory",
    url: "https://parametric-memory.dev",
    foundingDate: "2025",
    foundingLocation: "New Zealand",
    description:
      "Persistent, verifiable memory substrate for AI agents. Merkle proofs, Markov prediction, knowledge graph, MCP-native.",
  },
};

export default async function AboutPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("mmpm_session");
  const isLoggedIn = !!sessionCookie?.value;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutJsonLd) }}
      />

      <SiteNavbar variant="standard" isLoggedIn={isLoggedIn} />

      <main className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-3xl px-6 pt-32 pb-16">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#2a2a3d] bg-[#12121a] px-3 py-1 text-xs text-[#8888aa]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7c5cfc]" />
            Built by one human. Powered by AI.
          </div>

          <h1 className="font-syne mb-6 text-4xl leading-tight font-bold tracking-tight text-[#e8e8f0] sm:text-5xl">
            We built this{" "}
            <span className="bg-gradient-to-r from-[#7c5cfc] to-[#22d3ee] bg-clip-text text-transparent">
              for ourselves.
            </span>
          </h1>

          <p className="text-lg leading-relaxed text-[#8888aa]">
            Every AI conversation starts from zero. Claude doesn&apos;t remember your architecture
            decisions from last month. GPT forgets your preferences the moment the session ends. We
            hit this wall building software with AI agents — and decided to fix it.
          </p>
        </section>

        {/* ── Story ─────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-3xl px-6 pb-16">
          <div className="space-y-6 leading-relaxed text-[#b0b0c8]">
            <p>
              Context that took an hour to establish would vanish overnight. The AI we were
              directing was brilliant in the moment and amnesiac by morning. So we built Parametric
              Memory — not as a product first, but as infrastructure for ourselves.
            </p>
            <p>
              It worked. Claude started remembering. Decisions made in March applied correctly in
              April. Corrections stuck. The relationship deepened. After months of running our
              entire development operation on it, we knew: this is the missing layer. And it&apos;s
              missing for everyone.
            </p>
          </div>
        </section>

        {/* ── Memory flow diagram ───────────────────────────────────────── */}
        <section className="mx-auto max-w-3xl px-6 pb-16">
          <svg
            viewBox="0 0 680 200"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full"
            aria-label="Context flows into Parametric Memory and is transferred to a new chat session"
          >
            <defs>
              {/* Glow filter for the logo */}
              <filter id="logoGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {/* Soft glow for particles */}
              <filter id="dot-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <linearGradient id="chatGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1a1a2e" />
                <stop offset="100%" stopColor="#12121a" />
              </linearGradient>
              <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#7c5cfc" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
              <linearGradient id="flowLeft" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#7c5cfc" stopOpacity="0" />
                <stop offset="100%" stopColor="#7c5cfc" stopOpacity="0.7" />
              </linearGradient>
              <linearGradient id="flowRight" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
              </linearGradient>
              <marker id="arr-r" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#22d3ee" fillOpacity="0.7" />
              </marker>
            </defs>

            {/* ── Left chat window ── */}
            <rect
              x="8"
              y="24"
              width="168"
              height="152"
              rx="10"
              fill="url(#chatGrad)"
              stroke="#2a2a3d"
              strokeWidth="1"
            />
            {/* Titlebar dots */}
            <circle cx="24" cy="38" r="4" fill="#f87171" fillOpacity="0.6" />
            <circle cx="38" cy="38" r="4" fill="#fbbf24" fillOpacity="0.6" />
            <circle cx="52" cy="38" r="4" fill="#34d399" fillOpacity="0.6" />
            <line x1="8" y1="50" x2="176" y2="50" stroke="#2a2a3d" strokeWidth="0.75" />
            {/* Chat bubbles — user messages */}
            <rect x="20" y="60" width="96" height="12" rx="6" fill="#2a2a3d" />
            <rect x="20" y="79" width="72" height="12" rx="6" fill="#2a2a3d" />
            <rect x="20" y="98" width="110" height="12" rx="6" fill="#2a2a3d" />
            <rect x="20" y="117" width="60" height="12" rx="6" fill="#2a2a3d" />
            {/* Assistant reply — fading out */}
            <rect x="20" y="140" width="130" height="10" rx="5" fill="#7c5cfc" fillOpacity="0.25" />
            <rect x="20" y="155" width="90" height="10" rx="5" fill="#7c5cfc" fillOpacity="0.12" />
            {/* Label */}
            <text
              x="92"
              y="190"
              fontSize="9.5"
              fill="#555570"
              textAnchor="middle"
              fontFamily="ui-monospace,monospace"
            >
              Session ending
            </text>

            {/* ── Flow left → centre: context particles ── */}
            {/* Flow line */}
            <line
              x1="178"
              y1="100"
              x2="276"
              y2="100"
              stroke="url(#flowLeft)"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
            {/* Particles: fragments of context moving right */}
            {[
              { cx: 200, cy: 86, label: "correction", color: "#7c5cfc" },
              { cx: 224, cy: 100, label: "decision", color: "#a78bfa" },
              { cx: 210, cy: 114, label: "preference", color: "#7c5cfc" },
            ].map(({ cx, cy, label, color }) => (
              <g key={label} filter="url(#dot-glow)">
                <circle cx={cx} cy={cy} r="5" fill={color} fillOpacity="0.9" />
                <text
                  x={cx}
                  y={cy - 9}
                  fontSize="7.5"
                  fill={color}
                  fillOpacity="0.75"
                  textAnchor="middle"
                  fontFamily="ui-monospace,monospace"
                >
                  {label}
                </text>
              </g>
            ))}

            {/* ── Centre: Parametric logo / substrate ── */}
            {/* Outer glow ring */}
            <circle
              cx="340"
              cy="100"
              r="46"
              fill="none"
              stroke="url(#logoGrad)"
              strokeWidth="0.75"
              strokeOpacity="0.4"
              strokeDasharray="3 4"
            />
            {/* Logo circle */}
            <circle
              cx="340"
              cy="100"
              r="36"
              fill="#0a0a0f"
              stroke="url(#logoGrad)"
              strokeWidth="1.5"
              filter="url(#logoGlow)"
            />
            {/* Logo image */}
            <image
              href="/brand/favicon-192.png"
              x="313"
              y="73"
              width="54"
              height="54"
              style={{ borderRadius: "50%" }}
            />
            {/* Atom labels inside */}
            <text
              x="340"
              y="148"
              fontSize="8.5"
              fill="#7c5cfc"
              fillOpacity="0.8"
              textAnchor="middle"
              fontFamily="ui-monospace,monospace"
            >
              v1.procedure.*
            </text>
            <text
              x="340"
              y="159"
              fontSize="8.5"
              fill="#22d3ee"
              fillOpacity="0.6"
              textAnchor="middle"
              fontFamily="ui-monospace,monospace"
            >
              v1.fact.* · v1.state.*
            </text>
            <text
              x="340"
              y="190"
              fontSize="9.5"
              fill="#555570"
              textAnchor="middle"
              fontFamily="ui-monospace,monospace"
            >
              Merkle-sealed · persistent
            </text>

            {/* ── Flow centre → right: loaded context ── */}
            <line
              x1="404"
              y1="100"
              x2="500"
              y2="100"
              stroke="url(#flowRight)"
              strokeWidth="1.5"
              markerEnd="url(#arr-r)"
            />
            {/* Particles: atoms flowing into new session */}
            {[
              { cx: 422, cy: 86, label: "correction", color: "#22d3ee" },
              { cx: 446, cy: 100, label: "decision", color: "#67e8f9" },
              { cx: 432, cy: 114, label: "preference", color: "#22d3ee" },
            ].map(({ cx, cy, label, color }) => (
              <g key={label} filter="url(#dot-glow)">
                <circle cx={cx} cy={cy} r="5" fill={color} fillOpacity="0.9" />
                <text
                  x={cx}
                  y={cy - 9}
                  fontSize="7.5"
                  fill={color}
                  fillOpacity="0.75"
                  textAnchor="middle"
                  fontFamily="ui-monospace,monospace"
                >
                  {label}
                </text>
              </g>
            ))}

            {/* ── Right chat window (new session) ── */}
            <rect
              x="504"
              y="24"
              width="168"
              height="152"
              rx="10"
              fill="url(#chatGrad)"
              stroke="#22d3ee"
              strokeWidth="1"
              strokeOpacity="0.3"
            />
            {/* Titlebar dots */}
            <circle cx="520" cy="38" r="4" fill="#f87171" fillOpacity="0.6" />
            <circle cx="534" cy="38" r="4" fill="#fbbf24" fillOpacity="0.6" />
            <circle cx="548" cy="38" r="4" fill="#34d399" fillOpacity="0.6" />
            <line x1="504" y1="50" x2="672" y2="50" stroke="#2a2a3d" strokeWidth="0.75" />
            {/* Bootstrap pill at top of new session */}
            <rect
              x="516"
              y="58"
              width="144"
              height="18"
              rx="9"
              fill="#22d3ee"
              fillOpacity="0.08"
              stroke="#22d3ee"
              strokeWidth="0.75"
              strokeOpacity="0.4"
            />
            <text
              x="588"
              y="71"
              fontSize="8.5"
              fill="#22d3ee"
              fillOpacity="0.8"
              textAnchor="middle"
              fontFamily="ui-monospace,monospace"
            >
              ↻ context bootstrapped
            </text>
            {/* Richer chat bubbles — AI already knows */}
            <rect x="516" y="84" width="96" height="12" rx="6" fill="#2a2a3d" />
            <rect x="516" y="103" width="120" height="12" rx="6" fill="#2a2a3d" />
            {/* Assistant reply — confident, full */}
            <rect x="516" y="123" width="136" height="10" rx="5" fill="#22d3ee" fillOpacity="0.2" />
            <rect
              x="516"
              y="138"
              width="110"
              height="10"
              rx="5"
              fill="#22d3ee"
              fillOpacity="0.14"
            />
            <rect x="516" y="153" width="80" height="10" rx="5" fill="#22d3ee" fillOpacity="0.08" />
            {/* Label */}
            <text
              x="588"
              y="190"
              fontSize="9.5"
              fill="#22d3ee"
              fillOpacity="0.5"
              textAnchor="middle"
              fontFamily="ui-monospace,monospace"
            >
              New session · already knows you
            </text>
          </svg>
        </section>

        {/* ── What it is ────────────────────────────────────────────────── */}
        <section className="border-t border-[#1a1a26] bg-[#0d0d14] px-6 py-16">
          <div className="mx-auto max-w-3xl">
            <h2 className="font-syne mb-8 text-2xl font-bold text-[#e8e8f0]">What it is</h2>

            <p className="mb-8 leading-relaxed text-[#b0b0c8]">
              Parametric Memory is a{" "}
              <strong className="text-[#e8e8f0]">
                persistent, cryptographically verifiable memory substrate
              </strong>{" "}
              for AI agents. That&apos;s a sentence worth unpacking.
            </p>

            <div className="space-y-6">
              {[
                {
                  term: "Persistent",
                  def: "Your AI's memory survives between sessions. When you start a new conversation, your agent bootstraps — loading relevant context, past decisions, corrections you've made, and a prediction of what it'll need to know today. You don't re-explain. You continue.",
                },
                {
                  term: "Cryptographically verifiable",
                  def: "Every memory has a Merkle proof. Not \u201cwe promise your data is intact.\u201d Mathematical evidence it hasn\u2019t been tampered with or quietly replaced. You can verify the integrity of any atom at any time. That\u2019s not how other memory tools work. That\u2019s how we believe they should.",
                },
                {
                  term: "Memory substrate",
                  def: "We run alongside your existing setup — a dedicated layer your AI connects to over MCP, the protocol that Claude, GPT, and every major AI platform is converging on. One config line. Your agent has memory in 60 seconds.",
                },
              ].map(({ term, def }) => (
                <div key={term} className="rounded-xl border border-[#2a2a3d] bg-[#12121a] p-6">
                  <div className="mb-2 font-semibold text-[#7c5cfc]">{term}</div>
                  <p className="text-sm leading-relaxed text-[#8888aa]">{def}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it's different ────────────────────────────────────────── */}
        <section className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="font-syne mb-4 text-2xl font-bold text-[#e8e8f0]">
            How it&apos;s different
          </h2>

          <p className="mb-10 leading-relaxed text-[#b0b0c8]">
            Most competitors give you a vector database and call it memory. Similarity search finds
            what&apos;s <em>related</em> — useful, but not enough. Memory is also{" "}
            <em>true, corrected, structured,</em> and <em>anticipatory</em>.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                icon: "⬡",
                title: "Typed atoms",
                body: "Facts, procedures, corrections, events, relations. Not undifferentiated text blobs. A correction is stored as a constraint — it comes back as a rule, not a suggestion.",
              },
              {
                icon: "◈",
                title: "Markov prediction",
                body: "Every bootstrap learns from every prior session. Over time, the system predicts what context you'll need before you ask. 64% hit rate and rising.",
              },
              {
                icon: "◆",
                title: "Knowledge graph",
                body: "Atoms connect to each other. Decisions link to the facts that drove them. Corrections constrain the behaviours they fixed. Included at every tier — not a $249/mo upgrade.",
              },
              {
                icon: "◇",
                title: "Merkle proofs",
                body: "Every atom, every write, every state transition has a cryptographic proof. You own your memory — and you can prove it.",
              },
            ].map(({ icon, title, body }) => (
              <div key={title} className="rounded-xl border border-[#2a2a3d] bg-[#12121a] p-6">
                <div className="mb-3 text-2xl text-[#7c5cfc]">{icon}</div>
                <div className="mb-2 font-semibold text-[#e8e8f0]">{title}</div>
                <p className="text-sm leading-relaxed text-[#8888aa]">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Architecture ──────────────────────────────────────────────── */}
        <section className="border-t border-[#1a1a26] bg-[#0d0d14] px-6 py-16">
          <div className="mx-auto max-w-3xl">
            <h2 className="font-syne mb-4 text-2xl font-bold text-[#e8e8f0]">
              The architecture choice we&apos;re proud of
            </h2>

            <div className="space-y-5 leading-relaxed text-[#b0b0c8]">
              <p>
                When we designed MMPM, the easy path was multi-tenancy. One database, all customers,
                shared compute. Cheaper to run, faster to build — standard SaaS playbook.
              </p>
              <p>We didn&apos;t do it.</p>
              <p>
                AI memory contains the most intimate data an AI system produces: your thought
                patterns, your corrections, your architecture decisions, your business logic. A
                multi-tenant memory store is a single bug away from catastrophic data breach — one
                customer&apos;s context leaking into another&apos;s.
              </p>
              <div className="rounded-xl border border-[#2a2a3d] bg-[#12121a] p-6">
                <p className="font-semibold text-[#e8e8f0]">
                  Every customer gets their own substrate.
                </p>
                <p className="mt-2 text-sm text-[#8888aa]">
                  Their own PostgreSQL instance. Their own Merkle tree with its own root hash. Their
                  own container pair with its own API key. Isolation by architecture, not by policy.
                  It costs more to operate. We think it&apos;s the only defensible choice for a
                  product selling <em>memory</em>.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── How we built it ───────────────────────────────────────────── */}
        <section className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="font-syne mb-4 text-2xl font-bold text-[#e8e8f0]">How we built it</h2>

          <div className="space-y-5 leading-relaxed text-[#b0b0c8]">
            <p>One founder. A fleet of AI agents. Zero employees. Sixty days.</p>
            <p>
              Every line of code was written in collaboration with Claude. Architecture decisions
              made together, reviewed together, tested together. The sprint plan, the API contracts,
              the security review — all of it was a dialogue between human judgment and AI
              execution.
            </p>
            <p>
              We don&apos;t think this is a party trick. We think it&apos;s the future of software.
              And we operate the same way we sell.
            </p>
            <blockquote className="border-l-2 border-[#7c5cfc] pl-5 text-[#8888aa] italic">
              &ldquo;We don&apos;t just sell you a second brain — we trust it with ours.&rdquo;
            </blockquote>
            <p>
              Our internal operations — every health check, every billing event, every customer
              signup — is a Merkle-sealed atom in our own MMPM substrate. The morning briefing agent
              reads last night&apos;s ops atoms and surfaces anything that needs attention. The
              security review agent runs weekly. We built a second brain for our AI, then built a
              company on top of it.
            </p>
          </div>
        </section>

        {/* ── Ops substrate diagram ─────────────────────────────────────── */}
        <section className="border-t border-[#1a1a26] bg-[#0d0d14] px-6 py-16">
          <div className="mx-auto max-w-3xl">
            <p className="mb-2 text-xs font-medium tracking-widest text-[#7c5cfc] uppercase">
              How it works for us
            </p>
            <h2 className="font-syne mb-3 text-2xl font-bold text-[#e8e8f0]">
              The platform that runs itself
            </h2>
            <p className="mb-10 leading-relaxed text-[#8888aa]">
              Every operational event — signups, billing, health checks, security alerts — flows
              into our own MMPM substrate as a Merkle-sealed atom. AI agents read that substrate to
              produce briefings, surface anomalies, and generate intelligence. The same system we
              sell runs the company that builds it.
            </p>

            {/* Diagram */}
            <div className="overflow-x-auto rounded-2xl border border-[#2a2a3d] bg-[#0a0a0f] p-6">
              <svg
                viewBox="0 0 720 340"
                xmlns="http://www.w3.org/2000/svg"
                className="mx-auto w-full max-w-2xl"
                aria-label="Ops substrate flow diagram"
              >
                <defs>
                  <marker
                    id="arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="3"
                    orient="auto"
                  >
                    <path d="M0,0 L0,6 L8,3 z" fill="#2a2a3d" />
                  </marker>
                  <marker
                    id="arrow-purple"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="3"
                    orient="auto"
                  >
                    <path d="M0,0 L0,6 L8,3 z" fill="#7c5cfc" />
                  </marker>
                  <marker
                    id="arrow-cyan"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="3"
                    orient="auto"
                  >
                    <path d="M0,0 L0,6 L8,3 z" fill="#22d3ee" />
                  </marker>
                  <linearGradient id="substrateFill" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#7c5cfc" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.08" />
                  </linearGradient>
                  <linearGradient id="substrateStroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#7c5cfc" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.6" />
                  </linearGradient>
                </defs>

                {/* ── Left column: event sources ── */}
                {[
                  { y: 60, label: "Customer signup", icon: "👤" },
                  { y: 130, label: "Billing event", icon: "💳" },
                  { y: 200, label: "Health check", icon: "♡" },
                  { y: 270, label: "Security alert", icon: "⚑" },
                ].map(({ y, label, icon }) => (
                  <g key={label}>
                    <rect
                      x="12"
                      y={y - 18}
                      width="148"
                      height="36"
                      rx="8"
                      fill="#12121a"
                      stroke="#2a2a3d"
                      strokeWidth="1"
                    />
                    <text x="26" y={y + 5} fontSize="13" fill="#555570">
                      {icon}
                    </text>
                    <text
                      x="46"
                      y={y + 5}
                      fontSize="11.5"
                      fill="#8888aa"
                      fontFamily="ui-monospace,monospace"
                    >
                      {label}
                    </text>
                    {/* Arrow to substrate */}
                    <line
                      x1="160"
                      y1={y}
                      x2="238"
                      y2={y}
                      stroke="#2a2a3d"
                      strokeWidth="1.5"
                      markerEnd="url(#arrow)"
                      strokeDasharray="4 3"
                    />
                  </g>
                ))}

                {/* ── Centre: MMPM ops substrate ── */}
                <rect
                  x="242"
                  y="28"
                  width="156"
                  height="284"
                  rx="14"
                  fill="url(#substrateFill)"
                  stroke="url(#substrateStroke)"
                  strokeWidth="1.5"
                />
                <text
                  x="320"
                  y="58"
                  fontSize="10"
                  fill="#7c5cfc"
                  textAnchor="middle"
                  fontFamily="ui-monospace,monospace"
                  letterSpacing="1"
                >
                  OPS SUBSTRATE
                </text>

                {/* Atom rows */}
                {[
                  { y: 82, label: "v1.event.signup_…", color: "#22d3ee" },
                  { y: 122, label: "v1.event.billing_…", color: "#7c5cfc" },
                  { y: 162, label: "v1.state.health_…", color: "#34d399" },
                  { y: 202, label: "v1.event.alert_…", color: "#fbbf24" },
                ].map(({ y, label, color }) => (
                  <g key={label}>
                    <rect
                      x="258"
                      y={y - 14}
                      width="124"
                      height="26"
                      rx="6"
                      fill="#12121a"
                      stroke={color}
                      strokeWidth="0.75"
                      strokeOpacity="0.5"
                    />
                    {/* Merkle dot */}
                    <circle cx="272" cy={y} r="3.5" fill={color} fillOpacity="0.8" />
                    <text
                      x="283"
                      y={y + 4.5}
                      fontSize="9.5"
                      fill="#8888aa"
                      fontFamily="ui-monospace,monospace"
                    >
                      {label}
                    </text>
                  </g>
                ))}

                {/* "Merkle sealed" label */}
                <text
                  x="320"
                  y="245"
                  fontSize="9"
                  fill="#555570"
                  textAnchor="middle"
                  fontFamily="ui-monospace,monospace"
                >
                  ● Merkle-sealed atoms
                </text>
                <text
                  x="320"
                  y="260"
                  fontSize="9"
                  fill="#555570"
                  textAnchor="middle"
                  fontFamily="ui-monospace,monospace"
                >
                  ● Cryptographic proofs
                </text>
                <text
                  x="320"
                  y="275"
                  fontSize="9"
                  fill="#555570"
                  textAnchor="middle"
                  fontFamily="ui-monospace,monospace"
                >
                  ● Markov prediction
                </text>
                <text
                  x="320"
                  y="295"
                  fontSize="9"
                  fill="#2a2a3d"
                  textAnchor="middle"
                  fontFamily="ui-monospace,monospace"
                >
                  via MCP
                </text>

                {/* ── Right column: AI agents reading ── */}
                {/* Arrows out */}
                <line
                  x1="398"
                  y1="100"
                  x2="468"
                  y2="100"
                  stroke="#7c5cfc"
                  strokeWidth="1.5"
                  markerEnd="url(#arrow-purple)"
                />
                <line
                  x1="398"
                  y1="170"
                  x2="468"
                  y2="170"
                  stroke="#7c5cfc"
                  strokeWidth="1.5"
                  markerEnd="url(#arrow-purple)"
                />
                <line
                  x1="398"
                  y1="240"
                  x2="468"
                  y2="240"
                  stroke="#22d3ee"
                  strokeWidth="1.5"
                  markerEnd="url(#arrow-cyan)"
                />

                {/* Agent boxes */}
                {[
                  {
                    y: 100,
                    label: "Morning briefing agent",
                    sub: "Daily digest → founder",
                    accent: "#7c5cfc",
                  },
                  {
                    y: 170,
                    label: "Security review agent",
                    sub: "Weekly audit → alert",
                    accent: "#7c5cfc",
                  },
                  {
                    y: 240,
                    label: "Business intelligence",
                    sub: "Trends, anomalies, insights",
                    accent: "#22d3ee",
                  },
                ].map(({ y, label, sub, accent }) => (
                  <g key={label}>
                    <rect
                      x="470"
                      y={y - 28}
                      width="238"
                      height="56"
                      rx="10"
                      fill="#12121a"
                      stroke={accent}
                      strokeWidth="1"
                      strokeOpacity="0.4"
                    />
                    <text x="486" y={y - 8} fontSize="11.5" fill="#e8e8f0" fontWeight="500">
                      {label}
                    </text>
                    <text
                      x="486"
                      y={y + 10}
                      fontSize="10"
                      fill="#555570"
                      fontFamily="ui-monospace,monospace"
                    >
                      {sub}
                    </text>
                    {/* Small agent icon */}
                    <circle
                      cx="690"
                      cy={y - 10}
                      r="5"
                      fill={accent}
                      fillOpacity="0.2"
                      stroke={accent}
                      strokeWidth="1"
                      strokeOpacity="0.4"
                    />
                    <text x="690" y={y - 6} fontSize="8" fill={accent} textAnchor="middle">
                      AI
                    </text>
                  </g>
                ))}

                {/* Bootstrap label on substrate top */}
                <text
                  x="320"
                  y="16"
                  fontSize="9"
                  fill="#555570"
                  textAnchor="middle"
                  fontFamily="ui-monospace,monospace"
                >
                  bootstrap → read → act
                </text>
              </svg>
            </div>

            <p className="mt-5 text-center text-xs text-[#555570]">
              The same architecture available to every customer — we just happen to use it on
              ourselves.
            </p>
          </div>
        </section>

        {/* ── Who it's for ──────────────────────────────────────────────── */}
        <section className="border-t border-[#1a1a26] bg-[#0a0a0f] px-6 py-16">
          <div className="mx-auto max-w-3xl">
            <h2 className="font-syne mb-8 text-2xl font-bold text-[#e8e8f0]">Who it&apos;s for</h2>

            <div className="space-y-4">
              {[
                {
                  label: "Developers",
                  desc: "Building systems where AI agents need to remember state, decisions, and corrections across sessions. Stop embedding context in every prompt. Let the agent remember.",
                },
                {
                  label: "Operators",
                  desc: "Running AI-powered workflows where consistency and auditability matter. Every memory has a proof. Every correction sticks. Every decision is traceable.",
                },
                {
                  label: "Power users",
                  desc: "Using Claude, GPT, or any MCP-compatible AI who want their AI to actually know them — their preferences, their projects, their rules. Not from a pasted document. From memory.",
                },
              ].map(({ label, desc }) => (
                <div
                  key={label}
                  className="flex gap-4 rounded-xl border border-[#2a2a3d] bg-[#12121a] p-5"
                >
                  <div className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-[#7c5cfc]" />
                  <div>
                    <div className="mb-1 font-semibold text-[#e8e8f0]">{label}</div>
                    <p className="text-sm leading-relaxed text-[#8888aa]">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────────────────────── */}
        <section className="px-6 py-20">
          <div className="mx-auto max-w-xl text-center">
            <p className="font-syne mb-3 text-lg font-semibold text-[#e8e8f0]">
              Your AI has been waiting to remember you.
            </p>
            <p className="mb-8 text-sm text-[#8888aa]">
              14-day free trial. No credit card required.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/signup"
                className="rounded-lg bg-[#7c5cfc] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Get started free
              </Link>
              <Link
                href="/pricing"
                className="rounded-lg border border-[#2a2a3d] px-6 py-3 text-sm font-medium text-[#8888aa] transition-colors hover:border-[#7c5cfc] hover:text-[#e8e8f0]"
              >
                View pricing →
              </Link>
            </div>
            <p className="mt-8 text-xs text-[#555570]">
              Parametric Memory is built and operated by Entity One, from New Zealand.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
