import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import VisualiseClient from "./VisualiseClient";

export const metadata: Metadata = {
  title: "Substrate Viewer",
  description:
    "Live 3D visualisation of the MMPM Merkle tree — watch memory atoms, proof paths, and Markov transitions in real time.",
  alternates: { canonical: "https://parametric-memory.dev/visualise" },
  keywords: [
    "Merkle tree visualization",
    "AI memory visualization",
    "memory substrate viewer",
    "3D Merkle tree",
    "cryptographic proof visualization",
  ],
  openGraph: {
    title: "Substrate Viewer | Parametric Memory",
    description:
      "Live 3D visualization of the MMPM Merkle tree — watch memory atoms, proof paths, and Markov transitions in real time.",
    url: "https://parametric-memory.dev/visualise",
    images: [
      {
        url: "https://parametric-memory.dev/brand/og.png",
        width: 1200,
        height: 630,
        alt: "Parametric Memory Substrate Viewer",
      },
    ],
  },
};

const visualiseBreadcrumbJsonLd = {
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
      name: "Substrate Viewer",
      item: "https://parametric-memory.dev/visualise",
    },
  ],
};

export default async function VisualisePage() {
  const cookieStore = await cookies();
  const isLoggedIn = Boolean(cookieStore.get("mmpm_session")?.value);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(visualiseBreadcrumbJsonLd) }}
      />
      <VisualiseClient isLoggedIn={isLoggedIn} />

      {/*
        Server-rendered content below the WebGL viewer. The viewer itself is a
        client-only canvas, so without this section agents and crawlers that do
        not execute JavaScript would see an empty shell. Visible on scroll,
        readable by screen readers, and carries the page's single top-level heading.
      */}
      <section className="bg-[#030712] px-6 py-16 text-slate-300">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-semibold text-white sm:text-3xl">
            Live 3D Merkle-tree visualisation
          </h1>
          <p className="mt-4 leading-relaxed">
            This is a real-time 3D rendering of the Markov–Merkle Predictive
            Memory (MMPM) substrate. Every node is a memory atom committed to a
            SHA-256 Merkle tree; every edge is a proof path or a Markov
            transition between atoms. As atoms are written the tree rebalances
            and the visualisation updates live, so you can watch the structure
            that backs each cryptographic consistency proof.
          </p>
          <p className="mt-4 leading-relaxed">
            Use it to understand how MMPM stores and verifies memory: atoms
            cluster by shard (MMPM uses four independent Merkle shards via
            JumpHash sharding), proof paths trace the hashes needed to verify a
            single atom, and Markov arcs show which memories tend to be recalled
            together. The viewer runs entirely in your browser with WebGL. For
            the underlying architecture see the{" "}
            <Link
              href="/docs"
              className="text-cyan-400 underline-offset-4 hover:underline"
            >
              documentation
            </Link>
            , and to independently verify a signed snapshot use the{" "}
            <Link
              href="/verify"
              className="text-cyan-400 underline-offset-4 hover:underline"
            >
              snapshot verifier
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  );
}
