import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import SiteNavbar from "@/components/ui/SiteNavbar";

export const metadata: Metadata = {
  title: "Does memory beat a good prompt? — The benchmark — Parametric Memory",
  description:
    "A controlled Tier-1 retrieval benchmark on a real 3,716-fact corpus. A recency prompt found the needed fact 0 of 48 times even at 32,000 tokens; MMPM found all 48 using ~500 tokens. Honest, reproducible, and it names where keyword retrieval ties.",
  alternates: { canonical: "https://parametric-memory.dev/benchmark" },
  openGraph: {
    title: "Does memory beat a good prompt? — The benchmark",
    description:
      "Recency prompt: 0/48 needed-fact recall even at 32k tokens. MMPM: 48/48 at ~500 tokens. A reproducible retrieval benchmark on a real corpus.",
    url: "https://parametric-memory.dev/benchmark",
    siteName: "Parametric Memory",
    images: [
      {
        url: "https://parametric-memory.dev/brand/mmpm-vs-prompt-grid.png",
        width: 1080,
        height: 1080,
        alt: "Comparison grid: recency prompt vs keyword RAG vs MMPM across five retrieval benefits",
      },
    ],
    type: "article",
  },
};

type Tone = "good" | "warn" | "bad";
const cellText: Record<Tone, string> = {
  good: "text-emerald-400",
  warn: "text-amber-400",
  bad: "text-red-400",
};
const cellBg: Record<Tone, string> = {
  good: "bg-emerald-500/10",
  warn: "bg-amber-500/10",
  bad: "bg-red-500/10",
};

const columns = [
  { name: "Recency prompt", sub: "no retrieval" },
  { name: "Keyword RAG", sub: "strong baseline" },
  { name: "MMPM", sub: "with memory" },
];

const rows: {
  label: string;
  sub?: string;
  cells: { t: string; s?: string; tone: Tone }[];
}[] = [
  {
    label: "Answer a fact from your history",
    sub: "48 real recall tasks",
    cells: [
      { t: "0 / 48", s: "even at 32k tokens", tone: "bad" },
      { t: "48 / 48", s: "at ~500 tokens", tone: "good" },
      { t: "48 / 48", s: "at ~500 tokens", tone: "good" },
    ],
  },
  {
    label: "Tokens spent to get there",
    sub: "context per query",
    cells: [
      { t: "32k+", s: "and still misses", tone: "bad" },
      { t: "~500", s: "then plateaus", tone: "good" },
      { t: "~500", s: "caps at ~3.4k", tone: "good" },
    ],
  },
  {
    label: "Multi-hop (no shared words)",
    sub: "n = 18",
    cells: [
      { t: "0%", tone: "bad" },
      { t: "33%", tone: "warn" },
      { t: "39%", s: "directional", tone: "good" },
    ],
  },
  {
    label: "Keeps working as data grows",
    cells: [
      { t: "No", s: "forgets old facts", tone: "bad" },
      { t: "Maybe", s: "if you maintain it", tone: "warn" },
      { t: "Yes", s: "automatic", tone: "good" },
    ],
  },
  {
    label: "Retriever to build & maintain",
    cells: [
      { t: "None", s: "but weak", tone: "warn" },
      { t: "You", s: "build + keep fresh", tone: "warn" },
      { t: "Built in", tone: "good" },
    ],
  },
];

const faqs = [
  {
    q: "Isn't the prompt baseline a strawman?",
    a: "We gave the recency prompt a generous 32,000-token budget and also ran a genuinely strong non-memory baseline — keyword retrieval (BM25), which is lexical RAG. On direct lookups it tied MMPM at 100%. We report where the prompt and keyword retrieval win, which is exactly why the rest is believable.",
  },
  {
    q: "Why did the recency prompt score zero?",
    a: "We verified it. A 32k-token recency window holds only the newest 129 of 3,716 atoms; the newest of the 48 target facts sits 627 atoms deep, the median 1,506 deep. The facts people ask about are simply older than any recent-context window reaches — that's the core reason a rolling prompt can't be your memory.",
  },
  {
    q: "Aren't the lookup queries rigged — the query matches the target's words?",
    a: "For direct lookups, yes — that's what a lookup is (\"what did we decide about X?\"). The finding there isn't that MMPM is clever, it's that recency misses entirely while retrieval finds it cheaply. The multi-hop set is the opposite by construction: the answer shares no words with the query, so only a trained memory arc reaches it.",
  },
  {
    q: "Is the multi-hop result (39% vs 33%) statistically significant?",
    a: "Not yet — that set is only 18 probes, so the confidence band is wide and we call it directional. What is solid at this size: recency gets 0% and keyword retrieval trails, because the answer shares no words with the question. We're growing the probe set past 100 to confirm the gap.",
  },
  {
    q: "Is it reproducible?",
    a: "Fully. The retrieval is deterministic, so the recall and token numbers are hardware-independent. The runner, the probe sets, and the fixed random seed for the confidence intervals are all in the repository — anyone can re-run and get the same numbers.",
  },
  {
    q: "Does this mean MMPM beats vector or keyword RAG in general?",
    a: "No. We tested keyword retrieval and it tied MMPM on direct lookups. MMPM's measured edges here are token efficiency, multi-hop reach, and having no retriever to build or keep fresh. Its other properties — cross-session persistence and Merkle-verifiable provenance — are real but out of scope for this retrieval-only benchmark.",
  },
  {
    q: "Does better retrieval mean the agent answers better?",
    a: "This benchmark stops at \"the right context was retrievable.\" Whether the agent then completes a task better is a separate, LLM-in-the-loop test we haven't run yet, so we don't claim task-success numbers from it.",
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

export default async function BenchmarkPage() {
  const cookieStore = await cookies();
  const isLoggedIn = Boolean(cookieStore.get("mmpm_session")?.value);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <SiteNavbar isLoggedIn={isLoggedIn} variant="standard" />

      <main className="pt-[var(--site-nav-h)]">
        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <section
          className="mx-auto max-w-4xl px-6 pt-20 pb-10"
          aria-labelledby="bench-hero-heading"
        >
          <p className="text-brand-400 mb-4 font-mono text-[11px] tracking-[0.22em] uppercase">
            Benchmark · Tier 1 · retrieval
          </p>
          <h1
            id="bench-hero-heading"
            className="font-display text-4xl font-extrabold text-white lg:text-6xl"
            style={{ letterSpacing: "-0.03em", lineHeight: 1.05 }}
          >
            Does memory actually beat
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, #36aaf5 0%, #22d3ee 60%, #f59e0b 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              a well-crafted prompt?
            </span>
          </h1>
          <p className="font-body text-surface-400 mt-6 max-w-2xl text-lg leading-relaxed">
            We ran a controlled retrieval benchmark on our real 3,716-fact memory. A
            recency-maintained prompt found the needed fact{" "}
            <span className="font-medium text-red-400">0 of 48 times</span> even at a 32,000-token
            budget. MMPM found all <span className="font-medium text-emerald-400">48 of 48</span>{" "}
            using about 500 tokens. Here is the honest picture — including where a prompt ties.
          </p>
        </section>

        {/* ── TABLE ─────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-6 pt-4 pb-8" aria-labelledby="bench-table-heading">
          <h2
            id="bench-table-heading"
            className="font-display mb-6 text-2xl font-bold text-white lg:text-3xl"
            style={{ letterSpacing: "-0.02em" }}
          >
            With vs. without memory
          </h2>
          <div className="border-surface-800 overflow-x-auto rounded-2xl border">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-surface-800 border-b">
                  <th className="text-surface-400 px-4 py-4 text-sm font-medium"></th>
                  {columns.map((c, i) => (
                    <th
                      key={c.name}
                      className={`px-4 py-4 text-center ${i === 2 ? "text-brand-400" : "text-white"}`}
                    >
                      <div className="font-display text-base font-bold">{c.name}</div>
                      <div className="text-surface-400 text-xs font-normal">{c.sub}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-surface-800 border-b last:border-0">
                    <th scope="row" className="px-4 py-4 align-middle">
                      <div className="font-body text-sm font-medium text-white">{row.label}</div>
                      {row.sub && <div className="text-surface-600 text-xs">{row.sub}</div>}
                    </th>
                    {row.cells.map((cell, i) => (
                      <td key={i} className="px-3 py-3 text-center">
                        <div className={`mx-auto rounded-lg px-2 py-3 ${cellBg[cell.tone]}`}>
                          <div className={`font-display text-lg font-bold ${cellText[cell.tone]}`}>
                            {cell.t}
                          </div>
                          {cell.s && (
                            <div className={`text-xs ${cellText[cell.tone]} opacity-80`}>
                              {cell.s}
                            </div>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-surface-600 mt-4 text-sm leading-relaxed">
            Honest read: on plain keyword lookups, keyword RAG ties MMPM — both hit 100%.
            MMPM&apos;s separation shows on multi-hop recall and on not needing a retriever to
            maintain. Token counts are a disclosed ~4-chars/token estimate applied identically to
            every method, so the ratios are estimator-invariant.
          </p>
        </section>

        {/* ── CLAIMS ────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-6 py-10" aria-labelledby="bench-claims-heading">
          <h2 id="bench-claims-heading" className="sr-only">
            Key results
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                stat: "0.2%",
                head: "of the tokens",
                body: "MMPM reaches 100% recall on ~500 tokens vs ~253,000 to carry the whole corpus.",
              },
              {
                stat: "0 → 48",
                head: "recall that survives growth",
                body: "A recency prompt found 0/48 old facts even at 32k tokens; MMPM found 48/48.",
              },
              {
                stat: "39%",
                head: "multi-hop reach",
                body: "On queries whose answer shares no words with the question, vs 33% keyword / 0% recency. Directional (n=18).",
              },
            ].map((c) => (
              <div
                key={c.head}
                className="border-surface-800 bg-surface-900 rounded-2xl border p-6"
              >
                <div className="font-display text-brand-400 text-3xl font-extrabold">{c.stat}</div>
                <div className="font-body mt-1 text-sm font-medium text-white">{c.head}</div>
                <p className="text-surface-400 mt-3 text-sm leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-3xl px-6 py-10" aria-labelledby="bench-faq-heading">
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
            Give your agent a memory that ranks.
          </h2>
          <p className="font-body text-surface-400 mx-auto mt-4 max-w-lg text-base leading-relaxed">
            The same substrate we benchmarked here — verifiable, connected, and predictive — behind
            one MCP endpoint.
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
