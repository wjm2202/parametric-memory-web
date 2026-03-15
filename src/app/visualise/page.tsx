import type { Metadata } from "next";
import VisualiseClient from "./VisualiseClient";

export const metadata: Metadata = {
  title: "Substrate Viewer",
  description:
    "Live 3D visualisation of the MMPM Merkle tree — watch memory atoms, proof paths, and Markov transitions in real time.",
};

export default function VisualisePage() {
  return <VisualiseClient />;
}
