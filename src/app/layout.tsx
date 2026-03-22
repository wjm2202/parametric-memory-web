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
  },
  twitter: {
    card: "summary_large_image",
    title: "Parametric Memory — Persistent, Verifiable Memory for AI",
    description:
      "Enterprise-grade AI memory with cryptographic Merkle proofs. Dedicated instances from $9/mo.",
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
  contactPoint: {
    "@type": "ContactPoint",
    email: "entityone22@gmail.com",
    contactType: "sales",
  },
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
        {/* AI-first: WebApplication structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplicationJsonLd) }}
        />
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
