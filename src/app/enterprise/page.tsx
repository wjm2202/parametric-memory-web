import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import SiteNavbar from "@/components/ui/SiteNavbar";

export const metadata: Metadata = {
  title: "Operational Memory for Enterprise — Parametric Memory",
  description:
    "A verifiable operational memory: capture every operational signal as a Merkle-sealed, connected atom, then ask what needs a human. Agent-fleet observability, drift detection, noise-free oversight, and a knowledge store humans and agents share. We run our own SaaS on it.",
  alternates: { canonical: "https://parametric-memory.dev/enterprise" },
  openGraph: {
    title: "Operational Memory for Enterprise — Parametric Memory",
    description:
      "Your operations, remembered — and provable. Agent-fleet observability with drift detection, noise-free oversight, and a verifiable knowledge store. Every operational decision Merkle-proofed.",
    url: "https://parametric-memory.dev/enterprise",
    siteName: "Parametric Memory",
    images: [
      {
        url: "https://parametric-memory.dev/brand/og.png",
        width: 1200,
        height: 630,
        alt: "Parametric Memory — operational memory for enterprise",
      },
    ],
    type: "website",
  },
};

// ── Use-case data (also emitted as ItemList JSON-LD for AI answer engines) ──
const useCases = [
  {
    id: "agent-fleet",
    tag: "Integration",
    title: "Observability for a fleet of autonomous agents",
    body: "Instrument each agent as connected atoms. Query fleet state in plain language, watch the real path each agent walks, trace every error to its root cause — and detect behavioural drift when an agent diverges from its learned norm. Every action sealed for audit.",
  },
  {
    id: "oversight",
    tag: null,
    title: "Operational oversight, without the noise",
    body: "The substrate ingests every signal and tells you the few things that need judgement today. Alert fatigue and dashboard sprawl, replaced by one ranked “what needs a human.” The human decides — the noise is gone.",
  },
  {
    id: "adhoc",
    tag: null,
    title: "Ask questions you never designed for",
    body: "Because everything is general memory, not a fixed schema, you ask the novel question after the fact — “which customers hit a spend cap and a provisioning failure?” — and get an answer from what was already captured. No new pipeline, no new dashboard.",
  },
  {
    id: "knowledge",
    tag: null,
    title: "Verifiable knowledge & documentation",
    body: "Decisions, runbooks and docs become durable, provenance-tracked memory that humans and agents share. It beats a wiki or vector DB on three axes: provable (nothing was altered), connected (relationships, not chunks), and predictive (the right context before you ask).",
  },
];

const capability = [
  { k: "Capture", v: "Every event and decision becomes a typed, connected atom." },
  { k: "Verify", v: "Each atom is sealed in an RFC 6962 Merkle tree — tamper-evident, provable." },
  { k: "Learn", v: "Markov arcs learn your normal patterns. No rules to write." },
  { k: "Ask", v: "Natural-language questions over everything captured." },
  { k: "Prioritise", v: "A ranked “what needs a human today.”" },
];

// ── JSON-LD: WebPage + Breadcrumb + ItemList of offerings (AI-discoverable) ──
const enterpriseJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": "https://parametric-memory.dev/enterprise#webpage",
  name: "Operational Memory for Enterprise — Parametric Memory",
  url: "https://parametric-memory.dev/enterprise",
  description:
    "A verifiable operational memory for enterprises: capture, Merkle-audit, learn, ask, and prioritise operational signals. Agent-fleet observability with drift detection, noise-free oversight, and a knowledge store humans and agents share.",
  isPartOf: { "@type": "WebSite", "@id": "https://parametric-memory.dev/#website" },
  mainEntity: {
    "@type": "ItemList",
    name: "Enterprise operational-memory use cases",
    itemListElement: useCases.map((u, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: u.title,
      description: u.body,
    })),
  },
};

const enterpriseBreadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "@id": "https://parametric-memory.dev/enterprise#breadcrumbs",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://parametric-memory.dev" },
    {
      "@type": "ListItem",
      position: 2,
      name: "Enterprise",
      item: "https://parametric-memory.dev/enterprise",
    },
  ],
};

export default async function EnterprisePage() {
  const cookieStore = await cookies();
  const isLoggedIn = Boolean(cookieStore.get("mmpm_session")?.value);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(enterpriseJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(enterpriseBreadcrumbJsonLd) }}
      />

      <SiteNavbar isLoggedIn={isLoggedIn} variant="standard" />

      <main className="pt-[var(--site-nav-h)]">
        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <section
          className="mx-auto max-w-4xl px-6 pt-20 pb-16"
          aria-labelledby="enterprise-hero-heading"
        >
          <p className="text-brand-400 mb-4 font-mono text-[11px] tracking-[0.22em] uppercase">
            For enterprise · Operational memory
          </p>
          <h1
            id="enterprise-hero-heading"
            className="font-display text-4xl font-extrabold text-white lg:text-6xl"
            style={{ letterSpacing: "-0.03em", lineHeight: 1.05 }}
          >
            Your operations, remembered —
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, #36aaf5 0%, #22d3ee 60%, #f59e0b 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              and provable.
            </span>
          </h1>
          <p className="font-body text-surface-300 mt-6 max-w-2xl text-lg leading-relaxed">
            Parametric Memory captures every operational signal as a cryptographically sealed,
            connected memory — then reasons over it to surface what needs a human. You stay in
            control; the noise doesn&apos;t.
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <Link
              href="/contact"
              data-testid="enterprise-hero-cta-primary"
              aria-label="Talk to us about enterprise operational memory"
              className="bg-brand-500 hover:bg-brand-400 inline-flex items-center justify-center gap-2 rounded-xl px-7 py-3.5 text-sm font-semibold text-white shadow-[0_0_36px_rgba(12,142,230,0.4)] transition-all"
            >
              Talk to us →
            </Link>
            <Link
              href="/verify"
              data-testid="enterprise-hero-cta-secondary"
              aria-label="See how we run our own operations on the substrate"
              className="border-surface-700 bg-surface-900/50 text-surface-200 hover:border-brand-500/40 inline-flex items-center justify-center gap-2 rounded-xl border px-7 py-3.5 text-sm font-semibold transition-all hover:text-white"
            >
              See how we run on it →
            </Link>
          </div>
          <p className="text-surface-500 mt-8 font-mono text-xs">
            Running in production on our own SaaS — provisioning, billing, churn &amp; security —
            every decision Merkle-proofed.
          </p>
        </section>

        {/* ── CORE CAPABILITY ───────────────────────────────────────────── */}
        <section
          className="border-surface-800/50 bg-surface-900/30 border-t py-20"
          aria-labelledby="enterprise-capability-heading"
          data-testid="enterprise-section-capability"
        >
          <div className="mx-auto max-w-6xl px-6">
            <p className="text-brand-400 mb-3 font-mono text-[11px] tracking-widest uppercase">
              The capability
            </p>
            <h2
              id="enterprise-capability-heading"
              className="font-display max-w-2xl text-3xl font-bold text-white lg:text-4xl"
              style={{ letterSpacing: "-0.025em" }}
            >
              One verifiable memory for how your business actually runs.
            </h2>
            <dl className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
              {capability.map((c) => (
                <div key={c.k}>
                  <dt className="font-mono text-xs tracking-wide text-cyan-400">{c.k}</dt>
                  <dd className="text-surface-400 mt-2 text-sm leading-relaxed">{c.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── PROOF: we run on it ───────────────────────────────────────── */}
        <section
          className="mx-auto max-w-6xl px-6 py-20"
          aria-labelledby="enterprise-proof-heading"
          data-testid="enterprise-section-proof"
        >
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-brand-400 mb-3 font-mono text-[11px] tracking-widest uppercase">
                Proof, not a promise
              </p>
              <h2
                id="enterprise-proof-heading"
                className="font-display text-3xl font-bold text-white lg:text-4xl"
                style={{ letterSpacing: "-0.025em", lineHeight: 1.15 }}
              >
                We don&apos;t demo it.
                <br />
                We operate on it.
              </h2>
              <p className="font-body text-surface-400 mt-5 text-base leading-relaxed">
                Every provisioning run, billing event, churn signal and security check in this
                business is a Merkle-sealed atom in a live substrate. One question returns the
                day&apos;s briefing — revenue, and what needs attention, by severity. The most
                convincing proof of a memory substrate is that it runs the company that sells it.
              </p>
            </div>
            <div
              className="border-surface-800 bg-surface-950/70 rounded-2xl border p-6"
              aria-hidden="true"
            >
              <p className="text-surface-500 font-mono text-[11px] tracking-[0.18em] uppercase">
                ask_ops · today
              </p>
              <p className="mt-3 font-mono text-sm text-emerald-400">
                › what needs a human today, by severity
              </p>
              <p className="text-surface-400 mt-4 text-sm leading-relaxed">
                Ranked action queue · churn risk · security posture · business KPIs — returned as
                sealed, inspectable atoms.
              </p>
              <p className="text-surface-500 mt-4 font-mono text-[11px]">
                Verifiable operational memory · in production · every decision auditable
              </p>
            </div>
          </div>
        </section>

        {/* ── USE CASES ─────────────────────────────────────────────────── */}
        <section
          className="border-surface-800/50 bg-surface-900/30 border-t py-20"
          aria-labelledby="enterprise-usecases-heading"
          data-testid="enterprise-section-usecases"
        >
          <div className="mx-auto max-w-6xl px-6">
            <p className="text-brand-400 mb-3 font-mono text-[11px] tracking-widest uppercase">
              What you can do with it
            </p>
            <h2
              id="enterprise-usecases-heading"
              className="font-display max-w-2xl text-3xl font-bold text-white lg:text-4xl"
              style={{ letterSpacing: "-0.025em" }}
            >
              Four things logs, dashboards and wikis can&apos;t.
            </h2>
            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {useCases.map((u) => (
                <article
                  key={u.id}
                  data-testid={`enterprise-usecase-${u.id}`}
                  className="border-surface-800 bg-surface-900/50 rounded-2xl border p-7"
                >
                  {u.tag && (
                    <span className="mb-3 inline-block rounded-full border border-amber-500/30 px-2.5 py-1 font-mono text-[11px] tracking-widest text-amber-400 uppercase">
                      {u.tag}
                    </span>
                  )}
                  <h3
                    className="font-display text-lg font-semibold text-white"
                    style={{ letterSpacing: "-0.01em" }}
                  >
                    {u.title}
                  </h3>
                  <p className="text-surface-400 mt-2 text-sm leading-relaxed">{u.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── MOAT + honesty guardrail ──────────────────────────────────── */}
        <section className="mx-auto max-w-3xl px-6 py-20" aria-labelledby="enterprise-moat-heading">
          <p className="text-brand-400 mb-3 font-mono text-[11px] tracking-widest uppercase">
            Why it holds up
          </p>
          <h2
            id="enterprise-moat-heading"
            className="font-display text-2xl font-bold text-white lg:text-3xl"
            style={{ letterSpacing: "-0.02em" }}
          >
            Verifiable. Compounding. Self-proven.
          </h2>
          <p className="font-body text-surface-400 mt-4 text-base leading-relaxed">
            <span className="text-surface-200 font-medium">Verifiable</span> — RFC 6962 Merkle
            proofs give a <em>provable</em> decision trail, which is what compliance actually buys.{" "}
            <span className="text-surface-200 font-medium">Compounding</span> — it learns your
            operational patterns, so it gets more useful the longer it runs.{" "}
            <span className="text-surface-200 font-medium">Self-proven</span> — we operate our own
            SaaS on it, and every decision is inspectable.
          </p>
          <p className="text-surface-500 border-surface-700 mt-8 border-l-2 pl-4 text-sm leading-relaxed">
            Advisory by design: the substrate surfaces and proves — a human decides and acts.
            Agent-fleet observability is the same engine we run our operations on, applied to your
            domain through instrumentation. We&apos;ll scope it with you.
          </p>
        </section>

        {/* ── FINAL CTA ─────────────────────────────────────────────────── */}
        <section
          className="border-surface-800/50 border-t py-24 text-center"
          aria-labelledby="enterprise-cta-heading"
        >
          <div className="mx-auto max-w-2xl px-6">
            <p className="text-brand-400 mb-3 font-mono text-[11px] tracking-widest uppercase">
              Enterprise &amp; self-hosted
            </p>
            <h2
              id="enterprise-cta-heading"
              className="font-display text-3xl font-extrabold text-white lg:text-4xl"
              style={{ letterSpacing: "-0.03em" }}
            >
              Bring your operations into memory.
            </h2>
            <p className="font-body text-surface-400 mx-auto mt-4 max-w-lg text-base leading-relaxed">
              Dedicated or self-hosted deployment, verifiable by design. Tell us what you operate
              and we&apos;ll map it to the substrate.
            </p>
            <div className="mt-8">
              <Link
                href="/contact"
                data-testid="enterprise-cta-contact"
                aria-label="Talk to us about an enterprise deployment"
                className="bg-brand-500 hover:bg-brand-400 inline-flex items-center gap-2 rounded-xl px-8 py-4 text-base font-semibold text-white shadow-[0_0_40px_rgba(12,142,230,0.4)] transition-all"
              >
                Talk to us →
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
