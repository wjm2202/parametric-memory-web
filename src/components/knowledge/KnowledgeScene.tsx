"use client";

/**
 * KnowledgeScene — root R3F Canvas for the Knowledge Graph.
 *
 * Architecture:
 *   - useForceGraph hook owns the d3-force-3d simulation
 *   - Passes simNodes/simEdges refs down to GraphNodes + GraphEdges
 *   - GraphNodes/GraphEdges read positions from refs in useFrame (no Zustand per-frame)
 *   - All store interactions (select, hover, expand) happen in event handlers
 *
 * Seeding strategy (two layers):
 *   1. useAutoSeed() — loads the FULL atom graph on mount (one HTTP request,
 *      ~833 atoms + edges). Gives users an immediate visual even before they search.
 *   2. SearchBar (in KnowledgeClient.tsx) — additive ego-graph exploration.
 *      Typing a query seeds additional atoms + their Markov neighbours on top of
 *      the full graph. Clear button resets to empty so the user can start fresh.
 *
 * Matches MerkleScene.tsx patterns:
 *   - SceneErrorBoundary + Safe wrapper for resilient child mounting
 *   - OrbitControls with enableDamping
 *   - Stars background
 *   - Bloom via KnowledgeEffects
 */

import { Component, Suspense, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { useForceGraph } from "./useForceGraph";
import { useAutoSeed } from "./useAutoSeed";
import GraphNodes from "./GraphNodes";
import GraphEdges from "./GraphEdges";
import HoverLabel from "./HoverLabel";
import KnowledgeEffects from "./KnowledgeEffects";
import SearchAnchor from "./SearchAnchor";

/* ─── Error boundary ─────────────────────────────────────────────────────── */

class SceneErrorBoundary extends Component<
  { name: string; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[KnowledgeScene:${this.props.name}]`, error);
  }

  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

function Safe({ name, children }: { name: string; children: ReactNode }) {
  return (
    <SceneErrorBoundary name={name}>
      <Suspense fallback={null}>{children}</Suspense>
    </SceneErrorBoundary>
  );
}

/* ─── Inner scene (inside Canvas context) ─────────────────────────────────── */

function Scene() {
  const handle = useForceGraph();

  // Layer 1: full graph auto-load on mount (1 HTTP request, ~833 atoms + edges).
  // Layer 2: SearchBar in KnowledgeClient.tsx adds ego-graph expansions on top.
  useAutoSeed();

  return (
    <>
      {/* Orbit, zoom, pan */}
      <OrbitControls enableDamping dampingFactor={0.08} makeDefault />

      {/* Background */}
      <Stars radius={120} depth={60} count={3000} factor={3} fade />

      {/* Nodes, edges, and labels */}
      <Safe name="GraphNodes">
        <GraphNodes handle={handle} />
      </Safe>
      <Safe name="GraphEdges">
        <GraphEdges handle={handle} />
      </Safe>
      <Safe name="HoverLabel">
        <HoverLabel handle={handle} />
      </Safe>

      {/* Search anchor: pulsing sphere + spokes to hit nodes, visible during search */}
      <Safe name="SearchAnchor">
        <SearchAnchor handle={handle} />
      </Safe>

      {/* Bloom */}
      <Safe name="KnowledgeEffects">
        <KnowledgeEffects />
      </Safe>
    </>
  );
}

/* ─── Canvas root ────────────────────────────────────────────────────────── */

export default function KnowledgeScene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 300], fov: 60, near: 0.1, far: 3000 }}
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 2]}
      style={{ background: "#030712" }}
    >
      <Scene />
    </Canvas>
  );
}
