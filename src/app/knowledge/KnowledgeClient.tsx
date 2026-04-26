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
 *
 * Sprint 2026-W17: top-right `KnowledgeOverlayToggle` lets the user hide
 * the SearchBar and the bottom-left controls (DegreeSizeSlider + ViewToggle)
 * for a clean frame when capturing the substrate hero video.
 */

import dynamic from "next/dynamic";
import { useState } from "react";
import SiteNavbar from "@/components/ui/SiteNavbar";
import SearchBar from "@/components/knowledge/SearchBar";
import SidePanel from "@/components/knowledge/SidePanel";
import ViewToggle from "@/components/knowledge/ViewToggle";
import DegreeSizeSlider from "@/components/knowledge/DegreeSizeSlider";
import KnowledgeLegend from "@/components/knowledge/KnowledgeLegend";
import KnowledgeOverlayToggle from "@/components/knowledge/KnowledgeOverlayToggle";

const KnowledgeScene = dynamic(() => import("@/components/knowledge/KnowledgeScene"), {
  ssr: false,
  loading: () => <LoadingSkeleton />,
});

function LoadingSkeleton() {
  return (
    // M2: definite height (h-screen) + dvh upgrade via inline style.
    // See the same pattern in the main render below.
    <div
      className="flex h-screen w-full items-center justify-center bg-[#030712]"
      style={{ height: "100dvh" }}
    >
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
  // Overlay visibility — defaults are "everything visible" so a first-time
  // visitor's experience is unchanged. The toggle is for power users
  // capturing video; we deliberately don't persist this in localStorage
  // (Cowork artefact rules forbid browser storage) so each session starts
  // with all overlays on. If a future product decision wants this sticky,
  // wire it through the knowledge-store Zustand slice.
  const [showSearch, setShowSearch] = useState(true);
  const [showWeight, setShowWeight] = useState(true);

  return (
    // M2: definite `height` (not min-height) so the `flex-1` Canvas
    // child below resolves correctly. Inline style upgrades to 100dvh on
    // modern browsers for iOS Safari address-bar parity; the `h-screen`
    // class provides the 100vh fallback for iOS <15.4 (the JIT-emitted CSS
    // for h-screen is always parsed first; the inline style is more
    // specific so wins on dvh-capable browsers).
    <div
      className="flex h-screen w-full flex-col overflow-hidden bg-[#030712]"
      style={{ height: "100dvh" }}
    >
      {/* Standard navbar — full nav links visible, no Substrate cross-link */}
      <SiteNavbar isLoggedIn={isLoggedIn} variant="standard" />

      {/* Canvas area — fills remaining space below the fixed navbar.
          mt is tuned per breakpoint to *just* clear the fixed navbar:
            - mobile (< sm): 52px (py-3 + 26px logo + 1px border = ~51px)
            - sm+:           60px (py-4 + 26px logo + 1px border ≈ 59px)
          The old uniform `marginTop: 65px` was set for desktop and left
          ~13px of dead band beneath the mobile navbar, shoving the graph
          off the bottom of the screen. */}
      <div className="relative mt-[52px] flex-1 overflow-hidden sm:mt-[60px]">
        {/* Top-right overlay toggle (always visible — it's the way to hide
            the other overlays, so it can't itself be hidden). */}
        <KnowledgeOverlayToggle
          showSearch={showSearch}
          showWeight={showWeight}
          onToggleSearch={setShowSearch}
          onToggleWeight={setShowWeight}
        />

        {/* SearchBar — absolute overlay, centred at top of canvas */}
        {showSearch && (
          <div className="absolute inset-x-0 top-3 z-10 flex justify-center">
            <SearchBar />
          </div>
        )}

        {/* Full-screen 3D scene */}
        <KnowledgeScene />

        {/* Bottom-left controls — stacked vertically. Hidden together when
            "Weight" is toggled off because they're a related cluster of
            controls (size + edge filtering); splitting them into two
            checkboxes adds clutter without clear user value. */}
        {showWeight && (
          <div className="absolute bottom-4 left-4 z-10 flex flex-col items-start gap-2">
            <DegreeSizeSlider />
            <ViewToggle />
          </div>
        )}

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
