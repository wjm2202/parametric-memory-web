"use client";

/**
 * SearchAnchor — visual centrepiece rendered when a search is active.
 *
 * Shows:
 *   1. A bright pulsing sphere at the world origin [0,0,0].
 *   2. Thin spoke lines from the origin to each search-hit node's
 *      current force-sim position.
 *
 * This component is purely visual — it reads sim positions from the
 * ForceGraphHandle ref (same pattern as GraphEdges) and never touches
 * the d3 simulation. The anchor sphere is NOT a sim node; it has no
 * effect on the force layout.
 *
 * Why origin? The forceCenter force keeps the graph centred at [0,0,0],
 * so the anchor sits at the natural gravity well of the graph.
 *
 * Performance: at most 5 spokes (5 line segments, 10 vertices).
 * The sphere is a single non-instanced mesh. Both update in useFrame
 * via BufferAttribute writes — no geometry rebuilds.
 */

import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useKnowledgeStore, type KGNode } from "@/stores/knowledge-store";
import type { ForceGraphHandle } from "./useForceGraph";

/* ─── Constants ──────────────────────────────────────────────────────── */

const BLOOM_BOOST   = 2.2;
/** Same amber as SEARCH_HIT_COLOR in GraphNodes — visual continuity */
const ANCHOR_COLOR  = new THREE.Color("#f59e0b").multiplyScalar(BLOOM_BOOST);
/** Spokes are dimmer so they read as connectors, not features */
const SPOKE_COLOR   = new THREE.Color("#f59e0b").multiplyScalar(BLOOM_BOOST * 0.35);
/** Max search hits the component allocates for (matches searchAtoms limit: 5) */
const MAX_SPOKES    = 8;

interface SearchAnchorProps {
  handle: ForceGraphHandle;
}

export default function SearchAnchor({ handle }: SearchAnchorProps) {
  const { simNodes } = handle;

  /* ── Refs ──────────────────────────────────────────────────────────── */
  const sphereRef   = useRef<THREE.Mesh>(null);
  const linesRef    = useRef<THREE.LineSegments>(null);

  /* ── Geometry: pre-allocated spoke buffer ──────────────────────────── */
  // Each spoke = 2 vertices (origin → hit). MAX_SPOKES × 2 × 3 floats.
  const spokePositions = useMemo(
    () => new Float32Array(MAX_SPOKES * 2 * 3),
    [],
  );

  const spokeGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(spokePositions, 3);
    attr.usage = THREE.DynamicDrawUsage;
    geo.setAttribute("position", attr);
    return geo;
  }, [spokePositions]);

  /* ── Material ───────────────────────────────────────────────────────── */
  const spokeMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: SPOKE_COLOR,
        transparent: true,
        opacity: 0.6,
      }),
    [],
  );

  /* ── Cleanup on unmount ─────────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      spokeGeometry.dispose();
      spokeMaterial.dispose();
    };
  }, [spokeGeometry, spokeMaterial]);

  /* ── Frame loop ──────────────────────────────────────────────────────── */
  useFrame(({ clock }) => {
    const { searchHits, visibleAtoms } = useKnowledgeStore.getState();
    const sphere = sphereRef.current;
    const lines  = linesRef.current;
    if (!sphere || !lines) return;

    // Hide everything when no search is active
    const active = searchHits.size > 0 && visibleAtoms !== null;
    sphere.visible = active;
    lines.visible  = active;
    if (!active) return;

    // Animate the anchor sphere — slow breathe, slightly faster than the hit nodes
    const t = clock.getElapsedTime();
    const s = 1.0 + Math.sin(t * 2.2) * 0.18;
    sphere.scale.setScalar(s);

    // Build a key→node map from the live sim array
    // Only rebuild when the node array length changes (O(0) in steady state)
    const nodes = simNodes.current as KGNode[];

    // Write spoke vertices: origin → each hit's current sim position
    let spokeCount = 0;
    const pos = spokePositions;

    for (const key of searchHits) {
      if (spokeCount >= MAX_SPOKES) break;
      // Find the node in the sim array
      const node = nodes.find((n) => n.key === key);
      if (!node) continue;

      const base = spokeCount * 6; // 2 vertices × 3 floats
      // Vertex 0: origin
      pos[base + 0] = 0; pos[base + 1] = 0; pos[base + 2] = 0;
      // Vertex 1: hit node position
      pos[base + 3] = node.x ?? 0;
      pos[base + 4] = node.y ?? 0;
      pos[base + 5] = node.z ?? 0;
      spokeCount++;
    }

    // Zero out any unused spoke slots so stale lines don't show
    for (let i = spokeCount; i < MAX_SPOKES; i++) {
      const base = i * 6;
      pos.fill(0, base, base + 6);
    }

    const attr = spokeGeometry.getAttribute("position") as THREE.BufferAttribute;
    attr.needsUpdate = true;
    // Tell THREE how many vertices are actually drawn (pairs × 2)
    lines.geometry.setDrawRange(0, spokeCount * 2);
  });

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <>
      {/* Central anchor sphere */}
      <mesh ref={sphereRef} position={[0, 0, 0]} visible={false}>
        <sphereGeometry args={[1.8, 12, 12]} />
        <meshBasicMaterial color={ANCHOR_COLOR} toneMapped={false} />
      </mesh>

      {/* Spoke lines */}
      <lineSegments ref={linesRef} geometry={spokeGeometry} material={spokeMaterial} visible={false} />
    </>
  );
}
