"use client";

import { Component, useEffect, useRef, Suspense, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { useMemoryStore } from "@/stores/memory-store";
import AtomNodes from "./AtomNodes";
import MerkleEdges from "./MerkleEdges";
import TreePlaceholders from "./TreePlaceholders";
import HashRing from "./HashRing";
import BackgroundParticles from "./BackgroundParticles";
import Effects from "./Effects";
import ShardLabels from "./ShardLabels";
import StatsOverlay from "./StatsOverlay";
import AccessPathHighlight from "./AccessPathHighlight";
import SseEventHighlight from "./SseEventHighlight";
import TrainParticles from "./TrainParticles";
import MerkleRehashCascade from "./MerkleRehashCascade";
import RingParticleFlow from "./RingParticleFlow";
import PredictionArcs from "./PredictionArcs";
import StructuralEdgeLines from "./StructuralEdgeLines";

import AccessControls from "./AccessControls";

/* ─── Fallback poll interval (only used when SSE is down) ─── */
const FALLBACK_POLL_MS = 15_000;

/**
 * Error boundary that reports to the store error log.
 * The component stays hidden (graceful degradation) but the error
 * is visible in the error log panel and always in the console.
 */
class SceneErrorBoundary extends Component<
  { name: string; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Report to the centralized error log — NOT just console
    useMemoryStore
      .getState()
      .logError(this.props.name, `Component crashed: ${error.message}`, "fatal");
  }

  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

/** Wrap a 3D component with Suspense + ErrorBoundary for resilience */
function Safe({ name, children }: { name: string; children: ReactNode }) {
  return (
    <SceneErrorBoundary name={name}>
      <Suspense fallback={null}>{children}</Suspense>
    </SceneErrorBoundary>
  );
}

/**
 * The Substrate Viewer — main 3D scene.
 *
 * Composes: atom nodes, Merkle edges, shard labels, background,
 * bloom effects, orbit controls, and the stats overlay.
 */
export default function MerkleScene() {
  const fetchTree = useMemoryStore((s) => s.fetchTree);
  const fetchRealPositions = useMemoryStore((s) => s.fetchRealPositions);
  const autoRotate = useMemoryStore((s) => s.autoRotate);
  const selectAtom = useMemoryStore((s) => s.selectAtom);
  const connectSSE = useMemoryStore((s) => s.connectSSE);
  const dispose = useMemoryStore((s) => s.dispose);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolvedRef = useRef(false);

  useEffect(() => {
    // 1. Bootstrap: one-time fetch to build the initial scene
    fetchTree().then(() => {
      // 2. Connect SSE — all future updates come through here
      connectSSE();
    });

    // 3. Subscribe to sseStatus — start/stop fallback poll accordingly
    let prevStatus = useMemoryStore.getState().sseStatus;
    const unsub = useMemoryStore.subscribe((state) => {
      const status = state.sseStatus;
      if (status === prevStatus) return;
      prevStatus = status;

      // SSE connected → kill any fallback poll
      if (status === "connected" || status === "connecting") {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        return;
      }
      // SSE down (fallback / disconnected) → start slow poll if not already running
      if (!pollRef.current) {
        pollRef.current = setInterval(() => {
          fetchTree();
        }, FALLBACK_POLL_MS);
      }
    });

    const handleUnload = () => dispose();
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      if (pollRef.current) clearInterval(pollRef.current);
      unsub();
      dispose();
    };
  }, [fetchTree, connectSSE, dispose]);

  // Phase 2: progressively resolve real positions in background
  const atoms = useMemoryStore((s) => s.atoms);
  useEffect(() => {
    if (atoms.length > 0 && !resolvedRef.current) {
      resolvedRef.current = true;
      fetchRealPositions();
    }
  }, [atoms.length, fetchRealPositions]);

  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{ position: [0, 30, 120], fov: 55 }}
        gl={{
          antialias: true,
          toneMapping: 3, // ACESFilmicToneMapping
          toneMappingExposure: 1.2,
        }}
        style={{ background: "#030712" }}
        onPointerMissed={() => selectAtom(null)}
      >
        {/* Lighting — ambient for basic fill, points for subtle highlights */}
        <ambientLight intensity={0.2} />
        <pointLight position={[20, 30, 20]} intensity={0.4} color="#7dd3fc" />
        <pointLight position={[-20, 10, -20]} intensity={0.15} color="#c084fc" />

        {/* Each component isolated — one crash won't kill the scene */}
        <Safe name="AtomNodes">
          <AtomNodes />
        </Safe>
        <Safe name="TreePlaceholders">
          <TreePlaceholders />
        </Safe>
        <Safe name="MerkleEdges">
          <MerkleEdges />
        </Safe>
        <Safe name="HashRing">
          <HashRing />
        </Safe>
        <Safe name="ShardLabels">
          <ShardLabels />
        </Safe>
        <Safe name="AccessPathHighlight">
          <AccessPathHighlight />
        </Safe>
        <Safe name="SseEventHighlight">
          <SseEventHighlight />
        </Safe>
        <Safe name="TrainParticles">
          <TrainParticles />
        </Safe>
        <Safe name="MerkleRehashCascade">
          <MerkleRehashCascade />
        </Safe>
        <Safe name="RingParticleFlow">
          <RingParticleFlow />
        </Safe>
        <Safe name="PredictionArcs">
          <PredictionArcs />
        </Safe>
        <Safe name="StructuralEdgeLines">
          <StructuralEdgeLines />
        </Safe>
        <Safe name="BackgroundParticles">
          <BackgroundParticles />
        </Safe>
        <Safe name="Stars">
          <Stars radius={150} depth={120} count={1200} factor={2} saturation={0} fade speed={0.3} />
        </Safe>

        {/* Post-processing */}
        <Safe name="Effects">
          <Effects />
        </Safe>

        {/* No-op — kept for import compatibility */}

        {/* Controls */}
        <OrbitControls
          makeDefault
          target={[0, 2, 0]}
          autoRotate={autoRotate}
          autoRotateSpeed={0.3}
          enableDamping
          dampingFactor={0.05}
          minDistance={20}
          maxDistance={300}
          enablePan
          panSpeed={0.5}
        />
      </Canvas>

      {/* HTML overlays */}
      <StatsOverlay />
      <AccessControls />
    </div>
  );
}
