import type { Metadata } from "next";
import Script from "next/script";
import { Syne, Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { BetaBanner } from "@/components/ui/BetaBanner";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Parametric Memory — Persistent, Verifiable Memory for AI",
    template: "%s | Parametric Memory",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/brand/favicon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
    other: [{ rel: "mask-icon", url: "/brand/favicon-32x32.png" }],
  },
  manifest: "/site.webmanifest",
  description:
    "Persistent, verifiable memory for AI agents. Dedicated instances from $9/mo with cryptographic Merkle proofs, Markov prediction, and MCP-native integration.",
  metadataBase: new URL("https://parametric-memory.dev"),
  openGraph: {
    title: "Parametric Memory — Persistent, Verifiable Memory for AI",
    description:
      "Enterprise-grade AI memory with cryptographic Merkle proofs, Markov-chain prediction, and sub-millisecond recall. Dedicated instances from $9/mo.",
    url: "https://parametric-memory.dev",
    siteName: "Parametric Memory",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "https://parametric-memory.dev/brand/og.png",
        width: 1200,
        height: 630,
        alt: "Parametric Memory — Persistent, verifiable AI memory. 0.045ms recall · 64% Markov hit rate · From $9/mo.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Parametric Memory — Persistent, Verifiable Memory for AI",
    description:
      "Enterprise-grade AI memory with cryptographic Merkle proofs. Dedicated instances from $9/mo.",
    images: ["https://parametric-memory.dev/brand/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  alternates: {
    canonical: "https://parametric-memory.dev",
  },
};

/* ── Site-wide JSON-LD structured data ─────────────────────────────────────
 * Organization + WebApplication schema for AI discovery (Google AI Mode,
 * AI Overviews, ChatGPT, Perplexity). Safe on every page including /visualise.
 */
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Parametric Memory",
  url: "https://parametric-memory.dev",
  description:
    "Enterprise-grade persistent memory for AI with cryptographic Merkle proofs, Markov prediction, and MCP-native integration.",
  foundingDate: "2025",
  sameAs: ["https://github.com/wjm2202/Parametric-Memory"],
  image: {
    "@type": "ImageObject",
    url: "https://parametric-memory.dev/brand/og.png",
    width: "1200",
    height: "630",
  },
  contactPoint: [
    {
      "@type": "ContactPoint",
      email: "entityone22@gmail.com",
      contactType: "sales",
      availableLanguage: "English",
    },
    {
      "@type": "ContactPoint",
      email: "entityone22@gmail.com",
      contactType: "technical support",
      availableLanguage: "English",
    },
  ],
};

const webApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Parametric Memory",
  url: "https://parametric-memory.dev",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Linux, Docker",
  browserRequirements: "MCP-compatible AI client (Claude, Cowork, etc.)",
  description:
    "Persistent, verifiable memory substrate for AI agents. Cryptographic Merkle proofs (RFC 6962), Markov-chain prediction (64% hit rate), sub-millisecond access (0.045ms p50). Self-hosted on dedicated instances.",
  offers: {
    "@type": "AggregateOffer",
    lowPrice: "9",
    highPrice: "499",
    priceCurrency: "USD",
    offerCount: "5",
  },
  featureList: [
    "Cryptographic Merkle proofs (RFC 6962)",
    "Markov-chain predictive recall (64% hit rate)",
    "Sub-millisecond access latency (0.045ms p50)",
    "MCP-native integration (25+ tools)",
    "Compact proofs (37% token savings)",
    "LevelDB with JumpHash sharding (4 shards)",
    "Self-hosted dedicated instances",
    "OAuth2 and Bearer token authentication",
    "Streamable HTTP MCP transport",
  ],
};

/* ── SoftwareApplication — richer schema for AI search engines ──────────────
 * Separate from WebApplication. Google AI Mode, Perplexity, and ChatGPT use
 * SoftwareApplication + Offer arrays to surface pricing and feature data in
 * AI-generated answers. Includes all 5 pricing tiers.
 */
const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Parametric Memory",
  alternateName: "MMPM",
  url: "https://parametric-memory.dev",
  applicationCategory: "DeveloperApplication",
  applicationSubCategory: "AI Memory Infrastructure",
  softwareVersion: "1.0",
  operatingSystem: "Linux, Docker, Any (SaaS)",
  inLanguage: "en",
  description:
    "Persistent, verifiable memory substrate for AI agents. Cryptographic Merkle proofs (RFC 6962), Markov-chain prediction (64% hit rate), sub-millisecond recall (0.045ms p50). Dedicated instances, MCP-native, no shared infrastructure.",
  featureList: [
    "Cryptographic Merkle proofs (RFC 6962 SHA-256)",
    "Markov-chain predictive recall (64% hit rate)",
    "Sub-millisecond access latency (0.045ms p50, 1.2ms p99)",
    "6,423 ops/sec throughput",
    "MCP-native integration (25+ tools, Streamable HTTP)",
    "Compact proofs (37% token savings — 4,102 → 2,580 tokens)",
    "LevelDB with JumpHash sharding (4 independent Merkle shards)",
    "Dedicated instances — zero shared infrastructure",
    "OAuth2 and Bearer token authentication",
    "Knowledge graph edges with semantic relationships",
    "14-day free trial on all paid plans",
    "Docker Compose deployment (DigitalOcean + nginx + Let's Encrypt)",
  ],
  publisher: {
    "@type": "Organization",
    name: "Parametric Memory",
    url: "https://parametric-memory.dev",
  },
  offers: [
    {
      "@type": "Offer",
      name: "Indie",
      description: "Your personal AI memory. 10,000 atoms, up to 33 Claude sessions/day.",
      price: "9",
      priceCurrency: "USD",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "9",
        priceCurrency: "USD",
        billingDuration: "P1M",
        unitCode: "MON",
      },
      availability: "https://schema.org/InStock",
      url: "https://parametric-memory.dev/pricing#indie",
    },
    {
      "@type": "Offer",
      name: "Pro",
      description:
        "For serious daily AI development. 100,000 atoms, up to 333 Claude sessions/day.",
      price: "29",
      priceCurrency: "USD",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "29",
        priceCurrency: "USD",
        billingDuration: "P1M",
        unitCode: "MON",
      },
      availability: "https://schema.org/InStock",
      url: "https://parametric-memory.dev/pricing#pro",
    },
    {
      "@type": "Offer",
      name: "Team",
      description: "Your team's shared institutional memory. 500,000 atoms, unlimited bootstraps.",
      price: "79",
      priceCurrency: "USD",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "79",
        priceCurrency: "USD",
        billingDuration: "P1M",
        unitCode: "MON",
      },
      availability: "https://schema.org/InStock",
      url: "https://parametric-memory.dev/pricing#team",
    },
    {
      "@type": "Offer",
      name: "Enterprise Cloud",
      description:
        "Managed enterprise tier. 8 GiB RAM, 100+ GiB storage, 99.9% SLA, SSO/SAML, SOC 2 artifacts.",
      price: "299",
      priceCurrency: "USD",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "299",
        priceCurrency: "USD",
        billingDuration: "P1M",
        unitCode: "MON",
      },
      availability: "https://schema.org/InStock",
      url: "https://parametric-memory.dev/pricing",
    },
    {
      "@type": "Offer",
      name: "Enterprise Self-Hosted",
      description:
        "Commercial license. Deploy on your own cloud (AWS/GCP/Azure). Full source access, architecture review.",
      price: "499",
      priceCurrency: "USD",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "499",
        priceCurrency: "USD",
        billingDuration: "P1M",
        unitCode: "MON",
      },
      availability: "https://schema.org/InStock",
      url: "https://parametric-memory.dev/pricing",
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${syne.variable} ${outfit.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* AI-first: Organization structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        {/* AI-first: WebApplication structured data (Google rich results) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplicationJsonLd) }}
        />
        {/* AI-first: SoftwareApplication with full pricing offers
            Used by Google AI Mode, Perplexity, ChatGPT for product + pricing answers */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
        />
        {/* AI crawler discoverability — llms.txt standard (llmstxt.org) */}
        <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM-readable site index" />
        {/* Signal content is human-authored and AI-indexable */}
        <meta name="ai-content-declaration" content="human-authored" />
      </head>
      <body className="min-h-screen">
        <BetaBanner />
        <div className="relative flex min-h-screen flex-col">{children}</div>

        {/* PostHog analytics — loads async, no render impact */}
        {process.env.POSTHOG_KEY && (
          <Script
            id="posthog-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
                posthog.init('${process.env.POSTHOG_KEY}', {
                  api_host: '${process.env.POSTHOG_HOST || "https://us.i.posthog.com"}',
                  person_profiles: 'identified_only',
                  capture_pageview: true,
                  capture_pageleave: true,
                });
              `,
            }}
          />
        )}
      </body>
    </html>
  );
}
