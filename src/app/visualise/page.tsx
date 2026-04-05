import type { Metadata } from "next";
import { cookies } from "next/headers";
import VisualiseClient from "./VisualiseClient";

export const metadata: Metadata = {
  title: "Substrate Viewer",
  description:
    "Live 3D visualisation of the MMPM Merkle tree — watch memory atoms, proof paths, and Markov transitions in real time.",
  alternates: { canonical: "https://parametric-memory.dev/visualise" },
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
    </>
  );
}
