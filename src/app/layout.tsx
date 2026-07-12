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
    default: "Parametric Memory — The L2 Cache for AI: Verifiable, Predictive Agent Memory",
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
  // ── Bing Webmaster Tools site verification (2026-07-08) ────────────────
  // Renders <meta name="msvalidate.01" ...> on every page. Bing had ZERO
  // pages of this site indexed (ChatGPT/Copilot/DDG ride the Bing index);
  // this token verifies ownership so the sitemap can be submitted. The token
  // is public by design — do NOT remove it after verification succeeds, or
  // Bing eventually re-checks and un-verifies the site.
  verification: {
    other: { "msvalidate.01": "DB5282BEA4BFD32D9831FA7B542DF247" },
  },
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
    title: "Parametric Memory — The L2 Cache for AI: Verifiable, Predictive Agent Memory",
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
    title: "Parametric Memory — The L2 Cache for AI: Verifiable, Predictive Agent Memory",
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
/* ── Brand identity graph (sameAs) ─────────────────────────────────────────
 * Every URL here MUST be a LIVE, public profile we control. A dead/404 URL
 * WEAKENS entity disambiguation — only add a profile once it resolves.
 * Live today: X (below) + the canonical site (that's the @id, not repeated).
 * PENDING — uncomment each the moment it goes live (see
 * docs/marketing/strategy/ENTITY-AUTHORITY-KIT.md for the exact profiles + copy to use):
 */
const SAME_AS: string[] = [
  // Live handle TODAY. The rename to @parametricmem is pending X's account review
  // (scheduled task retry-x-handle-rename). X 301-redirects an old handle to the
  // new one, so this URL stays live through the rename — no dead link either way.
  // Flip to "https://x.com/parametricmem" once the rename lands.
  "https://x.com/_EntityOne",
  "https://doi.org/10.5281/zenodo.21213464", // whitepaper — Zenodo concept DOI (all versions), live 2026-07-06
  // "https://www.linkedin.com/company/parametric-memory",
  // "https://www.crunchbase.com/organization/parametric-memory",
  "https://www.wikidata.org/wiki/Q140446437", // Wikidata entity (created 2026-07-06)
  // "https://github.com/<public-org-or-repo>",
];

/* Topics the brand entity is authoritative about. schema.org/knowsAbout binds
 * "Parametric Memory (the company)" to its subject matter — another signal that
 * helps the Knowledge Graph model it as a distinct entity rather than folding
 * it into the generic ML term "parametric memory". */
const KNOWS_ABOUT: string[] = [
  "Verifiable AI memory",
  "AI agent memory",
  "Model Context Protocol (MCP)",
  "Merkle proofs (RFC 6962)",
  "Markov prediction",
  "Persistent memory for LLM agents",
  "Non-parametric memory",
  "Knowledge graphs",
];

// Exported so entity-disambiguation.test.ts can lock these signals against
// silent regression (see src/app/__tests__/entity-disambiguation.test.ts).
export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://parametric-memory.dev/#organization",
  name: "Parametric Memory",
  // Disambiguation: "parametric memory" is also a generic ML term (knowledge in
  // model weights). alternateName (incl. the collision-free token MMPM) +
  // sameAs + disambiguatingDescription tell Google/AI answer engines to model
  // this as a distinct brand entity, separate from the concept.
  alternateName: ["MMPM", "Markov-Merkle Predictive Memory"],
  disambiguatingDescription:
    "Parametric Memory (MMPM) is a commercial software product and company providing a persistent, cryptographically verifiable memory substrate for AI agents. It is distinct from the machine-learning concept 'parametric memory' (knowledge stored implicitly in a model's weights); MMPM is an external, retrievable, Merkle-verifiable memory system — i.e. non-parametric.",
  url: "https://parametric-memory.dev",
  sameAs: SAME_AS,
  knowsAbout: KNOWS_ABOUT,
  logo: {
    "@type": "ImageObject",
    url: "https://parametric-memory.dev/brand/favicon-512.png",
    width: "512",
    height: "512",
  },
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
    "Persistent, verifiable memory substrate for AI agents. Cryptographic Merkle proofs (RFC 6962), Markov-chain prediction (64% hit rate), sub-millisecond access (0.045ms p50). Isolated per-customer substrates; dedicated instances on Professional and Team.",
  offers: {
    "@type": "AggregateOffer",
    lowPrice: "5",
    highPrice: "499",
    priceCurrency: "USD",
    offerCount: "6",
  },
  featureList: [
    "LongMemEval-S 83.0% with typed ingest — graded by the benchmark's official GPT-4o judge",
    "LongMemEval-S 76.6% out of the box — zero LLM calls at ingest, nothing to configure",
    "Sealed, Merkle-rooted benchmark bundles — results are independently re-verifiable, not self-reported",
    "Retrieval 94.0% hit@10 on a static CPU-only embedder (no model call per query)",
    "Cryptographic Merkle proofs (RFC 6962)",
    "Markov-chain predictive recall (64% hit rate)",
    "Sub-millisecond access latency (0.045ms p50)",
    "MCP-native integration (11 tools)",
    "Compact proofs (37% token savings)",
    "LevelDB with JumpHash sharding (4 shards)",
    "Dedicated instances (Professional and Team)",
    "OAuth2 and Bearer token authentication",
    "Streamable HTTP MCP transport",
  ],
};

/* ── Merchant-listings schema fragments (Sprint 2026-W18 GSC fix) ───────────
 * Google Search Console flagged 5 invalid merchant listings on /pricing:
 *   - 1 critical: Missing field "image"  (per Offer)
 *   - 2 warnings: Missing "shippingDetails" + "hasMerchantReturnPolicy"
 * For digital SaaS the canonical pattern is zero-cost instant delivery and
 * a finite return window matching the 7-day money-back guarantee. Hoisted as
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
  merchantReturnDays: 7,
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
    "Persistent, verifiable memory substrate for AI agents. Scores 83.0% on LongMemEval-S with typed ingest and 76.6% out of the box with zero LLM calls at ingest — both graded by the benchmark's official GPT-4o judge and shipped as sealed, Merkle-rooted bundles that can be independently re-verified. Cryptographic Merkle proofs (RFC 6962), Markov-chain prediction (64% hit rate), sub-millisecond recall (0.045ms p50). Isolated per-customer substrates; dedicated on Professional and Team; MCP-native.",
  featureList: [
    "LongMemEval-S 83.0% with typed ingest — official GPT-4o judge, sealed bundle 20260711_typed_full-500_bd6759f",
    "LongMemEval-S 76.6% out of the box — zero LLM calls at ingest, nothing to configure",
    "Sealed, Merkle-rooted benchmark bundles — independently re-verifiable, not self-reported",
    "Retrieval 94.0% hit@10, 89.5% recall@10, MRR 0.826",
    "Known limitation, stated openly: preference-style recall 30%; no image support",
    "Cryptographic Merkle proofs (RFC 6962 SHA-256)",
    "Markov-chain predictive recall (64% hit rate)",
    "Sub-millisecond access latency (0.045ms p50, 1.2ms p99)",
    "~2,900 ops/sec sustained throughput",
    "MCP-native integration (11 tools, Streamable HTTP)",
    "Compact proofs (37% token savings — 4,102 → 2,580 tokens)",
    "LevelDB with JumpHash sharding (4 independent Merkle shards)",
    "Dedicated instances on Professional and Team; isolated substrate on every tier",
    "OAuth2 and Bearer token authentication",
    "Knowledge graph edges with semantic relationships",
    "7-day money-back guarantee on all paid plans",
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
      // ── Next 16 forward-compat (Sprint nextjs-16-upgrade, 2026-05-27) ───
      // In v15 Next.js auto-overrode `scroll-behavior: smooth` to `auto`
      // during SPA route transitions. v16 removes that auto-override; this
      // data attribute restores the v15 behaviour. Without it, every internal
      // navigation smooth-scrolls (visible delay on long pages).
      // See globals.css:70 for the `scroll-behavior: smooth` rule, and the
      // M4 row in docs/SPRINT-NEXTJS-16-UPGRADE-2026-05-27.md.
      data-scroll-behavior="smooth"
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
