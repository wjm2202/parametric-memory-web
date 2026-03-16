"use client";

import { Component, useEffect, useRef, useCallback, Suspense, type ReactNode } from "react";
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
import AccessControls from "./AccessControls";

/* ─── Polling intervals ─── */
const POLL_HEALTHY = 5_000; // 5s when connected
const POLL_BACKOFF = 15_000; // 15s when disconnected
const POLL_RATE_LIMITED = 30_000; // 30s after 429
const MAX_BACKOFF = 60_000; // 1min ceiling

/**
 * Compute poll delay with exponential backoff on consecutive failures.
 * Healthy: 5s. Disconnected: 15s. Rate-limited or repeated failures: exponential up to 60s.
 */
function getPollDelay(): number {
  const { healthy, consecutiveFailures } = useMemoryStore.getState();
  if (consecutiveFailures === 0) return healthy ? POLL_HEALTHY : POLL_BACKOFF;
  // Exponential backoff: base * 2^(failures-1), clamped
  const base = POLL_RATE_LIMITED;
  return Math.min(base * Math.pow(2, consecutiveFailures - 1), MAX_BACKOFF);
}

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
  const disconnectSSE = useMemoryStore((s) => s.disconnectSSE);
  const dispose = useMemoryStore((s) => s.dispose);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedRef = useRef(false);

  const scheduleNext = useCallback(() => {
    // S16-3: Skip polling when SSE is connected — live updates handle it
    const { sseStatus: currentSse } = useMemoryStore.getState();
    if (currentSse === "connected") {
      // Still poll at a very slow rate as a safety net (every 60s)
      timeoutRef.current = setTimeout(async () => {
        await fetchTree();
        scheduleNext();
      }, 60_000);
      return;
    }
    const delay = getPollDelay();
    timeoutRef.current = setTimeout(async () => {
      await fetchTree();
      scheduleNext();
    }, delay);
  }, [fetchTree]);

  // Initial fetch + SSE connection + adaptive polling fallback
  useEffect(() => {
    fetchTree().then(() => {
      // S16-3: After bootstrap, connect to SSE for real-time updates
      connectSSE();
      // Schedule polling as fallback (SSE-aware — slows down when connected)
      scheduleNext();
    });

    // Hard navigate / tab close — React cleanup doesn't fire reliably,
    // so we also hook beforeunload to dispose SSE, worker, and timers.
    const handleUnload = () => dispose();
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      dispose(); // Full teardown — SSE + worker + timers
    };
  }, [fetchTree, connectSSE, disconnectSSE, dispose, scheduleNext]);

  // Phase 2: progressively resolve real positions in background
  const atoms = useMemoryStore((s) => s.atoms);
  useEffect(() => {
    if (atoms.length > 0 && !resolvedRef.current) {
      resolvedRef.current = true;
      // Fire and forget — runs in background, yields between chunks
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
