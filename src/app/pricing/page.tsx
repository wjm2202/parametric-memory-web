import type { Metadata } from "next";
import { cookies } from "next/headers";
import { FAQAccordion } from "./PricingClient";
import { PricingCardClient } from "./PricingCardClient";
import SiteNavbar from "@/components/ui/SiteNavbar";
import { TIERS } from "@/config/tiers";
import { TeamInquiryForm } from "./TeamInquiryForm";

export const metadata: Metadata = {
  title: "Pricing — Plans from $9/mo",
  description:
    "Claude remembers everything. Persistent AI memory for developers — flat monthly subscription, no per-query costs. Indie $9/mo, Pro $29/mo, Team $79/mo.",
  alternates: {
    canonical: "https://parametric-memory.dev/pricing",
  },
  openGraph: {
    title: "Parametric Memory Pricing — Plans from $9/mo",
    description:
      "Persistent AI memory from $9/month. Flat rate subscription — no per-query costs, no credits. Merkle proofs, Markov prediction, MCP native.",
  },
};

// ── Display tiers — free tier not publicly sold; filtered out ─────────────────
// The 'free' tier exists only as an expired-trial fallback state in the system.
// Publicly we show indie, pro, and team. Team uses a contact-sales flow.
const DISPLAY_TIERS = TIERS.filter((t) => t.id !== "free");

// ── Human-readable tier copy ──────────────────────────────────────────────────
const TIER_COPY: Record<string, { tagline: string; humanAtoms: string; humanBootstraps: string }> =
  {
    indie: {
      tagline: "Your personal AI memory",
      humanAtoms: "10,000 memories (≈ 18 months of daily use)",
      humanBootstraps: "Up to 33 Claude sessions / day",
    },
    pro: {
      tagline: "For serious daily AI development",
      humanAtoms: "100,000 memories (years of intensive use)",
      humanBootstraps: "Up to 333 Claude sessions / day",
    },
    team: {
      tagline: "Your team's shared institutional memory",
      humanAtoms: "500,000 memories",
      humanBootstraps: "Up to 667 Claude sessions / day",
    },
  };

/* ── Competitor comparison ───────────────────────────────────────────── */
const competitors = [
  {
    feature: "Pricing model",
    parametric: "Flat monthly subscription",
    mem0: "Subscription + overages",
    zep: "Credits (pay-as-you-go)",
  },
  {
    feature: "Dedicated instance",
    parametric: "Yes (hosted, managed)",
    mem0: "No (shared)",
    zep: "No (shared)",
  },
  {
    feature: "SSL/TLS certificate",
    parametric: "Yes (per instance)",
    mem0: "Shared / CDN",
    zep: "Shared / CDN",
  },
  { feature: "Cryptographic proofs", parametric: "Yes (RFC 6962)", mem0: "No", zep: "No" },
  { feature: "Markov prediction", parametric: "Yes (64% hit rate)", mem0: "No", zep: "No" },
  {
    feature: "Graph/relational memory",
    parametric: "Yes (included)",
    mem0: "No ($249 Pro only)",
    zep: "Yes",
  },
  { feature: "MCP native", parametric: "Yes", mem0: "No", zep: "No" },
  {
    feature: "Per-query costs",
    parametric: "None (flat rate)",
    mem0: "Yes (limits)",
    zep: "Yes (credits)",
  },
  {
    feature: "Your data isolated",
    parametric: "Yes (dedicated DB)",
    mem0: "No (shared DB)",
    zep: "No (shared DB)",
  },
];

/* ── BreadcrumbList ──────────────────────────────────────────────────── */
const pricingBreadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://parametric-memory.dev",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Pricing",
      item: "https://parametric-memory.dev/pricing",
    },
  ],
};

/* ── JSON-LD FAQ schema ───────────────────────────────────────────────── */
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What's a 'memory'?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Every fact, decision, or correction that your AI stores for you. 'Always use strict TypeScript' is one memory. 'The database is Postgres on port 5432' is another. They accumulate silently and get surfaced automatically when relevant.",
      },
    },
    {
      "@type": "Question",
      name: "How much does Parametric Memory cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Three plans: Solo at $9/month (10,000 memories, up to 33 Claude sessions/day), Professional at $29/month (100,000 memories, up to 333 Claude sessions/day), and Team at $79/month (500,000 memories, unlimited sessions). All plans billed monthly, cancel anytime, no contracts.",
      },
    },
    {
      "@type": "Question",
      name: "What happens when I hit my limit?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Claude keeps working. Older, less-relevant memories are gently summarised to make room. You won't lose anything important, and you'll never get a hard stop mid-session.",
      },
    },
    {
      "@type": "Question",
      name: "Can I switch plans?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Upgrade or downgrade anytime from your dashboard. Upgrades apply immediately. Downgrades take effect at the end of your billing period.",
      },
    },
    {
      "@type": "Question",
      name: "Can I cancel?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Cancel anytime from the Billing section in your dashboard. Takes 30 seconds, no calls, no emails. Your memories are preserved for 90 days after cancellation.",
      },
    },
    {
      "@type": "Question",
      name: "What makes Parametric Memory different from Mem0 or Zep?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Parametric Memory provides cryptographic Merkle proofs (RFC 6962) for every memory operation — no other AI memory system offers verifiable proof of what was stored and when. It also includes Markov-chain prediction (64% hit rate) and runs on dedicated instances, not shared infrastructure.",
      },
    },
    {
      "@type": "Question",
      name: "I have a team larger than 5. Can you support us?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Contact us — we can accommodate larger teams with a custom arrangement.",
      },
    },
  ],
};

/* ── Icons ───────────────────────────────────────────────────────────── */
function CheckIcon() {
  return (
    <svg className="h-5 w-5 flex-shrink-0 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/* ── Page (Server Component) ─────────────────────────────────────────── */
export default async function PricingPage() {
  const cookieStore = await cookies();
  const isLoggedIn = Boolean(cookieStore.get("mmpm_session")?.value);

  // Capacity is now event-driven: checked on user click, not on page render.
  // See PricingCardClient.tsx for the on-click capacity check flow.

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingBreadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <main className="bg-surface-950 flex min-h-screen flex-col">
        {/* Nav */}
        <SiteNavbar isLoggedIn={isLoggedIn} variant="standard" />

        {/* Hero */}
        <section
          className="flex flex-col items-center gap-6 px-6 pt-32 pb-12 text-center"
          aria-label="Pricing hero"
        >
          <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Claude remembers everything.
          </h1>
          <p className="text-surface-200/80 mx-auto max-w-xl text-xl leading-relaxed">
            Persistent AI memory for developers who use Claude every day.
          </p>
          <p className="text-surface-400 text-sm">
            Flat monthly subscription &mdash; no per-query costs, no credits, no surprises. Cancel
            anytime.
          </p>
        </section>

        {/* Pricing cards */}
        <section className="mx-auto w-full max-w-5xl px-6 pb-24" aria-label="Pricing plans">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {DISPLAY_TIERS.map((tier) => {
              const copy = TIER_COPY[tier.id];
              const isTeam = tier.id === "team";
              const isPro = tier.id === "pro";

              return (
                <div
                  key={tier.id}
                  id={tier.id}
                  className={`relative flex flex-col rounded-2xl border p-8 transition-all ${
                    isPro
                      ? "border-brand-400/50 from-brand-500/10 to-surface-900/50 ring-brand-400/25 bg-gradient-to-b ring-1"
                      : "border-surface-200/10 bg-surface-900/30"
                  } hover:border-surface-200/20 backdrop-blur-sm`}
                >
                  {isPro && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-brand-500 rounded-full px-3 py-1 text-xs font-semibold text-white">
                        Most Popular
                      </span>
                    </div>
                  )}

                  {/* Tier name + tagline */}
                  <div className="mb-6">
                    <h3 className="text-xl font-bold tracking-wide text-white uppercase">
                      {tier.id === "indie" ? "SOLO" : tier.id === "pro" ? "PROFESSIONAL" : "TEAM"}
                    </h3>
                    <p className="text-surface-200/60 mt-1 text-sm">{copy?.tagline}</p>
                  </div>

                  {/* Capacity badge + CTA — event-driven, checks on click */}
                  {isTeam ? (
                    <>
                      {/* Price */}
                      <div className="mb-6">
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-bold text-white">${tier.price}</span>
                          <span className="text-surface-200/60 text-sm">/month</span>
                        </div>
                      </div>
                      <TeamInquiryForm />
                    </>
                  ) : (
                    <PricingCardClient
                      tierId={tier.id}
                      tierName={tier.name}
                      ctaLabel={tier.id === "indie" ? "Get Solo" : "Get Professional"}
                      isLoggedIn={isLoggedIn}
                    >
                      {/* Price — rendered as children inside the client wrapper */}
                      <div className="mb-6">
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-bold text-white">${tier.price}</span>
                          <span className="text-surface-200/60 text-sm">/month</span>
                        </div>
                        <p className="text-surface-400 mt-1.5 text-xs">
                          Billed monthly · cancel anytime from your dashboard
                        </p>
                      </div>
                    </PricingCardClient>
                  )}

                  {/* Features */}
                  <div className="mt-2 space-y-3" role="list">
                    <div className="flex items-start gap-3" role="listitem">
                      <CheckIcon />
                      <span className="text-sm text-white">{copy?.humanAtoms}</span>
                    </div>
                    <div className="flex items-start gap-3" role="listitem">
                      <CheckIcon />
                      <span className="text-sm text-white">{copy?.humanBootstraps}</span>
                    </div>
                    {tier.features
                      .filter(
                        (f) =>
                          f.included &&
                          !f.name.toLowerCase().includes("atoms") &&
                          !f.name.toLowerCase().includes("bootstraps"),
                      )
                      .map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-3" role="listitem">
                          <CheckIcon />
                          <span className="text-sm text-white">{feature.name}</span>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-surface-500 mt-6 text-center text-xs">
            All plans billed monthly. Cancel anytime from your dashboard. No contracts, no lock-in.
          </p>
        </section>

        {/* Social proof — honest pre-launch */}
        <section className="mx-auto max-w-3xl px-6 pb-20 text-center">
          <p className="text-surface-400 text-base italic">
            &ldquo;We run our entire operation on Parametric Memory.&rdquo;
          </p>
          <p className="text-surface-600 mt-2 text-sm">— The team that built it</p>
        </section>

        {/* Competitor comparison */}
        <section className="mx-auto max-w-5xl px-6 pb-24" aria-label="Comparison with competitors">
          <h2 className="mb-3 text-3xl font-bold text-white">vs. Competitors</h2>
          <p className="text-surface-200/70 mb-8">
            Parametric Memory Professional ($29/mo) vs. Mem0 Starter ($19/mo) vs. Zep Flex ($25/mo)
          </p>
          <div className="border-surface-200/10 bg-surface-900/30 overflow-x-auto rounded-xl border backdrop-blur-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-surface-200/10 border-b">
                  <th className="bg-surface-950/80 sticky left-0 px-6 py-4 text-left font-semibold text-white">
                    Feature
                  </th>
                  <th className="text-brand-300 px-6 py-4 text-center font-semibold">
                    Parametric Memory
                    <div className="mt-1 text-xs font-normal text-white">Professional · $29/mo</div>
                  </th>
                  <th className="text-surface-300 px-6 py-4 text-center font-semibold">
                    Mem0
                    <div className="text-surface-400 mt-1 text-xs font-normal">
                      Starter · $19/mo
                    </div>
                  </th>
                  <th className="text-surface-300 px-6 py-4 text-center font-semibold">
                    Zep
                    <div className="text-surface-400 mt-1 text-xs font-normal">Flex · $25/mo</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((row, idx) => (
                  <tr
                    key={idx}
                    className="border-surface-200/5 hover:bg-surface-900/50 border-b transition-colors"
                  >
                    <td className="bg-surface-950/40 sticky left-0 px-6 py-4 font-medium text-white">
                      {row.feature}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-sm font-medium text-emerald-400">{row.parametric}</span>
                    </td>
                    <td className="text-surface-200/70 px-6 py-4 text-center">{row.mem0}</td>
                    <td className="text-surface-200/70 px-6 py-4 text-center">{row.zep}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-4xl px-6 pb-32" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="mb-12 text-3xl font-bold text-white">
            Frequently Asked Questions
          </h2>
          <FAQAccordion />
        </section>
      </main>
    </>
  );
}
