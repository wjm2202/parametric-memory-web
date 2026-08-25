import type { Metadata } from "next";
import Link from "next/link";
import SiteNavbar from "@/components/ui/SiteNavbar";
import SiteFooter from "@/components/ui/SiteFooter";

/**
 * /research — the crawlable, citable home for the Parametric Memory papers.
 *
 * Rebuilt 2026-08-24 (SEO final fix). An earlier version of this page was
 * implemented on 2026-07-18 but never committed — git history has no trace of
 * it — which left both whitepapers with published Zenodo DOIs pointing at a
 * site that never mentioned them. Papers are among the strongest link-earning
 * assets the project has; they need an on-site landing page that (a) Google
 * can index, (b) the DOI records and citations can point to, and (c) carries
 * ScholarlyArticle JSON-LD tying the works to the site's Organization entity
 * (https://parametric-memory.dev/#organization, whose sameAs already lists
 * both DOIs — see src/app/layout.tsx and entity-disambiguation.test.ts).
 */

const SITE = "https://parametric-memory.dev";
const ORG_ID = `${SITE}/#organization`;

export interface ResearchPaper {
  /** Stable DOM/JSON-LD anchor, e.g. "substrate-whitepaper". */
  id: string;
  title: string;
  subtitle: string;
  /** Zenodo CONCEPT DOI (resolves to the latest version). */
  doi: string;
  datePublished: string; // ISO date of first publication
  abstract: string;
  keywords: string[];
  contributions: string[];
}

export const PAPERS: ResearchPaper[] = [
  {
    id: "substrate-whitepaper",
    title:
      "Parametric Memory: A Cryptographically Verifiable, Predictive Memory Substrate for MCP-Capable AI Agents",
    subtitle: "The L2 cache for AI — verifiable, predictive agent memory behind one MCP interface",
    doi: "https://doi.org/10.5281/zenodo.21213464",
    datePublished: "2026-07-06",
    abstract:
      "AI agents reason brilliantly over their context window and forget everything when it closes. " +
      "Retrieval-augmented generation restores recall, but a production agent also needs to know what " +
      "it knew and when, what tends to come next, when two of its beliefs disagree, and how its facts " +
      "relate. This paper describes a memory substrate delivering all four properties at once — " +
      "Merkle-verifiable snapshots with RFC 6962-style consistency proofs, Markov-chain predictive " +
      "prefetch, adaptive decay-based self-curation, and automatic contradiction detection — behind a " +
      "single Model Context Protocol interface any MCP-capable AI can use.",
    keywords: [
      "AI memory",
      "verifiable memory",
      "Merkle proofs",
      "RFC 6962",
      "Markov prediction",
      "Model Context Protocol",
      "agent memory substrate",
    ],
    contributions: [
      "Positions agent memory as an L2 cache between the context window and cold storage",
      "Composes verifiability, prediction, self-curation and conflict-awareness in one substrate",
      "Recall responses carry offline-verifiable cryptographic proofs of what was stored, and when",
    ],
  },
  {
    id: "self-reinforcing-loop",
    title:
      "The Self-Reinforcing Loop: Verifiable Evidence of Consensus for Distributed Agentic Systems",
    subtitle: "Signal → Evidence → Refinement on the Parametric Memory substrate",
    doi: "https://doi.org/10.5281/zenodo.21421364",
    datePublished: "2026-07-18",
    abstract:
      "A fleet of agents sharing a verifiable memory is a different kind of system from a single " +
      "agent with one. This paper describes an architecture where fixed knowledge substrates give " +
      "every agent identical versioned guidance, a state plane captures operational signals as " +
      "append-only Merkle-versioned evidence, and an orchestrator refines a control plane of " +
      "policies only when independent agents corroborate a signal and counterfactual replay shows " +
      "the change would have improved outcomes. Consensus becomes a derived artifact any AI can " +
      "recompute and verify from the evidence — asynchronously, offline, after the fact.",
    keywords: [
      "multi-agent systems",
      "distributed consensus",
      "evidence",
      "Merkle proofs",
      "counterfactual evaluation",
      "control plane",
      "AI memory",
      "Model Context Protocol",
    ],
    contributions: [
      "Replaces live consensus protocols with verifiable evidence-of-consensus",
      "Graduated promotion: signals → corroborated evidence → counterfactually-gated refinements",
      "Formal model: decay- and reliability-weighted support, correlation-corrected confidence, hysteresis thresholds",
    ],
  },
];

export const metadata: Metadata = {
  title: "Research",
  description:
    "Peer-citable research from Parametric Memory: verifiable predictive memory substrates for AI agents and evidence-of-consensus for agent fleets. Both with DOIs.",
  alternates: { canonical: `${SITE}/research` },
  openGraph: {
    title: "Research | Parametric Memory",
    description:
      "Whitepapers on verifiable, predictive AI memory and distributed evidence-of-consensus — published with Zenodo DOIs.",
    url: `${SITE}/research`,
    siteName: "Parametric Memory",
    type: "website",
    images: [
      {
        url: `${SITE}/brand/og.png`,
        width: 1200,
        height: 630,
        alt: "Parametric Memory Research",
      },
    ],
  },
};

/* ── JSON-LD ──────────────────────────────────────────────────────────────── */

function scholarlyArticleJsonLd(p: ResearchPaper) {
  return {
    "@type": "ScholarlyArticle",
    "@id": p.doi,
    name: p.title,
    alternativeHeadline: p.subtitle,
    abstract: p.abstract,
    datePublished: p.datePublished,
    inLanguage: "en",
    isAccessibleForFree: true,
    sameAs: p.doi,
    url: `${SITE}/research#${p.id}`,
    keywords: p.keywords.join(", "),
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
  };
}

const collectionJsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": `${SITE}/research`,
  name: "Parametric Memory Research",
  description:
    "Published research on verifiable, predictive memory substrates for AI agents, from the team behind Parametric Memory.",
  url: `${SITE}/research`,
  isPartOf: { "@id": `${SITE}/#website` },
  publisher: { "@id": ORG_ID },
  hasPart: PAPERS.map(scholarlyArticleJsonLd),
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE },
    { "@type": "ListItem", position: 2, name: "Research", item: `${SITE}/research` },
  ],
};

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function ResearchPage() {
  return (
    <div className="min-h-screen bg-[#030712] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <SiteNavbar />

      <main className="mx-auto max-w-3xl px-6 pt-28 pb-20">
        <div className="mb-12">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
            Research
          </div>
          <h1 className="font-[family-name:var(--font-space-grotesk)] text-4xl font-bold text-white">
            Published research
          </h1>
          <p className="mt-4 leading-relaxed text-white/70">
            The ideas behind Parametric Memory are published, DOI-registered, and free to read. If
            you build on them, cite the DOI — and if you want to see the claims hold up at runtime,{" "}
            <Link href="/verify" className="text-indigo-400 hover:underline">
              verify a sealed memory snapshot yourself
            </Link>{" "}
            or read the{" "}
            <Link href="/benchmark" className="text-indigo-400 hover:underline">
              LongMemEval benchmark results
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-col gap-10">
          {PAPERS.map((p) => (
            <article
              key={p.id}
              id={p.id}
              data-testid={`research-paper-${p.id}`}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-8"
            >
              <p className="text-xs font-medium tracking-wider text-white/40 uppercase">
                Whitepaper ·{" "}
                {new Date(p.datePublished + "T00:00:00Z").toLocaleDateString("en-NZ", {
                  year: "numeric",
                  month: "long",
                  timeZone: "UTC",
                })}
              </p>
              <h2 className="mt-3 font-[family-name:var(--font-space-grotesk)] text-2xl font-semibold text-white">
                {p.title}
              </h2>
              <p className="mt-2 text-sm text-indigo-300/80">{p.subtitle}</p>

              <h3 className="mt-6 text-sm font-semibold text-white/80">Abstract</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/70">{p.abstract}</p>

              <h3 className="mt-5 text-sm font-semibold text-white/80">Key contributions</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-white/70">
                {p.contributions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>

              <p className="mt-5 text-xs text-white/40">Keywords: {p.keywords.join(" · ")}</p>

              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href={p.doi}
                  data-testid={`research-doi-${p.id}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-500/15 px-4 py-2 text-sm font-medium text-indigo-300 ring-1 ring-indigo-500/30 transition-all hover:bg-indigo-500/25 hover:ring-indigo-500/50"
                >
                  Read on Zenodo (DOI)
                </a>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-12 text-sm leading-relaxed text-white/50">
          Both records are published under concept DOIs, which always resolve to the latest version
          of each paper. The Organization behind these works is described in machine-readable form
          on every page of this site.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
