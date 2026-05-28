import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    // ── Locked explicitly for Next 16 forward-compat (Sprint 2026-05-27) ──
    // The following three values are silently flipped by Next.js 16. Pinning
    // them here makes the defaults visible in source, prevents an invisible
    // behaviour change on upgrade, and gives reviewers a single place to
    // adjust them deliberately. See M2 in
    // docs/SPRINT-NEXTJS-16-UPGRADE-2026-05-27.md and the regression test at
    // src/app/__tests__/next-config-images-defaults.test.ts.
    //
    // minimumCacheTTL: 60s (v15 default) → 14400s/4h (v16 default).
    //   We accept v16's 4h — blog cover images + favicons rarely change and
    //   refreshing the optimizer cache every minute is wasteful.
    minimumCacheTTL: 14400,
    // imageSizes: [16, 32, ...] (v15) → 16 removed (v16). We keep 16 because
    //   the homepage favicon at src/app/page.tsx:178 renders at width=24,
    //   and 16 is the closest size below the deviceSizes floor.
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // qualities: unrestricted (v15) → [75] only (v16). Neither <Image> site
    //   currently passes `quality`, so 75 is what we render. Explicit lock.
    qualities: [75],
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
        // ── X-Robots-Tag (Sprint 2026-W18 SEO audit) ──────────────────────
        // Authoritative indexing signal that fires on EVERY response type
        // (HTML, JSON, SSE, sitemap, etc) — <meta name="robots"> only fires
        // on HTML. Mirrors the per-page metadata.robots block in layout.tsx
        // so SEO scanners (Lighthouse, SEO-Pro) see consistent signals.
        {
          key: "X-Robots-Tag",
          value:
            "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
        },
      ],
    },
    // Internal routes — mirror robots.txt Disallow with header-level noindex
    // so any non-HTML responses (JSON errors, redirects) carry the signal too.
    {
      source: "/api/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    },
    {
      source: "/admin/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    },
    {
      source: "/dashboard/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    },
    // ── JWKS public-key publication (V1.3 — Sprint 2026-05-13) ─────────────
    // The /.well-known/jwks.json endpoint publishes the Ed25519 public key
    // that signs MMPM snapshots. The verify page (and any third-party
    // verifier) does a cross-origin `fetch(snap.signature.keyUri)` to confirm
    // the embedded key matches the published key — i.e. that the snapshot
    // wasn't signed by some other key the substrate also has access to.
    //
    // Without ACAO on this response, the browser blocks the cross-origin
    // fetch and the verifier silently falls back to the embedded key
    // (keySource = embedded-fallback-jwks-unreachable). The fallback is
    // structurally safe — the embedded key is covered by the signature, so
    // it can't be swapped in transit — but the trust narrative is
    // "verifiable against an independently published key", which the
    // fallback path defeats.
    //
    // Public-key publication is, by definition, public. ACAO: * is correct.
    // OPTIONS is included so browser preflights succeed. Cache for 5 minutes
    // so key rotations propagate within a short window without hammering the
    // origin on every verify.
    {
      source: "/.well-known/jwks.json",
      headers: [
        { key: "Access-Control-Allow-Origin", value: "*" },
        { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
        { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        { key: "Cache-Control", value: "public, max-age=300, must-revalidate" },
        { key: "Content-Type", value: "application/json; charset=utf-8" },
      ],
    },
  ],
  redirects: async () => [
    {
      source: "/docs/plans-and-trial",
      destination: "/docs/plans",
      permanent: false,
    },
  ],
  // Three.js / R3F needs transpilation for ESM compat
  transpilePackages: ["three"],
};

export default nextConfig;
