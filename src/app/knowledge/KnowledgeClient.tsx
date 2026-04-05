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
import ViewToggle from "@/components/knowledge/ViewToggle";
import DegreeSizeSlider from "@/components/knowledge/DegreeSizeSlider";
import KnowledgeLegend from "@/components/knowledge/KnowledgeLegend";

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
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#030712]">
      {/* Standard navbar — full nav links visible, no Substrate cross-link */}
      <SiteNavbar isLoggedIn={isLoggedIn} variant="standard" />

      {/* Canvas area — fills remaining space below the fixed navbar */}
      <div className="relative flex-1 overflow-hidden" style={{ marginTop: "65px" }}>

        {/* SearchBar — absolute overlay, centred at top of canvas */}
        <div className="absolute inset-x-0 top-3 z-10 flex justify-center">
          <SearchBar />
        </div>

        {/* Full-screen 3D scene */}
        <KnowledgeScene />

        {/* Bottom-left controls — stacked vertically */}
        <div className="absolute bottom-4 left-4 z-10 flex flex-col items-start gap-2">
          <DegreeSizeSlider />
          <ViewToggle />
        </div>

        {/* Bottom-right legend — "?" toggle opens the visual key */}
        <div className="absolute right-4 bottom-4 z-10 flex flex-col items-end gap-2">
          <KnowledgeLegend />
        </div>

        {/* SidePanel — absolute overlay, slides in from the right edge */}
        <div className="absolute inset-y-0 right-0 z-20">
          <SidePanel />
        </div>

      </div>
    </div>
  );
}
