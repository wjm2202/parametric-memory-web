import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
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
