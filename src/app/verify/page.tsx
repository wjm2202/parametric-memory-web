import type { Metadata } from "next";
import { cookies } from "next/headers";
import SiteNavbar from "@/components/ui/SiteNavbar";
import VerifyClient from "./VerifyClient";

export const metadata: Metadata = {
  title: "Verify a snapshot — Ed25519 + Merkle proof",
  description:
    "Drop a signed Parametric Memory snapshot and your browser verifies its Ed25519 signature and recomputes every Merkle root locally. No data leaves your browser.",
  keywords: [
    "verify AI memory",
    "signed snapshot verifier",
    "Ed25519 verification",
    "Merkle commitment",
    "AI audit trail",
    "cryptographic AI provenance",
    "EU AI Act traceability",
    "SOC 2 AI memory",
    "Parametric Memory",
    "MMPM",
  ],
  alternates: { canonical: "https://parametric-memory.dev/verify" },
  openGraph: {
    title: "Verify a Parametric Memory snapshot — cryptographic proof in your browser",
    description:
      "Same cryptography as Bitcoin, Git, Certificate Transparency, and Sigstore. Drop a signed snapshot, verify Ed25519 signature + Merkle commitments client-side, no data leaves your browser.",
    url: "https://parametric-memory.dev/verify",
    siteName: "Parametric Memory",
    type: "website",
    images: [
      {
        url: "https://parametric-memory.dev/brand/og.png",
        width: 1200,
        height: 630,
        alt: "Verify a Parametric Memory snapshot",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Verify a Parametric Memory snapshot",
    description:
      "Drop a signed snapshot. Verify Ed25519 + Merkle commitments in your browser. Same cryptography as Bitcoin, Git, Certificate Transparency, Sigstore.",
    images: ["https://parametric-memory.dev/brand/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  },
};

// JSON-LD structured data -- helps Google rich results AND AI answer engines
// (ChatGPT, Perplexity, Claude) cite this page accurately when users ask
// "how do I verify an AI agent's memory" or similar regulated-industry queries.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": "https://parametric-memory.dev/verify#app",
      name: "Parametric Memory Snapshot Verifier",
      url: "https://parametric-memory.dev/verify",
      applicationCategory: "SecurityApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description:
        "Browser-based cryptographic verifier for signed Parametric Memory snapshots. Verifies Ed25519 signatures and recomputes SHA-256 Merkle commitments client-side. Uses the same cryptographic pattern as Bitcoin block headers, Git commit objects, Certificate Transparency log heads, and Sigstore manifests.",
      featureList: [
        "Ed25519 signature verification",
        "SHA-256 Merkle root recompute",
        "RFC 8785 JSON canonicalisation",
        "Client-side only, no data leaves the browser",
        "Drag-and-drop verification",
        "Demo snapshot download",
      ],
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://parametric-memory.dev" },
        {
          "@type": "ListItem",
          position: 2,
          name: "Verify",
          item: "https://parametric-memory.dev/verify",
        },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "How does Parametric Memory verification work?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Two independent cryptographic checks. First, the browser verifies an Ed25519 signature against the public key embedded in the snapshot — proving authenticity. Second, the browser independently recomputes every SHA-256 Merkle root from the atoms, edges, and audit entries actually in the snapshot — proving integrity. Both checks must pass. The signed payload is a constant-size header containing Merkle commitments, the same pattern Bitcoin uses for block headers and Git uses for commit objects.",
          },
        },
        {
          "@type": "Question",
          name: "Is verification done on Parametric Memory's servers or in my browser?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Entirely in your browser. No data is sent to any server. Verification uses the WebCrypto API for Ed25519 verify and SHA-256 hashing. The verifier's source code is published as part of the Parametric Memory open-source release; you can audit it yourself.",
          },
        },
        {
          "@type": "Question",
          name: "What cryptographic primitives does Parametric Memory use?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Ed25519 signatures (RFC 8032), SHA-256 Merkle trees following RFC 6962 strict (no domain-separation prefix byte, duplicate-last odd-pad), and RFC 8785 JSON canonicalisation. Signing keys live in HashiCorp Vault Transit — the substrate sends bytes, Vault returns a signature, the private key never leaves Vault.",
          },
        },
      ],
    },
  ],
};

export default async function VerifyPage() {
  const cookieStore = await cookies();
  const isLoggedIn = Boolean(cookieStore.get("mmpm_session")?.value);

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      <SiteNavbar isLoggedIn={isLoggedIn} />

      <main className="mx-auto max-w-3xl px-6 py-16">
        {/* JSON-LD structured data for SEO + AEO -- Google rich results,
                    ChatGPT/Perplexity/Claude answer-engine citation surface. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
        <div className="mb-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            Cryptographic verification
          </div>
          <h1 className="font-[family-name:var(--font-syne)] text-4xl font-bold text-white">
            Verify a Parametric Memory snapshot
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-white/60">
            Drag a signed snapshot onto the page. Your browser verifies the Ed25519 signature, then
            independently recomputes the Merkle roots from the atoms and edges. Both checks must
            pass. No data leaves your browser.
          </p>
        </div>

        <VerifyClient />

        {/* JWKS pointer -- small, one-line, with a clickable link to the
            actual public-key publication. Auditors expect to see this;
            customers can pin the key fingerprint into their own CI. */}
        <div className="border-surface-200/10 bg-surface-900/30 mt-8 rounded-xl border p-5 text-sm">
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.7}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
            <div>
              <div className="font-semibold text-white">Public keys published independently</div>
              <p className="mt-1 text-white/60">
                Our Ed25519 signing public keys are published in standard JWKS format at{" "}
                <a
                  href="/.well-known/jwks.json"
                  className="font-mono text-emerald-300 hover:text-emerald-200 hover:underline"
                >
                  /.well-known/jwks.json
                </a>{" "}
                &mdash; the same publication pattern OAuth providers and OIDC issuers use. Fetch it
                any time to cross-check the public key embedded in any snapshot against the one
                we&apos;ve published. If a snapshot&apos;s embedded key doesn&apos;t match the JWKS
                entry for its{" "}
                <code className="bg-surface-900/60 rounded px-1 py-0.5 text-[11px] text-white/70">
                  kid
                </code>
                , the snapshot is rejected.
              </p>
            </div>
          </div>
        </div>

        <details className="border-surface-200/10 bg-surface-900/30 mt-6 rounded-xl border p-5 text-sm">
          <summary className="cursor-pointer text-white/70">
            How does the verification actually work?
          </summary>
          <div className="mt-4 space-y-3 text-white/60">
            <p>Two independent cryptographic checks. Both must pass.</p>
            <ul className="ml-5 list-disc space-y-1.5">
              <li>
                <strong className="text-white/80">Check A &mdash; Authenticity.</strong> The Ed25519
                signature is verified against the public key embedded in the snapshot. The signed
                payload is a constant-size header containing the snapshot&apos;s Merkle commitments
                (master root, per-shard roots, edges root, audit-log root). MMPM&apos;s private
                signing key lives inside HashiCorp Vault and never leaves &mdash; the substrate
                sends bytes, Vault returns a signature.
              </li>
              <li>
                <strong className="text-white/80">Check B &mdash; Merkle commitment.</strong> Your
                browser independently recomputes every Merkle root from the atoms, edges, and audit
                entries actually in the snapshot. Each recomputed root must equal the claimed value
                in the signed header. Tamper any atom, remove any edge, omit any audit entry &mdash;
                the recomputed root differs, the check fails.
              </li>
            </ul>
            <p>
              The architecture is bitcoin-shaped on purpose. Bitcoin signs a block header that
              commits to a merkle root over transactions; we sign a snapshot header that commits to
              a merkle root over atoms, edges, and audit. Same cryptographic guarantee, same
              separation of authenticity and integrity, same auditability. Constant-size signed
              payload regardless of substrate scale &mdash; a 100-atom snapshot and a
              10-million-atom snapshot sign in the same time and produce the same-size signature.
            </p>
            <p>
              Together the two checks answer:{" "}
              <em className="text-white/80">
                does this snapshot describe a real Parametric Memory state, signed by MMPM,
                untampered since signing?
              </em>{" "}
              If both checks above are green, yes.
            </p>
          </div>
        </details>
      </main>
    </div>
  );
}
