import type { Metadata } from "next";
import { cookies } from "next/headers";
import { FAQAccordion } from "./PricingClient";
import { PricingCTA } from "./PricingCTA";
import SiteNavbar from "@/components/ui/SiteNavbar";
import { WaitlistForm } from "@/components/landing/WaitlistForm";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Parametric Memory pricing from $9/mo. Dedicated AI memory instances with Merkle proofs, Markov prediction, and MCP. Solo $29/mo, Team $79/mo, Enterprise from $299/mo.",
  openGraph: {
    title: "Pricing | Parametric Memory",
    description:
      "Dedicated AI memory instances from $9/mo. All features included. No per-query charges.",
  },
};

/* ── Pricing tier definitions ────────────────────────────────────────── */
const tiers = [
  {
    id: "starter",
    name: "Starter",
    price: 9,
    description: "For prototypes and small projects",
    highlightedBadge: null as string | null,
    cta: "Get Started Free",
    ctaLink: "/signup",
    features: [
      { name: "Dedicated instance", included: true },
      { name: "SSL/TLS certificate", included: true },
      { name: "512 MiB RAM", included: true },
      { name: "10 GiB storage", included: true },
      { name: "All features (proofs, Markov, MCP)", included: true },
      { name: "500 GiB transfer", included: true },
      { name: "Community support", included: true },
      { name: "Priority support", included: false },
      { name: "Custom domain", included: false },
    ],
  },
  {
    id: "solo",
    name: "Solo",
    price: 29,
    description: "For individual developers",
    highlightedBadge: "Most Popular",
    cta: "Get Solo",
    ctaLink: "#",
    features: [
      { name: "Dedicated instance", included: true },
      { name: "SSL/TLS certificate", included: true },
      { name: "1 GiB RAM", included: true },
      { name: "25 GiB storage", included: true },
      { name: "All features (proofs, Markov, MCP)", included: true },
      { name: "1,000 GiB transfer", included: true },
      { name: "Email support (48hr SLA)", included: true },
      { name: "Priority support", included: false },
      { name: "Custom domain", included: false },
    ],
  },
  {
    id: "team",
    name: "Team",
    price: 79,
    description: "For growing teams",
    highlightedBadge: null,
    cta: "Get Team",
    ctaLink: "#",
    features: [
      { name: "Dedicated instance", included: true },
      { name: "SSL/TLS certificate", included: true },
      { name: "4 GiB RAM", included: true },
      { name: "80 GiB storage", included: true },
      { name: "All features (proofs, Markov, MCP)", included: true },
      { name: "4,000 GiB transfer", included: true },
      { name: "Priority support (24hr SLA)", included: true },
      { name: "Custom domain", included: true },
      { name: "Multi-user API keys", included: true },
    ],
  },
  {
    id: "enterprise-cloud",
    name: "Enterprise Cloud",
    price: 299,
    description: "For mission-critical AI systems",
    highlightedBadge: null,
    cta: "Contact Sales",
    ctaLink: "mailto:entityone22@gmail.com?subject=Enterprise%20Cloud%20Inquiry",
    features: [
      { name: "Dedicated General Purpose instance", included: true },
      { name: "SSL/TLS certificate", included: true },
      { name: "8 GiB RAM", included: true },
      { name: "100+ GiB expandable storage", included: true },
      { name: "All features (proofs, Markov, MCP)", included: true },
      { name: "99.9% SLA", included: true },
      { name: "SSO/SAML", included: true },
      { name: "SOC 2 artifacts", included: true },
      { name: "Dedicated support channel", included: true },
    ],
  },
  {
    id: "enterprise-self-hosted",
    name: "Enterprise Self-Hosted",
    price: 499,
    description: "Complete control and sovereignty",
    highlightedBadge: null,
    cta: "Contact Sales",
    ctaLink: "mailto:entityone22@gmail.com?subject=Enterprise%20Self-Hosted%20Inquiry",
    features: [
      { name: "Commercial license", included: true },
      { name: "Deploy on your own cloud", included: true },
      { name: "SSL/TLS (via deployment guide)", included: true },
      { name: "Full source access", included: true },
      { name: "Unlimited instances", included: true },
      { name: "Architecture review", included: true },
      { name: "Deployment guide", included: true },
      { name: "Quarterly reviews", included: true },
      { name: "Upgrade assistance", included: true },
    ],
  },
];

/* ── Comparison matrix ───────────────────────────────────────────────── */
const comparisonRows = [
  { feature: "Dedicated instance", tiers: [true, true, true, true, true] },
  { feature: "SSL/TLS certificate (Let's Encrypt)", tiers: [true, true, true, true, true] },
  { feature: "RAM", tiers: ["512 MiB", "1 GiB", "4 GiB", "8 GiB", "Unlimited"] },
  { feature: "Storage", tiers: ["10 GiB", "25 GiB", "80 GiB", "100+ GiB", "Unlimited"] },
  { feature: "Transfer", tiers: ["500 GiB", "1,000 GiB", "4,000 GiB", "Unlimited", "Unlimited"] },
  { feature: "Merkle proofs", tiers: [true, true, true, true, true] },
  { feature: "Markov prediction", tiers: [true, true, true, true, true] },
  { feature: "MCP native", tiers: [true, true, true, true, true] },
  {
    feature: "Support",
    tiers: ["Community", "Email (48hr)", "Priority (24hr)", "Dedicated", "Dedicated"],
  },
  { feature: "SLA", tiers: ["Best effort", "Best effort", "Best effort", "99.9%", "Custom"] },
  { feature: "Custom domain", tiers: [false, false, true, true, true] },
  { feature: "SSO/SAML", tiers: [false, false, false, true, true] },
  { feature: "SOC 2 artifacts", tiers: [false, false, false, true, true] },
  { feature: "Quarterly reviews", tiers: [false, false, false, false, true] },
  { feature: "Source access", tiers: [false, false, false, false, true] },
];

/* ── Competitor comparison ───────────────────────────────────────────── */
const competitors = [
  { feature: "Dedicated instance", parametric: "Yes", mem0: "No (shared)", zep: "No (shared)" },
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
    feature: "Data sovereignty",
    parametric: "Full (your cloud)",
    mem0: "Their cloud",
    zep: "Their cloud",
  },
];

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

function XIcon() {
  return (
    <svg
      className="text-surface-600 mx-auto h-5 w-5 flex-shrink-0"
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path
        fillRule="evenodd"
        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/* ── JSON-LD structured data (static, no Date() calls) ───────────────── */
const productSchemas = tiers.map((tier) => ({
  "@context": "https://schema.org",
  "@type": "Product",
  name: `Parametric Memory - ${tier.name}`,
  description: tier.description,
  brand: { "@type": "Brand", name: "Parametric Memory" },
  offers: {
    "@type": "Offer",
    url: `https://parametric-memory.dev/pricing#${tier.id}`,
    priceCurrency: "USD",
    price: tier.price.toString(),
    priceValidUntil: "2027-03-19",
    availability: "https://schema.org/InStock",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      priceType: "https://schema.org/RecurringPrice",
      price: tier.price.toString(),
      priceCurrency: "USD",
      billingDuration: "P1M",
      unitText: "MONTH",
    },
    seller: {
      "@type": "Organization",
      name: "Parametric Memory",
      url: "https://parametric-memory.dev",
    },
  },
}));

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
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
      name: "How much does Parametric Memory cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Plans start at $9/month for a dedicated instance with all features. Solo is $29/month, Team is $79/month, Enterprise Cloud is $299/month with SLA, and Enterprise Self-Hosted is $499/month.",
      },
    },
    {
      "@type": "Question",
      name: "Does Parametric Memory work with Claude and MCP?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Parametric Memory is MCP-native with 25+ MCP tools, HTTP REST API, OAuth2, and Streamable HTTP transport. It works with Claude, Claude Code, Cowork, and any MCP-compatible client.",
      },
    },
    {
      "@type": "Question",
      name: "Can I self-host Parametric Memory?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. The Enterprise Self-Hosted plan ($499/month) provides a commercial license to deploy on your own AWS, GCP, Azure, or on-premise infrastructure with full source access and deployment support.",
      },
    },
    {
      "@type": "Question",
      name: "Is there a free trial?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. All plans include a free trial with no credit card required. Spin up a dedicated instance in under 5 minutes from the pricing page.",
      },
    },
    {
      "@type": "Question",
      name: "What happens if I outgrow my plan?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Upgrade instantly — same data, zero downtime. RAM and storage scale with the next tier. No surprise bills.",
      },
    },
  ],
};

/* ── Page (Server Component) ─────────────────────────────────────────── */
export default async function PricingPage() {
  const cookieStore = await cookies();
  const isLoggedIn = Boolean(cookieStore.get("mmpm_session")?.value);

  return (
    <>
      {/* JSON-LD structured data — rendered server-side, no hydration issues */}
      {productSchemas.map((schema, index) => (
        <script
          key={`product-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <main className="bg-surface-950 flex min-h-screen flex-col">
        {/* Nav */}
        <SiteNavbar isLoggedIn={isLoggedIn} variant="standard" />

        {/* Hero */}
        <section
          className="flex flex-col items-center gap-6 px-6 pt-32 pb-8 text-center"
          aria-label="Pricing hero"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" />
            <span className="text-xs font-semibold tracking-widest text-brand-300 uppercase">
              Now Available
            </span>
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl">
            Simple, Transparent Pricing
          </h1>
          <p className="text-surface-200/70 mx-auto max-w-2xl text-lg">
            From $9/mo for prototypes to $499/mo for self-hosted enterprise. All plans include
            cryptographic proofs, Markov prediction, and MCP native integration. No hidden fees. No
            per-query charges.
          </p>
          <p className="text-surface-400 text-sm">
            All plans include a free trial &mdash; no credit card required to start.
          </p>
        </section>

        {/* Spacer between hero and cards */}
        <div className="pb-8" />

        {/* Pricing cards */}
        <section className="mx-auto max-w-7xl px-6 pb-24" aria-label="Pricing plans">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
            {tiers.map((tier) => (
              <div
                key={tier.id}
                id={tier.id}
                className={`relative flex flex-col rounded-2xl border transition-all ${
                  tier.highlightedBadge
                    ? "border-brand-400/50 from-brand-500/10 to-surface-900/50 ring-brand-400/25 bg-gradient-to-b ring-1 md:scale-105"
                    : "border-surface-200/10 bg-surface-900/30"
                } hover:border-surface-200/20 p-8 backdrop-blur-sm`}
              >
                {tier.highlightedBadge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 transform">
                    <span className="bg-brand-500 rounded-full px-3 py-1 text-xs font-semibold text-white">
                      {tier.highlightedBadge}
                    </span>
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-white">{tier.name}</h3>
                  <p className="text-surface-200/70 mt-1 text-sm">{tier.description}</p>
                </div>
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">${tier.price}</span>
                    <span className="text-surface-200/70 text-sm">/month</span>
                  </div>
                  <p className="text-surface-200/50 mt-2 text-xs">
                    Billed monthly &mdash; cancel anytime
                  </p>
                </div>
                <PricingCTA tierId={tier.id} tierName={tier.name} label={tier.cta} isLoggedIn={isLoggedIn} ctaLink={tier.ctaLink} />
                <div className="space-y-3" role="list">
                  {tier.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-3" role="listitem">
                      {feature.included ? <CheckIcon /> : <XIcon />}
                      <span
                        className={`text-sm ${feature.included ? "text-white" : "text-surface-500"}`}
                      >
                        {feature.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Comparison table */}
        <section className="mx-auto max-w-7xl px-6 pb-24" aria-label="Pricing comparison matrix">
          <h2 className="mb-8 text-3xl font-bold text-white">Detailed Comparison</h2>
          <div className="border-surface-200/10 bg-surface-900/30 overflow-x-auto rounded-xl border backdrop-blur-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-surface-200/10 border-b">
                  <th className="bg-surface-950/80 sticky left-0 px-6 py-4 text-left font-semibold text-white">
                    Feature
                  </th>
                  {tiers.map((tier) => (
                    <th
                      key={tier.id}
                      className="px-6 py-4 text-center font-semibold whitespace-nowrap text-white"
                    >
                      <div>{tier.name}</div>
                      <div className="text-brand-300 mt-1 text-xs font-normal">
                        ${tier.price}/mo
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, idx) => (
                  <tr
                    key={idx}
                    className="border-surface-200/5 hover:bg-surface-900/50 border-b transition-colors"
                  >
                    <td className="bg-surface-950/40 sticky left-0 px-6 py-4 font-medium text-white">
                      {row.feature}
                    </td>
                    {row.tiers.map((value, tierIdx) => (
                      <td key={tierIdx} className="text-surface-200/70 px-6 py-4 text-center">
                        {typeof value === "boolean" ? value ? <CheckIcon /> : <XIcon /> : value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Competitor comparison */}
        <section className="mx-auto max-w-7xl px-6 pb-24" aria-label="Comparison with competitors">
          <h2 className="mb-3 text-3xl font-bold text-white">vs. Competitors</h2>
          <p className="text-surface-200/70 mb-8">
            How Parametric Memory stacks up (Solo plan $29/mo vs. Mem0 Starter $19/mo vs. Zep Flex
            $25/mo)
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
                    <div className="mt-1 text-xs font-normal text-white">$29/mo</div>
                  </th>
                  <th className="text-surface-300 px-6 py-4 text-center font-semibold">
                    Mem0<div className="text-surface-400 mt-1 text-xs font-normal">$19/mo</div>
                  </th>
                  <th className="text-surface-300 px-6 py-4 text-center font-semibold">
                    Zep<div className="text-surface-400 mt-1 text-xs font-normal">$25/mo</div>
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
        <section className="mx-auto max-w-4xl px-6 pb-24" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="mb-12 text-3xl font-bold text-white">
            Frequently Asked Questions
          </h2>
          <FAQAccordion />
        </section>

        {/* Stay Updated */}
        <section
          id="early-access"
          className="mx-auto max-w-4xl px-6 pb-32"
          aria-labelledby="updates-heading"
        >
          <div className="border-brand-400/20 from-brand-500/5 to-surface-900/50 rounded-2xl border bg-gradient-to-b p-8 backdrop-blur-sm">
            <div className="mb-6 flex items-start gap-4">
              <div className="bg-brand-500/15 mt-0.5 flex-shrink-0 rounded-full p-2">
                <svg
                  className="text-brand-400 h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"
                  />
                </svg>
              </div>
              <div>
                <h3 id="updates-heading" className="mb-2 text-xl font-bold text-white">
                  Stay Updated
                </h3>
                <p className="text-surface-200/70 text-sm leading-relaxed">
                  Get notified about new features, integrations, and platform updates.
                  Founding customers who provide feedback receive priority support
                  and influence the roadmap directly.
                </p>
              </div>
            </div>

            {/* Email capture */}
            <div className="border-surface-200/10 border-t pt-6">
              <p className="mb-4 text-sm font-medium text-white">
                Leave your email for product updates:
              </p>
              <WaitlistForm />
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
