import type { Metadata, Viewport } from "next";
import { Syne, Outfit, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { BetaBanner } from "@/components/ui/BetaBanner";
import SiteFooter from "@/components/ui/SiteFooter";
import {
  getLayoutMetaDescription,
  getTwitterDescription,
  getOffersJsonLd,
  getOgImageAltText,
  defaultPriceValidUntil,
} from "@/lib/pricing";

import { SUPPORT_EMAIL } from "@/config/site";
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

/* ── Viewport (Sprint 2026-W18 — M1) ─────────────────────────────────────────
 * Explicit export so Googlebot Smartphone (mobile-first indexing) sees the
 * exact configuration we want rather than Next.js's default. Do NOT set
 * `userScalable: false` — blocking pinch-zoom is a WCAG failure. maximumScale
 * of 5 gives users headroom for visual-impairment zooming.
 *
 * `themeColor` + `colorScheme` prime iOS Safari + Android Chrome to render
 * the status-bar / address-bar in our dark brand colour instead of white,
 * which is the single biggest mobile visual-polish win.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "dark",
  themeColor: "#030712",
};

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
  description: getLayoutMetaDescription(),
  metadataBase: new URL("https://parametric-memory.dev"),
  // ── E-E-A-T + SEO-extension surface (Sprint 2026-W18 SEO audit) ────────
  // Next.js renders these as <meta name="publisher">, <meta name="author">,
  // <meta name="creator">, <meta name="application-name"> — picked up by
  // Google E-E-A-T scoring and SEO crawlers (Lighthouse, SEO-Pro, Ahrefs).
  publisher: "Parametric Memory",
  authors: [{ name: "Parametric Memory", url: "https://parametric-memory.dev/about" }],
  creator: "Parametric Memory",
  applicationName: "Parametric Memory",
  category: "AI Memory Infrastructure",
  openGraph: {
    title: "Parametric Memory — Persistent, Verifiable Memory for AI",
    description: getLayoutMetaDescription(),
    url: "https://parametric-memory.dev",
    siteName: "Parametric Memory",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "https://parametric-memory.dev/brand/og.png",
        width: 1200,
        height: 630,
        alt: getOgImageAltText(),
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@parametricmem",
    creator: "@parametricmem",
    title: "Parametric Memory — Persistent, Verifiable Memory for AI",
    description: getTwitterDescription(),
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
  "@id": "https://parametric-memory.dev/#organization",
  name: "Parametric Memory",
  url: "https://parametric-memory.dev",
  description:
    "Enterprise-grade persistent memory for AI with cryptographic Merkle proofs, Markov prediction, and MCP-native integration.",
  foundingDate: "2025",
  image: {
    "@type": "ImageObject",
    url: "https://parametric-memory.dev/brand/og.png",
    width: "1200",
    height: "630",
  },
  contactPoint: [
    {
      "@type": "ContactPoint",
      email: SUPPORT_EMAIL,
      contactType: "sales",
      availableLanguage: "English",
    },
    {
      "@type": "ContactPoint",
      email: SUPPORT_EMAIL,
      contactType: "technical support",
      availableLanguage: "English",
    },
  ],
  // Bind discoverable actions to the Organization node.
  // Agents reading this JSON-LD can invoke these endpoints directly; the
  // full request/response schemas live at /.well-known/actions.json.
  potentialAction: [
    {
      "@type": "LoginAction",
      "@id": "https://parametric-memory.dev/#action-signin",
      name: "Sign in",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://parametric-memory.dev/api/auth/request-link",
        httpMethod: "POST",
        contentType: "application/json",
        actionPlatform: [
          "https://schema.org/DesktopWebPlatform",
          "https://schema.org/MobileWebPlatform",
        ],
      },
    },
    {
      "@type": "RegisterAction",
      "@id": "https://parametric-memory.dev/#action-signup",
      name: "Create an account",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://parametric-memory.dev/api/signup",
        httpMethod: "POST",
        contentType: "application/json",
        actionPlatform: [
          "https://schema.org/DesktopWebPlatform",
          "https://schema.org/MobileWebPlatform",
        ],
      },
    },
    {
      "@type": "SubscribeAction",
      "@id": "https://parametric-memory.dev/#action-subscribe-waitlist",
      name: "Join the waitlist",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://parametric-memory.dev/api/waitlist",
        httpMethod: "POST",
        contentType: "application/json",
      },
    },
    {
      "@type": "SearchAction",
      "@id": "https://parametric-memory.dev/#action-search-docs",
      name: "Search documentation",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://parametric-memory.dev/docs?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  ],
};

const webApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "@id": "https://parametric-memory.dev/#webapplication",
  name: "Parametric Memory",
  url: "https://parametric-memory.dev",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Linux, Docker",
  browserRequirements: "MCP-compatible AI client (Claude, Cowork, etc.)",
  description:
    "Persistent, verifiable memory substrate for AI agents. Cryptographic Merkle proofs (RFC 6962), Markov-chain prediction (64% hit rate), sub-millisecond access (0.045ms p50). Self-hosted on dedicated instances.",
  offers: {
    "@type": "AggregateOffer",
    lowPrice: "5",
    highPrice: "499",
    priceCurrency: "USD",
    offerCount: "6",
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

/* ── Merchant-listings schema fragments (Sprint 2026-W18 GSC fix) ───────────
 * Google Search Console flagged 5 invalid merchant listings on /pricing:
 *   - 1 critical: Missing field "image"  (per Offer)
 *   - 2 warnings: Missing "shippingDetails" + "hasMerchantReturnPolicy"
 * For digital SaaS the canonical pattern is zero-cost instant delivery and
 * a finite return window matching the 30-day money-back guarantee. Hoisted as
 * constants so every Offer references the same policy — single source of
 * truth, single line to update if the return window changes.
 */
const PRODUCT_IMAGE_URL = "https://parametric-memory.dev/brand/og.png";

const DIGITAL_SHIPPING_DETAILS = {
  "@type": "OfferShippingDetails",
  shippingRate: {
    "@type": "MonetaryAmount",
    value: "0",
    currency: "USD",
  },
  shippingDestination: {
    "@type": "DefinedRegion",
    geoMidpoint: { "@type": "GeoCoordinates", latitude: 0, longitude: 0 },
    name: "Worldwide",
  },
  deliveryTime: {
    "@type": "ShippingDeliveryTime",
    handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 0, unitCode: "DAY" },
    transitTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 0, unitCode: "DAY" },
  },
};

const FREE_TRIAL_RETURN_POLICY = {
  "@type": "MerchantReturnPolicy",
  applicableCountry: "US",
  returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
  merchantReturnDays: 14,
  returnMethod: "https://schema.org/ReturnByMail",
  returnFees: "https://schema.org/FreeReturn",
};

/* ── SoftwareApplication — richer schema for AI search engines ──────────────
 * Separate from WebApplication. Google AI Mode, Perplexity, and ChatGPT use
 * SoftwareApplication + Offer arrays to surface pricing and feature data in
 * AI-generated answers. Includes all 5 pricing tiers.
 */
const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": "https://parametric-memory.dev/#softwareapplication",
  name: "Parametric Memory",
  alternateName: "MMPM",
  url: "https://parametric-memory.dev",
  applicationCategory: "DeveloperApplication",
  applicationSubCategory: "AI Memory Infrastructure",
  softwareVersion: "1.0",
  image: PRODUCT_IMAGE_URL,
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
    "30-day money-back guarantee on all paid plans",
    "Docker Compose deployment (DigitalOcean + nginx + Let's Encrypt)",
  ],
  publisher: {
    "@type": "Organization",
    name: "Parametric Memory",
    url: "https://parametric-memory.dev",
  },
  offers: getOffersJsonLd({
    baseUrl: "https://parametric-memory.dev",
    imageUrl: PRODUCT_IMAGE_URL,
    shippingDetails: DIGITAL_SHIPPING_DETAILS,
    returnPolicy: FREE_TRIAL_RETURN_POLICY,
    priceValidUntil: defaultPriceValidUntil(),
  }),
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
        {/* Agent actions manifest — machine-readable catalogue of actions
            agents can invoke on this origin (signin/signup/waitlist/search).
            Convention: https://parametric-memory.dev/.well-known/actions.json */}
        <link
          rel="actions"
          type="application/actions+json"
          href="/.well-known/actions.json"
          title="Agent actions manifest"
        />
        {/* Signal content is human-authored and AI-indexable */}
        <meta name="ai-content-declaration" content="human-authored" />
      </head>
      <body className="min-h-screen">
        <BetaBanner />
        <div className="relative flex min-h-screen flex-col">
          {children}
          {/* SiteFooter — site-wide canonical copyright + jurisdiction line.
              Rendered AFTER children so pages with their own bespoke footer
              (homepage, /privacy, /terms, /aup, /dpa) still show that
              footer above this one-liner. The bespoke footers no longer
              carry the © string — this is the single source of truth for
              copyright wording. See src/components/ui/SiteFooter.tsx. */}
          <SiteFooter />
        </div>
        {/* Sonner renderer — mounted site-wide so toast() calls anywhere in
            the app have a target. Dark-themed + top-right to match the admin
            page aesthetic. */}
        <Toaster theme="dark" position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
