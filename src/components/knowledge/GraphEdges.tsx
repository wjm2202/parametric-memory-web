"use client";

/**
 * GraphEdges — renders directed Markov arcs AND structural edges as LineSegments.
 *
 * CRITICAL RULES (from sprint plan):
 *   1. Position buffer updated IN PLACE every frame — never rebuild BufferGeometry.
 *   2. Set geometry.attributes.position.needsUpdate = true each frame.
 *   3. Opacity encodes effectiveWeight — WebGL line width is capped at 1px.
 *   4. Edge direction preserved: source → target = "source predicts target".
 *
 * Sprint 3 will replace this with animated arc particles travelling along
 * these same edges. The source→target direction must remain correct.
 *
 * KG-08: DynamicDrawUsage on both buffers — GPU driver hint for frequent updates.
 * KG-09: isSettled short-circuit — skip GPU upload when positions are frozen.
 * KG-10: Single useFrame (was two) — merged index rebuild + edge update.
 * KG-11: edgeKey() helper — safe against d3 link resolution (source = object not string).
 * KG-15: One-time console.warn when edge cap is exceeded.
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ForceGraphHandle } from "./useForceGraph";
import type { KGNode, KGEdge } from "@/stores/knowledge-store";

/* ─── Constants ─────────────────────────────────────────────────────────── */

const MAX_EDGES = 2048; // 1024 nodes × avg 2 outgoing arcs
const BASE_COLOR_WEAK = new THREE.Color("#7c3aed"); // violet — weak Markov edges
const BASE_COLOR_STRONG = new THREE.Color("#22d3ee"); // cyan — strong Markov edges

/* ─── S-EDGE-VIZ: Structural edge type colour palette ──────────────────── */
const STRUCTURAL_EDGE_COLORS: Record<string, THREE.Color> = {
  references: new THREE.Color("#38bdf8"),   // sky blue
  depends_on: new THREE.Color("#f97316"),   // amber/orange
  supersedes: new THREE.Color("#a855f7"),   // purple
  constrains: new THREE.Color("#ef4444"),   // red
  member_of: new THREE.Color("#22c55e"),    // green
  derived_from: new THREE.Color("#2dd4bf"), // teal
};
const STRUCTURAL_FALLBACK_COLOR = new THREE.Color("#94a3b8"); // slate
const STRUCTURAL_OPACITY = 0.6;

/* ─── KG-11: d3 link resolution safety ──────────────────────────────────── */
/**
 * After sim.nodes() + lf.links() run, d3-force-3d resolves edge source/target
 * from string keys into node object references. This helper extracts the string
 * key safely regardless of whether resolution has occurred.
 */
function edgeKey(v: string | KGNode): string {
  return typeof v === "string" ? v : (v as KGNode).key;
}

/* ─── KG-15: One-time cap warning ───────────────────────────────────────── */
let _warnedEdgeCap = false;

/* ─── Component ─────────────────────────────────────────────────────────── */

interface GraphEdgesProps {
  handle: ForceGraphHandle;
}

export default function GraphEdges({ handle }: GraphEdgesProps) {
  const { simNodes, simEdges, isSettled } = handle; // KG-09: destructure isSettled

  // Pre-allocated typed arrays — updated in place, never recreated
  const positions = useMemo(() => new Float32Array(MAX_EDGES * 2 * 3), []);
  const colors = useMemo(() => new Float32Array(MAX_EDGES * 2 * 3), []);

  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const lineRef = useRef<THREE.LineSegments>(null);

  // Build a key→index lookup into simNodes so edge resolution is O(1)
  const nodeIndexRef = useRef<Map<string, number>>(new Map());

  // Reusable temp colour — avoids GC pressure from allocating per frame
  const tmpColor = useMemo(() => new THREE.Color(), []);

  // Track last drawn count to avoid zeroing the full buffer every frame
  const lastDrawnRef = useRef(0);

  /* ── KG-10: Single merged useFrame ─────────────────────────────────────
   *
   * Previously two separate useFrame registrations:
   *   1. Index rebuild (priority 0)
   *   2. Edge position+color update (priority 0)
   *
   * Merged into one: index rebuild always runs (needed even post-settle for
   * Sprint 2 expand-on-click). Edge update short-circuits via KG-09.
   */
  useFrame(() => {
    const nodes = simNodes.current;

    // ── Always: rebuild node index when count changes ──
    // Must run even after settle so Sprint 2 expand-on-click gets correct indices.
    if (nodeIndexRef.current.size !== nodes.length) {
      const idx = new Map<string, number>();
      for (let i = 0; i < nodes.length; i++) {
        idx.set((nodes[i] as KGNode).key, i);
      }
      nodeIndexRef.current = idx;
    }

    // ── KG-09: Skip position/color upload when sim has settled ──
    // Positions are frozen — nothing to recompute or upload to the GPU.
    // On the next expand-on-click, isSettled will be reset to false
    // in useForceGraph and updates resume automatically.
    if (isSettled.current) return;

    const geo = geometryRef.current;
    const line = lineRef.current;
    if (!geo || !line) return;

    const edges = simEdges.current;
    const idx = nodeIndexRef.current;

    let edgeCount = 0;

    for (const edge of edges) {
      if (edgeCount >= MAX_EDGES) break;

      // KG-11: safe source/target extraction — handles both string keys
      // (pre-resolution) and node object references (post-d3-resolution).
      const si = idx.get(edgeKey((edge as KGEdge).source));
      const ti = idx.get(edgeKey((edge as KGEdge).target));
      if (si === undefined || ti === undefined) continue;

      const src = nodes[si];
      const tgt = nodes[ti];
      if (!src || !tgt) continue;

      const base = edgeCount * 6; // 2 verts × 3 components

      // Source position
      positions[base + 0] = src.x ?? 0;
      positions[base + 1] = src.y ?? 0;
      positions[base + 2] = src.z ?? 0;

      // Target position
      positions[base + 3] = tgt.x ?? 0;
      positions[base + 4] = tgt.y ?? 0;
      positions[base + 5] = tgt.z ?? 0;

      // S-EDGE-VIZ: Branch colour by edge kind
      const typedEdge = edge as KGEdge;
      let r: number, g: number, b: number;

      if (typedEdge.kind === "structural") {
        // Structural edges: fixed colour by edgeType, constant opacity
        const typeColor = STRUCTURAL_EDGE_COLORS[typedEdge.edgeType ?? ""] ?? STRUCTURAL_FALLBACK_COLOR;
        r = typeColor.r * STRUCTURAL_OPACITY;
        g = typeColor.g * STRUCTURAL_OPACITY;
        b = typeColor.b * STRUCTURAL_OPACITY;
      } else {
        // Markov arcs: lerp violet → cyan based on effectiveWeight (unchanged)
        const ew = Math.min(typedEdge.effectiveWeight, 1.0);
        tmpColor.copy(BASE_COLOR_WEAK).lerp(BASE_COLOR_STRONG, ew);
        const opacity = 0.15 + ew * 0.65; // 0.15 → 0.8
        r = tmpColor.r * opacity;
        g = tmpColor.g * opacity;
        b = tmpColor.b * opacity;
      }

      colors[base + 0] = r;
      colors[base + 1] = g;
      colors[base + 2] = b;
      colors[base + 3] = r;
      colors[base + 4] = g;
      colors[base + 5] = b;

      edgeCount++;
    }

    // KG-15: Warn once if edge count exceeds the draw cap
    if (!_warnedEdgeCap && edges.length > MAX_EDGES) {
      _warnedEdgeCap = true;
      console.warn(
        `[GraphEdges] Edge count ${edges.length} exceeds MAX_EDGES ${MAX_EDGES}. Increase the cap.`,
      );
    }

    // Zero only the slots that were drawn last frame but aren't now
    // (avoids zeroing the entire 24K float buffer every frame)
    const prevDrawn = lastDrawnRef.current;
    if (edgeCount < prevDrawn) {
      const clearStart = edgeCount * 6;
      const clearEnd = prevDrawn * 6;
      positions.fill(0, clearStart, clearEnd);
    }
    lastDrawnRef.current = edgeCount;

    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, edgeCount * 2);
  });

  return (
    <lineSegments ref={lineRef} renderOrder={-1}>
      <bufferGeometry ref={geometryRef}>
        {/* KG-08: DynamicDrawUsage — hints to the GPU driver that these buffers
            are updated frequently, matching PredictionArcs.tsx in /visualise. */}
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
