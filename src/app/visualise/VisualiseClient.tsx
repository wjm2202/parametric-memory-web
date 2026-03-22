"use client";

import dynamic from "next/dynamic";
import SiteNavbar from "@/components/ui/SiteNavbar";

/**
 * Dynamic import — Three.js / R3F cannot render server-side.
 * The loading fallback shows a cinematic skeleton.
 */
const MerkleScene = dynamic(() => import("@/components/visualise/MerkleScene"), {
  ssr: false,
  loading: () => <LoadingSkeleton />,
});

function LoadingSkeleton() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#030712]">
      <div className="text-center">
        <div className="mx-auto mb-6 h-16 w-16 animate-pulse rounded-2xl bg-cyan-500/10 ring-1 ring-cyan-500/20" />
        <div className="mb-2 font-mono text-sm tracking-widest text-cyan-400/60">
          SUBSTRATE VIEWER
        </div>
        <div className="flex items-center justify-center gap-2">
          <div className="h-3 w-3 animate-spin rounded-full border border-cyan-400/30 border-t-cyan-400" />
          <span className="font-mono text-xs text-slate-500">Initialising Merkle tree…</span>
        </div>
      </div>
    </div>
  );
}

interface VisualiseClientProps {
  isLoggedIn: boolean;
}

export default function VisualiseClient({ isLoggedIn }: VisualiseClientProps) {
  return (
    <div className="h-screen w-full overflow-hidden bg-[#030712]">
      <SiteNavbar
        isLoggedIn={isLoggedIn}
        variant="immersive"
        pageLabel="SUBSTRATE VIEWER"
        accentColor="cyan"
      />
      <MerkleScene />
    </div>
  );
}
