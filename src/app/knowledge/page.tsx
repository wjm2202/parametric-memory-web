import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import KnowledgeClient from "./KnowledgeClient";

export const metadata: Metadata = {
  title: "Knowledge Graph",
  description:
    "3D interactive knowledge graph — explore the semantic connections inside your MMPM memory substrate. Search to seed, click to expand Markov arcs.",
  alternates: { canonical: "https://parametric-memory.dev/knowledge" },
  keywords: [
    "knowledge graph",
    "AI memory graph",
    "semantic memory",
    "memory connections",
    "3D knowledge graph",
    "Markov arcs",
  ],
  openGraph: {
    title: "Knowledge Graph | Parametric Memory",
    description:
      "3D interactive knowledge graph — explore the semantic connections inside your MMPM memory substrate.",
    url: "https://parametric-memory.dev/knowledge",
    images: [
      {
        url: "https://parametric-memory.dev/brand/og.png",
        width: 1200,
        height: 630,
        alt: "Parametric Memory Knowledge Graph",
      },
    ],
  },
};

const knowledgeBreadcrumbJsonLd = {
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
      name: "Knowledge Graph",
      item: "https://parametric-memory.dev/knowledge",
    },
  ],
};

/**
 * Public page — no auth required.
 * Middleware only protects /admin and /dashboard; /knowledge is open.
 * Verified: src/middleware.ts isProtected check does not include this path.
 */
export default async function KnowledgePage() {
  const cookieStore = await cookies();
  const isLoggedIn = Boolean(cookieStore.get("mmpm_session")?.value);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(knowledgeBreadcrumbJsonLd) }}
      />
      <KnowledgeClient isLoggedIn={isLoggedIn} />

      {/*
        Server-rendered content below the WebGL graph. The explorer is a
        client-only canvas, so this section is what no-JS agents and crawlers
        actually read. Visible on scroll, readable by screen readers, and
        carries the page's single top-level heading.
      */}
      <section className="bg-[#030712] px-6 py-16 text-slate-300">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-semibold text-white sm:text-3xl">
            Interactive knowledge graph
          </h1>
          <p className="mt-4 leading-relaxed">
            Explore the semantic connections inside an MMPM memory substrate as a force-directed 3D
            graph. Each node is a memory atom; each link is a typed edge or a Markov arc — the
            learned probability that recalling one memory leads to another. Search to seed the graph
            from a concept, then click any node to expand its neighbourhood and follow how knowledge
            connects.
          </p>
          <p className="mt-4 leading-relaxed">
            The knowledge graph is how MMPM turns a flat store of atoms into reasoning structure:
            edges capture relationships (supersedes, depends-on, derived-from, member-of) while
            Markov arcs capture usage patterns learned over time. The explorer runs in your browser
            with WebGL. To learn how atoms, edges, and arcs fit together, see the{" "}
            <Link href="/docs" className="text-violet-400 underline-offset-4 hover:underline">
              documentation
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  );
}
