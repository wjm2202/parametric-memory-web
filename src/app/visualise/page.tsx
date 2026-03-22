import type { Metadata } from "next";
import { cookies } from "next/headers";
import VisualiseClient from "./VisualiseClient";

export const metadata: Metadata = {
  title: "Substrate Viewer",
  description:
    "Live 3D visualisation of the MMPM Merkle tree — watch memory atoms, proof paths, and Markov transitions in real time.",
};

export default async function VisualisePage() {
  const cookieStore = await cookies();
  const isLoggedIn = Boolean(cookieStore.get("mmpm_session")?.value);
  return <VisualiseClient isLoggedIn={isLoggedIn} />;
}
