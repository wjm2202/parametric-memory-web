import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import SiteNavbar from "@/components/ui/SiteNavbar";

export const metadata: Metadata = {
  title: "Build your own RAG, or don't — MMPM vs. keyword retrieval",
  description:
    "You could build keyword RAG and match MMPM on simple lookups. But you'd build, tune, host, and maintain it — and still lack multi-hop recall, Merkle-verifiable provenance, a knowledge graph, and conflict detection. MMPM is all of that, managed, from $5/mo. Backed by a benchmark on our real production substrate.",
  alternates: { canonical: "https://parametric-memory.dev/benchmark" },
  openGraph: {
    title: "Build your own RAG, or don't — MMPM vs. keyword retrieval",
    description:
      "Match us on simple lookups by building RAG. Everything else — multi-hop, Merkle proofs, knowledge graph, no ops — is why teams buy MMPM. From $5/mo.",
    url: "https://parametric-memory.dev/benchmark",
    siteName: "Parametric Memory",
    images: [
      {
        url: "https://parametric-memory.dev/brand/mmpm-vs-prompt-grid.png",
        width: 1080,
        height: 1080,
        alt: "MMPM vs. build-your-own retrieval — capability and pricing comparison",
      },
    ],
    type: "article",
  },
};

type Tone = "good" | "warn" | "bad" | "muted";
const toneText: Record<Tone, string> = {
  good: "text-emerald-400",
  warn: "text-amber-400",
  bad: "text-red-400",
  muted: "text-surface-400",
};
const toneBg: Record<Tone, string> = {
  good: "bg-emerald-500/10",
  warn: "bg-amber-500/10",
  bad: "bg-red-500/10",
  muted: "bg-surface-800/40",
};

// ── Build-your-own-RAG vs MMPM ────────────────────────────────────────────────
const comparison: {
  capability: string;
  rag: { t: string; tone: Tone };
  mmpm: { t: string; tone: Tone };
}[] = [
  {
    capability: "Simple keyword lookup",
    rag: { t: "Yes", tone: "good" },
    mmpm: { t: "Yes — 100%", tone: "good" },
  },
  {
    capability: "Multi-hop recall (answer shares no words with the question)",
    rag: { t: "No — 0% in test", tone: "bad" },
    mmpm: { t: "Only arm that answered any", tone: "good" },
  },
  {
    capability: "Verifiable provenance (Merkle proofs)",
    rag: { t: "No", tone: "bad" },
    mmpm: { t: "Every atom", tone: "good" },
  },
  {
    capability: "Knowledge-graph edges (relationships, not chunks)",
    rag: { t: "No", tone: "bad" },
    mmpm: { t: "Built in", tone: "good" },
  },
  {
    capability: "Conflict detection (stale facts flagged)",
    rag: { t: "No", tone: "bad" },
    mmpm: { t: "Built in", tone: "good" },
  },
  {
    capability: "Cross-session persistence",
    rag: { t: "You build & host it", tone: "warn" },
    mmpm: { t: "Built in", tone: "good" },
  },
  {
    capability: "MCP-native — drops into your agent",
    rag: { t: "You wire it", tone: "warn" },
    mmpm: { t: "One endpoint", tone: "good" },
  },
  {
    capability: "Who builds, tunes, hosts & maintains it",
    rag: { t: "You", tone: "warn" },
    mmpm: { t: "Managed for you", tone: "good" },
  },
  {
    capability: "Cost",
    rag: { t: "Engineering time + infra", tone: "warn" },
    mmpm: { t: "From $5/mo", tone: "good" },
  },
];

const differentiators = [
  {
    tag: "Managed",
    title: "The retriever you don't build",
    body: "No chunking, embeddings, vector database, or ops to run. MMPM drops into your agent over a single MCP endpoint — the memory layer is someone else's problem to keep alive.",
  },
  {
    tag: "Verifiable",
    title: "Every memory, provable",
    body: "Each atom is sealed in an RFC 6962 Merkle tree — tamper-evident and auditable. You can prove what your agent knew, and when. Keyword retrieval can't offer that.",
  },
  {
    tag: "Predictive",
    title: "The right context before you ask",
    body: "Markov spreading activation surfaces facts that share no words with your query — the one capability that beat keyword retrieval in our benchmark, and the reason memory is more than search.",
  },
];

const tiers = [
  {
    name: "Starter",
    price: "$5",
    unit: "/mo",
    detail: "1,000 atoms · shared",
    badge: null as string | null,
  },
  { name: "Solo", price: "$9", unit: "/mo", detail: "10,000 atoms · shared", badge: null },
  {
    name: "Professional",
    price: "$29",
    unit: "/mo",
    detail: "100,000 atoms · dedicated infra",
    badge: "Most Popular",
  },
  {
    name: "Team",
    price: "$79",
    unit: "/mo",
    detail: "500,000 atoms · dedicated infra",
    badge: null,
  },
  {
    name: "Enterprise",
    price: "Contact",
    unit: "",
    detail: "Custom · self-hosted option",
    badge: null,
  },
];

const faqs = [
  {
    q: "Can't I just build this with a vector database?",
    a: "For simple keyword lookups, yes — in our benchmark, keyword retrieval tied MMPM at 100%. But that's a retriever you build, tune, host, and keep alive, and it still can't do multi-hop recall, give you Merkle-verifiable provenance, a knowledge graph, or conflict detection. MMPM is all of that, managed, from $5/mo.",
  },
  {
    q: "So does MMPM actually beat RAG?",
    a: "On simple keyword lookups, no — it's a tie (both answered 100%). We say that plainly. MMPM's edge is threefold: multi-hop recall (it was the only method to answer any multi-hop question in our test), cryptographic verifiability, and the fact that it isn't your team's problem to operate.",
  },
  {
    q: "Is the benchmark run on a real system?",
    a: "Yes — on our own production substrate, the same one we run our SaaS on, hardened across many revisions. Not a toy corpus. The numbers are deterministic and reproducible; the harness, probes, and seeds are in the repo.",
  },
  {
    q: "Why did the no-memory baseline score 0%?",
    a: "The facts are private to the substrate, so the model can't know them from training. With no retrieval it correctly refuses rather than guessing — which is exactly why any score above zero is attributable to the memory layer, not the model.",
  },
  {
    q: "What do I actually get at each price?",
    a: "Every tier ships the differentiators — Merkle proofs, Markov prediction, knowledge-graph edges, MCP-native — and scales on atoms and infrastructure: Starter ($5) and Solo ($9) on shared infra, Professional ($29, most popular) and Team ($79) on dedicated infrastructure, Enterprise on custom or self-hosted.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://parametric-memory.dev" },
    {
      "@type": "ListItem",
      position: 2,
      name: "Benchmark",
      item: "https://parametric-memory.dev/benchmark",
    },
  ],
};

export default async function BenchmarkPage() {
  const cookieStore = await cookies();
  const isLoggedIn = Boolean(cookieStore.get("mmpm_session")?.value);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <SiteNavbar isLoggedIn={isLoggedIn} variant="standard" />

      <main className="pt-[var(--site-nav-h)]">
        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <section
          className="mx-auto max-w-4xl px-6 pt-20 pb-10"
          aria-labelledby="bench-hero-heading"
        >
          <p className="text-brand-400 mb-4 font-mono text-[11px] tracking-[0.22em] uppercase">
            Build vs. buy · Agent memory
          </p>
          <h1
            id="bench-hero-heading"
            className="font-display text-4xl font-extrabold text-white lg:text-6xl"
            style={{ letterSpacing: "-0.03em", lineHeight: 1.05 }}
          >
            Build your own retriever.
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, #36aaf5 0%, #22d3ee 60%, #f59e0b 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Or don&apos;t.
            </span>
          </h1>
          <p className="font-body text-surface-400 mt-6 max-w-2xl text-lg leading-relaxed">
            Our benchmark settled one thing: your agent needs memory — answer accuracy went from{" "}
            <span className="font-medium text-red-400">0%</span> without it to{" "}
            <span className="font-medium text-emerald-400">~75%</span> with it. You could match us
            on simple lookups by building keyword RAG yourself. The question is whether you want to
            build, tune, host, and maintain that — or drop in a managed memory layer that also does
            what RAG can&apos;t.
          </p>
        </section>

        {/* ── MEMORY HIERARCHY (positioning visual, leads with strengths) ── */}
        <section
          className="mx-auto max-w-4xl px-6 pt-4 pb-8"
          aria-labelledby="bench-hierarchy-heading"
        >
          <h2
            id="bench-hierarchy-heading"
            className="font-display mb-6 text-2xl font-bold text-white lg:text-3xl"
            style={{ letterSpacing: "-0.02em" }}
          >
            Where MMPM sits: the L2 cache for AI
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
          <p className="text-surface-600 mt-4 text-sm leading-relaxed">
            Your vector database is main memory. MMPM is the L2 cache in front of it — the fast,
            predictive, verifiable tier that keeps the right context warm before your agent asks.{" "}
            <Link href="/verify" className="text-brand-400 hover:underline">
              Verify a memory yourself →
            </Link>
          </p>
        </section>

        {/* ── COMPARISON (centerpiece) ──────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-6 pb-4" aria-labelledby="bench-compare-heading">
          <h2
            id="bench-compare-heading"
            className="font-display mb-6 text-2xl font-bold text-white lg:text-3xl"
            style={{ letterSpacing: "-0.02em" }}
          >
            Build your own RAG, or use MMPM
          </h2>
          <div className="border-surface-800 overflow-x-auto rounded-2xl border">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-surface-800 border-b">
                  <th className="text-surface-400 px-4 py-4 text-sm font-medium">Capability</th>
                  <th className="px-4 py-4 text-center text-white">
                    <div className="font-display text-base font-bold">Build-your-own RAG</div>
                    <div className="text-surface-400 text-xs font-normal">you own it</div>
                  </th>
                  <th className="text-brand-400 px-4 py-4 text-center">
                    <div className="font-display text-base font-bold">MMPM</div>
                    <div className="text-surface-400 text-xs font-normal">managed</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.capability} className="border-surface-800 border-b last:border-0">
                    <th scope="row" className="px-4 py-4 align-middle">
                      <span className="font-body text-sm font-medium text-white">
                        {row.capability}
                      </span>
                    </th>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`inline-block rounded-lg px-3 py-2 text-sm font-medium ${toneBg[row.rag.tone]} ${toneText[row.rag.tone]}`}
                      >
                        {row.rag.t}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`inline-block rounded-lg px-3 py-2 text-sm font-medium ${toneBg[row.mmpm.tone]} ${toneText[row.mmpm.tone]}`}
                      >
                        {row.mmpm.t}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-surface-600 mt-4 text-sm leading-relaxed">
            The honest row is the first one: on simple keyword lookups, a RAG you build can match
            MMPM. Every row below it is what you&apos;d still be missing — or still be maintaining.
          </p>
        </section>

        {/* ── DIFFERENTIATORS (managed-first) ───────────────────────────── */}
        <section className="mx-auto max-w-4xl px-6 py-12" aria-labelledby="bench-diff-heading">
          <h2 id="bench-diff-heading" className="sr-only">
            What you&apos;re paying for
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {differentiators.map((d) => (
              <div
                key={d.title}
                className="border-surface-800 bg-surface-900 rounded-2xl border p-6"
              >
                <p className="text-brand-400 mb-2 font-mono text-[11px] tracking-[0.18em] uppercase">
                  {d.tag}
                </p>
                <h3 className="font-display text-lg font-bold text-white">{d.title}</h3>
                <p className="text-surface-400 mt-3 text-sm leading-relaxed">{d.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── PRICING LADDER ────────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-6 py-6" aria-labelledby="bench-price-heading">
          <h2
            id="bench-price-heading"
            className="font-display mb-2 text-2xl font-bold text-white lg:text-3xl"
            style={{ letterSpacing: "-0.02em" }}
          >
            One managed layer, priced to scale
          </h2>
          <p className="text-surface-400 mb-6 text-sm">
            Every tier ships Merkle proofs, Markov prediction, knowledge-graph edges, and MCP-native
            access.
          </p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {tiers.map((t) => (
              <div
                key={t.name}
                className={`bg-surface-900 rounded-2xl border p-5 ${t.badge ? "border-brand-500" : "border-surface-800"}`}
              >
                {t.badge && (
                  <span className="bg-brand-500/15 text-brand-400 mb-2 inline-block rounded-md px-2 py-0.5 text-[11px] font-medium">
                    {t.badge}
                  </span>
                )}
                <div className="font-body text-sm font-medium text-white">{t.name}</div>
                <div className="mt-1">
                  <span className="font-display text-2xl font-extrabold text-white">{t.price}</span>
                  <span className="text-surface-400 text-sm">{t.unit}</span>
                </div>
                <div className="text-surface-500 mt-2 text-xs leading-relaxed">{t.detail}</div>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="bg-brand-500 hover:bg-brand-400 inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-base font-semibold text-white shadow-[0_0_40px_rgba(12,142,230,0.4)] transition-all"
            >
              Start building →
            </Link>
            <Link
              href="/pricing"
              className="border-surface-700 text-surface-200 hover:border-surface-500 inline-flex items-center gap-2 rounded-xl border px-7 py-3.5 text-base font-semibold transition-all"
            >
              See full pricing
            </Link>
          </div>
        </section>

        {/* ── THE EVIDENCE (demoted benchmark) ──────────────────────────── */}
        <section className="mx-auto max-w-4xl px-6 py-12" aria-labelledby="bench-evidence-heading">
          <h2
            id="bench-evidence-heading"
            className="font-display mb-2 text-2xl font-bold text-white lg:text-3xl"
            style={{ letterSpacing: "-0.02em" }}
          >
            The evidence behind the claims
          </h2>
          <p className="text-surface-400 mb-6 text-sm leading-relaxed">
            A controlled retrieval + answer benchmark (Opus 4.8) on our real 3,716-fact production
            substrate. Deterministic and reproducible.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                stat: "0% → ~75%",
                head: "Memory is necessary",
                body: "Answer accuracy with no memory (or a recency prompt) vs. with MMPM-retrieved context. The no-context control scored 0%, proving answers come from retrieval, not the model.",
              },
              {
                stat: "Only MMPM",
                head: "Answered multi-hop",
                body: "On questions whose answer shares no words with the query, keyword RAG scored 0/18. MMPM was the only method to answer any (directional; small sample).",
              },
              {
                stat: "100% = 100%",
                head: "Tie on simple lookups",
                body: "On direct keyword lookups (n=48), MMPM and keyword RAG both answered 100%. We report where the baseline wins — it's what makes the rest credible.",
              },
            ].map((c) => (
              <div
                key={c.head}
                className="border-surface-800 bg-surface-900 rounded-2xl border p-6"
              >
                <div className="font-display text-brand-400 text-2xl font-extrabold">{c.stat}</div>
                <div className="font-body mt-1 text-sm font-medium text-white">{c.head}</div>
                <p className="text-surface-400 mt-3 text-sm leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
          <p className="text-surface-600 mt-4 text-sm leading-relaxed">
            Retrieval-side: a recency-maintained prompt surfaced the needed fact 0 of 48 times even
            at a 32,000-token budget; MMPM surfaced it using about 500 tokens — the same answer on
            roughly 0.2% of the tokens.
          </p>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-3xl px-6 py-6" aria-labelledby="bench-faq-heading">
          <h2
            id="bench-faq-heading"
            className="font-display mb-6 text-2xl font-bold text-white lg:text-3xl"
            style={{ letterSpacing: "-0.02em" }}
          >
            Questions people ask
          </h2>
          <div className="space-y-3">
            {faqs.map((f) => (
              <details
                key={f.q}
                className="border-surface-800 group bg-surface-900 rounded-xl border px-5 py-4"
              >
                <summary className="font-body flex cursor-pointer list-none items-center justify-between text-base font-medium text-white">
                  {f.q}
                  <span className="text-brand-400 ml-4 transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="text-surface-400 mt-3 text-sm leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────────────────────── */}
        <section
          className="mx-auto max-w-4xl px-6 pt-6 pb-24 text-center"
          aria-labelledby="bench-cta-heading"
        >
          <h2
            id="bench-cta-heading"
            className="font-display text-3xl font-extrabold text-white lg:text-4xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            Skip the retriever. Keep the memory.
          </h2>
          <p className="font-body text-surface-400 mx-auto mt-4 max-w-lg text-base leading-relaxed">
            Verifiable, connected, and predictive memory behind one MCP endpoint — from $5/mo.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="bg-brand-500 hover:bg-brand-400 inline-flex items-center gap-2 rounded-xl px-8 py-4 text-base font-semibold text-white shadow-[0_0_40px_rgba(12,142,230,0.4)] transition-all"
            >
              Get started →
            </Link>
            <Link
              href="/enterprise"
              className="border-surface-700 text-surface-200 hover:border-surface-500 inline-flex items-center gap-2 rounded-xl border px-8 py-4 text-base font-semibold transition-all"
            >
              For enterprise
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
