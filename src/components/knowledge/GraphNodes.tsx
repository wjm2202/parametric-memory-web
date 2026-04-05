"use client";

import { useRef, useMemo, useCallback } from "react";
import { useFrame, ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useKnowledgeStore, type KGNode } from "@/stores/knowledge-store";
import { ATOM_COLORS, type AtomType } from "@/types/memory";
import { expandAtom } from "@/lib/knowledge-api";
import type { ForceGraphHandle } from "./useForceGraph";

/**
 * 8 segments = 64 vertices per sphere (vs 256 at 16 segments).
 * 1024 × 64 = 65K vertices — well within mobile GPU budget.
 * At the zoom levels used in the graph, 8 segments is visually identical.
 */
const SPHERE_SEGMENTS = 8;
const MAX_INSTANCES = 1024;
const BLOOM_BOOST = 2.2;
const PULSE_SCALE = 1.5;

/**
 * Geometry radius = 1 (unit sphere), scaled per-instance via BASE_SCALE.
 * This matches AtomNodes.tsx pattern and keeps bounding sphere sane.
 * Effective radius = 1 × 0.5 = 0.5 world units ≈ 7px at camera z=80.
 */
const BASE_SCALE = 1.0;

const TYPE_COLORS: Record<AtomType, THREE.Color> = Object.fromEntries(
  Object.entries(ATOM_COLORS).map(([type, hex]) => [
    type,
    new THREE.Color(hex).multiplyScalar(BLOOM_BOOST),
  ]),
) as Record<AtomType, THREE.Color>;

/* ─── Sprint 5: Poincaré-derived colour helpers ──────────────────────────── */

/**
 * Derive a continuous colour from Poincaré disk coordinates.
 * - Hue: angular position → full 360° spectrum (same-domain = similar hue)
 * - Saturation: radius-based (general atoms = desaturated, specific = vivid)
 * - Lightness: fixed at 0.65 for readability against dark background
 *
 * Returns a THREE.Color (mutates the provided output color object).
 */
function poincareColor(px: number, py: number, out: THREE.Color): THREE.Color {
  const hue = (Math.atan2(py, px) / (2 * Math.PI) + 1) % 1; // [0, 1]
  const radius = Math.sqrt(px * px + py * py);
  const saturation = 0.3 + Math.min(radius, 1.0) * 0.7; // 0.3 → 1.0
  const lightness = 0.65;
  out.setHSL(hue, saturation, lightness);
  out.multiplyScalar(BLOOM_BOOST);
  return out;
}

/**
 * Sprint 5.3: Depth-encoded scale from Poincaré radius and atom type.
 * Domain atoms: large (anchor points). Task atoms: medium. Knowledge: small.
 * Formula: scale = BASE_SCALE * (1.4 - radius * 0.6), min 0.6.
 */
function poincareScale(px: number, py: number, type: AtomType): number {
  const radius = Math.sqrt(px * px + py * py);
  let scale = BASE_SCALE * Math.max(1.4 - radius * 0.6, 0.6);
  // Type bonus — anchor points in the visualisation
  if (type === "domain") scale += 0.3;
  else if (type === "task") scale += 0.15;
  return scale;
}

const HOVER_COLOR = new THREE.Color("#ffffff").multiplyScalar(BLOOM_BOOST);
const SELECT_COLOR = new THREE.Color("#f0abfc").multiplyScalar(BLOOM_BOOST);
const LOADING_COLOR = new THREE.Color("#94a3b8").multiplyScalar(BLOOM_BOOST * 0.6);
/**
 * Gold/amber highlight for atoms that were direct search matches.
 * Chosen to be clearly distinct from all atom type colours (which are in the
 * violet/blue/green spectrum) and from hover (white) and select (pink/violet).
 * Multiplied by BLOOM_BOOST so it glows through the bloom post-process pass.
 */
const SEARCH_HIT_COLOR = new THREE.Color("#f59e0b").multiplyScalar(BLOOM_BOOST);

/* ─── KG-04/KG-06: Module-level node index ──────────────────────────────── */
/**
 * Maps node key → array index for O(1) hovered/selected lookups inside useFrame.
 * Rebuilt only when node count changes. Pattern mirrors _atomAnimMap in
 * AtomNodes.tsx (/visualise). Zero allocation in the steady state.
 *
 * Using module-level (not useRef) because simNodes is a ref — the index
 * only needs to follow simNodes.current.length changes, not React renders.
 */
const _simNodeIndex = new Map<string, number>();
let _simNodeIndexSize = 0;

/* ─── KG-15: One-time cap warning ───────────────────────────────────────── */
let _warnedNodeCap = false;

interface GraphNodesProps {
  handle: ForceGraphHandle;
}

/** Safe key extraction from d3-resolved edge endpoints (string or KGNode object) */
function edgeEndKey(v: string | KGNode): string {
  return typeof v === "string" ? v : (v as KGNode).key;
}

/** At degreeInfluence=1, the highest-degree node is this many times its base size */
const MAX_DEGREE_MULTIPLIER = 7.5;

export default function GraphNodes({ handle }: GraphNodesProps) {
  const { simNodes, simEdges, isSettled } = handle; // KG-09: destructure isSettled
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // ── Degree map — rebuilt only when edge count changes ──────────────────
  // Maps node key → total connection count (in + out degree).
  const degreeMapRef = useRef<Map<string, number>>(new Map());
  const maxDegreeRef = useRef(1);
  const cachedEdgeCountRef = useRef(-1);

  // Tracks the last degreeInfluence value seen — forces a flush frame when changed
  const prevDegreeInfluenceRef = useRef(-1);

  /**
   * BUG-FIX: tracks whether the previous frame had an active filter
   * (visibleAtoms non-null OR searchHits non-empty).
   *
   * Problem: when the user clears a search, visibleAtoms → null and
   * searchHits → empty in the same frame. All early-exit conditions are
   * immediately true so the guard fires and skips the frame — the scale=0
   * values written during search are frozen in the GPU instanceMatrix buffer.
   *
   * Fix: if the previous frame was filtered but this frame is not, we are
   * in a "just cleared" state. Force exactly one flush frame so every
   * instance gets its scale written back to BASE_SCALE before the early
   * exit is allowed to fire again.
   */
  const prevWasFiltered = useRef(false);

  // Only subscribe to actions — they're stable refs and don't cause re-renders.
  // All state reads (hoveredAtom, selectedAtom, loadingAtoms) move inside
  // useFrame via getState() — KG-06: eliminates cascading re-renders during seed.
  // selectAtom is read via getState() inside handleClick (never subscribed here).
  const hoverAtom = useKnowledgeStore((s) => s.hoverAtom);

  const tmpObj = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Primary: simNodes (d3 mutates positions in-place each tick).
    // Fallback: read directly from store on the first frames before the force
    // simulation has been given the node array (async seed not yet complete).
    const nodes =
      simNodes.current.length > 0
        ? simNodes.current
        : Array.from(useKnowledgeStore.getState().nodes.values());

    // KG-04: Rebuild key→index map only when node count changes.
    // Gives O(1) hover/select lookups below instead of O(n) string compares.
    if (nodes.length !== _simNodeIndexSize) {
      _simNodeIndex.clear();
      for (let i = 0; i < nodes.length; i++) _simNodeIndex.set(nodes[i].key, i);
      _simNodeIndexSize = nodes.length;
    }

    // ── Degree map rebuild — O(E) only when edge array grows/shrinks ──────
    const edges = simEdges.current;
    if (edges.length !== cachedEdgeCountRef.current) {
      cachedEdgeCountRef.current = edges.length;
      const map = new Map<string, number>();
      for (const e of edges) {
        const sk = edgeEndKey(e.source as string | KGNode);
        const tk = edgeEndKey(e.target as string | KGNode);
        map.set(sk, (map.get(sk) ?? 0) + 1);
        map.set(tk, (map.get(tk) ?? 0) + 1);
      }
      degreeMapRef.current = map;
      let max = 1;
      for (const v of map.values()) if (v > max) max = v;
      maxDegreeRef.current = max;
    }

    // KG-06: Read reactive state directly from store inside useFrame.
    // Removes the loadingAtoms/selectedAtom/hoveredAtom selectors from the
    // component — no more re-renders on every loading state change during seed.
    const {
      loadingAtoms,
      hoveredAtom,
      selectedAtom,
      searchHits,
      visibleAtoms,
      degreeInfluence,
      bridgeAtom,
    } = useKnowledgeStore.getState();

    // Detect slider change — force one flush frame so sizes update when settled
    const degreeChanged = degreeInfluence !== prevDegreeInfluenceRef.current;
    prevDegreeInfluenceRef.current = degreeInfluence;

    // KG-04: O(1) index lookups — integer compare in the hot loop below
    const hoveredIdx = hoveredAtom ? (_simNodeIndex.get(hoveredAtom) ?? -1) : -1;
    const selectedIdx = selectedAtom ? (_simNodeIndex.get(selectedAtom) ?? -1) : -1;

    // Track whether this frame has an active filter (used by the early-exit guard below).
    const isFiltered = visibleAtoms !== null || searchHits.size > 0;
    const wasFiltered = prevWasFiltered.current;
    prevWasFiltered.current = isFiltered;

    // KG-09: Skip the entire frame when the sim has settled and nothing
    // interactive is active — positions are frozen, no GPU work needed.
    //
    // EXCEPTION — "just cleared" state: if the previous frame was filtered
    // (scale=0 written to many instances) but this frame is not, we MUST run
    // one flush frame to restore all scales to BASE_SCALE before going idle.
    // Without this, the scale=0 values are frozen in the GPU buffer forever.
    const justCleared = wasFiltered && !isFiltered;
    if (
      isSettled.current &&
      !justCleared &&
      !degreeChanged &&
      hoveredIdx < 0 &&
      selectedIdx < 0 &&
      loadingAtoms.size === 0 &&
      searchHits.size === 0 &&
      visibleAtoms === null
    )
      return;

    // KG-15: Warn once if node count exceeds the instanced mesh cap
    if (!_warnedNodeCap && nodes.length > MAX_INSTANCES) {
      _warnedNodeCap = true;
      console.warn(
        `[GraphNodes] Node count ${nodes.length} exceeds MAX_INSTANCES ${MAX_INSTANCES}. Increase the cap.`,
      );
    }

    const t = clock.getElapsedTime();
    mesh.count = Math.min(nodes.length, MAX_INSTANCES);

    for (let i = 0; i < mesh.count; i++) {
      const node = nodes[i];

      // visibleAtoms filter: when set, hide any atom not in the visible set.
      // Exception: the bridge atom (most-connected external atom) is always shown.
      // scale=0 tells the GPU to discard the instance — essentially free.
      // The node stays in the force sim so the layout is preserved.
      const isBridgeAtom = node.key === bridgeAtom;
      if (visibleAtoms !== null && !visibleAtoms.has(node.key) && !isBridgeAtom) {
        tmpObj.position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0);
        tmpObj.scale.setScalar(0);
        tmpObj.updateMatrix();
        mesh.setMatrixAt(i, tmpObj.matrix);
        continue;
      }

      // Sprint 5.3: Base scale from Poincaré depth encoding (or default)
      const poinc = node.poincare as [number, number] | null | undefined;
      let scale = poinc ? poincareScale(poinc[0], poinc[1], node.type) : BASE_SCALE;

      // Degree-based size boost: highly-connected atoms grow relative to isolates.
      // normalizedDegree ∈ [0, 1] where 1 = the most-connected node in the graph.
      // At degreeInfluence=0 → no change. At 1 → max-degree node is MAX_DEGREE_MULTIPLIER× base.
      if (degreeInfluence > 0) {
        const degree = degreeMapRef.current.get(node.key) ?? 0;
        const normalizedDegree = degree / maxDegreeRef.current;
        scale *= 1 + normalizedDegree * degreeInfluence * MAX_DEGREE_MULTIPLIER;
      }

      const isLoading = loadingAtoms.has(node.key);
      const isSearchHit = searchHits.has(node.key);

      if (isLoading) {
        // Loading: fast breathe (t * 4) — waiting for data
        scale = scale * (1.0 + (Math.sin(t * 4 + i) * 0.5 + 0.5) * (PULSE_SCALE - 1.0));
      } else if (isSearchHit && i !== selectedIdx) {
        // Search hit: slow breathe (t * 1.5) — draws the eye without being distracting.
        scale = scale * (1.15 + Math.sin(t * 1.5 + i * 0.3) * 0.25);
      } else if (i === selectedIdx) {
        scale = scale * 1.3;
      }

      tmpObj.position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0);
      tmpObj.scale.setScalar(scale);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);

      // Colour priority: hover > select > bridge > loading > search hit > poincaré > type colour
      if (i === hoveredIdx) {
        tmpColor.copy(HOVER_COLOR);
      } else if (i === selectedIdx) {
        tmpColor.copy(SELECT_COLOR);
      } else if (isBridgeAtom) {
        // Bridge atom: amber/gold — visually distinct from search hits (gold) and
        // type colours, signals "most entangled external node".
        tmpColor.set("#f59e0b").multiplyScalar(BLOOM_BOOST * 1.2);
      } else if (isLoading) {
        tmpColor.copy(LOADING_COLOR);
      } else if (isSearchHit) {
        tmpColor.copy(SEARCH_HIT_COLOR);
      } else if (poinc) {
        // Sprint 5.2: Continuous colour derived from Poincaré position
        poincareColor(poinc[0], poinc[1], tmpColor);
      } else {
        tmpColor.copy(TYPE_COLORS[node.type] ?? TYPE_COLORS.other);
      }

      mesh.setColorAt(i, tmpColor);
    }

    mesh.instanceMatrix.needsUpdate = true;

    // KG-05: Only upload the color buffer when interactive state is present
    // or the sim is still settling. After settle with no hover/select/loading,
    // colors are frozen — skipping needsUpdate avoids a GPU re-upload each frame.
    // Pattern mirrors the colorChanged guard in AtomNodes.tsx (/visualise).
    if (mesh.instanceColor) {
      const hasInteraction =
        hoveredIdx >= 0 ||
        selectedIdx >= 0 ||
        loadingAtoms.size > 0 ||
        searchHits.size > 0 || // keep pulsing search hit colours
        visibleAtoms !== null; // keep uploading while filter is active
      if (hasInteraction || !isSettled.current) {
        mesh.instanceColor.needsUpdate = true;
      }
    }
  });

  // KG-07: useCallback — stable handler refs across renders.
  // Pattern mirrors AtomNodes.tsx (/visualise) where all three handlers
  // are memoized to prevent unnecessary instancedMesh event rebinding.
  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const node = simNodes.current[e.instanceId ?? -1] as KGNode | undefined;
      if (!node) return;

      const {
        selectAtom: sel,
        selectedAtom,
        expandedAtoms,
        nodes,
        markLoading,
      } = useKnowledgeStore.getState();

      // ── 1. Toggle selection ──────────────────────────────────────────
      sel(node.key === selectedAtom ? null : node.key);

      // ── 2. Expand neighbours (Sprint 2, Item 2.4) ────────────────────
      // Skip if already expanded or node limit reached
      if (expandedAtoms.has(node.key)) return;
      if (nodes.size >= 150) {
        console.warn("[GraphNodes] Node limit (150) reached. Clear the graph to explore further.");
        return;
      }

      // Pulse the node while fetching
      markLoading(node.key, true);

      // Anchor new nodes near the clicked node's current sim position
      const anchorPos = { x: node.x ?? 0, y: node.y ?? 0, z: node.z ?? 0 };
      const existingKeys = new Set(nodes.keys());

      expandAtom(node.key, existingKeys)
        .then(({ newAtoms, edges }) => {
          const s = useKnowledgeStore.getState();
          if (newAtoms.length > 0) s.addNodes(newAtoms, anchorPos);
          if (edges.length > 0) s.addEdges(edges);
          s.markExpanded(node.key);
          s.markLoading(node.key, false);
        })
        .catch((err: Error) => {
          if (err.name !== "AbortError") {
            console.error("[GraphNodes] Expand failed:", err);
          }
          useKnowledgeStore.getState().markLoading(node.key, false);
        });
    },
    [simNodes],
  );

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const node = simNodes.current[e.instanceId ?? -1] as KGNode | undefined;
      if (node) hoverAtom(node.key);
    },
    [simNodes, hoverAtom],
  );

  const handlePointerOut = useCallback(() => {
    hoverAtom(null);
  }, [hoverAtom]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, MAX_INSTANCES]}
      frustumCulled={false}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <sphereGeometry args={[1, SPHERE_SEGMENTS, SPHERE_SEGMENTS]} />
      <meshBasicMaterial toneMapped={false} transparent opacity={0.92} />
    </instancedMesh>
  );
}
