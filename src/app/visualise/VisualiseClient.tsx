"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

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

export default function VisualiseClient() {
  return (
    <div className="h-screen w-full overflow-hidden bg-[#030712]">
      {/* Navigation bar */}
      <nav className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 py-3 md:px-6 md:py-4">
        <Link
          href="/"
          className="font-mono text-xs font-semibold tracking-wider text-slate-400 transition-colors hover:text-white md:text-sm"
        >
          <span className="hidden sm:inline">PARAMETRIC MEMORY</span>
          <span className="sm:hidden">PMEM</span>
        </Link>
        <div className="flex items-center gap-1">
          <span className="hidden font-mono text-xs tracking-widest text-cyan-500/60 sm:inline">
            SUBSTRATE VIEWER
          </span>
          <span className="ml-1 rounded-full bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] text-cyan-400 ring-1 ring-cyan-500/20 sm:ml-2">
            LIVE
          </span>
        </div>
      </nav>

      {/* Full-screen 3D scene */}
      <MerkleScene />
    </div>
  );
}
