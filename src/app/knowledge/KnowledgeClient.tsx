"use client";

/**
 * KnowledgeClient — shell for the Knowledge Graph page.
 *
 * Pattern mirrors VisualiseClient.tsx:
 *   - Dynamic import of the R3F scene (ssr: false — Three.js can't SSR)
 *   - Loading skeleton while the scene bundle loads
 *   - Nav bar + full-screen canvas
 *
 * Sprint 2: SearchBar and SidePanel added as absolute HTML overlays on top
 * of the Canvas — they live here (not inside R3F) so they can use normal
 * React state, DOM inputs, and CSS transitions.
 */

import dynamic from "next/dynamic";
import SiteNavbar from "@/components/ui/SiteNavbar";
import SearchBar from "@/components/knowledge/SearchBar";
import SidePanel from "@/components/knowledge/SidePanel";

const KnowledgeScene = dynamic(() => import("@/components/knowledge/KnowledgeScene"), {
  ssr: false,
  loading: () => <LoadingSkeleton />,
});

function LoadingSkeleton() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#030712]">
      <div className="text-center">
        <div className="mx-auto mb-6 h-16 w-16 animate-pulse rounded-2xl bg-violet-500/10 ring-1 ring-violet-500/20" />
        <div className="mb-2 font-mono text-sm tracking-widest text-violet-400/60">
          KNOWLEDGE GRAPH
        </div>
        <div className="flex items-center justify-center gap-2">
          <div className="h-3 w-3 animate-spin rounded-full border border-violet-400/30 border-t-violet-400" />
          <span className="font-mono text-xs text-slate-500">Initialising force graph…</span>
        </div>
      </div>
    </div>
  );
}

interface KnowledgeClientProps {
  isLoggedIn: boolean;
}

export default function KnowledgeClient({ isLoggedIn }: KnowledgeClientProps) {
  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#030712]">
      <SiteNavbar
        isLoggedIn={isLoggedIn}
        variant="immersive"
        pageLabel="KNOWLEDGE GRAPH"
        accentColor="violet"
      />

      {/* SearchBar — absolute overlay, centred below the navbar */}
      <div className="absolute inset-x-0 top-14 z-10 flex justify-center md:top-16">
        <SearchBar />
      </div>

      {/* Full-screen 3D scene */}
      <KnowledgeScene />

      {/* SidePanel — absolute overlay, slides in from the right edge */}
      <div className="absolute inset-y-0 top-14 right-0 z-20 md:top-16">
        <SidePanel />
      </div>
    </div>
  );
}
