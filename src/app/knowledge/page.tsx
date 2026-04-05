import type { Metadata } from "next";
import { cookies } from "next/headers";
import KnowledgeClient from "./KnowledgeClient";

export const metadata: Metadata = {
  title: "Knowledge Graph",
  description:
    "3D interactive knowledge graph — explore the semantic connections inside your MMPM memory substrate. Search to seed, click to expand Markov arcs.",
  alternates: { canonical: "https://parametric-memory.dev/knowledge" },
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
    </>
  );
}
