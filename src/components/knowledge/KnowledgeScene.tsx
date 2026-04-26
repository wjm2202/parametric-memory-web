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

import { Component, Suspense, useEffect, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { useForceGraph } from "./useForceGraph";
import { useAutoSeed } from "./useAutoSeed";
import GraphNodes from "./GraphNodes";
import GraphEdges from "./GraphEdges";
import ClusterNebulae from "./ClusterNebulae";
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

/* ─── KnowledgeSpaceDrift ────────────────────────────────────────────────────
 *
 * Wraps all scene content in a group that slowly oscillates on secondary axes.
 *
 * WHY THIS EXISTS — the conceptual distinction between the two viewers:
 *
 *   Substrate viewer  → Y-axis camera orbit only (a disc spinning in place).
 *                       Conveys: "this is data laid flat on physical storage."
 *
 *   Knowledge viewer  → same Y-axis autoRotate speed (identical UX feel),
 *                       PLUS gentle X/Z oscillation of the scene itself.
 *                       Conveys: "this is the same data floating in 3D semantic
 *                       space — no fixed 'up', gravity is meaning not physics."
 *
 * The viewer's aha-moment: they recognise the atoms are identical across both
 * views — flat disc storage ↔ dimensional knowledge simulation.
 *
 * Stars are kept OUTSIDE this group (fixed backdrop, feels infinite).
 * OrbitControls stays outside (user interaction composes on top of the drift).
 * ─────────────────────────────────────────────────────────────────────────── */

function KnowledgeSpaceDrift({ children }: { children: ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const g = groupRef.current;
    if (!g) return;
    const t = clock.getElapsedTime();
    // Gentle multi-axis breathing — no fixed "up" in semantic space.
    // Amplitude kept small so the drift reads as spatial, not disorienting.
    g.rotation.x = Math.sin(t * 0.09) * 0.055; // ±3.2°  slow vertical sway
    g.rotation.z = Math.sin(t * 0.06) * 0.028; // ±1.6°  subtle roll
  });

  return <group ref={groupRef}>{children}</group>;
}

/* ─── Inner scene (inside Canvas context) ─────────────────────────────────── */

function Scene() {
  const handle = useForceGraph();

  // Layer 1: full graph auto-load on mount (1 HTTP request, ~833 atoms + edges).
  // Layer 2: SearchBar in KnowledgeClient.tsx adds ego-graph expansions on top.
  useAutoSeed();

  return (
    <>
      {/* OrbitControls — identical speed + damping to substrate viewer so both
          feel the same to operate. The spatial distinction comes from the scene
          geometry (flat ring vs 3D cloud) and the drift group below, not from
          different interaction parameters. */}
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        makeDefault
        autoRotate
        autoRotateSpeed={0.3}
        minDistance={30}
        // Sprint 2026-W17: bumped from 800 → 3000 so users (and the hero-video
        // capture pass) can frame the entire substrate from far away. The
        // Stars backdrop sits at radius 120 with depth 60 so a far camera
        // still sees them; the graph itself caps at ~700 units across.
        maxDistance={3000}
      />

      {/* Stars — fixed infinite backdrop, lives outside the drift group */}
      <Stars radius={120} depth={60} count={3000} factor={3} fade />

      {/* Knowledge space drifts as a whole on secondary axes — see KnowledgeSpaceDrift */}
      <KnowledgeSpaceDrift>
        {/* Nebulae — soft cluster halos, rendered first (behind everything) */}
        <Safe name="ClusterNebulae">
          <ClusterNebulae handle={handle} />
        </Safe>

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
      </KnowledgeSpaceDrift>

      {/* Bloom — applied to the full frame, outside the drift group */}
      <Safe name="KnowledgeEffects">
        <KnowledgeEffects />
      </Safe>
    </>
  );
}

/* ─── Camera auto-fit ────────────────────────────────────────────────────── */

/**
 * APPROX_GRAPH_RADIUS — ballpark for how far node positions extend from the
 * scene origin. The d3-force-3d simulation in useForceGraph spreads ~833
 * atoms across roughly a 700-unit box, so radius ≈ 350-400. Used to compute
 * the camera distance that keeps the whole substrate in view on portrait /
 * narrow screens. Empirical, not a physics constant — bump it if a future
 * seed makes the cloud noticeably bigger or smaller.
 */
const APPROX_GRAPH_RADIUS = 400;

/**
 * Compute the camera z-distance that frames the substrate horizontally for
 * the current viewport. Returns the existing 300-unit close-up on landscape
 * desktop (aspect ≥ 1.4), and pulls the camera back on portrait / narrow
 * mobile so the whole graph fits without horizontal cropping.
 */
function fitDistance(width: number, height: number, fovDeg: number): number {
  const aspect = width / height;
  // Landscape / desktop: keep the current immersive close-up. Pulling back
  // here would shrink the graph unnecessarily for most users.
  if (aspect >= 1.4) return 300;
  // Portrait / narrow: compute the distance such that the horizontal field
  // of view contains APPROX_GRAPH_RADIUS. Three.js fov is *vertical*; the
  // horizontal half-width at distance d is d * tan(fov/2) * aspect.
  // → d = radius / (tan(fov/2) * aspect)
  const fovRad = (fovDeg * Math.PI) / 180;
  const distance = APPROX_GRAPH_RADIUS / (Math.tan(fovRad / 2) * aspect);
  // 1.10× padding so nodes near the edge don't visually clip.
  // Cap at OrbitControls' maxDistance (3000) minus a margin so the user can
  // still pinch-zoom in and out from this initial frame.
  return Math.min(distance * 1.1, 2500);
}

/**
 * CameraAutoFit — re-fits the camera on viewport resize / orientation
 * change. Lives inside the Canvas so it can use `useThree`. Only updates
 * `camera.position.z` (preserves any user pan/orbit on x/y); leaves
 * OrbitControls' damping intact.
 *
 * We deliberately do NOT re-fit on every render — only when the viewport
 * size genuinely changes — so the user's pinch-zoom stays sticky during
 * normal interaction.
 */
function CameraAutoFit() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  // Track the last size we fit for so we don't fight the user's zoom on
  // unrelated re-renders (e.g. OrbitControls' damping).
  const lastFit = useRef({ width: 0, height: 0 });

  useEffect(() => {
    if (lastFit.current.width === size.width && lastFit.current.height === size.height) {
      return;
    }
    lastFit.current = { width: size.width, height: size.height };
    // Three.js PerspectiveCamera.fov is the vertical FOV; we set 60° in
    // the Canvas `camera` prop below so the math here matches.
    const distance = fitDistance(size.width, size.height, 60);
    camera.position.set(0, 0, distance);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);

  return null;
}

/* ─── Canvas root ────────────────────────────────────────────────────────── */

export default function KnowledgeScene() {
  // Compute the initial position synchronously so SSR-skipped, dynamic-
  // imported mounts get the right framing on first paint instead of
  // briefly showing a desktop close-up before resizing.
  const initialDistance =
    typeof window !== "undefined" ? fitDistance(window.innerWidth, window.innerHeight, 60) : 300;

  return (
    <Canvas
      camera={{ position: [0, 0, initialDistance], fov: 60, near: 0.1, far: 3000 }}
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 2]}
      style={{ background: "#030712" }}
    >
      <CameraAutoFit />
      <Scene />
    </Canvas>
  );
}
