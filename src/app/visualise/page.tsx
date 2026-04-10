import type { Metadata } from "next";
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
    </>
  );
}
