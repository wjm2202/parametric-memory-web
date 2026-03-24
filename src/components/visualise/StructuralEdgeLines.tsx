"use client";

/**
 * StructuralEdgeLines — renders structural (knowledge-graph) edges between
 * atoms in the Substrate Viewer.
 *
 * S-EDGE-VIZ: Edges arrive via SSE commit events and are stored in
 * memory-store as VisualStructuralEdge[]. This component reads them
 * per-frame and draws coloured line segments between the source and
 * target atom positions.
 *
 * Architecture (mirrors PredictionArcs.tsx):
 *   - Pre-allocated Float32Array buffers with DynamicDrawUsage
 *   - useFrame updates positions + colours in place
 *   - Creation flash: new edges (arrivedAt < 600ms ago) lerp opacity 1.0→0.4
 *   - Settled edges render at 0.4 opacity
 *   - Skips edges where either atom is not yet in the scene
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useMemoryStore } from "@/stores/memory-store";

/* ─── Constants ─────────────────────────────────────────────────────────── */

const MAX_EDGES = 256;
const FLASH_DURATION_MS = 600;
const SETTLED_OPACITY = 0.4;

/* ─── Edge type colour palette (matches GraphEdges.tsx in /knowledge) ──── */

const EDGE_TYPE_COLORS: Record<string, THREE.Color> = {
  references: new THREE.Color("#38bdf8"),   // sky blue
  depends_on: new THREE.Color("#f97316"),   // amber/orange
  supersedes: new THREE.Color("#a855f7"),   // purple
  constrains: new THREE.Color("#ef4444"),   // red
  member_of: new THREE.Color("#22c55e"),    // green
  derived_from: new THREE.Color("#2dd4bf"), // teal
};
const FALLBACK_COLOR = new THREE.Color("#94a3b8"); // slate

/* ─── Component ─────────────────────────────────────────────────────────── */

export default function StructuralEdgeLines() {
  const positions = useMemo(() => new Float32Array(MAX_EDGES * 2 * 3), []);
  const colors = useMemo(() => new Float32Array(MAX_EDGES * 2 * 3), []);

  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const lastDrawnRef = useRef(0);

  useFrame(() => {
    const geo = geometryRef.current;
    if (!geo) return;

    const { structuralEdges, atomMap } = useMemoryStore.getState();
    if (structuralEdges.length === 0 && lastDrawnRef.current === 0) return;

    const now = performance.now();
    let count = 0;

    for (const edge of structuralEdges) {
      if (count >= MAX_EDGES) break;

      const srcAtom = atomMap.get(edge.source);
      const tgtAtom = atomMap.get(edge.target);
      // Skip edges where either atom is not yet in the scene
      if (!srcAtom || !tgtAtom || !srcAtom.resolved || !tgtAtom.resolved) continue;

      const base = count * 6;

      // Source position
      positions[base + 0] = srcAtom.position[0];
      positions[base + 1] = srcAtom.position[1];
      positions[base + 2] = srcAtom.position[2];

      // Target position
      positions[base + 3] = tgtAtom.position[0];
      positions[base + 4] = tgtAtom.position[1];
      positions[base + 5] = tgtAtom.position[2];

      // Colour by edge type
      const typeColor = EDGE_TYPE_COLORS[edge.type] ?? FALLBACK_COLOR;

      // Flash animation: new edges start at opacity 1.0, settle to 0.4
      const age = now - edge.arrivedAt;
      const opacity = age < FLASH_DURATION_MS
        ? 1.0 - (1.0 - SETTLED_OPACITY) * (age / FLASH_DURATION_MS)
        : SETTLED_OPACITY;

      const r = typeColor.r * opacity;
      const g = typeColor.g * opacity;
      const b = typeColor.b * opacity;

      colors[base + 0] = r;
      colors[base + 1] = g;
      colors[base + 2] = b;
      colors[base + 3] = r;
      colors[base + 4] = g;
      colors[base + 5] = b;

      count++;
    }

    // Zero stale slots from previous frame
    const prev = lastDrawnRef.current;
    if (count < prev) {
      const clearStart = count * 6;
      const clearEnd = prev * 6;
      positions.fill(0, clearStart, clearEnd);
    }
    lastDrawnRef.current = count;

    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, count * 2);
  });

  return (
    <lineSegments renderOrder={-1}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={MAX_EDGES * 2}
          usage={THREE.DynamicDrawUsage}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
          count={MAX_EDGES * 2}
          usage={THREE.DynamicDrawUsage}
        />
      </bufferGeometry>
      <lineBasicMaterial vertexColors transparent opacity={1} depthWrite={false} />
    </lineSegments>
  );
}
