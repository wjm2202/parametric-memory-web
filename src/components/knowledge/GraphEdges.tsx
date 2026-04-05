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
import { useKnowledgeStore, type KGNode, type KGEdge } from "@/stores/knowledge-store";

/* ─── Constants ─────────────────────────────────────────────────────────── */

const MAX_EDGES = 16384; // raised to 16384 — member_of edges now emit 3 sub-segments each (centre-fade effect)
const BASE_COLOR_WEAK = new THREE.Color("#7c3aed"); // violet — weak Markov edges
const BASE_COLOR_STRONG = new THREE.Color("#22d3ee"); // cyan — strong Markov edges
/** Sprint 5.4: Cross-domain bridge arcs rendered in gold/white to highlight them */
const CROSS_DOMAIN_COLOR = new THREE.Color("#fbbf24"); // amber — cross-domain bridges

/* ─── Markov arc glow layer ──────────────────────────────────────────────── */
/** Separate buffer cap for the Markov-arc-only glow pass */
const MAX_MARKOV_EDGES = 4096;
/** Glow halo is this fraction of the core brightness — bleeds outward for apparent thickness */
const MARKOV_GLOW_OPACITY = 0.32;

/* ─── S-EDGE-VIZ: Structural edge type colour palette ──────────────────── */
const STRUCTURAL_EDGE_COLORS: Record<string, THREE.Color> = {
  references: new THREE.Color("#38bdf8"), // sky blue
  depends_on: new THREE.Color("#f97316"), // amber/orange
  supersedes: new THREE.Color("#a855f7"), // purple
  constrains: new THREE.Color("#ef4444"), // red
  member_of: new THREE.Color("#22c55e"), // green
  derived_from: new THREE.Color("#2dd4bf"), // teal
};
const STRUCTURAL_FALLBACK_COLOR = new THREE.Color("#94a3b8"); // slate
const STRUCTURAL_OPACITY = 0.6;
/** member_of edges use a lower peak opacity — they're the most numerous and overwhelm the canvas */
const MEMBER_OF_OPACITY = 0.22;
/** How opaque the centre third of a member_of edge is (fraction of MEMBER_OF_OPACITY) */
const MEMBER_OF_CENTER_FADE = 0.05;
/**
 * Mycelial root asymmetry: the ATOM end of a member_of edge is this fraction
 * of full brightness — the HUB end is always full. Gives a "branch tapering
 * toward the root" reading where the hub is clearly the generative centre.
 */
const MEMBER_OF_LEAF_DIM = 0.35;
/** Centre-fade for all other structural edges — slightly more visible than member_of */
const STRUCTURAL_CENTER_FADE = 0.08;

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

  // Track visibleAtoms reference — detecting a change bypasses isSettled so
  // the edge buffer is re-filtered immediately when a search starts or clears.
  const lastVisibleAtomsRef = useRef<Set<string> | null>(null);

  // Tracks the bridge atom key we last wrote to the store — avoids spamming setState
  const lastBridgeAtomRef = useRef<string | null>(null);

  // ── Glow layer: Markov arcs rendered a second time behind the main layer ──
  // Two identical passes at different renderOrder create the appearance of
  // a thicker, luminous line without needing Line2 or post-processing.
  const glowPositions = useMemo(() => new Float32Array(MAX_MARKOV_EDGES * 2 * 3), []);
  const glowColors = useMemo(() => new Float32Array(MAX_MARKOV_EDGES * 2 * 3), []);
  const glowGeoRef = useRef<THREE.BufferGeometry>(null);
  const glowLineRef = useRef<THREE.LineSegments>(null);
  const lastGlowDrawnRef = useRef(0);

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

    // ── Read search filter state ──────────────────────────────────────────
    const { visibleAtoms, setBridgeAtom } = useKnowledgeStore.getState();
    const filterChanged = visibleAtoms !== lastVisibleAtomsRef.current;
    lastVisibleAtomsRef.current = visibleAtoms;

    // ── Bridge atom computation — runs only when filter changes ──────────
    // Find the atom OUTSIDE the result set with the most edges into it.
    // This is the atom the search cluster is most entangled with externally.
    if (filterChanged) {
      if (visibleAtoms !== null && visibleAtoms.size > 0) {
        const connectionCount = new Map<string, number>();
        for (const e of simEdges.current) {
          const sk = edgeKey((e as KGEdge).source);
          const tk = edgeKey((e as KGEdge).target);
          const srcIn = visibleAtoms.has(sk);
          const tgtIn = visibleAtoms.has(tk);
          // Count external atom connections into the visible set
          if (srcIn && !tgtIn) connectionCount.set(tk, (connectionCount.get(tk) ?? 0) + 1);
          else if (tgtIn && !srcIn) connectionCount.set(sk, (connectionCount.get(sk) ?? 0) + 1);
        }
        let bestKey: string | null = null;
        let bestCount = 0;
        for (const [key, count] of connectionCount) {
          if (count > bestCount) {
            bestCount = count;
            bestKey = key;
          }
        }
        if (bestKey !== lastBridgeAtomRef.current) {
          lastBridgeAtomRef.current = bestKey;
          setBridgeAtom(bestKey);
        }
      } else {
        // Search cleared — remove bridge atom
        if (lastBridgeAtomRef.current !== null) {
          lastBridgeAtomRef.current = null;
          setBridgeAtom(null);
        }
      }
    }

    // Read the (possibly just updated) bridge atom for use in the edge loop
    const bridgeAtom = useKnowledgeStore.getState().bridgeAtom;

    // ── KG-09: Skip position/color upload when sim has settled ──
    // Exception: if the search filter just changed (on or off, or new results),
    // we must run one pass to re-filter the edge buffer even when positions
    // are frozen — then we can go idle again until the next change.
    if (isSettled.current && !filterChanged) return;

    const geo = geometryRef.current;
    const line = lineRef.current;
    if (!geo || !line) return;

    const edges = simEdges.current;
    const idx = nodeIndexRef.current;

    let edgeCount = 0;
    let markovCount = 0; // tracks slots used in the glow buffer this frame

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

      // ── Search filter: hide edges where either endpoint is not visible ──
      // Allow edges when both endpoints are in the result set, OR when one
      // endpoint is the bridge atom and the other is in the result set.
      if (visibleAtoms !== null) {
        const srcKey = (src as KGNode).key ?? "";
        const tgtKey = (tgt as KGNode).key ?? "";
        const srcIn = visibleAtoms.has(srcKey) || srcKey === bridgeAtom;
        const tgtIn = visibleAtoms.has(tgtKey) || tgtKey === bridgeAtom;
        // Must be drawable AND at least one endpoint in the search result set
        // (prevents bridge→bridge self-edges if somehow bridgeAtom connects to itself)
        const eitherInResult = visibleAtoms.has(srcKey) || visibleAtoms.has(tgtKey);
        if (!srcIn || !tgtIn || !eitherInResult) continue;
      }

      // Brightness multiplier — two sources of boost, applied together:
      //  1. Search active: all surviving edges boosted 2× for vivid focus view.
      //  2. Hub endpoint: edges touching a hub node boosted 1.6× so the root
      //     structure of each cluster reads clearly even in the resting view.
      const srcIsHub = ((src as KGNode).key ?? "").includes("hub_");
      const tgtIsHub = ((tgt as KGNode).key ?? "").includes("hub_");
      const hubBoost = (srcIsHub || tgtIsHub) && visibleAtoms === null ? 1.6 : 1.0;
      const searchBoost = visibleAtoms !== null ? 2.0 : 1.0;
      const edgeBoost = searchBoost * hubBoost;

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
        const typeColor =
          STRUCTURAL_EDGE_COLORS[typedEdge.edgeType ?? ""] ?? STRUCTURAL_FALLBACK_COLOR;

        if (typedEdge.edgeType === "member_of") {
          // member_of: render as 3 sub-segments — full → transparent → full
          // This gives a "fade at centre" effect that reduces visual dominance
          // while still showing where edges start and end.
          if (edgeCount + 3 > MAX_EDGES) break;

          const sx = src.x ?? 0,
            sy = src.y ?? 0,
            sz = src.z ?? 0;
          const tx = tgt.x ?? 0,
            ty = tgt.y ?? 0,
            tz = tgt.z ?? 0;

          // Interpolated 1/3 and 2/3 positions along the edge
          const m1x = sx + (tx - sx) / 3;
          const m1y = sy + (ty - sy) / 3;
          const m1z = sz + (tz - sz) / 3;
          const m2x = sx + (2 * (tx - sx)) / 3;
          const m2y = sy + (2 * (ty - sy)) / 3;
          const m2z = sz + (2 * (tz - sz)) / 3;

          const rFull = typeColor.r * MEMBER_OF_OPACITY * edgeBoost;
          const gFull = typeColor.g * MEMBER_OF_OPACITY * edgeBoost;
          const bFull = typeColor.b * MEMBER_OF_OPACITY * edgeBoost;
          const rDim = rFull * MEMBER_OF_CENTER_FADE;
          const gDim = gFull * MEMBER_OF_CENTER_FADE;
          const bDim = bFull * MEMBER_OF_CENTER_FADE;

          // ── Mycelial root asymmetry ──────────────────────────────────
          // Hub end = bright root. Atom end = dim leaf tip.
          // Detect which endpoint is the hub by key pattern.
          const tgtIsHub = ((tgt as KGNode).key ?? "").includes("hub_");
          const srcIsHub = ((src as KGNode).key ?? "").includes("hub_");

          // Root colours (hub end) — full brightness
          const rRoot = rFull,
            gRoot = gFull,
            bRoot = bFull;
          // Leaf colours (atom end) — dim, still slightly visible
          const rLeaf = rFull * MEMBER_OF_LEAF_DIM;
          const gLeaf = gFull * MEMBER_OF_LEAF_DIM;
          const bLeaf = bFull * MEMBER_OF_LEAF_DIM;

          // srcColor = colour at the source endpoint
          // tgtColor = colour at the target endpoint
          const [srC, sgC, sbC, trC, tgC, tbC] = tgtIsHub
            ? [rLeaf, gLeaf, bLeaf, rRoot, gRoot, bRoot] // atom→hub: leaf→root
            : srcIsHub
              ? [rRoot, gRoot, bRoot, rLeaf, gLeaf, bLeaf] // hub→atom: root→leaf
              : [rFull, gFull, bFull, rFull, gFull, bFull]; // symmetric fallback

          // Segment A: src endpoint → 1/3 (fades to invisible centre)
          let mBase = edgeCount * 6;
          positions[mBase + 0] = sx;
          positions[mBase + 1] = sy;
          positions[mBase + 2] = sz;
          positions[mBase + 3] = m1x;
          positions[mBase + 4] = m1y;
          positions[mBase + 5] = m1z;
          colors[mBase + 0] = srC;
          colors[mBase + 1] = sgC;
          colors[mBase + 2] = sbC;
          colors[mBase + 3] = rDim;
          colors[mBase + 4] = gDim;
          colors[mBase + 5] = bDim;
          edgeCount++;

          // Segment B: 1/3 → 2/3 — transparent void at centre
          mBase = edgeCount * 6;
          positions[mBase + 0] = m1x;
          positions[mBase + 1] = m1y;
          positions[mBase + 2] = m1z;
          positions[mBase + 3] = m2x;
          positions[mBase + 4] = m2y;
          positions[mBase + 5] = m2z;
          colors[mBase + 0] = rDim;
          colors[mBase + 1] = gDim;
          colors[mBase + 2] = bDim;
          colors[mBase + 3] = rDim;
          colors[mBase + 4] = gDim;
          colors[mBase + 5] = bDim;
          edgeCount++;

          // Segment C: 2/3 → tgt endpoint (fades in from invisible centre)
          mBase = edgeCount * 6;
          positions[mBase + 0] = m2x;
          positions[mBase + 1] = m2y;
          positions[mBase + 2] = m2z;
          positions[mBase + 3] = tx;
          positions[mBase + 4] = ty;
          positions[mBase + 5] = tz;
          colors[mBase + 0] = rDim;
          colors[mBase + 1] = gDim;
          colors[mBase + 2] = bDim;
          colors[mBase + 3] = trC;
          colors[mBase + 4] = tgC;
          colors[mBase + 5] = tbC;
          edgeCount++;

          // Skip the shared vertex-write block below — already committed
          continue;
        }

        // All other structural edges: 3-segment centre-fade — same pattern as member_of
        // Endpoints are visible; centre third is almost transparent.
        if (edgeCount + 3 > MAX_EDGES) break;

        const sx2 = src.x ?? 0,
          sy2 = src.y ?? 0,
          sz2 = src.z ?? 0;
        const tx2 = tgt.x ?? 0,
          ty2 = tgt.y ?? 0,
          tz2 = tgt.z ?? 0;

        const n1x = sx2 + (tx2 - sx2) / 3;
        const n1y = sy2 + (ty2 - sy2) / 3;
        const n1z = sz2 + (tz2 - sz2) / 3;
        const n2x = sx2 + (2 * (tx2 - sx2)) / 3;
        const n2y = sy2 + (2 * (ty2 - sy2)) / 3;
        const n2z = sz2 + (2 * (tz2 - sz2)) / 3;

        const sRFull = typeColor.r * STRUCTURAL_OPACITY * edgeBoost;
        const sGFull = typeColor.g * STRUCTURAL_OPACITY * edgeBoost;
        const sBFull = typeColor.b * STRUCTURAL_OPACITY * edgeBoost;
        const sRDim = sRFull * STRUCTURAL_CENTER_FADE;
        const sGDim = sGFull * STRUCTURAL_CENTER_FADE;
        const sBDim = sBFull * STRUCTURAL_CENTER_FADE;

        // Segment A: src (bright) → 1/3 (dim)
        let sBase = edgeCount * 6;
        positions[sBase + 0] = sx2;
        positions[sBase + 1] = sy2;
        positions[sBase + 2] = sz2;
        positions[sBase + 3] = n1x;
        positions[sBase + 4] = n1y;
        positions[sBase + 5] = n1z;
        colors[sBase + 0] = sRFull;
        colors[sBase + 1] = sGFull;
        colors[sBase + 2] = sBFull;
        colors[sBase + 3] = sRDim;
        colors[sBase + 4] = sGDim;
        colors[sBase + 5] = sBDim;
        edgeCount++;

        // Segment B: 1/3 (dim) → 2/3 (dim) — invisible centre
        sBase = edgeCount * 6;
        positions[sBase + 0] = n1x;
        positions[sBase + 1] = n1y;
        positions[sBase + 2] = n1z;
        positions[sBase + 3] = n2x;
        positions[sBase + 4] = n2y;
        positions[sBase + 5] = n2z;
        colors[sBase + 0] = sRDim;
        colors[sBase + 1] = sGDim;
        colors[sBase + 2] = sBDim;
        colors[sBase + 3] = sRDim;
        colors[sBase + 4] = sGDim;
        colors[sBase + 5] = sBDim;
        edgeCount++;

        // Segment C: 2/3 (dim) → tgt (bright)
        sBase = edgeCount * 6;
        positions[sBase + 0] = n2x;
        positions[sBase + 1] = n2y;
        positions[sBase + 2] = n2z;
        positions[sBase + 3] = tx2;
        positions[sBase + 4] = ty2;
        positions[sBase + 5] = tz2;
        colors[sBase + 0] = sRDim;
        colors[sBase + 1] = sGDim;
        colors[sBase + 2] = sBDim;
        colors[sBase + 3] = sRFull;
        colors[sBase + 4] = sGFull;
        colors[sBase + 5] = sBFull;
        edgeCount++;

        continue; // skip shared single-vertex write below
      } else {
        // Markov arcs: lerp violet → cyan based on effectiveWeight
        const ew = Math.min(typedEdge.effectiveWeight, 1.0);
        // Boosted brightness: floor raised from 0.15 → 0.55 so even weak arcs are visible
        const opacity = 0.55 + ew * 0.45; // 0.55 → 1.0

        // Sprint 5.4: Domain-aware tinting for Markov arcs
        // Same-domain arcs get the source node's Poincaré hue tint.
        // Cross-domain arcs render in gold to highlight bridges.
        const srcPoinc = (src as KGNode).poincare as [number, number] | null | undefined;
        const tgtPoinc = (tgt as KGNode).poincare as [number, number] | null | undefined;

        if (srcPoinc && tgtPoinc) {
          // Compare angular sectors — if >60° apart, treat as cross-domain
          const srcAngle = Math.atan2(srcPoinc[1], srcPoinc[0]);
          const tgtAngle = Math.atan2(tgtPoinc[1], tgtPoinc[0]);
          let angleDiff = Math.abs(srcAngle - tgtAngle);
          if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

          if (angleDiff > Math.PI / 3) {
            // Cross-domain bridge — gold highlight
            tmpColor.copy(CROSS_DOMAIN_COLOR);
          } else {
            // Same-domain — tint with source node's hue
            const hue = (Math.atan2(srcPoinc[1], srcPoinc[0]) / (2 * Math.PI) + 1) % 1;
            tmpColor.setHSL(hue, 0.5 + ew * 0.3, 0.5);
          }
        } else {
          // No Poincaré data — fall back to original violet→cyan lerp
          tmpColor.copy(BASE_COLOR_WEAK).lerp(BASE_COLOR_STRONG, ew);
        }

        r = tmpColor.r * opacity * edgeBoost;
        g = tmpColor.g * opacity * edgeBoost;
        b = tmpColor.b * opacity * edgeBoost;

        // ── Glow layer: write this Markov arc to the secondary halo buffer ──
        // Rendered behind the main layer — the soft halo creates apparent thickness.
        const glowGeo = glowGeoRef.current;
        if (glowGeo && markovCount < MAX_MARKOV_EDGES) {
          const gBase = markovCount * 6;
          glowPositions[gBase + 0] = src.x ?? 0;
          glowPositions[gBase + 1] = src.y ?? 0;
          glowPositions[gBase + 2] = src.z ?? 0;
          glowPositions[gBase + 3] = tgt.x ?? 0;
          glowPositions[gBase + 4] = tgt.y ?? 0;
          glowPositions[gBase + 5] = tgt.z ?? 0;
          glowColors[gBase + 0] = r * MARKOV_GLOW_OPACITY;
          glowColors[gBase + 1] = g * MARKOV_GLOW_OPACITY;
          glowColors[gBase + 2] = b * MARKOV_GLOW_OPACITY;
          glowColors[gBase + 3] = r * MARKOV_GLOW_OPACITY;
          glowColors[gBase + 4] = g * MARKOV_GLOW_OPACITY;
          glowColors[gBase + 5] = b * MARKOV_GLOW_OPACITY;
          markovCount++;
        }
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

    // ── Glow layer flush ──────────────────────────────────────────────────
    const glowGeo = glowGeoRef.current;
    if (glowGeo) {
      const prevGlow = lastGlowDrawnRef.current;
      if (markovCount < prevGlow) {
        glowPositions.fill(0, markovCount * 6, prevGlow * 6);
        glowColors.fill(0, markovCount * 6, prevGlow * 6);
      }
      lastGlowDrawnRef.current = markovCount;
      glowGeo.attributes.position.needsUpdate = true;
      glowGeo.attributes.color.needsUpdate = true;
      glowGeo.setDrawRange(0, markovCount * 2);
    }
  });

  return (
    <>
      {/* ── Glow halo layer — Markov arcs only, behind main layer ── */}
      {/* Renders at renderOrder -2 so it sits under the main LineSegments.
          The soft halo bleeds outward giving the illusion of line thickness. */}
      <lineSegments ref={glowLineRef} renderOrder={-2}>
        <bufferGeometry ref={glowGeoRef}>
          <bufferAttribute
            attach="attributes-position"
            args={[glowPositions, 3]}
            count={MAX_MARKOV_EDGES * 2}
            usage={THREE.DynamicDrawUsage}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[glowColors, 3]}
            count={MAX_MARKOV_EDGES * 2}
            usage={THREE.DynamicDrawUsage}
          />
        </bufferGeometry>
        <lineBasicMaterial vertexColors transparent opacity={1} depthWrite={false} />
      </lineSegments>

      {/* ── Main layer — all edges at full brightness ── */}
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
    </>
  );
}
